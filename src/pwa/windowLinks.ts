/**
 * Одно окно тренажёра для ссылок из Lab, Model и Flow.
 *
 * Обратное направление описано в `src/labLink.ts` (`openInApp`): приложения
 * семьи открывают друг друга по имени окна. Lab зовёт `window.open(url, 'quaera')`
 * (возврат «Count it in Quaera», `#lab-done=…`), поэтому тренажёр называет своё
 * окно `quaera`, и уже открытая вкладка берёт ссылку вместо новой.
 *
 * Имя ставится только пустое: осмысленное чужое имя не трогаем (так же делает
 * переключатель семьи, family/switcher.js). Установленное окно (PWA) по имени не
 * найти; там ссылку берёт то же окно через `launch_handler: navigate-existing`
 * в манифесте (Chrome 139+), а `launchQueue` ниже применяет фрагмент, если сам
 * Chrome его не сменил.
 */
export const TRAINER_WINDOW = 'quaera';

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
