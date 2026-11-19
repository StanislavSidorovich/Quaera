/**
 * Операторы в прозе: разметка и словарь смыслов.
 *
 * **Как помечается.** Однострочный код внутри фразы берётся в одинарные обратные
 * кавычки, как в `rich()` у карточек (`src/ui/figureParts.tsx`); блок кода на своих
 * строках по-прежнему огораживается тройными (`proseCode.ts`). Нового синтаксиса нет.
 * Оператор или выражение с оператором в прозе стоит в такой разметке, иначе
 * `npm run test:bare-operators` падает: глаз цепляется за то, чему шаг учит сейчас,
 * только если оператор отделён от предложения.
 *
 * **Смыслы.** Оператор, стоящий в кавычках один (`>`, `IN`), при первом появлении
 * на экране получает рядом смысл словами из этого словаря. Словарь один на ru и en.
 */

export interface OpMeaning {
  ru: string;
  en: string;
}

export const OP_MEANINGS: Record<string, OpMeaning> = {
  '>': { ru: 'строго больше', en: 'strictly above' },
  '>=': { ru: 'больше или равно', en: 'greater or equal' },
  '<': { ru: 'строго меньше', en: 'strictly below' },
  '<=': { ru: 'меньше или равно', en: 'less or equal' },
  '=': { ru: 'равно', en: 'equals' },
  '==': { ru: 'равно (сравнение)', en: 'equals (comparison)' },
  '<>': { ru: 'не равно', en: 'not equal' },
  '!=': { ru: 'не равно', en: 'not equal' },
  AND: { ru: 'выполнены оба условия', en: 'both conditions hold' },
  OR: { ru: 'хотя бы одно условие', en: 'at least one condition' },
  NOT: { ru: 'наоборот', en: 'the opposite' },
  IN: { ru: 'одно из списка', en: 'one of a list' },
  BETWEEN: { ru: 'в диапазоне, границы входят', en: 'within a range, ends included' },
  LIKE: { ru: 'совпадает с шаблоном', en: 'matches a pattern' },
};

/** Однострочный код в одинарных кавычках; тройная ограда сюда не попадает. */
export const INLINE_CODE = /(?<!`)`([^`\n]+)`(?!`)/g;

export interface ProseSegment {
  code: boolean;
  text: string;
}

/** Строка прозы по кускам: обычный текст и однострочный код (без самих кавычек). */
export function splitInlineCode(text: string): ProseSegment[] {
  const out: ProseSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(INLINE_CODE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ code: false, text: text.slice(last, at) });
    out.push({ code: true, text: m[1] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ code: false, text: text.slice(last) });
  return out;
}

/** Текст для озвучки: однострочный код без обратных кавычек. */
export const stripInlineMarks = (text: string): string => text.replace(INLINE_CODE, '$1');

/** Отрезки, занятые однострочным кодом вместе с кавычками, — [начало, конец). */
export function inlineCodeRanges(text: string): [number, number][] {
  return [...text.matchAll(INLINE_CODE)].map((m) => [m.index ?? 0, (m.index ?? 0) + m[0].length]);
}

/** Знак, который читается как оператор, если стоит рядом с кодом: имя с `_`, точка, кавычка, скобка, число. */
const CODE_LIKE = /[_'[\]]|\w\.\w/;
const WORD_OPS = /(?<![\p{L}\p{N}_.])(?:AND|OR|NOT|IN|BETWEEN|LIKE)(?![\p{L}\p{N}_])/gu;
const SYMBOL_OPS = />=|<=|<>|!=|==|(?<![-=<>!])>(?![=>])|(?<![<-])<(?![=>-])/g;
const EQUALS = /(?<![<>!=])=(?!=)/g;

/**
 * Операторы вне разметки кода в строке прозы — для гейта `test:bare-operators`.
 *
 * Что ловится: `AND`, `OR`, `NOT`, `IN`, `BETWEEN`, `LIKE` заглавными как отдельное слово
 * (английские and, or, in строчными не трогаем); `>`, `>=`, `<`, `<=`, `<>`, `!=`, `==`;
 * знак `=` с пробелами с обеих сторон (не именованный аргумент `on='k'`), когда рядом стоит что-то похожее на код (имя с подчёркиванием, число,
 * кавычка, скобка): «колонка = значение», а не «Штуки = число точек × продажи».
 * Стрелки `->`, `=>`, `→` не операторы. Тройная ограда и однострочный код вырезаются.
 */
export function bareOperators(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(INLINE_CODE, ' ');
  const found: string[] = [];
  for (const m of prose.matchAll(WORD_OPS)) found.push(m[0]);
  for (const m of prose.matchAll(SYMBOL_OPS)) found.push(m[0]);
  for (const m of prose.matchAll(EQUALS)) {
    const at = m.index ?? 0;
    // Именованный аргумент без пробелов (`as_index=False`, `on='key'`) не сравнение.
    if (!/\s/.test(prose[at - 1] ?? '') || !/\s/.test(prose[at + 1] ?? '')) continue;
    const before = prose.slice(0, at).split(/\s+/).filter(Boolean).pop() ?? '';
    const after = prose.slice(at + 1).split(/\s+/).filter(Boolean)[0] ?? '';
    if (CODE_LIKE.test(before) || CODE_LIKE.test(after)) found.push('=');
  }
  return found;
}

/** Операторы, стоящие в прозе плашкой по одному (`>`, `IN`): их шаг объясняет, их подсвечиваем в примере кода. */
export function chipOperators(texts: string[]): string[] {
  const out = new Set<string>();
  for (const text of texts) for (const seg of splitInlineCode(text)) if (seg.code && OP_MEANINGS[seg.text.trim()]) out.add(seg.text.trim());
  return [...out];
}

/** Строка кода по кускам: оператор из `ops` как отдельный кусок (слова целиком, знаки длинные первыми). */
export function splitCodeByOps(line: string, ops: string[]): { op: boolean; text: string }[] {
  if (!ops.length) return [{ op: false, text: line }];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alt = [...ops].sort((a, b) => b.length - a.length).map((o) => (/^[A-Z]+$/.test(o) ? `(?<!\\w)${o}(?!\\w)` : esc(o))).join('|');
  const re = new RegExp(alt, 'g');
  const out: { op: boolean; text: string }[] = [];
  let last = 0;
  for (const m of line.matchAll(re)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ op: false, text: line.slice(last, at) });
    out.push({ op: true, text: m[0] });
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ op: false, text: line.slice(last) });
  return out;
}
