import { armWake } from './schedule';
import type { Progress } from '../srs/store';

/**
 * Подписка на push-напоминания со стороны браузера.
 *
 * Весь файл держится на одном правиле: **ни одна ошибка отсюда не должна
 * дойти до человека.** Напоминания — это удобство поверх работающего
 * приложения, а не его часть; тренажёр обязан открываться и работать
 * там, где push нет вовсе (Firefox без разрешения, обычная вкладка Safari,
 * устройство без сети, отключённый сервер). Отсюда `catch`, возвращающий
 * состояние, а не бросающий, — тот же приём, что у бейджа `setAppBadge`,
 * только состояний здесь больше и они видимы человеку.
 *
 * ## Публичный ключ VAPID лежит открыто, и это не недосмотр
 *
 * Он и обязан быть открытым: браузер передаёт его push-сервису при подписке,
 * чтобы тот потом мог убедиться, что уведомление шлёт тот же отправитель.
 * Секретная половина пары живёт в секретах Edge Function и в репозиторий
 * не попадает — ровно как publishable-ключ Supabase лежит в `sync/client.ts`,
 * а `service_role` не лежит нигде. **Форк обязан заменить эту константу
 * своей** вместе с адресом Supabase, иначе его подписки уедут к автору.
 */
const VAPID_PUBLIC_KEY = 'BAvAdO8rBiMrnueA1g72ejNMqc2TR6rfYiZl0KLhLrLWpAn65sXx6tqOiuJJMc7hzIkbH_f9M1GeUuD7m3QiI3E';

const SUPABASE_URL = 'https://lueignziprnjnjiixdsh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Bjyj9gNlpgFJXhbWb7vhIg_DlpXtQpx';
const SUBSCRIBE_FN = `${SUPABASE_URL}/functions/v1/push-subscribe`;

/**
 * Состояние напоминаний, каким его видит экран.
 *
 * Различать `unsupported` и `denied` обязательно, и это не педантизм:
 * первое означает «здесь этого не бывает» и требует объяснить, где бывает;
 * второе означает «вы отказали» и требует объяснить, что кнопка больше
 * не поможет — разрешение снимается только в настройках браузера, и
 * приложение не может ни спросить второй раз, ни узнать почему.
 *
 * `unsupported-ios` выделен из `unsupported` по той же причине: на iPhone
 * push существует, но только в приложении, добавленном на домашний экран
 * (Safari 16.4+). Сказать такому человеку «ваш браузер не умеет» — соврать
 * и лишить единственного доступного ему пути.
 */
export type PushState =
  | 'unsupported'
  | 'unsupported-ios'
  | 'default'
  | 'granted'
  | 'denied';

const hasPushApi = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * iOS до установки на домашний экран: API есть, подписка не выйдет.
 *
 * Признак — не user agent сам по себе, а сочетание «это iOS-браузер»
 * и «страница открыта не в standalone». На iPadOS 13+ Safari отдаёт
 * десктопный UA, поэтому вдобавок проверяется тач: без него это настоящий
 * Mac, где push работает и во вкладке.
 */
