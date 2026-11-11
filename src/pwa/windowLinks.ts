/**
 * Одно окно тренажёра для ссылок из Lab, Model и Flow.
 *
 * Обратное направление описано в `src/labLink.ts` (`openInApp`): приложения
 * семьи открывают друг друга по имени окна. Lab зовёт `window.open(url, 'quaera-quaera')`
 * (возврат «Count it in Quaera», `#lab-done=…`), поэтому тренажёр называет своё
 * окно `quaera-quaera` (то же имя даёт ему переключатель семьи), и уже открытая вкладка берёт ссылку вместо новой.
 *
 * Имя ставится только пустое: осмысленное чужое имя не трогаем (так же делает
 * переключатель семьи, family/switcher.js). Установленное окно (PWA) по имени не
 * найти; там ссылку берёт то же окно через `launch_handler: navigate-existing`
 * в манифесте (Chrome 139+), а `launchQueue` ниже применяет фрагмент, если сам
 * Chrome его не сменил.
 */
import { parseLabDone } from '../labDone';

export const TRAINER_WINDOW = 'quaera-quaera';

export function nameTrainerWindow(): void {
  try {
    if (!window.name) window.name = TRAINER_WINDOW;
  } catch {
    /* имя окна не критично */
  }
}

/** Фрагмент присланной ссылки применяется, чтобы сработал hashchange (его ждёт LabDoneToast). */
export function followLaunchLinks(): void {
  const queue = (window as unknown as { launchQueue?: { setConsumer(f: (p: { targetURL?: string }) => void): void } }).launchQueue;
  queue?.setConsumer(({ targetURL }) => {
    if (!targetURL) return;
    try {
      const u = new URL(targetURL);
      if (u.origin === location.origin && u.pathname === location.pathname && u.hash && u.hash !== location.hash) location.hash = u.hash;
    } catch {
      /* не адрес: пропускаем */
    }
  });
}

/** Приложения семьи, которым тренажёр отвечает на «ты тренажёр?» и чьи «перейди» принимает. */
const FAMILY_ORIGINS = [
  'https://lab.quaera.app',
  'https://model.quaera.app',
  'https://flow.quaera.app',
  'https://pandas.quaera.app',
  'http://localhost:5180',
  'http://localhost:5181',
];

/**
 * Возврат из Lab в эту же вкладку (lab `src/core/quaeraLink.ts`). По имени окна
 * Lab сюда не попадёт: по правилам HTML открытое окно не «знакомо» с открывшим.
 * Узнать, что его открыл тренажёр, по referrer Lab тоже не может: у тренажёра
 * `Referrer-Policy: no-referrer`. Поэтому рукопожатие: Lab при загрузке шлёт
 * opener-у `quaera:hello` (доходит, только если там quaera.app), тренажёр отвечает
 * `quaera:here`. По клику Lab шлёт `quaera:go` с адресом и фокусирует вкладку;
 * тренажёр применяет только фрагмент (`#lab-done=…`), экран не перезагружается.
 */
/**
 * Подтверждение приёма. Lab после `quaera:go` с `#lab-done=<ключ>` ждёт ответ (около 400 мс):
 * молчание он читает как «вкладка не приняла» и открывает ссылку заново. Ответ уходит
 * только окну и origin, чьё сообщение принято, и только когда отметка уже принята и
 * записана в прогресс (зовёт `ackLabDone` из LabDoneToast); до этого запись ждёт здесь.
 */
let pendingAck: { source: Window; origin: string; key: string } | null = null;

/** Ответить `{ type: 'quaera:done', key }` тому, кто прислал эту отметку; без ожидающего — ничего. */
export function ackLabDone(key: string): void {
  const p = pendingAck;
  if (!p || p.key !== key) return;
  pendingAck = null;
  try {
    p.source.postMessage({ type: 'quaera:done', key }, p.origin);
  } catch {
    /* окно закрыто: Lab сам откроет ссылку */
  }
}

export function answerFamilyWindows(): void {
  window.addEventListener('message', (e: MessageEvent) => {
    if (!FAMILY_ORIGINS.includes(e.origin)) return;
    const data = e.data as { type?: string; url?: string } | null;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'quaera:hello') {
      (e.source as Window | null)?.postMessage({ type: 'quaera:here' }, e.origin);
    } else if (data.type === 'quaera:go' && typeof data.url === 'string') {
      try {
        const u = new URL(data.url);
        if (u.origin === location.origin && u.hash && u.hash !== location.hash) {
          const mark = parseLabDone(u.hash);
          if (mark && e.source) pendingAck = { source: e.source as Window, origin: e.origin, key: mark.key };
          location.hash = u.hash;
        }
      } catch {
        /* не адрес: пропускаем */
      }
    }
  });
}
