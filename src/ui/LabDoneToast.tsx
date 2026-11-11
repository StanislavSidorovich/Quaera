import { createContext, useContext, useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';
import { LAB_DONE_EVENT, acceptLabDone, labDoneKind } from '../labDone';
import { ackLabDone } from '../pwa/windowLinks';
import { LabDoneCard } from './LabDoneCard';

const NO_MARKS: Record<string, string> = {};
export const LabDoneContext = createContext<Record<string, string>>(NO_MARKS);

/**
 * Что Lab уже отметил: `{ "build:kaiyo-sales": "<ISO-дата>", "practice:sql": …, … }`. Лежит в
 * `progress.career.labDone` (едет с синхронизацией и резервной копией); App отдаёт его через контекст.
 */
export function useLabDone(): Record<string, string> {
  return useContext(LabDoneContext);
}

/**
 * Принимает `#lab-done=…` (при загрузке и на hashchange): кладёт отметку в прогресс (`onAccept`),
 * отвечает Lab подтверждением и говорит спасибо: тостом, а на сборку руками (`build:`) карточкой
 * «что дальше». Монтируется один раз в App; сам ничего не рисует, пока отметки нет.
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

export function LabDoneToast({
  onAccept,
  sqlSkill,
  onStartSkill,
  onOpenPath,
}: {
  /** Положить отметку в прогресс (App: `updateCareer(withLabDone)`). */
  onAccept: (key: string, iso: string) => void;
  /** Навык SQL, с которого начать после сборки (`sql-group-by`, а когда он пройден, `sql-join-inner`). */
  sqlSkill: string;
  onStartSkill: (skillId: string) => void;
  onOpenPath: () => void;
}) {
  const { t } = useI18n();
  /* Флаг в sessionStorage переживает перезагрузку, которую делает первый заход со старой сборкой в service worker: иначе тост пропадает вместе со страницей (замер на живом quaera.app, 2026-11-05). */
  const [shown, setShown] = useState(pendingToast);
  const [key, setKey] = useState<string | null>(pendingKey);
  const isCard = labDoneKind(key ?? '') === 'build';

  const hide = () => {
    try {
      sessionStorage.removeItem(PENDING_KEY);
    } catch {
      /* нечего убирать */
    }
    setShown(false);
  };

  useEffect(() => {
    const take = () => {
      const got = acceptLabDone(window.location, (url) => window.history.replaceState(null, '', url), onAccept);
      if (!got) return;
      setKey(got);
      window.dispatchEvent(new Event(LAB_DONE_EVENT));
      try {
        sessionStorage.setItem(PENDING_KEY, got);
      } catch {
        /* без флага тост просто не переживёт перезагрузку */
      }
      setShown(true);
      ackLabDone(got);
    };
    take();
    window.addEventListener('hashchange', take);
    return () => window.removeEventListener('hashchange', take);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Тост гаснет сам; карточка «что дальше» остаётся, пока её не закроют: на ней кнопки. */
  useEffect(() => {
    if (!shown || isCard) return;
    const id = window.setTimeout(hide, 7000);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, isCard]);

  if (!shown || !key) return null;
  if (isCard) {
    return (
      <LabDoneCard
        markKey={key}
        sqlSkill={sqlSkill}
        onClose={hide}
        onStartSkill={(id) => {
          hide();
          onStartSkill(id);
        }}
        onOpenPath={() => {
          hide();
          onOpenPath();
        }}
      />
    );
  }
  return (
    <div className="lab-done-toast" role="status">
      {toastText(t.labDone.toast, key)}
    </div>
  );
}

/** Текст тоста по ключу отметки: свой на конвейер и каждую практику (сборка руками идёт карточкой). */
function toastText(toast: { pipeline: string; practiceSql: string; practicePython: string }, key: string | null): string {
  switch (labDoneKind(key ?? '')) {
    case 'practice':
      return key === 'practice:python' ? toast.practicePython : toast.practiceSql;
    default:
      return toast.pipeline;
  }
}
