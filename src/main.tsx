// Первой строкой и до всего остального: переносит ключи localStorage
// с querium-* на quaera-* (см. migrateStorage.ts — там же почему порядок
// импорта здесь важен, а не косметичен).
import './migrateStorage';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './i18n/context';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>
);

// Офлайн — не опция, а условие сценария: заниматься в метро и в самолёте.
// Регистрируем только в проде: в dev воркер кешировал бы модули Vite и мешал бы разработке.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  /*
   * Установленная PWA годами не делает полной навигации — вкладку сворачивают,
   * а не закрывают, и браузер сам проверяет sw.js на новую версию раз в сутки,
   * не чаще. Без явной проверки при каждом возврате приложение может неделями
   * показывать старую сборку контента, хотя код на сервере давно свежий.
   */
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker
    .register('/sw.js')
    .then((reg) => {
      reg.update().catch(() => undefined);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);

  /*
   * Перезагружаем сами, а не ждём, пока человек заметит несовпадение чисел.
   * `hadController` отсекает первый визит: там controllerchange — это просто
   * взятие страницы под контроль, а не обновление, и перезагрузка была бы
   * лишней. На каждом следующем визите controller уже стоит с прошлого раза,
   * и смена — это всегда реальный апдейт.
   */
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) window.location.reload();
  });
}
