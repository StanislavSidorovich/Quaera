import type { CSSProperties } from 'react';

/** На сколько знаков продолжение перенесённой строки уходит правее её начала. */
const HANG = 3;

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
        const lead = line.length - line.trimStart().length;
        const ind = `${lead + HANG}ch`;
        return (
          <span key={i} className="code-line" style={{ paddingLeft: ind, textIndent: `-${ind}` }}>
            {line || ' '}
          </span>
        );
      })}
    </pre>
  );
}
