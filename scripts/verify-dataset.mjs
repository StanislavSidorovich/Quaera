/**
 * Регрессионная проверка датасета.
 *
 * Задания опираются не на «какие-то данные», а на конкретные сюжеты: падение бренда
 * из-за потери дистрибуции, затоваривание дистрибьютора, сезонность, запуск SKU.
 * Если генератор поправили и сюжет пропал — эталонные ответы к заданиям молча
 * разъедутся с реальностью. Поэтому сюжеты проверяются как тесты.
 *
 * Запуск: npm run verify:data
 */
import initSqlJs from 'sql.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
const db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'querium.sqlite'))));

const rows = (sql) => {
  const res = db.exec(sql);
  if (!res.length) return [];
  return res[0].values.map((v) => Object.fromEntries(res[0].columns.map((c, i) => [c, v[i]])));
};

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

// --- Сюжет 1: «Чистовъ» падает из-за дистрибуции, а не из-за спроса или цены.
const chistov = rows(`
  SELECT d.year || '-Q' || d.quarter AS period, SUM(f.units) units,
         COUNT(DISTINCT f.customer_id) outlets,
         ROUND(1.0*SUM(f.units)/COUNT(DISTINCT f.customer_id), 2) per_outlet,
         ROUND(SUM(f.revenue)/SUM(f.units), 1) avg_price
  FROM fact_sellout f
  JOIN dim_product p ON p.product_id = f.product_id
  JOIN dim_date d ON d.date_id = f.week_start
  WHERE p.brand = 'Чистовъ' GROUP BY 1 ORDER BY 1`);
console.table(chistov);
// Сравниваем одноимённые кварталы: у бренда выражена весенняя сезонность,
// и сравнение Q1 с Q2 показало бы рост там, где на деле идёт падение.
const byPeriod = Object.fromEntries(chistov.map((r) => [r.period, r]));
const first = byPeriod['2024-Q1'];
const last = byPeriod['2026-Q1'];
check('Чистовъ: объём падает год к году', last.units < first.units * 0.75,
  `${first.period}: ${first.units} → ${last.period}: ${last.units}`);
check('Чистовъ: причина — потеря точек', last.outlets < first.outlets * 0.7,
  `точек ${first.outlets} → ${last.outlets}`);
check('Чистовъ: продажи на точку НЕ рухнули (спрос жив)', last.per_outlet > first.per_outlet * 0.75,
  `на точку ${first.per_outlet} → ${last.per_outlet}`);

// --- Сюжет 2: затоваривание одного дистрибьютора в Q4 2025.
const overstock = rows(`
  WITH si AS (SELECT distributor_id d, SUM(units) u FROM fact_sellin
              WHERE month_start BETWEEN '2025-10-01' AND '2025-12-01' GROUP BY 1),
       so AS (SELECT c.served_by_distributor_id d, SUM(f.units) u FROM fact_sellout f
              JOIN dim_customer c ON c.customer_id = f.customer_id
              WHERE f.week_start BETWEEN '2025-09-29' AND '2025-12-28' GROUP BY 1)
  SELECT c.customer_name, si.u sell_in, so.u sell_out, ROUND(1.0*si.u/so.u, 2) ratio
  FROM si JOIN so USING (d) JOIN dim_customer c ON c.customer_id = si.d
  ORDER BY ratio DESC LIMIT 3`);
console.table(overstock);
check('Затоваривание: лидер отрывается от остальных',
  overstock[0].ratio > 1.6 && overstock[0].ratio > overstock[1].ratio * 1.4,
  `${overstock[0].customer_name} ratio ${overstock[0].ratio} vs ${overstock[1].ratio}`);

// --- Сюжет 3: сезонность разнонаправлена у FMCG и фармы.
const season = rows(`
  SELECT d.month,
         SUM(CASE WHEN p.brand='Ключевая' THEN f.units END) voda,
         SUM(CASE WHEN p.brand='Витамакс' THEN f.units END) vitaminy
  FROM fact_sellout f JOIN dim_product p ON p.product_id=f.product_id
  JOIN dim_date d ON d.date_id=f.week_start WHERE d.year=2025 GROUP BY 1 ORDER BY 1`);
console.table(season);
const summerWater = season.filter((r) => [6, 7, 8].includes(r.month)).reduce((a, r) => a + r.voda, 0);
const winterWater = season.filter((r) => [12, 1, 2].includes(r.month)).reduce((a, r) => a + r.voda, 0);
const summerVit = season.filter((r) => [6, 7, 8].includes(r.month)).reduce((a, r) => a + r.vitaminy, 0);
const winterVit = season.filter((r) => [12, 1, 2].includes(r.month)).reduce((a, r) => a + r.vitaminy, 0);
check('Вода: лето > зимы', summerWater > winterWater * 1.4, `${summerWater} vs ${winterWater}`);
check('Витамины: зима > лета', winterVit > summerVit * 1.4, `${winterVit} vs ${summerVit}`);

// --- Сюжет 4: запуск SKU в сентябре 2025 с раскаткой дистрибуции.
const launch = rows(`
  SELECT substr(f.week_start,1,7) m, SUM(f.units) units, COUNT(DISTINCT f.customer_id) outlets
  FROM fact_sellout f JOIN dim_product p ON p.product_id=f.product_id
  WHERE p.product_name LIKE 'Витамакс Форте%' GROUP BY 1 ORDER BY 1`);
