import { useState, type ReactNode } from 'react';
import type { TaskResult } from '../content/types';
import { useI18n } from '../i18n/context';
import './predictResult.css';

/** Сколько строк видно до раскрытия. */
const SHOWN_ROWS = 5;

/** Рамка вставки с заголовком: общая для вставки с исполнением запроса и для сохранённой таблицы. */
export function ResultFrame({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card predict-result">
      <h3>{title}</h3>
      {children}
    </div>
  );
}

type Cell = string | number | null;

/** Значение клетки по формату колонки и локали; пустое значение меры показывается как BLANK. */
export function formatResultCell(v: Cell, fmt: string | undefined, locale: 'ru' | 'en', blank: string): string {
  if (v === null) return blank;
  if (typeof v !== 'number') return String(v);
  const tag = locale === 'ru' ? 'ru-RU' : 'en-US';
  switch (fmt) {
    case 'money': {
      const n = Math.round(v).toLocaleString(tag);
      return locale === 'ru' ? `${n} ¥` : `¥${n}`;
    }
    case 'int':
      return Math.round(v).toLocaleString(tag);
    case 'num':
      return v.toLocaleString(tag, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    case 'pct': {
      const n = (v * 100).toLocaleString(tag, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
      return locale === 'ru' ? `${n} %` : `${n}%`;
    }
    default:
      return v.toLocaleString(tag, { maximumFractionDigits: 4 });
  }
}

/** Индекс строки вопроса: ровно одна строка, совпавшая со всеми значениями `focus`. */
function focusIndex(r: TaskResult): number {
  if (!r.focus) return -1;
  const keys = Object.keys(r.focus);
  return r.rows.findIndex((row) => keys.every((k) => row[r.head.indexOf(k)] === r.focus![k]));
}

/**
 * Таблица визуала с сохранёнными числами Kaiyo (`Task.result`): ничего не исполняет и не суммирует.
 * Видно 5 строк; если строка вопроса (`focus`) дальше, показываются первые 4, «…» и она сама.
 * «ещё N» раскрывает все сохранённые строки; итог всегда последней строкой, как его дал `totalSql`.
 * Монтируется только после проверки (решает вызывающий): до неё таблица была бы подсказкой.
 */
export function ResultInset({ result, title }: { result: TaskResult; title: string }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const fi = focusIndex(result);
  const show = (v: Cell, ci: number) => formatResultCell(v, result.fmt?.[result.head[ci]], locale, t.task.resultBlank);

  const body = (() => {
    if (result.empty || result.rows.length === 0) return <p className="muted result-empty">{t.task.resultVisualEmpty}</p>;
    if (result.visual === 'card') {
      const v = result.rows[0][0];
      return (
        <div className="result-card" data-blank={v === null || undefined}>
          <span className="result-card-label">{result.labels[result.head[0]]}</span>
          <span className="result-card-value">{show(v, 0)}</span>
        </div>
      );
    }
    const small = result.rows.length <= SHOWN_ROWS;
    const jump = !open && !small && fi >= SHOWN_ROWS;
    const visible: (number | 'gap')[] =
      open || small ? result.rows.map((_, i) => i) : jump ? [0, 1, 2, 3, 'gap', fi] : [0, 1, 2, 3, 4];
    const hidden = open || small ? 0 : result.rows.length - visible.filter((x) => x !== 'gap').length;
    return (
      <>
        <div className="result-grid">
          <table>
            <thead>
              <tr>
                {result.head.map((c, ci) => (
                  <th key={c} className={ci > 0 ? 'num' : undefined}>
                    {result.labels[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((ri, k) =>
                ri === 'gap' ? (
                  <tr key={`gap${k}`} className="result-gap" aria-hidden="true">
                    <td colSpan={result.head.length}>…</td>
                  </tr>
                ) : (
                  <tr key={ri} className={ri === fi ? 'result-focus' : undefined} aria-current={ri === fi ? 'true' : undefined}>
                    {result.rows[ri].map((v, ci) => (
                      <td key={ci} className={ci > 0 ? 'num' : undefined} data-blank={v === null || undefined}>
                        {ci === 0 && ri === fi && <span className="result-mark" aria-hidden="true">▶ </span>}
                        {show(v, ci)}
                      </td>
                    ))}
                  </tr>
                )
              )}
              {result.total && (
                <tr className="result-total">
                  {result.total.map((v, ci) => (
                    <td key={ci} className={ci > 0 ? 'num' : undefined}>
                      {ci === 0 && v === null ? t.task.resultTotal : show(v, ci)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {!small && (
          <button type="button" className="result-more" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? t.task.resultLess : t.task.resultMore(hidden)}
          </button>
        )}
        {open && result.rowCount > result.rows.length && <p className="muted result-count">{t.task.resultAllRows(result.rowCount)}</p>}
      </>
    );
  })();

  return (
    <ResultFrame title={title}>
      <p className="muted result-caption">{result.caption}</p>
      {body}
      <p className="muted result-note">{t.task.resultNote}</p>
    </ResultFrame>
  );
}
