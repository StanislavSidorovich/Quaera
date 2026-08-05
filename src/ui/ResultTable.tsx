import { useMemo, type CSSProperties } from 'react';
import type { Preview, SqlValue } from '../engine/types';
import { useI18n } from '../i18n/context';

/** Меньше трёх строк — сравнивать нечего, полоса только зашумит две цифры. */
const MIN_ROWS_FOR_BARS = 3;

/**
 * Масштаб полос величины по колонкам — null там, где полосу рисовать нельзя.
 *
 * Полоса за числом (как условное форматирование в Excel или Power BI) — самый
 * дешёвый способ увидеть в результате запроса форму распределения, а не столбик
 * цифр: где отрыв лидера, где длинный хвост, где всё ровно. Это ровно то, чем
 * занимаются глазами в рабочем инструменте, и стоит это одного прохода по уже
 * загруженным строкам.
 *
 * Три случая, когда полосы нет:
 *
 * 1. Отрицательные значения. Возвраты и дельты требуют оси с нулём посередине,
 *    иначе полоса врёт о знаке. Честнее не рисовать ничего, чем рисовать
 *    «минус двести» длиннее, чем «сто».
 * 2. Колонки-идентификаторы. product_id от 1 до 47 даёт красивый градиент,
 *    который не значит ничего: величина id — не величина.
 * 3. Все значения равны. Полосы во всю ширину в каждой строке — шум без сигнала.
 */
function barScales(columns: string[], rows: SqlValue[][]): (number | null)[] {
  if (rows.length < MIN_ROWS_FOR_BARS) return columns.map(() => null);
  return columns.map((name, ci) => {
    if (/(^|_)id$/i.test(name)) return null;
    let max = 0;
    let seen = 0;
    let allSame = true;
    let first: number | null = null;
    for (const row of rows) {
      const v = row[ci];
      if (v === null) continue;
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      if (v < 0) return null;
      if (first === null) first = v;
      else if (v !== first) allSame = false;
      if (v > max) max = v;
      seen++;
    }
    if (seen < MIN_ROWS_FOR_BARS || allSame || max <= 0) return null;
    return max;
  });
}

/**
 * Таблица результата. Горизонтальный скролл живёт внутри контейнера:
 * страница целиком ездить вбок не должна, иначе на телефоне теряется навигация.
 */
export function ResultTable({ data, caption }: { data: Preview; caption?: string }) {
  const { t, locale } = useI18n();
  const numberLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const scales = useMemo(() => barScales(data.columns, data.rows), [data.columns, data.rows]);
  /**
   * Вывод print() показывается до таблицы и отдельно от неё: это не результат,
   * а то, что человек печатал по дороге, чтобы посмотреть на промежуточный шаг.
   * Есть только у исполнителей кода (Python) — у SQL всегда пусто.
   */
  const stdout = data.stdout?.trimEnd();

  if (!data.columns.length) {
    return (
      <div>
        {stdout && <pre className="sql-block">{stdout}</pre>}
        <p className="muted">{t.result.noColumns}</p>
      </div>
    );
  }

  return (
    <div>
      {stdout && (
        <>
          <p className="muted" style={{ margin: '0 0 6px' }}>{t.result.stdoutLabel}</p>
          <pre className="sql-block" style={{ marginBottom: 10 }}>{stdout}</pre>
        </>
      )}
      {caption && <p className="muted" style={{ margin: '0 0 6px' }}>{caption}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {data.columns.map((c, i) => (
                <th key={`${c}-${i}`}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri}>
                {row.map((v, ci) => {
                  const scale = scales[ci];
                  const bar = scale !== null && typeof v === 'number' && Number.isFinite(v);
                  return (
                    <td
                      key={ci}
                      data-label={data.columns[ci]}
                      className={`${v === null ? 'null' : typeof v === 'number' ? 'num' : ''}${bar ? ' bar-cell' : ''}`}
                      style={bar ? ({ '--fill': `${((v as number) / scale!) * 100}%` } as CSSProperties) : undefined}
                    >
                      {v === null ? 'NULL' : typeof v === 'number' ? v.toLocaleString(numberLocale, { maximumFractionDigits: 4 }) : String(v)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ margin: '6px 0 0' }}>
        {t.result.rowsSuffix(data.totalRows.toLocaleString(numberLocale))}
        {data.truncated ? t.result.truncatedSuffix(data.rows.length) : ''}
      </p>
    </div>
  );
}
