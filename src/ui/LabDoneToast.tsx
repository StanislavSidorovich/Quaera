import { useEffect, useState, useSyncExternalStore } from 'react';
import { appStorage } from '../guestMode';
import { useI18n } from '../i18n/context';
import { LAB_DONE_EVENT, LAB_DONE_KEY, acceptLabDone, readLabDoneMap } from '../labDone';

/** Что Lab уже отметил как собранное: `{ "pipeline:kaiyo-sellout": "<ISO-дата>" }`. Обновляется в этой вкладке и в других. */
export function useLabDone(): Record<string, string> {
  const raw = useSyncExternalStore(
    (cb) => {
      window.addEventListener(LAB_DONE_EVENT, cb);
      window.addEventListener('storage', cb);
      return () => {
        window.removeEventListener(LAB_DONE_EVENT, cb);
        window.removeEventListener('storage', cb);
      };
    },
    () => {
      try {
        return appStorage().getItem(LAB_DONE_KEY) ?? '';
      } catch {
        return '';
      }
    },
    () => ''
  );
  return readLabDoneMap(raw || null);
}

/**
 * Принимает `#lab-done=…` (при загрузке и на hashchange) и коротко говорит спасибо.
 * Монтируется один раз в App; сам ничего не рисует, пока отметки нет.
 */
const PENDING_KEY = 'quaera-lab-done-toast';
const pendingToast = () => {
  try {
    return sessionStorage.getItem(PENDING_KEY) === '1';
  } catch {
    return false;
  }
};

export function LabDoneToast() {
  const { t } = useI18n();
  /* Флаг в sessionStorage переживает перезагрузку, которую делает первый заход со старой сборкой в service worker: иначе тост пропадает вместе со страницей (замер на живом quaera.app, 2026-11-05). */
  const [shown, setShown] = useState(pendingToast);

  useEffect(() => {
    const take = () => {
      const key = acceptLabDone(appStorage(), window.location, (url) => window.history.replaceState(null, '', url));
      if (!key) return;
      window.dispatchEvent(new Event(LAB_DONE_EVENT));
      try {
        sessionStorage.setItem(PENDING_KEY, '1');
      } catch {
        /* без флага тост просто не переживёт перезагрузку */
      }
      setShown(true);
    };
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
  }, []);

  useEffect(() => {
    if (!shown) return;
    const id = window.setTimeout(() => {
      try {
        sessionStorage.removeItem(PENDING_KEY);
      } catch {
        /* нечего убирать */
      }
      setShown(false);
    }, 7000);
    return () => window.clearTimeout(id);
  }, [shown]);

  if (!shown) return null;
  return (
    <div className="lab-done-toast" role="status">
      {t.labDone.toast}
    </div>
  );
}
