import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Preview } from '../engine/types';
import { useI18n } from '../i18n/context';
import { echoHits, splitTables } from './afterEcho';
import { ResultTable } from './ResultTable';

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
  result,
  schemaTables,
  onOpenSchema,
}: {
  note: { from: string; text: string };
  voice?: ReactNode;
  speaking?: boolean;
  result: Preview | null;
  schemaTables: string[];
  onOpenSchema: (table?: string) => void;
}) {
  const { t } = useI18n();
  const wide = useWide();
  const parts = useMemo(() => splitTables(note.text, schemaTables), [note.text, schemaTables]);
  const hits = useMemo(
    () => (result && result.columns.length ? echoHits(note.text, result.columns, result.rows) : null),
    [note.text, result]
  );

  const card = (
    <div className={'card story-after' + (speaking ? ' story-after--speaking' : '')}>
      {voice}
      <p className="story-mode-from">{note.from}</p>
      <p className="story-mode-text">
        {parts.map((p, i) => {
          if (p.kind === 'text') return p.text;
          const real = schemaTables.find((n) => n.toLowerCase() === p.text.toLowerCase()) ?? p.text;
          return (
            <button key={i} type="button" className="after-table" onClick={() => onOpenSchema(real)}>
              <code>{p.text}</code>
            </button>
          );
        })}
      </p>
    </div>
  );
  if (!result || !result.columns.length) return card;

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
        {card}
        <aside className="card story-after-result" aria-label={t.task.yourResult}>
          {table}
        </aside>
      </div>
    );
  }
  return (
    <>
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
