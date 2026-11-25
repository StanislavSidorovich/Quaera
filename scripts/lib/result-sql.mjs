/**
 * Исполнение `result.sql` / `result.totalSql` на Kaiyo (sql.js, `.cache/quaera.sqlite`).
 * Общее для `npm run result:write` и гейта `test:result`.
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const PACK_FILE = path.join(root, 'src', 'content', 'packs', 'model-core.json');
export const PACK_FILE_EN = path.join(root, 'src', 'content', 'packs', 'model-core.en.json');
/** Сколько строк результата хранится в задании. */
export const MAX_ROWS = 12;

let db = null;
export async function openDb() {
  if (db) return db;
  const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
  db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'quaera.sqlite'))));
  return db;
}

/** Результат запроса: `{ columns, values }`; пустой результат даёт `values: []`, а колонки sql.js не сообщает. */
export async function runSql(sql) {
  const d = await openDb();
  const res = d.exec(sql);
  if (!res.length) {
    // sql.js отдаёт пустой массив при нуле строк: колонки берём из подготовленного запроса.
    const st = d.prepare(sql);
    const columns = st.getColumnNames();
    st.free();
    return { columns, values: [] };
  }
  return { columns: res[0].columns, values: res[0].values };
}

/** Значения для JSON: sql.js отдаёт числа и строки; Uint8Array здесь не ожидается. */
export const cell = (v) => (v === undefined ? null : v);
