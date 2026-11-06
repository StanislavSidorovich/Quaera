/**
 * Движок задания «Найдите, что не так» (`mode: 'spot'`): чистая логика без React,
 * чтобы ту же функцию звали экран и гейт `test:spot`.
 *
 * В задании лежит верная таблица (`rows`, её считает запрос `sql` к Kaiyo, гейт сверяет) и список порч
 * поверх неё (`mutate`). Дефектные клетки не размечаются руками: движок применяет порчи и сам выводит,
 * какие клетки испорчены. Так гейт знает и верную таблицу, и испорченную, и может проверить, что
 * отмеченные дефекты это ровно изменённые клетки.
 *
 * Клетки адресуются ключами: `строка:колонка` у тела таблицы, `f:rows` и `f:total` у подвала.
 *
 * Проверка «всё или ничего»: у каждой порчи отмечена хотя бы одна её клетка и нет ни одной отметки вне
 * порч. Счётчика «2 из 3» нет, иначе перебор. Задвоенную строку отмечают в любой из двух копий: они
 * неотличимы, и штрафовать за выбор верхней было бы нечестно. Кнопка «Всё в порядке» это ответ
 * «дефектов нет»: верна только на таблице без порч.
 */

import type { SpotDecoy, SpotMutation, SpotSpec } from '../content/types';

export type SpotValue = string | number;

export const FOOTER_ROWS = 'f:rows';
export const FOOTER_TOTAL = 'f:total';
export const cellKey = (row: number, col: number) => `${row}:${col}`;

export interface SpotDefect {
  /** Id порчи (`mutate[i].id`). */
  id: string;
  /** Клетки, любая из которых засчитывается как «замечено». */
  cells: string[];
  /** Для `scale`: значение испорченной клетки, как оно показано (`{value}` в разборе). */
  value?: number;
}

export interface SpotBuilt {
  /** Строки испорченной таблицы, как их видит человек. */
  rows: SpotValue[][];
  /** «Строк: N» в подвале или null, если подвала нет. */
  footerRows: number | null;
  /** «Итог» в подвале или null. Сумма показанных строк плюс порча `total`. */
  footerTotal: number | null;
  /** Сумма показанных строк колонки итога (без порчи `total`). */
  sum: number | null;
  /** Сколько строк в верной таблице. */
  expectedRows: number;
  defects: SpotDefect[];
  /** Ключ клетки каждой приманки, позиционно к `spec.decoys`. */
  decoyCells: string[];
  /** Что не сошлось при сборке (строка не найдена, колонки нет…). У исправного задания пусто. */
  errors: string[];
}

interface Live {
  cells: SpotValue[];
  /** Значения верной строки: по ним ищут `where`, чтобы порча не сбивала адресацию приманок. */
  orig: SpotValue[];
}

/** Строки верной таблицы, подходящие под `where` (все указанные колонки равны). */
function matches(head: string[], rows: Live[], where: Record<string, string | number>): Live[] {
  const entries = Object.entries(where);
  return rows.filter((r) =>
    entries.every(([col, v]) => {
      const ci = head.indexOf(col);
      return ci >= 0 && String(r.orig[ci]) === String(v);
    })
  );
}

export function buildSpot(spec: SpotSpec): SpotBuilt {
  const { head } = spec;
  const errors: string[] = [];
  const clean: Live[] = spec.rows.map((r) => ({ cells: [...r], orig: [...r] }));
  let rows = [...clean];

  const one = (what: string, where: Record<string, string | number> | undefined): Live | null => {
    if (!where) {
      errors.push(`${what}: нет where`);
      return null;
    }
    const found = matches(head, clean, where);
    if (found.length !== 1) {
      errors.push(`${what}: where подходит строкам: ${found.length}`);
      return null;
    }
    return found[0];
  };

  // Порча → объекты строк и колонки; индексы считаются после всех порч, когда строки уже сдвинулись.
  const touched: { id: string; kind: SpotMutation['kind']; targets: Live[]; col?: number }[] = [];
  let totalDelta = 0;

  for (const m of spec.mutate) {
    if (m.kind === 'total') {
      if (!spec.footer?.total) errors.push(`${m.id}: порча total без footer.total`);
      if (!m.delta) errors.push(`${m.id}: у total нет delta`);
      totalDelta += m.delta ?? 0;
      touched.push({ id: m.id, kind: m.kind, targets: [] });
      continue;
    }
    const target = one(m.id, m.where);
    if (!target) continue;
    if (m.kind === 'drop') {
      if (!spec.footer?.rows) errors.push(`${m.id}: порча drop без footer.rows`);
      rows = rows.filter((r) => r !== target);
      touched.push({ id: m.id, kind: m.kind, targets: [] });
    } else if (m.kind === 'scale') {
      const ci = m.column ? head.indexOf(m.column) : -1;
      const v = ci >= 0 ? target.cells[ci] : undefined;
      if (ci < 0 || typeof v !== 'number') {
        errors.push(`${m.id}: column «${m.column}» не числовая колонка`);
        continue;
      }
      target.cells[ci] = v * (m.factor ?? 1);
      touched.push({ id: m.id, kind: m.kind, targets: [target], col: ci });
    } else {
      const copy: Live = { cells: [...target.cells], orig: [...target.orig] };
      const at = rows.indexOf(target);
      if (at < 0) {
        errors.push(`${m.id}: строка уже убрана`);
        continue;
      }
      rows = [...rows.slice(0, at + 1), copy, ...rows.slice(at + 1)];
      touched.push({ id: m.id, kind: m.kind, targets: [target, copy] });
    }
  }

  const totalCol = spec.footer?.total ? head.indexOf(spec.footer.total) : -1;
  if (spec.footer?.total && totalCol < 0) errors.push(`footer.total: колонки «${spec.footer.total}» нет`);
  const sum =
    totalCol >= 0
      ? rows.reduce((n, r) => n + (typeof r.cells[totalCol] === 'number' ? (r.cells[totalCol] as number) : 0), 0)
      : null;

  const defects: SpotDefect[] = touched.map((t) => {
    if (t.kind === 'drop') return { id: t.id, cells: [FOOTER_ROWS] };
    if (t.kind === 'total') return { id: t.id, cells: [FOOTER_TOTAL] };
    if (t.kind === 'scale') {
      const cell = t.targets[0].cells[t.col!];
      return {
        id: t.id,
        cells: t.targets.map((r) => cellKey(rows.indexOf(r), t.col!)),
        value: typeof cell === 'number' ? cell : undefined,
      };
    }
    return {
      id: t.id,
      cells: t.targets.flatMap((r) => head.map((_, ci) => cellKey(rows.indexOf(r), ci))),
    };
  });

  const decoyCells = spec.decoys.map((d, i) => {
    const target = one(`decoys[${i}]`, d.where);
    const ci = head.indexOf(d.column);
    if (ci < 0) errors.push(`decoys[${i}]: колонки «${d.column}» нет`);
    const ri = target ? rows.indexOf(target) : -1;
    if (target && ri < 0) errors.push(`decoys[${i}]: строка убрана порчей`);
    return ri >= 0 && ci >= 0 ? cellKey(ri, ci) : '';
  });

  return {
    rows: rows.map((r) => r.cells),
    footerRows: spec.footer?.rows ? rows.length : null,
    footerTotal: sum === null ? null : sum + totalDelta,
    sum,
    expectedRows: clean.length,
    defects,
    decoyCells,
    errors,
  };
}

