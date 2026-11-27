import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Preview } from '../engine/types';
import { useI18n } from '../i18n/context';
import { ProseText } from './ProseOps';
import { echoHits, splitTables } from './afterEcho';
import { ResultTable } from './ResultTable';
import { Avatar } from './Avatar';
import { ClipButton } from './ClipButton';
import { activeClipKey, getClipVersion, subscribeClips } from '../voice';

/** Ширина, с которой результат встаёт рядом с репликой; ниже — сворачивается над ней. */
const WIDE = '(min-width: 1024px)';

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia(WIDE).matches);
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}

/**
 * Реплика персонажа про сданный результат и сам результат рядом с ней.
 *
 * Реплика говорит про число или бренд («весь верх прайса — фарма: Vitanor,
 * Gastrivo…»), а таблица, о которой речь, осталась выше экрана. Поэтому
 * таблица стоит рядом: справа (липкая) на ноутбуке, свёрнутой полосой над
 * репликой на узком экране. Строки, названные в тексте, подсвечены (см.
 * afterEcho.ts); имена таблиц схемы в тексте стали кнопками, открывающими
 * схему на этой таблице. Текст реплики в storymode.ts для этого не менялся.
 *
 * Без табличного результата (`result` пуст: predict, order, waves) остаётся
 * прежняя карточка реплики.
 */
export function AfterReply({
  note,
  voice,
  speaking,
  clipId,
  result,
  schemaTables,
  onOpenSchema,
  lead,
}: {
  note: { from: string; text: string };
  voice?: ReactNode;
  speaking?: boolean;
  /** Слот записи в манифесте (`<миссия>/a<шаг>`): под текстом кнопка ▶, если запись есть. */
  clipId?: string;
  result: Preview | null;
  schemaTables: string[];
  onOpenSchema: (table?: string) => void;
  /**
   * Карточка перед репликой (разбор задания). На ноутбуке с таблицей встаёт в левую колонку над репликой,
   * таблица справа тянется на высоту обеих; иначе идёт перед ними, как и раньше.
   */
  lead?: ReactNode;
}) {
  const { t } = useI18n();
  useSyncExternalStore(subscribeClips, getClipVersion, getClipVersion);
  const clipSpeaking = !!clipId && activeClipKey() === clipId;
  const wide = useWide();
  const parts = useMemo(() => splitTables(note.text, schemaTables), [note.text, schemaTables]);
  const hits = useMemo(
    () => (result && result.columns.length ? echoHits(note.text, result.columns, result.rows) : null),
    [note.text, result]
  );

  const card = (
    <div className={'card story-after' + (speaking || clipSpeaking ? ' story-after--speaking' : '')}>
      {voice}
      <div className="avatar-row">
        <Avatar from={note.from} />
        <div className="avatar-body">
      <p className="story-mode-from">{note.from}</p>
      <p className="story-mode-text">
        {parts.map((p, i) => {
          if (p.kind === 'text') return <ProseText key={i} text={p.text} />;
          const real = schemaTables.find((n) => n.toLowerCase() === p.text.toLowerCase()) ?? p.text;
          return (
            <button key={i} type="button" className="after-table" onClick={() => onOpenSchema(real)}>
              <code>{p.text}</code>
            </button>
          );
        })}
      </p>
      {clipId && <ClipButton id={clipId} />}
        </div>
      </div>
    </div>
  );
  if (!result || !result.columns.length) return <>{lead}{card}</>;

  const named = hits?.rows.length ?? 0;
  const table = (
    <>
      <ResultTable data={result} caption={wide ? t.task.yourResult : undefined} echo={hits ?? undefined} />
      {wide && named > 0 && (
        <p className="muted" style={{ margin: '4px 0 0', fontSize: 12 }}>
          {t.result.namedRows(named)}
        </p>
      )}
    </>
  );

  if (wide) {
    return (
      <div className="story-after-grid">
        <div className="story-after-left">
          {lead}
          {card}
        </div>
        <aside className="card story-after-result" aria-label={t.task.yourResult}>
          {table}
        </aside>
      </div>
    );
  }
  return (
    <>
      {lead}
      <details className="card story-after-fold">
        <summary>
          {t.task.yourResult}
          {named > 0 && <span className="muted"> · {t.result.namedRows(named)}</span>}
        </summary>
        {table}
      </details>
      {card}
    </>
  );
}
