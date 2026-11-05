/**
 * Движок задания «Проведите связи» (`mode: 'relate'`): чистая логика без React,
 * чтобы ту же функцию звали экран и гейт `test:relate`.
 *
 * Эталона в задании нет. Верные связи и их кардинальность выводятся из внешних
 * ключей схемы датасета (`schema.json`): внешний ключ это пара «колонка факта
 * (много) → колонка справочника (1)», сторона «1» это сторона первичного ключа.
 * В задании хранится только состав: какие таблицы показаны и какие их колонки
 * раскрыты (в том числе приманки), плюс разборы ловушек.
 *
 * Проверка «всё или ничего»: множество связей человека совпадает с эталоном
 * вместе с кардинальностью концов. Счётчика «3 из 5» нет, иначе перебор.
 * Ловушка это не второй эталон, а описание ошибки (провёл лишнее, не провёл
 * нужное, поставил «много» на сторону ключа); совпавшие ловушки показываются
 * все, каждая со своим разбором.
 */

import type { RelateSpec, RelateTrap } from '../content/types';
import type { SchemaDoc } from './types';

/** Конец связи: «1» (сторона первичного ключа) или «много» (сторона внешнего). */
export type Card = 'one' | 'many';

/** Колонка записывается как `таблица.колонка`: одинаковые имена (`product_id`) есть в нескольких таблицах. */
export interface Rel {
  a: string;
  b: string;
  /** Кардинальность конца у колонки `a` и у колонки `b`. */
  ca: Card;
  cb: Card;
}

/** Эталонная связь: `fk` (много) → `pk` (1). */
export interface RefRel {
  fk: string;
  pk: string;
}

export const colKey = (table: string, column: string) => `${table}.${column}`;
export const tableOf = (key: string) => key.slice(0, key.indexOf('.'));

/** Ключ неупорядоченной пары: связь `a — b` и `b — a` это одна связь. */
export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * Эталон: все внешние ключи между показанными таблицами. Собственные ссылки
 * таблицы на себя (`manager_id`) в модель этих заданий не входят.
 */
export function referenceRelations(doc: SchemaDoc, shown: string[]): RefRel[] {
  const inShown = new Set(shown);
  const out: RefRel[] = [];
  for (const t of doc.tables) {
    if (!inShown.has(t.table)) continue;
    for (const c of t.columns) {
      const ref = c.references;
      if (!ref || ref.table === t.table || !inShown.has(ref.table)) continue;
      out.push({ fk: colKey(t.table, c.name), pk: colKey(ref.table, ref.column) });
    }
  }
  return out;
}

/** Все раскрытые колонки задания в виде ключей `таблица.колонка`. */
export function exposedColumns(spec: RelateSpec): string[] {
  return spec.tables.flatMap((t) => t.columns.map((c) => colKey(t.table, c)));
}

/**
 * Урезанная схема для раскладки: только показанные таблицы и только связи между
 * ними. Группы факт/справочник выводит из этих связей общая раскладка схемы
 * (`buildSchemaLayout`), поэтому ссылки наружу и на себя отрезаны здесь.
 */
export function subsetDoc(doc: SchemaDoc, shown: string[]): SchemaDoc {
  const inShown = new Set(shown);
  return {
    ...doc,
    tables: doc.tables
      .filter((t) => inShown.has(t.table))
      .map((t) => ({
        ...t,
        columns: t.columns.map((c) =>
          c.references && (!inShown.has(c.references.table) || c.references.table === t.table) ? { ...c, references: undefined } : c
        ),
      })),
  };
}

/** Колонка уже в связи с этим соседом? Повторное касание той же пары убирает связь. */
export function findRel(rels: Rel[], x: string, y: string): number {
  const k = pairKey(x, y);
  return rels.findIndex((r) => pairKey(r.a, r.b) === k);
}

/** Добавляет связь или, если такая пара уже есть, убирает её. Внутри одной таблицы связи не бывает. */
export function toggleRel(rels: Rel[], x: string, y: string): Rel[] {
  if (x === y || tableOf(x) === tableOf(y)) return rels;
  const i = findRel(rels, x, y);
  if (i >= 0) return rels.filter((_, j) => j !== i);
  // Оба конца сначала «много»: человек сам решает, где «1».
  return [...rels, { a: x, b: y, ca: 'many', cb: 'many' }];
}

export function setCard(rels: Rel[], index: number, end: 'a' | 'b', card: Card): Rel[] {
  return rels.map((r, i) => (i === index ? (end === 'a' ? { ...r, ca: card } : { ...r, cb: card }) : r));
}

export interface RelateVerdict {
  correct: boolean;
  /** Нужной связи нет. */
  missing: boolean;
  /** Есть связь, которой в эталоне нет. */
  extra: boolean;
  /** Связь на месте, но «1»/«много» стоят не так. */
  cards: boolean;
  /** Id совпавших ловушек в порядке задания. */
  traps: string[];
}

const cardAt = (r: Rel, col: string): Card => (r.a === col ? r.ca : r.cb);

export function gradeRelate(rels: Rel[], reference: RefRel[], traps: RelateTrap[]): RelateVerdict {
  const refByPair = new Map(reference.map((r) => [pairKey(r.fk, r.pk), r]));
  const mine = new Map(rels.map((r) => [pairKey(r.a, r.b), r]));

  const missing = reference.some((r) => !mine.has(pairKey(r.fk, r.pk)));
  const extra = rels.some((r) => !refByPair.has(pairKey(r.a, r.b)));
  const cards = rels.some((r) => {
    const ref = refByPair.get(pairKey(r.a, r.b));
    return ref ? cardAt(r, ref.fk) !== 'many' || cardAt(r, ref.pk) !== 'one' : false;
  });

  const hit = (t: RelateTrap): boolean => {
    switch (t.kind) {
      case 'drew':
        return mine.has(pairKey(t.a!, t.b!)) && !refByPair.has(pairKey(t.a!, t.b!));
      case 'touch':
        return rels.some((r) => tableOf(r.a) === t.table || tableOf(r.b) === t.table);
      case 'missing':
        return !mine.has(pairKey(t.a!, t.b!));
      case 'keyMany': {
        // «Много» на стороне первичного ключа у любой эталонной связи (в том числе оба конца «много»).
        return reference.some((ref) => {
          const r = mine.get(pairKey(ref.fk, ref.pk));
          return r ? cardAt(r, ref.pk) === 'many' : false;
        });
      }
    }
  };

  return {
    correct: !missing && !extra && !cards,
    missing,
    extra,
    cards,
    traps: traps.filter(hit).map((t) => t.id),
  };
}

/** Число симптома в тексте: `{n}` заменяется отформатированным значением. */
export function fillSymptom(text: string, trap: RelateTrap, locale: 'ru' | 'en'): string {
  if (trap.n === undefined) return text;
  const tag = locale === 'ru' ? 'ru-RU' : 'en-US';
  let shown: string;
  if (trap.fmt === 'money') shown = `¥${Math.round(trap.n).toLocaleString(tag)}`;
  else if (trap.fmt === 'num') shown = trap.n.toLocaleString(tag, { maximumFractionDigits: 1 });
  else shown = Math.round(trap.n).toLocaleString(tag);
  return text.split('{n}').join(shown);
}

/** Раскладка для гейта и для экрана: первая в порядке показа пара, из которой собирается эталон. */
export function referenceAsRels(reference: RefRel[]): Rel[] {
  return reference.map((r) => ({ a: r.fk, b: r.pk, ca: 'many', cb: 'one' }));
}
