/**
 * Сверка реплики `after` режима истории с таблицей результата, о котором она.
 *
 * Реплика говорит про число или бренд из результата, а результат остался
 * выше и в голосе не виден. Здесь чистые функции: какие строки результата
 * названы в тексте (их подсвечивает ResultTable) и какие слова текста — имена
 * таблиц схемы (их TaskView делает кнопками). Тесты — scripts/test-after-echo.mjs.
 *
 * **Принцип: лучше промолчать, чем подсветить зря.** Подсветка, указывающая
 * на строку, о которой реплика не говорила, учит не верить подсветке. Поэтому
 * строка совпадает только по целому слову или фразе, регистр не важен, а
 * короткие и общие значения («All», «Other», «NA», «10») не совпадают никогда.
 */
import type { SqlValue } from '../engine/types';

/** Что нашлось в результате: номера строк и ячеек (строка, колонка). */
export interface EchoHits {
  /** Индексы строк, названных в тексте. */
  rows: number[];
  /** Ячейки, из-за которых строка названа: ключ `строка:колонка`. */
  cells: Set<string>;
}

/** Строковые значения короче этого не сверяются: «NA», «ID», «ВИ» совпали бы с чем угодно. */
const MIN_TOKEN = 3;

/**
 * Слова, которые бывают значением ячейки, но называют не её, а вообще.
 * «Other» в колонке канала и «other» в тексте реплики — не одно и то же.
 */
const COMMON = new Set([
  'all', 'any', 'other', 'others', 'total', 'none', 'null', 'true', 'false', 'yes', 'not', 'and', 'the',
  'new', 'old', 'top', 'low', 'high', 'mid', 'big', 'small', 'one', 'two', 'six', 'ten', 'day', 'week',
  'month', 'year', 'unknown', 'misc', 'rest', 'name', 'type', 'item', 'items', 'count', 'sum', 'avg',
  'все', 'всё', 'это', 'итого', 'прочее', 'прочие', 'другое', 'другие', 'нет', 'неделя', 'месяц', 'год',
]);

const LEFT = '(?<![\\p{L}\\p{N}_])';
const RIGHT = '(?![\\p{L}\\p{N}_])';

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Значение ячейки годится в токен для сверки со словами текста. */
function textToken(v: SqlValue): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s.length < MIN_TOKEN) return null;
  if (/^[\d\s.,:/-]+$/.test(s)) return null; // даты, коды, числа строкой
  if (COMMON.has(s.toLowerCase())) return null;
  return s;
}

/** Число из текста: «1,240», «41.3%», «3 146 133» (пробелы и запятые между тысячами). */
interface TextNumber {
  value: number;
  decimals: number;
}

function numbersIn(text: string): TextNumber[] {
  const out: TextNumber[] = [];
  const re = /(?<![\p{L}\p{N}_.,])\d{1,3}(?:[\s  ,]\d{3})+(?:[.,]\d+)?|(?<![\p{L}\p{N}_.,])\d+(?:[.,]\d+)?/gu;
  for (const m of text.matchAll(re)) {
    let raw = m[0].replace(/[\s  ]/g, '');
    // «1,240» тысячи; «41,3» десятичная запятая; «1,240.5» запятая — тысячи.
    if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(raw)) raw = raw.replace(/,/g, '');
    else raw = raw.replace(',', '.');
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    const decimals = raw.includes('.') ? raw.length - raw.indexOf('.') - 1 : 0;
    out.push({ value, decimals });
  }
  return out;
}

/**
 * Число из текста совпадает с ячейкой, если округление ячейки до
 * записанного в тексте количества знаков даёт то же число. «41.3» ← 41.2967.
 * Короткие целые («5», «37», «10») не совпадают: две цифры встречаются
 * в таблице десятком способов, а значит ничего не называют. Значимое число —
 * от трёх цифр подряд или с дробной частью.
 */
function numberMatches(cell: number, n: TextNumber): boolean {
  const digits = String(Math.trunc(Math.abs(n.value))).length;
  if (n.decimals === 0 && digits < 3) return false;
  if (n.decimals > 0 && n.value === 0) return false;
  const k = 10 ** n.decimals;
  return Math.round(cell * k) / k === n.value;
}

/** Какие строки результата названы в тексте реплики. */
export function echoHits(text: string, columns: string[], rows: SqlValue[][]): EchoHits {
  const hit = new Set<number>();
  const cells = new Set<string>();
  const nums = numbersIn(text);
  const regexCache = new Map<string, RegExp>();
  const regexFor = (token: string) => {
    let re = regexCache.get(token);
    if (!re) {
      re = new RegExp(`${LEFT}${escapeRe(token).replace(/\s+/g, '\\s+')}${RIGHT}`, 'iu');
      regexCache.set(token, re);
    }
    return re;
  };
  const idCol = columns.map((c) => /(^|_)id$/i.test(c));
  rows.forEach((row, ri) => {
    row.forEach((v, ci) => {
      let named = false;
      const token = textToken(v);
      if (token !== null) named = regexFor(token).test(text);
      else if (typeof v === 'number' && Number.isFinite(v) && !idCol[ci]) {
        named = nums.some((n) => numberMatches(v, n));
      }
      if (named) {
        hit.add(ri);
        cells.add(`${ri}:${ci}`);
      }
    });
  });
  return { rows: [...hit].sort((a, b) => a - b), cells };
}

/** Кусок текста реплики: обычный или имя таблицы схемы. */
export type EchoPart = { kind: 'text'; text: string } | { kind: 'table'; text: string };

/** Режет текст на куски по именам таблиц схемы (целое слово, регистр не важен для поиска, имя возвращается как в тексте). */
export function splitTables(text: string, tables: string[]): EchoPart[] {
  const names = [...new Set(tables)].filter((t) => t.length >= 4).sort((a, b) => b.length - a.length);
  if (!names.length) return [{ kind: 'text', text }];
  const re = new RegExp(`${LEFT}(${names.map(escapeRe).join('|')})${RIGHT}`, 'giu');
  const parts: EchoPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) parts.push({ kind: 'text', text: text.slice(last, at) });
    parts.push({ kind: 'table', text: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts.length ? parts : [{ kind: 'text', text }];
}
