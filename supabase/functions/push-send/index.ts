/**
 * Рассылка подошедших напоминаний. Вызывается по расписанию, не человеком.
 *
 * Работа функции целиком: выбрать строки, у которых будильник взведён
 * и время настало, отправить push, погасить будильник. Ни расписания,
 * ни правил «что считается подошедшим» здесь нет и быть не должно —
 * их считает клиент (src/push/schedule.ts), а сервер только сравнивает
 * отметку времени с now(). Довод расписан там же: вторая реализация
 * правила разошлась бы с первой молча.
 *
 * ## Что уезжает в уведомление
 *
 * Только число. Текст собирает service worker из своей таблицы строк
 * (public/sw.js) — сервер не присылает ни заголовка, ни фразы. Причина
 * не в экономии байтов: так у того, кто добыл приватный ключ VAPID,
 * нет способа показать человеку произвольный текст от имени приложения.
 * Ошибиться числом он сможет, подменить фразу — нет.
 *
 * ## Развёртывание
 *
 * Вызывается pg_cron через pg_net раз в 15 минут (SQL — в supabase/README.md).
 * Проверка JWT может остаться включённой: cron ходит с service_role.
 * Сверх неё функция требует общий секрет в заголовке — иначе любой
 * обладатель publishable-ключа мог бы дёргать рассылку когда вздумается.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

/**
 * VAPID: приватный ключ живёт только здесь, публичный лежит в коде клиента
 * открыто — он и должен быть открыт, браузер передаёт его push-сервису при
 * подписке. Пара нужна, чтобы push-сервис мог убедиться, что стучит тот же,
 * на кого подписывались: без неё любой, узнавший endpoint, слал бы
 * уведомления от имени приложения.
 *
 * `mailto:` в subject — требование спецификации: push-сервису нужен адрес,
 * по которому можно написать, если отправитель начал вести себя плохо.
 */
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:noreply@quaera.app';

/** Сколько строк берём за один прогон: cron ходит часто, спешить некуда. */
const BATCH = 200;

/**
 * После скольких отказов подряд строка считается мёртвой.
 *
 * Отдельно от 404/410: те однозначны («адреса больше нет») и удаляются
 * сразу. Здесь речь про сеть и 5xx — они бывают временными, и удалять
 * живую подписку из-за пятиминутной недоступности push-сервиса нельзя.
 * Но и стучать вечно тоже: cron ходит каждые 15 минут, пять отказов —
 * это больше часа подряд.
 */
const MAX_FAILURES = 5;

Deno.serve(async (req) => {
  /*
   * Общий секрет, а не только JWT. С включённой проверкой JWT сюда попадёт
   * любой, у кого есть publishable-ключ, — то есть кто угодно, ключ лежит
   * в бандле открыто. Рассылка от постороннего не украдёт данные, но
   * разошлёт напоминания не вовремя и сожжёт квоту.
   */
  const secret = Deno.env.get('PUSH_CRON_SECRET') ?? '';
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'нет доступа' }), { status: 401 });
  }

  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    return new Response(JSON.stringify({ error: 'VAPID не настроен' }), { status: 500 });
  }
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, due_count, locale, failures')
    .not('wake_at', 'is', null)
    .lte('wake_at', nowIso)
    .order('wake_at', { ascending: true })
    .limit(BATCH);

  if (error) return new Response(JSON.stringify({ error: 'выборка не удалась' }), { status: 500 });
  if (!rows?.length) return new Response(JSON.stringify({ sent: 0, gone: 0, failed: 0 }), { status: 200 });

  let sent = 0;
  let gone = 0;
  let failed = 0;

  /*
   * Последовательно, а не Promise.all: отправка идёт в чужой сервис,
   * и параллельный залп двух сотен запросов — верный способ получить
   * 429 и потерять всю пачку разом. Cron ходит каждые 15 минут,
   * растянуть пачку во времени ничего не стоит.
   */
  for (const row of rows) {
    const payload = JSON.stringify({
      /*
       * Только число и версия схемы payload. Версия нужна не сейчас,
       * а тому service worker'у, который останется на устройстве после
       * следующей правки формата: он должен уметь отличить payload,
       * который не понимает, и показать нейтральный текст вместо мусора.
       */
      v: 1,
      count: row.due_count ?? 1,
    });

    try {
      await webpush.sendNotification(
        { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        payload,
        {
          /*
           * TTL: сколько push-сервису держать уведомление, если устройство
           * выключено. Сутки — потому что напоминание про повторение
           * протухает вместе с днём: доставить его через неделю значит
           * позвать человека к теме, которая с тех пор ушла ещё дальше.
           */
          TTL: 24 * 60 * 60,
          urgency: 'low',
        }
      );
      /*
       * Будильник гасится сразу после успеха. Отсюда «не больше одного
       * уведомления на одно открытие приложения»: следующее возможно
       * только после того, как человек откроет приложение и оно взведёт
       * будильник заново.
       */
      await supabase
        .from('push_subscriptions')
        .update({ wake_at: null, due_count: null, last_sent_at: nowIso, failures: 0 })
        .eq('endpoint', row.endpoint);
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Однозначный ответ push-сервиса: адреса больше нет. Браузер снят,
        // приложение удалено, подписка отозвана — строка мертва.
        await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
        gone++;
      } else {
        const failures = (row.failures ?? 0) + 1;
        if (failures >= MAX_FAILURES) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', row.endpoint);
          gone++;
        } else {
          /*
           * Будильник НЕ гасим: попытка повторится на следующем прогоне.
           * Гасить здесь значило бы терять напоминание из-за одной
           * сетевой заминки — тот самый молчаливый отказ, ради которого
           * вся эта работа и вынесена в отдельную фазу.
           */
          await supabase.from('push_subscriptions').update({ failures }).eq('endpoint', row.endpoint);
          failed++;
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent, gone, failed }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
});