function isIosBeforeInstall(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  if (!iOS) return false;
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

export function pushState(): PushState {
  if (!hasPushApi()) return isIosBeforeInstall() ? 'unsupported-ios' : 'unsupported';
  const permission = Notification.permission;
  if (permission === 'granted') return 'granted';
  if (permission === 'denied') return 'denied';
  // Разрешение ещё не спрашивали, но на iOS вне standalone спрашивать
  // бессмысленно: подписка не создастся даже при согласии.
  return isIosBeforeInstall() ? 'unsupported-ios' : 'default';
}

/**
 * base64url → байты: в таком виде `PushManager` принимает ключ.
 *
 * Возвращается `ArrayBuffer`, а не `Uint8Array`, и это не косметика:
 * с `lib.dom` последних версий `Uint8Array` типизирован по `ArrayBufferLike`,
 * то есть допускает `SharedArrayBuffer`, а `BufferSource` — нет. Отдать
 * сам буфер и короче, и честнее по типам.
 */
function decodeKey(base64url: string): ArrayBuffer {
  const padded = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    base64url.length + ((4 - (base64url.length % 4)) % 4),
    '='
  );
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!hasPushApi()) return null;
  try {
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/**
 * Есть ли подписка на самом деле — отдельный вопрос от разрешения.
 *
 * Эти две вещи расходятся: разрешение выдано, а подписка не создалась
 * (сеть отвалилась, push-сервис отказал, iOS вне standalone). Экран,
 * судящий только по `Notification.permission`, показал бы в этом случае
 * «включено» там, где не придёт ничего, — то есть самый дорогой вид
 * вранья в этой функции: тихое.
 */
export async function hasPushSubscription(): Promise<boolean> {
  return (await currentSubscription()) !== null;
}

/** Форма, в которой подписка уезжает на сервер. `toJSON` даёт ровно её. */
function serialize(sub: PushSubscription) {
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}

/**
 * Запрос к функции идёт напрямую `fetch`, а не через `supabase.functions`.
 *
 * Причина практическая: клиент Supabase тянет за собой авторизацию и её
 * заголовки, а эта функция намеренно работает без входа и с выключенной
 * проверкой JWT. Прямой запрос делает эту независимость явной — по коду
 * видно, что напоминания не требуют аккаунта.
 *
 * `keepalive` — потому что взведение будильника часто происходит на уходе
 * со страницы (`pagehide`), где обычный запрос браузер обрывает.
 */
async function callSubscribeFn(body: Record<string, unknown>): Promise<boolean> {
  try {
    const res = await fetch(SUBSCRIBE_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Спросить разрешение и подписаться. Зовётся только по явному нажатию.
 *
 * Спрашивать разрешение на загрузке нельзя ни при каких обстоятельствах:
 * человек, которого спросили до того, как он понял, что это за приложение,
 * жмёт «Запретить» — а отказ необратим из приложения, он снимается только
 * в настройках браузера. То есть преждевременный вопрос закрывает
 * возможность навсегда, и цена ошибки здесь несимметрична.
 */
export async function enablePush(
  progress: Progress,
  skillIds: readonly string[],
  locale: 'ru' | 'en'
): Promise<PushState> {
  if (!hasPushApi()) return pushState();
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';

    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        /*
         * `userVisibleOnly` обязателен: браузеры отказываются создавать
         * подписку, которая может прийти без видимого уведомления.
         * Это ограничение приложению ничего не стоит — тихих push
         * здесь нет и не задумано.
         */
        userVisibleOnly: true,
        applicationServerKey: decodeKey(VAPID_PUBLIC_KEY),
      }));

    const payload = serialize(sub);
    if (!payload) return 'granted';

    /*
     * Сразу после подписки взводим будильник: иначе между «разрешил»
     * и следующим закрытием приложения подписка существует, но не
     * назначена ни на что, и первое напоминание потерялось бы молча.
     */
    await syncWake(progress, skillIds, locale);
    return 'granted';
  } catch {
    /*
     * Сюда попадает и отказ подписки на iOS вне standalone, и сбой сети,
     * и отозванный push-сервис. Возвращаем то, что реально видит браузер,
     * — экран покажет честное состояние, а не «получилось».
     */
    return pushState();
  }
}

/** Выключить: снять подписку в браузере и удалить строку на сервере. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const payload = serialize(sub);
  /*
   * Порядок: сначала сервер, потом браузер. После `unsubscribe()` ключи
   * уже не получить, а серверу они нужны, чтобы найти строку. Обратный
   * порядок оставил бы на сервере строку, стучащую в снятую подписку
   * до первого 410.
   */
  if (payload) await callSubscribeFn({ action: 'unsubscribe', subscription: payload });
  try {
    await sub.unsubscribe();
  } catch {
    /* уже снята или сервис недоступен — состояние всё равно спросим заново */
  }
}

/**
 * Взвести (или снять) будильник по текущему прогрессу.
 *
 * Зовётся при открытии приложения и при уходе со страницы, а не после
 * каждого ответа: расписание меняется только вместе с прогрессом, но
 * дёргать сеть на каждое решённое задание — это батарея и трафик ради
 * числа, которое всё равно уточнится при закрытии.
 *
 * `armWake` вернул `null` — будильник **снимается**, а не оставляется
 * прежним. Без этого сброс прогресса или импорт с другого устройства
 * не гасили бы уведомление, назначенное до них: человек стёр всё,
 * а через день получил напоминание про темы, которых у него нет.
 */
export async function syncWake(
  progress: Progress,
  skillIds: readonly string[],
  locale: 'ru' | 'en'
): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  const payload = serialize(sub);
  if (!payload) return;

  const arm = armWake(progress, skillIds);
  if (!arm) {
    await callSubscribeFn({ action: 'clear', subscription: payload });
    return;
  }
  await callSubscribeFn({
    action: 'arm',
    subscription: payload,
    wakeAt: arm.wakeAt,
    dueCount: arm.dueCount,
    locale,
  });
}
