/**
 * Гейт: числа вставки «что такое промежуточная таблица» у дня day-8-two-steps
 * (src/content/cteInset.json, рисует CteMeaningFigure) против настоящего датасета.
 * Фильтр тот же, что у задания sql-118: Nettora, 2024. Вставка статична, и без
 * гейта она молча разошлась бы с данными при пересборке датасета.
 *
 * Запуск: npm run test:cte-inset (входит в npm run verify).
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
const db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'quaera.sqlite'))));
const inset = JSON.parse(readFileSync(path.join(root, 'src/content/cteInset.json'), 'utf8'));

let failed = 0;
const check = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) console.log(` ok    ${name}: ${JSON.stringify(want)}`);
  else {
    console.log(` FAIL  ${name}: в данных ${JSON.stringify(got)}, во вставке ${JSON.stringify(want)}`);
    failed++;
  }
};

// Фильтр взят из solution задания sql-118; сверяем, что задание его не поменяло.
const task = JSON.parse(readFileSync(path.join(root, 'src/content/packs/sql-core.json'), 'utf8')).tasks.find((t) => t.id === 'sql-118');
const where = "WHERE product_id IN (SELECT product_id FROM dim_product WHERE brand = 'Nettora')\n    AND week_start BETWEEN '2024-01-01' AND '2024-12-31'";
if (!task.solution.includes(where)) {
  console.log(' FAIL  sql-118: фильтр задания изменился, обновить вставку и этот гейт');
  failed++;
}
const per = `SELECT customer_id, SUM(units) AS units FROM fact_sellout ${where} GROUP BY customer_id`;
const rows = db.exec(`${per} ORDER BY customer_id LIMIT ${inset.rows.length}`)[0].values;
check('строки точек', rows, inset.rows);
const [[outlets, total, avg]] = db.exec(`WITH p AS (${per}) SELECT COUNT(*), SUM(units), ROUND(AVG(units)) FROM p`)[0].values;
check('число точек', outlets, inset.outlets);
check('сумма штук', total, inset.total);
check('среднее по точкам', avg, inset.average);

if (failed) process.exit(1);
