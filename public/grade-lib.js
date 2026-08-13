/* eslint-disable no-restricted-globals */
/**
 * Сверка результата с эталоном — общая для всех исполнителей кода (SQL, Python).
 *
 * Вынесено из sql-worker.js: python-worker.js подключает тот же файл через
 * importScripts, чтобы «правильный ответ» значило одно и то же независимо
 * от языка — числа с допуском, разрезы отдельно от мер, порядок не важен,
 * если не сказано обратное.
 */

const isNum = (v) => typeof v === 'number';
const NUM_TOLERANCE = 1e-6;

/** Числа сравниваем с относительным допуском: ROUND и порядок операций дают дребезг. */
function sameValue(a, b) {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (isNum(a) && isNum(b)) {
    if (a === b) return true;
    const scale = Math.max(Math.abs(a), Math.abs(b), 1);
    return Math.abs(a - b) / scale < NUM_TOLERANCE;
  }
  if (isNum(a) !== isNum(b)) {
    // '10' и 10 — считаем совпадением: движки легко возвращают число текстом
    const na = Number(a);
    const nb = Number(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return sameValue(na, nb);
    return false;
  }
  return String(a).trim() === String(b).trim();
}

/** Канонический вид строки — для сравнения множеств независимо от порядка. */
function rowKey(row) {
  return row
    .map((v) => (v === null ? ' ' : isNum(v) ? (Math.round(v * 1e6) / 1e6).toString() : String(v).trim()))
    .join('');
}

function sameRow(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
  return true;
}

/**
 * Ключевые колонки — те, где значения не числовые: обычно это разрезы
 * (месяц, бренд, регион), а числовые колонки — меры. Разделение позволяет
 * сказать не просто «не сходится», а «разрезы те же, а цифры разошлись».
 */
function keyColumnIndexes(columns, rows) {
  const idx = [];
  for (let c = 0; c < columns.length; c++) {
    const anyNumeric = rows.some((r) => isNum(r[c]));
    if (!anyNumeric) idx.push(c);
  }
  return idx.length ? idx : [0];
}

/**
 * Те же данные, но колонки переставлены.
 *
 * Случай стоит отдельным диагнозом, потому что сравнение строк позиционное:
 * rowKey склеивает значения в порядке колонок, поэтому перестановка двух
 * колонок расходит разом все строки. Дальше расхождение попадало в 'both'
 * («часть строк лишняя, часть отсутствует» при равном числе строк) с
 * подсказкой про GROUP BY — на задании, где никакой группировки нет вовсе.
 *
 * Перестановка ищется сначала по именам колонок, потом по значениям (имён
 * может не быть вовсе — человек забыл алиас), и в обоих случаях проверяется
 * пересборкой: диагноз ставится, только если после перестановки строки
 * сходятся с эталоном. Без этой проверки сопоставление по именам приняло бы
 * за перестановку и по-настоящему неверный ответ, где алиас навешен
 * не на ту колонку.
 */
const MAX_PERM_ROWS = 5000;

/** Сигнатура колонки — её значения в порядке строк, тем же каноном, что rowKey. */
function columnKey(rows, c) {
  return rows
    .map((r) => (r[c] === null ? ' ' : isNum(r[c]) ? (Math.round(r[c] * 1e6) / 1e6).toString() : String(r[c]).trim()))
    .join('');
}

function permByNames(userCols, expectedCols) {
  const norm = (s) => String(s).trim().toLowerCase();
  const used = new Array(userCols.length).fill(false);
  const perm = [];
  for (const want of expectedCols) {
    const i = userCols.findIndex((c, k) => !used[k] && norm(c) === norm(want));
    if (i === -1) return null;
    used[i] = true;
    perm.push(i);
  }
  return perm;
}

function permByValues(user, expected) {
  const userSigs = user.columns.map((_, c) => columnKey(user.rows, c));
  const used = new Array(user.columns.length).fill(false);
  const perm = [];
  for (let c = 0; c < expected.columns.length; c++) {
    const want = columnKey(expected.rows, c);
    const i = userSigs.findIndex((s, k) => !used[k] && s === want);
    if (i === -1) return null;
    used[i] = true;
    perm.push(i);
  }
  return perm;
}

function rowsEqual(a, b, orderMatters) {
  if (a.length !== b.length) return false;
  if (orderMatters) return a.every((r, i) => sameRow(r, b[i]));
  const counts = new Map();
  for (const r of a) {
    const k = rowKey(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const r of b) {
    const k = rowKey(r);
    const n = counts.get(k) ?? 0;
    if (!n) return false;
    counts.set(k, n - 1);
  }
  return true;
}

function findColumnOrder(user, expected, orderMatters) {
  if (user.rows.length !== expected.rows.length) return null;
  if (!user.rows.length || user.rows.length > MAX_PERM_ROWS) return null;
  const candidates = [permByNames(user.columns, expected.columns), permByValues(user, expected)];
  for (const perm of candidates) {
    if (!perm) continue;
    if (perm.every((i, j) => i === j)) continue;
    const reordered = user.rows.map((r) => perm.map((i) => r[i]));
    if (rowsEqual(reordered, expected.rows, orderMatters)) return perm;
  }
  return null;
}

function compare(user, expected, opts) {
  const orderMatters = !!opts.orderMatters;
  const result = {
    ok: false,
    reason: null,
    userRows: user.rows.length,
    expectedRows: expected.rows.length,
    userCols: user.columns,
    expectedCols: expected.columns,
    extraRows: 0,
    missingRows: 0,
    sameSetWrongOrder: false,
    keysMatchValuesDiffer: false,
    columnNamesDiffer: false,
    sampleExtra: [],
    sampleMissing: [],
    sampleMismatch: [],
  };

  if (user.columns.length !== expected.columns.length) {
    result.reason = 'columns_count';
    return result;
  }

  const norm = (s) => String(s).trim().toLowerCase();
  result.columnNamesDiffer = user.columns.some((c, i) => norm(c) !== norm(expected.columns[i]));

  // 1. Сравнение как множеств: отвечает на вопрос «те же ли данные вообще».
  const userCounts = new Map();
  for (const r of user.rows) {
    const k = rowKey(r);
    userCounts.set(k, (userCounts.get(k) ?? 0) + 1);
  }
  const expCounts = new Map();
  for (const r of expected.rows) {
    const k = rowKey(r);
    expCounts.set(k, (expCounts.get(k) ?? 0) + 1);
  }
  const expByKey = new Map(expected.rows.map((r) => [rowKey(r), r]));
  const userByKey = new Map(user.rows.map((r) => [rowKey(r), r]));

  for (const [k, n] of userCounts) {
    const diff = n - (expCounts.get(k) ?? 0);
    if (diff > 0) {
      result.extraRows += diff;
      if (result.sampleExtra.length < 3) result.sampleExtra.push(userByKey.get(k));
    }
  }
  for (const [k, n] of expCounts) {
    const diff = n - (userCounts.get(k) ?? 0);
    if (diff > 0) {
      result.missingRows += diff;
      if (result.sampleMissing.length < 3) result.sampleMissing.push(expByKey.get(k));
    }
  }

  const setsEqual = result.extraRows === 0 && result.missingRows === 0;

  if (setsEqual) {
    if (!orderMatters) {
      result.ok = true;
      return result;
    }
    // Множества совпали — проверяем последовательность.
    const ordered = user.rows.length === expected.rows.length &&
      user.rows.every((r, i) => sameRow(r, expected.rows[i]));
    if (ordered) {
      result.ok = true;
      return result;
    }
    result.sameSetWrongOrder = true;
    result.reason = 'order';
    return result;
  }

  // 1а. Те же данные, но колонки переставлены — см. findColumnOrder. Проверка
  // стоит до разбора мер: перестановка числовых колонок при неизменных разрезах
  // иначе уходит в 'values' и объясняется расхождением цифр, которого нет.
  if (findColumnOrder(user, expected, orderMatters)) {
    result.reason = 'columns_order';
    return result;
  }

  // 2. Разрезы совпали, а меры — нет. Самый частый и самый информативный случай.
  const keyIdx = keyColumnIndexes(expected.columns, expected.rows);
  const keyOf = (r) => keyIdx.map((i) => (r[i] === null ? ' ' : String(r[i]).trim())).join('');
  const userByDim = new Map(user.rows.map((r) => [keyOf(r), r]));
  const expByDim = new Map(expected.rows.map((r) => [keyOf(r), r]));
  if (userByDim.size === expByDim.size && [...expByDim.keys()].every((k) => userByDim.has(k))) {
    result.keysMatchValuesDiffer = true;
    result.reason = 'values';
    for (const [k, exp] of expByDim) {
      if (result.sampleMismatch.length >= 6) break;
      const got = userByDim.get(k);
      if (!sameRow(got, exp)) {
        const col = exp.findIndex((v, i) => !sameValue(v, got[i]));
        result.sampleMismatch.push({
          key: keyIdx.map((i) => exp[i]).join(' / '),
          column: expected.columns[col] ?? '',
          expected: exp[col],
          got: got[col],
          ratio: isNum(exp[col]) && isNum(got[col]) && exp[col] !== 0 ? got[col] / exp[col] : null,
        });
      }
    }
    return result;
  }

  result.reason = result.extraRows && result.missingRows ? 'both' : result.extraRows ? 'extra' : 'missing';
  return result;
}
