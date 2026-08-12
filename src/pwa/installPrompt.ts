/**
 * Перехват `beforeinstallprompt` — по тому же паттерну подписки, что
 * subscribeLoad в engine/pythonClient.ts: браузер присылает событие один раз
 * за сессию и без слушателя, повешенного до первого рендера, оно теряется
 * безвозвратно (event.preventDefault() обязателен именно в обработчике).
 *
 * Событие не типизировано в lib.dom.d.ts — интерфейс минимальный, только то,
 * чем реально пользуемся.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

let deferredEvent: BeforeInstallPromptEvent | null = null;
const listeners = new Set<(available: boolean) => void>();

function notify(): void {
  const available = deferredEvent !== null;
  listeners.forEach((l) => l(available));
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredEvent = e as BeforeInstallPromptEvent;
    notify();
  });
  // Событие приходит и после установки из другого источника (адресная строка,
  // системное меню) — тогда своя кнопка обязана исчезнуть, а не звать prompt()
  // на уже неактуальном событии.
  window.addEventListener('appinstalled', () => {
    deferredEvent = null;
    notify();
  });
}

export function subscribeInstallAvailable(listener: (available: boolean) => void): () => void {
  listeners.add(listener);
  listener(deferredEvent !== null);
  return () => listeners.delete(listener);
}

/** Событие одноразовое: после вызова, независимо от исхода, кнопка обязана спрятаться. */
export async function promptInstall(): Promise<InstallOutcome> {
  if (!deferredEvent) return 'unavailable';
  const event = deferredEvent;
  deferredEvent = null;
  notify();
  await event.prompt();
  const choice = await event.userChoice;
  return choice.outcome;
}
