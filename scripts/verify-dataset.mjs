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

// --- Сюжет 1: «Nettora» падает из-за дистрибуции, а не из-за спроса или цены.
const nettora = rows(`
  SELECT d.year || '-Q' || d.quarter AS period, SUM(f.units) units,
         COUNT(DISTINCT f.customer_id) outlets,
         ROUND(1.0*SUM(f.units)/COUNT(DISTINCT f.customer_id), 2) per_outlet,
         ROUND(SUM(f.revenue)/SUM(f.units), 1) avg_price
  FROM fact_sellout f
  JOIN dim_product p ON p.product_id = f.product_id
  JOIN dim_date d ON d.date_id = f.week_start
  WHERE p.brand = 'Nettora' GROUP BY 1 ORDER BY 1`);
console.table(nettora);
// Сравниваем одноимённые кварталы: у бренда выражена весенняя сезонность,
// и сравнение Q1 с Q2 показало бы рост там, где на деле идёт падение.
const byPeriod = Object.fromEntries(nettora.map((r) => [r.period, r]));
const first = byPeriod['2024-Q1'];
const last = byPeriod['2026-Q1'];
check('Nettora: объём падает год к году', last.units < first.units * 0.75,
  `${first.period}: ${first.units} → ${last.period}: ${last.units}`);
check('Nettora: причина — потеря точек', last.outlets < first.outlets * 0.7,
  `точек ${first.outlets} → ${last.outlets}`);
