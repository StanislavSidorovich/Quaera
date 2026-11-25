/**
 * `npm run result:write [id…]`: исполняет `result.sql` / `result.totalSql` заданий трека model на Kaiyo
 * и записывает `head`, `rows` (не больше 12), `rowCount`, `total` в model-core.json.
 * Без id берутся все задания с `result`. Формат файла сохраняется: заменяется только объект `result`
 * (ключи в каноническом порядке), остальной текст не трогается. Числа руками не набирать.
 * Python-ветка (pandas) отдельным заходом.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { MAX_ROWS, PACK_FILE, cell, runSql } from './lib/result-sql.mjs';

const ORDER = ['visual', 'sql', 'totalSql', 'head', 'rows', 'rowCount', 'total', 'fmt', 'focus', 'labels', 'caption', 'empty'];

/** Конец JSON-объекта, открывающегося в `start` (учитывает строки и экранирование). */
function objectEnd(raw, start) {
  let depth = 0;
  let inStr = false;
  for (let i = start; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (c === '\\') i++;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  throw new Error('не закрыта скобка объекта result');
}

const ind = (n) => ' '.repeat(n);

/** Объект result одним блоком: строки таблицы по одной на строку файла. */
export function serializeResult(res, base) {
  const lines = [];
  for (const key of ORDER) {
    if (res[key] === undefined) continue;
    const v = res[key];
    if (key === 'rows') {
      const rows = v.map((r) => `${ind(base + 4)}${JSON.stringify(r)}`);
      lines.push(`${ind(base + 2)}"rows": [${rows.length ? '\n' + rows.join(',\n') + '\n' + ind(base + 2) : ''}]`);
    } else if (key === 'head' || key === 'total') {
      lines.push(`${ind(base + 2)}"${key}": ${JSON.stringify(v)}`);
    } else if (typeof v === 'object') {
      const inner = Object.entries(v).map(([k, x]) => `${ind(base + 4)}${JSON.stringify(k)}: ${JSON.stringify(x)}`);
      lines.push(`${ind(base + 2)}"${key}": {\n${inner.join(',\n')}\n${ind(base + 2)}}`);
    } else lines.push(`${ind(base + 2)}"${key}": ${JSON.stringify(v)}`);
  }
  return `{\n${lines.join(',\n')}\n${ind(base)}}`;
}

const only = process.argv.slice(2);
let raw = readFileSync(PACK_FILE, 'utf8');
const pack = JSON.parse(raw);
const tasks = pack.tasks.filter((t) => t.result && (!only.length || only.includes(t.id)));
if (only.length) for (const id of only) if (!tasks.some((t) => t.id === id)) throw new Error(`result:write: у задания ${id} нет result`);

for (const t of tasks) {
  const r = { ...t.result };
  if (t.track === 'python' || !r.sql) throw new Error(`result:write: ${t.id}: python-ветка ещё не сделана (pandas отдельным заходом)`);
  const main = await runSql(r.sql);
  r.head = main.columns;
  r.rows = main.values.slice(0, MAX_ROWS).map((row) => row.map(cell));
  r.rowCount = main.values.length;
  if (r.totalSql) {
    const tot = await runSql(r.totalSql);
    if (tot.values.length !== 1) throw new Error(`result:write: ${t.id}: totalSql вернул ${tot.values.length} строк вместо одной`);
    r.total = tot.values[0].map(cell);
  } else delete r.total;
  const at = raw.indexOf(`"id": "${t.id}"`);
  const keyAt = at < 0 ? -1 : raw.indexOf('"result": {', at);
  const nextTask = raw.indexOf('\n      "id": ', at + 1);
  if (keyAt < 0 || (nextTask > 0 && keyAt > nextTask)) throw new Error(`result:write: не найден объект result у ${t.id}`);
  const start = keyAt + '"result": '.length;
  const lineStart = raw.lastIndexOf('\n', keyAt) + 1;
  const base = keyAt - lineStart;
  raw = raw.slice(0, start) + serializeResult(r, base) + raw.slice(objectEnd(raw, start));
  console.log(`result:write ${t.id}: ${r.rows.length} из ${r.rowCount} строк${r.total ? ', итог' : ''}`);
}
writeFileSync(PACK_FILE, raw);
