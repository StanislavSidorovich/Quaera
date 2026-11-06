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

import type { RelateDefect, RelateSpec, RelateTrap } from '../content/types';
import type { SchemaDoc } from './types';

/** Конец связи: «1» (сторона первичного ключа) или «много» (сторона внешнего). */
export type Card = 'one' | 'many';

/**
 * Направление фильтра связи: `one` идёт от стороны «1» к стороне «много» (обычное),
 * `both` в обе стороны. Переключатель виден только в заданиях с `directions`.
 */
export type Dir = 'one' | 'both';

/** Колонка записывается как `таблица.колонка`: одинаковые имена (`product_id`) есть в нескольких таблицах. */
export interface Rel {
  a: string;
  b: string;
  /** Кардинальность конца у колонки `a` и у колонки `b`. */
  ca: Card;
  cb: Card;
  /** Нет поля = `one`. */
  dir?: Dir;
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
  return [...rels, { a: x, b: y, ca: 'many', cb: 'many', dir: 'one' }];
}

export const dirOf = (r: Rel): Dir => r.dir ?? 'one';

export function setDir(rels: Rel[], index: number, dir: Dir): Rel[] {
  return rels.map((r, i) => (i === index ? { ...r, dir } : r));
}

/**
 * Куда течёт фильтр «одно»: от конца «1» к концу «много». Возвращает колонку-источник
 * и колонку-приёмник, а если концы не «1»/«много» (ещё не решено), null.
 */
export function flowOf(r: Rel): { from: string; to: string } | null {
  if (r.ca === 'one' && r.cb === 'many') return { from: r.a, to: r.b };
  if (r.ca === 'many' && r.cb === 'one') return { from: r.b, to: r.a };
  return null;
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
  /** У какой-то связи направление фильтра «оба», а нужно «одно». */
  dirs: boolean;
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

  const dirs = rels.some((r) => dirOf(r) === 'both');

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
      case 'both':
        return dirs;
    }
  };

  return {
    correct: !missing && !extra && !cards && !dirs,
    missing,
    extra,
    cards,
    dirs,
    traps: traps.filter(hit).map((t) => t.id),
  };
}

/** Числа симптома в тексте: `{n}` и `{m}` заменяются отформатированными значениями. */
export function fillSymptom(text: string, trap: RelateTrap, locale: 'ru' | 'en'): string {
  const tag = locale === 'ru' ? 'ru-RU' : 'en-US';
  let out = text;
  if (trap.n !== undefined) {
    let shown: string;
    if (trap.fmt === 'money') shown = `¥${Math.round(trap.n).toLocaleString(tag)}`;
    else if (trap.fmt === 'num') shown = trap.n.toLocaleString(tag, { maximumFractionDigits: 1 });
    else shown = Math.round(trap.n).toLocaleString(tag);
    out = out.split('{n}').join(shown);
  }
  // Второе число симптома всегда целое.
  if (trap.m !== undefined) out = out.split('{m}').join(Math.round(trap.m).toLocaleString(tag));
  return out;
}

/** Раскладка для гейта и для экрана: первая в порядке показа пара, из которой собирается эталон. */
export function referenceAsRels(reference: RefRel[]): Rel[] {
  return reference.map((r) => ({ a: r.fk, b: r.pk, ca: 'many', cb: 'one' }));
}

/**
 * Модель, с которой начинается задание «Найдите, что не так»: эталон без одной связи
 * (`missing`) или с лишней вместо эталонной (`drew`). Ответ человека сравнивается с обычным эталоном.
 */
export function startModel(reference: RefRel[], defect: RelateDefect): Rel[] {
  const rels = referenceAsRels(reference);
  const same = (r: Rel, x: string, y: string) => pairKey(r.a, r.b) === pairKey(x, y);
  if (defect.kind === 'missing') return rels.filter((r) => !same(r, defect.a, defect.b));
  const base = defect.replaces ? rels.filter((r) => !same(r, defect.replaces!.a, defect.replaces!.b)) : rels;
  return [...base, { a: defect.a, b: defect.b, ca: 'many', cb: 'many', dir: 'one' }];
}
