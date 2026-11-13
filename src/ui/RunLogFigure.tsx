import type { FigureStatus, FigureTone, TaskFigure } from '../content/types';
import './runLogFigure.css';
import './runLogFigureWrap.css';

/**
 * Рисунок задания по данным (см. TaskFigure в content/types.ts): журнал запуска,
 * полосы «до и после», цепочка шагов, таблица как в превью. Заменяет моноширинную
 * выкладку пробелами, которая на 375 px держалась на 39 знаках в строке.
 *
 * Статус всегда значок плюс слово, не один цвет: рисунок читают и в тёмной теме,
 * и люди с цветовой слепотой. Цвета только токенами темы (runLogFigure.css).
 * Тот же `StatusChip` проигрывает журнал запуска в виде задания `waves`.
 */

/** Ячейка длиннее этого числа знаков переносится по словам, а не держится в одну строку. */
const WRAP_FROM = 24;

const GLYPH: Record<FigureStatus, string> = {
  succeeded: '✓',
  failed: '✕',
  skipped: '–',
  running: '…',
  queued: '·',
};

const TONE_OF: Record<FigureStatus, string> = {
  succeeded: 'ok',
  failed: 'err',
  skipped: 'skip',
  running: 'run',
  queued: 'wait',
};

export function StatusChip({ status, label }: { status: FigureStatus; label: string }) {
  return (
    <span className={`rl-chip rl-chip--${TONE_OF[status]}`}>
      <span aria-hidden="true">{GLYPH[status]}</span> {label}
    </span>
  );
}

const toneClass = (tone?: FigureTone) => (tone ? ` rl-tone--${tone}` : '');

export function RunLogFigure({ figure }: { figure: TaskFigure }) {
  return (
    <figure className="rl">
      {figure.title && <figcaption className="rl-title">{figure.title}</figcaption>}
      {figure.facts && (
        <dl className="rl-facts">
          {figure.facts.map((f, i) => (
            <div key={i} className="rl-fact">
              <dt>{f.label}</dt>
              <dd className={toneClass(f.tone).trim()}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {figure.kind === 'runlog' && (
        <div className="rl-scroll">
          <table className="rl-table">
            <thead>
              <tr>
                {figure.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {figure.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.cells.map((c, ci) => (
                    <td key={ci}>
                      {ci === figure.statusCol ? <StatusChip status={r.status} label={c} /> : c}
                      {ci === figure.valueCol && r.value !== undefined && (
                        <span className="rl-bar-track rl-bar-track--cell" aria-hidden="true">
                          <span
                            className="rl-bar-fill"
                            style={{ width: `${(r.value / Math.max(...figure.rows.map((x) => x.value ?? 0), 1)) * 100}%` }}
                          />
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {figure.kind === 'table' && (
        <div className="rl-scroll">
          <table className={`rl-table${figure.mono ? ' rl-table--mono' : ''}${figure.rows.some((r) => r.some((c) => c.length > WRAP_FROM)) ? ' rl-table--wrap' : ''}`}>
            <thead>
              <tr>
                {figure.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {figure.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {figure.kind === 'chain' && (
        <ol className="rl-chain">
          {figure.steps.map((s, i) => (
            <li key={i} className="rl-chain-item">
              {s.via && (
                <span className="rl-via" aria-hidden={false}>
                  <span aria-hidden="true">↓ </span>
                  {s.via}
                </span>
              )}
              <span className="rl-step">
                <span className="rl-step-name">{s.label}</span>
                {s.status && s.statusLabel && <StatusChip status={s.status} label={s.statusLabel} />}
              </span>
            </li>
          ))}
        </ol>
      )}

      {figure.kind === 'bars' &&
        figure.groups.map((g, gi) => {
          const max = Math.max(...g.bars.map((b) => b.value), 1);
          return (
            <div key={gi} className="rl-group">
              {g.label && <p className="rl-group-label">{g.label}</p>}
              {g.bars.map((b, bi) => (
                <div key={bi} className="rl-bar">
                  <span className="rl-bar-label">{b.label}</span>
                  <span className="rl-bar-track" aria-hidden="true">
                    <span
                      className={`rl-bar-fill${toneClass(b.tone)}`}
                      style={{ width: `${Math.max((b.value / max) * 100, 1.5)}%` }}
                    />
                  </span>
                  <span className="rl-bar-value">{b.text}</span>
                </div>
              ))}
            </div>
          );
        })}

      {figure.note && <p className="rl-note">{figure.note}</p>}
    </figure>
  );
}
