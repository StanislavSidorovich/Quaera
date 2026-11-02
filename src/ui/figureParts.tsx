import { Fragment } from 'react';
import type { ReactNode } from 'react';

/** Общие части схем: SVG-часть (Badge, Label, LH) нужна ProcessFigure, Notes и rich ещё SourceMapFigure и IngestFigure; цвета в классах `.pf-*` из styles.css. */

/** Текст с `кодом` в обратных кавычках: тот же разбор, что у подписей артефактов слоёв. */
export const rich = (s: string): ReactNode => s.split('`').map((part, i) => (i % 2 ? <code key={i}>{part}</code> : <Fragment key={i}>{part}</Fragment>));

export const LH = 12.5;

/** Подпись в несколько строк: `\n` в тексте — перенос; `y` — базовая линия первой строки. */
export function Label({ x, y, text, anchor = 'middle', cls = 'pf-t' }: { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end'; cls?: string }) {
  return (
    <text className={cls} textAnchor={anchor}>
      {text.split('\n').map((line, i) => (
        <tspan key={i} x={x} y={y + i * LH}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Пометка-кружок с номером. */
export function Badge({ x, y, n }: { x: number; y: number; n: number }) {
  return (
    <g>
      <circle className="pf-badge" cx={x} cy={y} r={9.5} />
      <text className="pf-badge-t" x={x} y={y + 4} textAnchor="middle">
        {n}
      </text>
    </g>
  );
}

/** Пронумерованный список пометок под схемой. */
export function Notes({ notes, locale }: { notes: { ru: string; en: string }[]; locale: 'ru' | 'en' }) {
  return (
    <ol className="pf-notes">
      {notes.map((n, i) => (
        <li key={i}>
          <span className="pf-num" aria-hidden="true">
            {i + 1}
          </span>
          <span>{rich(n[locale])}</span>
        </li>
      ))}
    </ol>
  );
}
