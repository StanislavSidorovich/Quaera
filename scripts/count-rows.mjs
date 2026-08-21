/**
 * Пересчёт строк по таблицам — то, что можно прогнать самому и своими глазами.
 *
 * Зачем отдельно от verify:data. Тот гейт читает `.cache/quaera.sqlite`, то есть
 * промежуточный файл сборки, и проверяет сюжеты («бренд падает из-за потери
 * точек»). Здесь другое: берётся ровно тот файл, который уезжает в браузер
 * пользователя (`public/data/quaera.dataset`, gzip поверх SQLite), и по нему
 * пересчитывается COUNT(*) каждой таблицы. Числа сверяются с `row_count`
 * в `public/data/schema.json` — это то, что приложение печатает на экране
 * «Данные».
 *
 * То есть проверяются два разных утверждения:
 *   1) в поставленной базе столько строк, сколько говорит схема;
 *   2) сумма по таблицам — то самое число, которым проза хвалится в тексте.
 *
 * Расхождение возможно ровно одно и известное: схему и базу собирает один
 * прогон `npm run gen:data`, и если после него правили только схему руками,
 * разъедется здесь.
 *
 * Запуск: npm run count:rows
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const raw = readFileSync(path.join(root, 'public', 'data', 'quaera.dataset'));
// Файл лежит пожатым: так его отдаёт сборка и так его получает браузер.
// Признак gzip — первые два байта 1f 8b; распакованный SQLite начинается
// со строки «SQLite format 3».
const bytes = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;

const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
const db = new SQL.Database(new Uint8Array(bytes));

const one = (sql) => db.exec(sql)[0].values[0][0];

const tables = db
  .exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")[0]
  .values.map((v) => v[0]);

const schema = JSON.parse(readFileSync(path.join(root, 'public', 'data', 'schema.json'), 'utf8'));
const declared = Object.fromEntries(schema.tables.map((t) => [t.table, t.row_count]));

let total = 0;
let mismatched = 0;
const report = tables.map((name) => {
  const rows = one(`SELECT COUNT(*) FROM "${name}"`);
  total += rows;
  const inSchema = declared[name];
  const ok = inSchema === undefined ? '—' : inSchema === rows ? 'ok' : 'РАСХОЖДЕНИЕ';
  if (ok === 'РАСХОЖДЕНИЕ') mismatched++;
  return { таблица: name, строк: rows, 'в схеме': inSchema ?? '—', сверка: ok };
});

console.table(report);
console.log(`\nТаблиц: ${tables.length}`);
console.log(`Всего строк: ${total.toLocaleString('ru-RU')}`);
console.log(`Файл: public/data/quaera.dataset — ${(raw.length / 1024 / 1024).toFixed(2)} МБ gzip, ${(bytes.length / 1024 / 1024).toFixed(2)} МБ распакованный`);

if (mismatched) {
  console.error(`\nСхема расходится с базой у ${mismatched} таблиц — пересоберите: npm run gen:data`);
  process.exit(1);
}
console.log('\nСхема и база говорят одно и то же.');
