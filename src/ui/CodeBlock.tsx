import type { CSSProperties } from 'react';

/** На сколько знаков продолжение перенесённой строки уходит правее её начала. */
const HANG = 3;

/** Ведущие пробелы строки: собственный отступ кода, от которого считается висячий. */
export function hangLead(line: string): number {
  return line.length - line.trimStart().length;
}

/** Стиль строки блочным span-ом: первая строка на своём месте, продолжение на HANG правее. */
export function hangStyle(lead: number): CSSProperties {
  const ind = `${lead + HANG}ch`;
  return { paddingLeft: ind, textIndent: `-${ind}` };
}

/**
 * Блок кода с висячим отступом. text-indent на <pre> действует только на
 * первую строку всего блока, поэтому каждая строка кода — свой блочный span:
 * padding-left двигает всё, text-indent вытягивает первую визуальную строку
 * обратно, и остаётся сдвинутым только продолжение. Собственные отступы кода
 * (WHEN под CASE) входят в расчёт, так что перенос всегда правее своей строки.
 *
 * Для кода, а не для вывода: у stdout Python выравнивание колонок и есть
 * содержимое, висячий отступ его исказил бы (ResultTable остаётся на голом
 * pre.sql-block). Между span нет "\n": блочные span сами ломают строку.
 */
export function CodeBlock({
  code,
  className,
  style,
}: {
  code: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <pre className={className ? `sql-block ${className}` : 'sql-block'} style={style}>
      {code.split('\n').map((line, i) => {
        return (
          <span key={i} className="code-line" style={hangStyle(hangLead(line))}>
            {line || ' '}
          </span>
        );
      })}
    </pre>
  );
}
