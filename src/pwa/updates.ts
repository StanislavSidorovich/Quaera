/**
 * Проверка обновления service worker: при возврате на вкладку и по кнопке
 * «Проверить обновления» на экране «О проекте».
 *
 * Воркер у тренажёра ставится сам (skipWaiting) и страница перезагружается
 * по controllerchange (см. main.tsx), поэтому «ждущей» версии и кнопки
 * «Обновить» здесь нет: найденное обновление просто применяется.
 */

let registration: ServiceWorkerRegistration | null = null;
let lastCheck = Date.now();

/** Результат ручной проверки; `installing` — новая версия найдена и ставится, страница перезагрузится сама. */
export type UpdateCheck = 'latest' | 'installing' | 'failed' | 'unavailable';

export function trackRegistration(reg: ServiceWorkerRegistration): void {
  registration = reg;
  reg.update().catch(() => undefined);
  // Не чаще раза в минуту: быстрые переключения вкладок не должны дёргать сеть.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || Date.now() - lastCheck < 60 * 1000) return;
    lastCheck = Date.now();
    reg.update().catch(() => undefined);
  });
}

export async function checkForUpdates(): Promise<UpdateCheck> {
  if (!registration) return 'unavailable';
  lastCheck = Date.now();
  try {
    await registration.update();
  } catch {
    return 'failed';
  }
  // Новый воркер может появиться через мгновение после того, как update() вернулся.
  if (!registration.installing && !registration.waiting) await new Promise((done) => setTimeout(done, 1000));
  const sw = registration.installing ?? registration.waiting;
  if (!sw || sw.state === 'redundant') return 'latest';
  // Дальше controllerchange перезагрузит страницу; ждём, чтобы успеть показать текст.
  return 'installing';
}
