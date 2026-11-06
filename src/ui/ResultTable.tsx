import { useMemo, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Preview, SqlValue } from '../engine/types';
import { useI18n } from '../i18n/context';
import { chartSpec } from './chartSpec';
import { Chart } from './Chart';
import { copyText, useContextMenu } from './ContextMenu';
import type { EchoHits } from './afterEcho';
import './spotPick.css';

/**
 * Режим касания клеток (задание «Найдите, что не так»): каждая клетка тела таблицы и каждая строка подвала
 * становится кнопкой-переключателем. Таблица остаётся таблицей: те же полосы величины, тот же скролл.
 * Число строк под таблицей и вкладка графика в этом режиме прячутся: «Строк: N» и есть то, что человек сверяет.
 */
export interface PickMode {
  /** Ключи отмеченных клеток: `строка:колонка` у тела, свои ключи у подвала. */
  marked: ReadonlySet<string>;
  /** Состояние клетки после проверки. */
  states?: ReadonlyMap<string, 'hit' | 'miss' | 'extra'>;
  /** После проверки отметки не меняются. */
  locked: boolean;
  onToggle: (key: string) => void;
  /** Строки подвала: тоже клетки. */
  footer?: { key: string; text: string }[];
  /** Подпись кнопки-клетки для скринридера. */
  cellAria: (column: string, value: string, marked: boolean, state?: 'hit' | 'miss' | 'extra') => string;
  /** Подпись кнопки подвала для скринридера. */
  footerAria: (text: string, marked: boolean, state?: 'hit' | 'miss' | 'extra') => string;
}

const STATE_MARK = { hit: '✓', miss: '!', extra: '×' } as const;

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

/** Значение для буфера обмена: пустая ячейка остаётся пустой, чтобы Excel не получил слово NULL. */
function plain(v: SqlValue): string {
  return v === null ? '' : String(v);
}

/**
 * Таблица результата. Горизонтальный скролл живёт внутри контейнера:
 * страница целиком ездить вбок не должна, иначе на телефоне теряется навигация.
 */