export interface SpotVerdict {
  correct: boolean;
  /** Нажата «Всё в порядке». */
  allOk: boolean;
  /** Id порч, у которых отмечена хотя бы одна клетка. */
  found: string[];
  /** Id порч, которых человек не заметил. */
  missed: string[];
  /** Отметки вне порч. */
  extra: string[];
  /** Индексы приманок среди лишних отметок. */
  decoyHits: number[];
}

export function gradeSpot(built: SpotBuilt, marks: string[], allOk: boolean): SpotVerdict {
  const marked = new Set(allOk ? [] : marks);
  const inDefect = new Set(built.defects.flatMap((d) => d.cells));
  const found = built.defects.filter((d) => d.cells.some((c) => marked.has(c))).map((d) => d.id);
  const missed = built.defects.filter((d) => !found.includes(d.id)).map((d) => d.id);
  const extra = [...marked].filter((c) => !inDefect.has(c));
  const decoyHits = built.decoyCells.flatMap((c, i) => (c && extra.includes(c) ? [i] : []));
  return { correct: missed.length === 0 && extra.length === 0, allOk, found, missed, extra, decoyHits };
}

/** Состояние клетки после проверки: для подсветки в таблице. */
export type SpotCellState = 'hit' | 'miss' | 'extra';

export function cellStates(built: SpotBuilt, marks: string[], verdict: SpotVerdict): Map<string, SpotCellState> {
  const out = new Map<string, SpotCellState>();
  const marked = new Set(verdict.allOk ? [] : marks);
  for (const d of built.defects) {
    const hit = verdict.found.includes(d.id);
    for (const c of d.cells) {
      if (marked.has(c)) out.set(c, 'hit');
    }
    // Пропущенный дефект показывается всеми своими клетками, найденный только отмеченными.
    if (!hit) for (const c of d.cells) out.set(c, 'miss');
  }
  for (const c of verdict.extra) out.set(c, 'extra');
  return out;
}

export interface FillSource {
  fmt?: 'int' | 'money' | 'num';
  n?: number;
  m?: number;
}

/**
 * Числа разбора. `{n}` и `{m}` приходят из запросов к Kaiyo (`sql`, `sql2`), остальные считает сам
 * движок из таблицы задания: `{delta}`, `{factor}` и `{value}` (значение испорченной клетки) порчи, `{sum}` сумма показанных строк, `{total}`
 * итог в подвале, `{rows}` показанных строк, `{expected}` строк в верной таблице.
 */
export function fillWhy(
  text: string,
  src: FillSource & { delta?: number; factor?: number; value?: number },
  built: SpotBuilt,
  locale: 'ru' | 'en'
): string {
  const tag = locale === 'ru' ? 'ru-RU' : 'en-US';
  const int = (v: number) => Math.round(v).toLocaleString(tag);
  const shown = (v: number) => {
    if (src.fmt === 'money') return `¥${int(v)}`;
    if (src.fmt === 'num') return v.toLocaleString(tag, { maximumFractionDigits: 1 });
    return int(v);
  };
  let out = text;
  const put = (key: string, value: string | null) => {
    if (value !== null) out = out.split(`{${key}}`).join(value);
  };
  put('n', src.n === undefined ? null : shown(src.n));
  put('m', src.m === undefined ? null : int(src.m));
  put('delta', src.delta === undefined ? null : int(Math.abs(src.delta)));
  put('factor', src.factor === undefined ? null : int(src.factor));
  put('value', src.value === undefined ? null : int(src.value));
  put('sum', built.sum === null ? null : int(built.sum));
  put('total', built.footerTotal === null ? null : int(built.footerTotal));
  put('rows', int(built.rows.length));
  put('expected', int(built.expectedRows));
  return out;
}

/** Все плейсхолдеры, которые знает fillWhy: гейт ищет ими опечатки и руками набранные числа. */
export const WHY_PLACEHOLDERS = ['n', 'm', 'delta', 'factor', 'value', 'sum', 'total', 'rows', 'expected'] as const;

export type { SpotDecoy, SpotMutation, SpotSpec };
