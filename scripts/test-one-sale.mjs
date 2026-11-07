/**
 * Гейт блока «Одна продажа насквозь» (экран «Данные»): значения в
 * src/content/oneSale.json захардкожены, поэтому сверяются с датасетом.
 * Перегенерация данных, после которой строка изменилась, роняет гейт
 * до того, как человек увидит в блоке цифры, которых в таблицах нет.
 *
 * Запуск: npm run test:one-sale (входит в npm run verify).
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
const s = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'oneSale.json'), 'utf8'));

const res = db.exec(
  `SELECT f.week_start, f.units, f.revenue, p.product_id, p.product_name, p.category,
          c.customer_id, c.customer_name, c.city, c.region_id, r.region_name, r.macro_region
   FROM fact_sellout f
   JOIN dim_product p ON p.product_id = f.product_id
   JOIN dim_customer c ON c.customer_id = f.customer_id
   JOIN dim_region r ON r.region_id = c.region_id
   WHERE f.sellout_id = ${Number(s.sellout_id)}`
);
let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok ? '' : `: датасет ${JSON.stringify(got)}, в oneSale.json ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};
if (!res.length) {
  console.log(` FAIL sellout_id ${s.sellout_id} не найден в датасете`);
  process.exitCode = 1;
  throw new Error("sellout_id not found");
}
const [week_start, units, revenue, product_id, product_name, category, customer_id, customer_name, city, region_id, region_name, macro_region] = res[0].values[0];
check('week_start', week_start, s.week_start);
check('units', units, s.units);
check('revenue', revenue, s.revenue);
check('product_id', product_id, s.product.product_id);
check('product_name', product_name, s.product.product_name);
check('category', category, s.product.category);
check('customer_id', customer_id, s.customer.customer_id);
check('customer_name', customer_name, s.customer.customer_name);
check('city', city, s.customer.city);
check('customer.region_id', region_id, s.customer.region_id);
check('region.region_id', region_id, s.region.region_id);
check('region_name', region_name, s.region.region_name);
check('macro_region', macro_region, s.region.macro_region);
process.exitCode = failed ? 1 : 0;