export function ResultTable({
  data,
  caption,
  echo,
  pick,
  labels,
}: {
  data: Preview;
  caption?: string;
  echo?: EchoHits;
  pick?: PickMode;
  /** Подписи колонок для человека; нет подписи: имя колонки. */
  labels?: Record<string, string>;
}) {
  const { t, locale } = useI18n();
  const numberLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const head = (c: string) => labels?.[c] ?? c;
  const scales = useMemo(() => barScales(data.columns, data.rows), [data.columns, data.rows]);
  const spec = useMemo(() => (pick ? null : chartSpec(data)), [data, pick]);
  const [view, setView] = useState<'table' | 'chart'>('table');
  const menu = useContextMenu((target) => {
    const cell = target?.closest('td');
    const row = cell?.parentElement;
    const ci = cell && row ? Array.from(row.children).indexOf(cell) : -1;
    const ri = row?.parentElement ? Array.from(row.parentElement.children).indexOf(row) : -1;
    const value = ci >= 0 && ri >= 0 ? data.rows[ri]?.[ci] : undefined;
    const flat = (v: unknown) => plain(v as SqlValue).replace(/[\t\r\n]+/g, ' ');
    const tsv = [data.columns, ...data.rows].map((r) => r.map(flat).join('\t')).join('\n');
    const md = [
      `| ${data.columns.join(' | ')} |`,
      `| ${data.columns.map(() => '---').join(' | ')} |`,
      ...data.rows.map((r) => `| ${r.map((v) => flat(v).replace(/\|/g, '\\|')).join(' | ')} |`),
    ].join('\n');
    return [
      ...(value !== undefined ? [{ label: t.ctx.copyCell, run: () => copyText(plain(value)) }, 'separator' as const] : []),
      { label: t.ctx.copyTable, run: () => copyText(tsv) },
      { label: t.ctx.copyMarkdown, run: () => copyText(md) },
    ];
  });
  const effectiveView = spec ? view : 'table';
  /** Стрелки двигают фокус по клеткам-кнопкам; Tab, пробел и Enter работают как у любых кнопок. */
  const onPickKey = (e: ReactKeyboardEvent<HTMLElement>) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-r]');
    if (!el) return;
    const delta: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    const d = delta[e.key];
    if (!d) return;
    const r = Number(el.dataset.r) + d[0];
    const c = Number(el.dataset.c) + d[1];
    const root = e.currentTarget;
    const next =
      root.querySelector<HTMLElement>(`[data-r="${r}"][data-c="${c}"]`) ??
      (d[1] === 0 ? root.querySelector<HTMLElement>(`[data-r="${r}"]`) : null);
    if (next) {
      e.preventDefault();
      next.focus();
    }
  };
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
    <div onKeyDown={pick ? onPickKey : undefined}>
      {stdout && (
        <>
          <p className="muted" style={{ margin: '0 0 6px' }}>{t.result.stdoutLabel}</p>
          <pre className="sql-block" style={{ marginBottom: 10 }}>{stdout}</pre>
        </>
      )}
      {caption && <p className="muted" style={{ margin: '0 0 6px' }}>{caption}</p>}
      {spec && (
        <div className="tabs result-view-tabs" role="tablist">
          <button type="button" role="tab" aria-pressed={effectiveView === 'table'} onClick={() => setView('table')}>
            {t.result.tableTab}
          </button>
          <button type="button" role="tab" aria-pressed={effectiveView === 'chart'} onClick={() => setView('chart')}>
            {t.result.chartTab}
          </button>
        </div>
      )}
      {effectiveView === 'chart' && spec ? (
        <Chart spec={spec} numberLocale={numberLocale} />
      ) : (
        <div className={pick ? 'table-wrap spot-pick' : 'table-wrap'} {...menu}>
          <table>
            <thead>
              <tr>
                {data.columns.map((c, i) => (
                  <th key={`${c}-${i}`}>{head(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row, ri) => (
                <tr key={ri} className={echo?.rows.includes(ri) ? 'echo-row' : undefined}>
                  {row.map((v, ci) => {
                    const scale = scales[ci];
                    const bar = scale !== null && typeof v === 'number' && Number.isFinite(v);
                    const shown =
                      v === null ? 'NULL' : typeof v === 'number' ? v.toLocaleString(numberLocale, { maximumFractionDigits: 4 }) : String(v);
                    if (pick) {
                      const key = `${ri}:${ci}`;
                      const marked = pick.marked.has(key);
                      const state = pick.states?.get(key);
                      return (
                        <td
                          key={ci}
                          data-label={head(data.columns[ci])}
                          className={`${typeof v === 'number' ? 'num' : ''}${bar ? ' bar-cell' : ''} spot-td`}
                          style={bar ? ({ '--fill': `${((v as number) / scale!) * 100}%` } as CSSProperties) : undefined}
                        >
                          <button
                            type="button"
                            className="spot-cell"
                            data-r={ri}
                            data-c={ci}
                            data-marked={marked || undefined}
                            data-state={state}
                            aria-pressed={marked}
                            aria-label={pick.cellAria(head(data.columns[ci]), shown, marked, state)}
                            onClick={() => !pick.locked && pick.onToggle(key)}
                          >
                            {shown}
                            {state && <span className="spot-flag" aria-hidden="true">{STATE_MARK[state]}</span>}
                          </button>
                        </td>
                      );
                    }
                    return (
                      <td
                        key={ci}
                        data-label={head(data.columns[ci])}
                        className={`${v === null ? 'null' : typeof v === 'number' ? 'num' : ''}${bar ? ' bar-cell' : ''}`}
                        style={bar ? ({ '--fill': `${((v as number) / scale!) * 100}%` } as CSSProperties) : undefined}
                      >
                        {echo?.cells.has(`${ri}:${ci}`) ? (
                          <mark className="echo-hit">
                            {typeof v === 'number' ? v.toLocaleString(numberLocale, { maximumFractionDigits: 4 }) : String(v)}
                            <span className="echo-sr"> ({t.result.namedInReply})</span>
                          </mark>
                        ) : v === null ? 'NULL' : typeof v === 'number' ? v.toLocaleString(numberLocale, { maximumFractionDigits: 4 }) : String(v)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pick?.footer && pick.footer.length > 0 && (
        <div className="spot-footer">
          {pick.footer.map((f, i) => {
            const marked = pick.marked.has(f.key);
            const state = pick.states?.get(f.key);
            return (
              <button
                key={f.key}
                type="button"
                className="spot-cell spot-foot"
                data-r={data.rows.length + i}
                data-c={0}
                data-marked={marked || undefined}
                data-state={state}
                aria-pressed={marked}
                aria-label={pick.footerAria(f.text, marked, state)}
                onClick={() => !pick.locked && pick.onToggle(f.key)}
              >
                {f.text}
                {state && <span className="spot-flag" aria-hidden="true">{STATE_MARK[state]}</span>}
              </button>
            );
          })}
        </div>
      )}
      {!pick && (
        <p className="muted" style={{ margin: '6px 0 0' }}>
          {t.result.rowsSuffix(data.totalRows)}
          {data.truncated ? t.result.truncatedSuffix(data.rows.length) : ''}
        </p>
      )}
    </div>
  );
}
