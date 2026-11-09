import { useEffect, useState, useSyncExternalStore } from 'react';
import { appStorage } from '../guestMode';
import { useI18n } from '../i18n/context';
import { LAB_DONE_EVENT, LAB_DONE_KEY, acceptLabDone, labDoneKind, readLabDoneMap } from '../labDone';

/** Что Lab уже отметил: `{ "pipeline:kaiyo-sellout": "<ISO-дата>", "build:kaiyo-sales": …, "practice:sql": … }`. Обновляется в этой вкладке и в других. */
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
/** Флаг хранит ключ принятой отметки (старый флаг '1' от прежней сборки читается как конвейер). */
const pendingKey = (): string | null => {
  try {
    const v = sessionStorage.getItem(PENDING_KEY);
    return v === '1' ? 'pipeline:kaiyo-sellout' : v;
  } catch {
    return null;
  }
};
const pendingToast = () => pendingKey() !== null;

export function LabDoneToast() {
  const { t } = useI18n();
  /* Флаг в sessionStorage переживает перезагрузку, которую делает первый заход со старой сборкой в service worker: иначе тост пропадает вместе со страницей (замер на живом quaera.app, 2026-11-05). */
  const [shown, setShown] = useState(pendingToast);
  const [key, setKey] = useState<string | null>(pendingKey);

  useEffect(() => {
    const take = () => {
      const got = acceptLabDone(appStorage(), window.location, (url) => window.history.replaceState(null, '', url));
      if (!got) return;
      setKey(got);
      window.dispatchEvent(new Event(LAB_DONE_EVENT));
      try {
        sessionStorage.setItem(PENDING_KEY, got);
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
      {toastText(t.labDone.toast, key)}
    </div>
  );
}

/** Текст тоста по ключу отметки: свой на конвейер, сборку руками и каждую практику. */
function toastText(toast: { pipeline: string; build: string; practiceSql: string; practicePython: string }, key: string | null): string {
  switch (labDoneKind(key ?? '')) {
    case 'build':
      return toast.build;
    case 'practice':
      return key === 'practice:python' ? toast.practicePython : toast.practiceSql;
    default:
      return toast.pipeline;
  }
}