console.table(launch.slice(0, 8));
check('Запуск: первых продаж нет раньше сентября 2025', launch[0].m >= '2025-09', `первый месяц ${launch[0]?.m}`);
check('Запуск: дистрибуция раскатывается', launch.length > 5 && launch[4].outlets > launch[0].outlets,
  `точек ${launch[0].outlets} → ${launch[4]?.outlets}`);

// --- Бизнес-правила, на которых строятся задания на JOIN и фильтры.
const pharmaChannels = rows(`
  SELECT c.channel, COUNT(*) n FROM fact_sellout f
  JOIN dim_customer c ON c.customer_id=f.customer_id
  JOIN dim_product p ON p.product_id=f.product_id
  WHERE p.division='Pharma' GROUP BY 1`);
check('Фарма продаётся только в аптеках',
  pharmaChannels.length === 1 && pharmaChannels[0].channel === 'pharmacy',
  pharmaChannels.map((r) => `${r.channel}:${r.n}`).join(', '));

const promo = rows(`
  SELECT CASE WHEN promo_id IS NULL THEN 'base' ELSE 'promo' END mode,
         ROUND(AVG(units),2) avg_units, ROUND(AVG(avg_price),1) avg_price
  FROM fact_sellout GROUP BY 1`);
console.table(promo);
const base = promo.find((r) => r.mode === 'base');
const pro = promo.find((r) => r.mode === 'promo');
check('Промо даёт аплифт в штуках', pro.avg_units > base.avg_units * 1.3,
  `${base.avg_units} → ${pro.avg_units}`);
check('Промо снижает цену', pro.avg_price < base.avg_price, `${base.avg_price} → ${pro.avg_price}`);

// --- Грязный слой: ловушки на месте.
const dup = rows(`SELECT COUNT(*) - COUNT(DISTINCT sale_date||'|'||customer_name||'|'||sku_code||'|'||COALESCE(units,'~')) dups FROM staging_raw_sellout`)[0].dups;
const nulls = rows(`SELECT SUM(units IS NULL) u, SUM(revenue IS NULL) r FROM staging_raw_sellout`)[0];
const spellings = rows(`SELECT COUNT(DISTINCT CASE WHEN TRIM(customer_name) LIKE 'Пят%' THEN substr(TRIM(customer_name),1,9) END) v FROM staging_raw_sellout`)[0].v;
const negatives = rows(`SELECT COUNT(*) n FROM staging_raw_sellout WHERE units LIKE '-%'`)[0].n;
const formats = rows(`SELECT COUNT(DISTINCT CASE WHEN sale_date LIKE '__.__.____' THEN 'dot' WHEN sale_date LIKE '__/__/____' THEN 'slash' WHEN length(sale_date)=10 THEN 'iso' ELSE 'short' END) f FROM staging_raw_sellout`)[0].f;
check('Грязный слой: есть дубли', dup > 30, `${dup}`);
check('Грязный слой: есть NULL', nulls.u > 0 && nulls.r > 0, `units ${nulls.u}, revenue ${nulls.r}`);
check('Грязный слой: два написания одной сети', spellings >= 2, `${spellings}`);
check('Грязный слой: есть возвраты (отрицательные)', negatives > 0, `${negatives}`);
check('Грязный слой: несколько форматов дат', formats >= 3, `${formats}`);

// --- Свойства схемы, на которых держатся задания на джойны.
const orphans = rows(`
  SELECT (SELECT COUNT(*) FROM fact_sellout f LEFT JOIN dim_customer c USING (customer_id) WHERE c.customer_id IS NULL) a,
         (SELECT COUNT(*) FROM fact_sellout f LEFT JOIN dim_product p USING (product_id) WHERE p.product_id IS NULL) b,
         (SELECT COUNT(*) FROM fact_sellout f LEFT JOIN dim_date d ON d.date_id=f.week_start WHERE d.date_id IS NULL) c`)[0];
check('Ссылочная целостность фактов', orphans.a === 0 && orphans.b === 0 && orphans.c === 0,
  `сироты: cust ${orphans.a}, prod ${orphans.b}, date ${orphans.c}`);

const selfJoin = rows(`SELECT SUM(manager_id IS NULL) managers, SUM(manager_id IS NOT NULL) reps FROM dim_rep`)[0];
check('dim_rep пригоден для self-join', selfJoin.managers >= 3 && selfJoin.reps >= 10,
  `руководителей ${selfJoin.managers}, представителей ${selfJoin.reps}`);

// Колонка описана человеку как «последний день месяца» (см. подписи в build-dataset.mjs),
// и на ней будут строиться задания трека model про остаток на конец периода. Прежняя
// версия генератора для последнего месяца датасета подставляла день РАНЬШЕ month_start:
// граничный случай, который не видно ни в одной выборке «первых строк».
const stockEnd = rows(`
  SELECT COUNT(*) bad FROM fact_stock
  WHERE month_end < month_start
     OR substr(month_end, 1, 7) <> substr(month_start, 1, 7)
     OR date(month_end, '+1 day') <> date(month_start, '+1 month')`)[0].bad;
check('fact_stock: month_end — последний день своего месяца', stockEnd === 0, `нарушений ${stockEnd}`);

console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
