/**
 * Приём и снятие подписки на push-напоминания.
 *
 * Единственная дверь, через которую клиент трогает `push_subscriptions`.
 * Прямой доступ к таблице закрыт наглухо (RLS без политик — см.
 * supabase/migrations/0002_push_subscriptions.sql), и это тот же приём,
 * что у `delete-account`: привилегированный ключ живёт на сервере,
 * а клиент получает узкий проверяющий вход.
 *
 * ## Три операции, а не две
 *
 * - `arm` — «подписка жива, разбуди меня тогда-то с таким числом».
 *   Взводится при каждом открытии приложения, поэтому это upsert.
 * - `clear` — «подписка жива, но будить не за чем» (прогресс сброшен,
 *   всё пройдено на месяцы вперёд, всё просроченное уже на экране).
 * - `unsubscribe` — «выключил напоминания», строка удаляется целиком.
 *
 * `clear` и `unsubscribe` разведены намеренно: свести их в одно значило бы
 * либо терять подписку при каждом сбросе прогресса (и требовать заново
 * разрешение у браузера), либо оставлять строку с истёкшим будильником
 * навсегда. Это разные события, и путать их дорого в обе стороны.
 *
 * ## Развёртывание: проверку JWT надо ВЫКЛЮЧИТЬ
 *
 * Дашборд включает «Verify JWT» по умолчанию, но этот гейт завязан
 * на legacy-секрет и отсекает запрос от клиента, который ходит ключом
 * `sb_publishable_…`, ещё до кода функции. На `delete-account` это уже
 * стоило разбирательства. Здесь проверять всё равно нечего: подписка
 * анонимна по замыслу, а форму данных функция проверяет сама.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

/**
 * Ключи Supabase кладёт в окружение рантайма сам — руками не вписываются.
 * `SERVICE_ROLE_KEY` обходит RLS, поэтому он и не может жить в браузере:
 * там он отключил бы защиту таблицы `progress` заодно.
 */
const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/**
 * Верхняя граница будильника.
 *
 * Интервал SM-2 упёрт в 180 дней (`scheduler.ts`), то есть честный срок
 * дальше года не бывает ни при каком прогрессе. Всё, что дальше, — либо
 * сбитые часы устройства, либо мусор; принимать такое значит держать
 * строку, которая никогда не выстрелит, и считать её живой подпиской.
 */
const MAX_HORIZON_MS = 400 * 24 * 60 * 60 * 1000;

/**
 * Проверка формы, а не доверие клиенту.
 *
 * Функция пишет от service_role, то есть без единой проверки сюда можно
 * было бы залить что угодно. Проверяется ровно то, без чего строка
 * бессмысленна: адрес — https-URL, ключи — base64url правдоподобной длины
 * (p256dh это несжатая точка P-256, 65 байт; auth — 16 байт), число тем
 * и язык — из ожидаемого множества.
 *
 * Длины не «примерно»: короче — это точно не ключ, а длиннее принимать
 * незачем, потому что шифрование всё равно отвергнет.
 */
function invalidSubscription(sub: unknown): string | null {
  if (!sub || typeof sub !== 'object') return 'подписка не объект';
  const { endpoint, keys } = sub as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  if (typeof endpoint !== 'string' || endpoint.length < 20 || endpoint.length > 1000) return 'endpoint не строка';
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return 'endpoint не URL';
  }
  if (url.protocol !== 'https:') return 'endpoint не https';
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  const base64url = /^[A-Za-z0-9_-]+$/;
  if (typeof p256dh !== 'string' || p256dh.length < 80 || p256dh.length > 100 || !base64url.test(p256dh)) {
    return 'p256dh не похож на ключ';
  }
  if (typeof auth !== 'string' || auth.length < 16 || auth.length > 32 || !base64url.test(auth)) {
    return 'auth не похож на ключ';
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'только POST' }, 405);

  let body: {
    action?: string;
    subscription?: { endpoint: string; keys: { p256dh: string; auth: string } };
    wakeAt?: string;
    dueCount?: number;
    locale?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'тело не JSON' }, 400);
  }

  const action = body.action;
  if (action !== 'arm' && action !== 'clear' && action !== 'unsubscribe') {
    return json({ error: 'неизвестное действие' }, 400);
  }

  const bad = invalidSubscription(body.subscription);
  if (bad) return json({ error: bad }, 400);
  const sub = body.subscription!;

  if (action === 'unsubscribe') {
    /*
     * Ошибку удаления не поднимаем наверх и это осознанно: человек уже
     * выключил тумблер у себя, и показать ему «не удалось отписаться»
     * значит предложить действие, которого у него нет. Не удалилось —
     * строка умрёт сама на первом же 404/410 от push-сервиса, потому что
     * подписка на стороне браузера к этому моменту уже снята.
     */
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    return json({ ok: true });
  }

  if (action === 'clear') {
    await supabase
      .from('push_subscriptions')
      .update({ wake_at: null, due_count: null })
      .eq('endpoint', sub.endpoint);
    return json({ ok: true });
  }

  const wakeMs = Date.parse(body.wakeAt ?? '');
  if (!Number.isFinite(wakeMs)) return json({ error: 'wakeAt не дата' }, 400);
  const now = Date.now();
  if (wakeMs > now + MAX_HORIZON_MS) return json({ error: 'wakeAt слишком далеко' }, 400);

  const dueCount = body.dueCount;
  if (!Number.isInteger(dueCount) || dueCount! < 1 || dueCount! > 999) {
    return json({ error: 'dueCount вне диапазона' }, 400);
  }

  const locale = body.locale === 'en' ? 'en' : 'ru';

  /*
   * Счётчик отказов сбрасывается на каждом взведении: раз клиент только что
   * пришёл с этим endpoint, адрес заведомо жив, и прошлые неудачи были
   * про сеть, а не про мёртвую подписку. Без сброса строка копила бы
   * отказы месяцами и была бы удалена у живого пользователя.
   */
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      wake_at: new Date(wakeMs).toISOString(),
      due_count: dueCount,
      locale,
      failures: 0,
    },
    { onConflict: 'endpoint' }
  );

  if (error) return json({ error: 'не удалось сохранить' }, 500);
  return json({ ok: true });
});