check('Nettora: продажи на точку НЕ рухнули (спрос жив)', last.per_outlet > first.per_outlet * 0.75,
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
         SUM(CASE WHEN p.brand='Aqualis' THEN f.units END) voda,
         SUM(CASE WHEN p.brand='Vitanor' THEN f.units END) vitaminy
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
  WHERE p.product_name LIKE 'Vitanor Forte%' GROUP BY 1 ORDER BY 1`);
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
/*
 * Два написания одной сети. Сравнение идёт по хвосту имени («armarka»),
 * потому что различаются как раз первые буквы: транслитерация я → ya или ia
 * (Yarmarka против Iarmarka). Проверка на общее начало имени, стоявшая здесь
 * при русской «ё», на такой паре не сработала бы вовсе.
 */
const spellings = rows(`SELECT COUNT(DISTINCT substr(TRIM(customer_name),1,8)) v FROM staging_raw_sellout WHERE TRIM(customer_name) LIKE '%armarka%'`)[0].v;
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

// Вторая дата в факте заведена ради одного: чтобы «по дате заказа» и «по дате
// отгрузки» давали РАЗНЫЕ месячные итоги. Если задержка окажется настолько
// короткой, что ни один заказ не переезжает через границу месяца, тема активной
// и неактивной связи станет неотличима от одной даты, а задания на ней — пустыми.
const ship = rows(`
  SELECT SUM(ship_date <= order_date) bad,
         SUM(substr(ship_date,1,7) <> substr(order_date,1,7)) crossing,
         COUNT(*) total
  FROM fact_sellin`)[0];
check('fact_sellin: отгрузка всегда позже заказа', ship.bad === 0, `нарушений ${ship.bad}`);
check('fact_sellin: часть заказов отгружается в следующем месяце', ship.crossing > 500,
  `${ship.crossing} из ${ship.total} строк переходят границу месяца`);

/*
 * Схема данных, которую видит человек: связи и строки-примеры.
 *
 * Эти два блока — не описание базы, а часть интерфейса: по ним человек решает,
 * по чему соединять таблицы, ещё не написав ни строки запроса. Соврать они
 * могут молча — связь указана на колонку, которой нет, или ключи не сходятся
 * и JOIN вернёт пустоту, — а увидеть это можно только попробовав.
 *
 * Сироты проверяются с оглядкой на NULL: пустой promo_id значит «продажа вне
 * акции», пустой manager_id — «сам руководитель». Это не разрыв связи, а её
 * законное отсутствие, поэтому в счёт идут только заполненные значения.
 */
const schema = JSON.parse(readFileSync(path.join(root, 'public', 'data', 'schema.json'), 'utf8'));
const tablesByName = new Map(schema.tables.map((t) => [t.table, t]));
let refCount = 0;

/*
 * Текст схемы обязан быть парой { ru, en } на месте, а не отдельным файлом
 * перевода рядом (см. LocalizedText в src/engine/types.ts). Отдельный файл
 * гейт по построению проверить не может — незаполненный слот падает уже
 * в build-dataset.mjs, до записи schema.json на диск. Здесь проверяется
 * другое: сам артефакт на диске может оказаться устаревшим — собранным
 * до того, как в генератор добавили эту проверку, или руками поправленным.
 * Тот же довод, что у сверки звезды по связям с префиксом имени чуть выше:
 * гейт на исходник и гейт на результат ловят разные поломки.
 */
const cyrillic = /[А-Яа-яЁё]/;
const checkLocalizedField = (where, pair, { allowBothEmpty = false } = {}) => {
  const ru = pair?.ru ?? '', en = pair?.en ?? '';
  /*
   * Описание колонки, целиком состоявшей из «FK → …», после stripFkNote
   * в build-dataset.mjs остаётся пустым на обеих локалях намеренно: связь
   * и так рисуется отдельной строкой из references (см. TableDoc), а сверх
   * неё сказать нечего. Это не непереведённый слот — переводить нечего.
   * Разрешено только когда пусто на обеих локалях сразу: если заполнена
   * только одна, это обычный незаполненный перевод, не особый случай.
   */
  if (allowBothEmpty && !ru.trim() && !en.trim()) {
    check(`${where}: заполнены обе локали`, true);
    return;
  }
  const complete = ru.trim().length > 0 && en.trim().length > 0;
  check(`${where}: заполнены обе локали`, complete, complete ? undefined : `ru=${JSON.stringify(ru)}, en=${JSON.stringify(en)}`);
  if (!complete) return;
  check(`${where}: en без кириллицы`, !cyrillic.test(en), `en: «${en}»`);
  // Совпадение локалей — это не перевод, а копипаст: почти всегда значит,
  // что английский слот заполнили русским текстом не глядя. Не относится
  // к чистым отметкам связи («FK → dim_region»): они латиницей и остаются
  // латиницей, но это проверяется выше по кириллице, не здесь.
  check(`${where}: en отличается от ru`, en !== ru || !cyrillic.test(ru), `обе локали: «${ru}»`);
};

checkLocalizedField('company', schema.company);
for (const table of schema.tables) {
  checkLocalizedField(`${table.table}.title`, table.title);
  checkLocalizedField(`${table.table}.grain`, table.grain);
  if (table.note) checkLocalizedField(`${table.table}.note`, table.note);
  for (const col of table.columns) {
    checkLocalizedField(`${table.table}.${col.name}`, col.description, { allowBothEmpty: Boolean(col.references) });
  }
}

for (const table of schema.tables) {
  check(
    `${table.table}: есть строки-примеры`,
    Array.isArray(table.sample) && table.sample.length > 0 &&
      table.sample.every((r) => r.length === table.columns.length),
    `строк ${table.sample?.length ?? 0}, колонок в каждой должно быть ${table.columns.length}`
  );

  for (const col of table.columns) {
    if (!col.references) continue;
    refCount++;
    const target = tablesByName.get(col.references.table);
    if (!target) {
      check(`${table.table}.${col.name} → ${col.references.table}`, false, 'такой таблицы нет в схеме');
      continue;
    }
    if (!target.columns.some((c) => c.name === col.references.column)) {
      check(
        `${table.table}.${col.name} → ${col.references.table}.${col.references.column}`,
        false,
        'такой колонки нет в целевой таблице'
      );
      continue;
    }
    const orphans = rows(`
      SELECT COUNT(*) bad FROM ${table.table} s
      WHERE s.${col.name} IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM ${col.references.table} t WHERE t.${col.references.column} = s.${col.name})`)[0].bad;
    check(
      `${table.table}.${col.name} → ${col.references.table}.${col.references.column}`,
      orphans === 0,
      orphans ? `${orphans} значений не находят пары — JOIN потеряет эти строки` : 'ключи сходятся'
    );
  }
}
check('схема описывает связи между таблицами', refCount >= 15, `найдено ${refCount}`);

/*
 * Звезда, выведенная из связей, обязана сойтись с именами таблиц.
 *
 * Экран «Данные» делит таблицы на факты и справочники по графу внешних
 * ключей (см. src/engine/schemaGroups.ts), а не по префиксу имени — так же,
 * как этому учит трек модели данных. Имена при этом соглашению следуют,
 * и здесь проверяется, что два независимых признака говорят одно и то же.
 *
 * Расхождение — всегда настоящий дефект, и оба его вида одинаково опасны:
 * либо таблица названа не тем, что она есть, либо у неё забыт внешний ключ.
 * Второй случай тихий: без ключа факт уедет в раздел «сырой слой», и человек
 * прочитает про свои данные неправду ровно там, где пришёл разобраться.
 */
const groupOf = (t) => {
  const selfless = (tbl) => tbl.columns.filter((c) => c.references && c.references.table !== tbl.table);
  const referenced = schema.tables.some((other) =>
    other.table !== t.table && selfless(other).some((c) => c.references.table === t.table)
  );
  if (referenced) return 'dimension';
  return selfless(t).length ? 'fact' : 'standalone';
};
const byPrefix = (name) =>
  name.startsWith('dim_') ? 'dimension' : name.startsWith('fact_') ? 'fact' : 'standalone';

for (const table of schema.tables) {
  const derived = groupOf(table);
  const named = byPrefix(table.table);
  check(
    `${table.table}: связи и имя говорят одно и то же`,
    derived === named,
    derived === named
      ? `${derived}`
      : `по связям — ${derived}, по имени — ${named}: либо имя неверно, либо потерян внешний ключ`
  );
}

console.log(failed ? `\n${failed} проверок провалено` : '\nВсе проверки пройдены');
process.exit(failed ? 1 : 0);
