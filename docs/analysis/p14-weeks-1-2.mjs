// Раскладка недель 1–2 на шесть дней (п. 14 ROADMAP, семнадцатый заход, Opus, 2026-09-14).
//
// Спецификация для шага Sonnet: по ней заводятся задания и правятся три существующих.
// Запросы здесь проверены на данных (fill собирается ровно в эталон), раскладка —
// прототипом правила плотности, которое теперь живёт в scripts/test-story-ladder.mjs.
// После того как задания лягут в пак и кампанию, проверка — сам гейт:
//   node scripts/test-story-ladder.mjs --density
// Недели 1–2 должны пройти все три правила плотности без единой строки в отчёте.
//
// Что НЕ задано здесь, а решается позже: названия, бриф, цель, подсказки, разбор,
// английская накладка (Sonnet, шаг 2); подводки, реплики, два субботних дня,
// перенос итога недели на субботу (Opus, шаг 3).

// Новые задания. id — предложенные, по порядку появления в кампании.
// level — трудность вне кампании (правило четырнадцатого захода), а не лёгкость в дне.
export const NEW_TASKS = {
  // Пн w1 — вместо sql-004 в кампании (sql-004 остаётся в треке)
  'sql-093': { skill: 'sql-order-limit', level: 1, mode: 'fill',
    template: "SELECT product_name, brand, list_price\nFROM dim_product\n___ list_price ___\nLIMIT 10",
    blanks: ['ORDER BY', 'DESC'],
    solution: "SELECT product_name, brand, list_price\nFROM dim_product\nORDER BY list_price DESC\nLIMIT 10" },
  // Вт w1 — вместо sql-008. Ответ: 47 | 9 | 230.34
  'sql-094': { skill: 'sql-aggregate', level: 2, mode: 'fill',
    template: "SELECT ___ AS products,\n       ___ AS brands,\n       ROUND(AVG(list_price), 2) AS avg_price\nFROM dim_product",
    blanks: ['COUNT(*)', 'COUNT(DISTINCT brand)'],
    solution: "SELECT COUNT(*) AS products,\n       COUNT(DISTINCT brand) AS brands,\n       ROUND(AVG(list_price), 2) AS avg_price\nFROM dim_product" },
  // Вт w1 — вместо sql-009
  'sql-095': { skill: 'sql-group-by', level: 2, mode: 'fill',
    template: "SELECT brand, COUNT(*) AS sku_count, ROUND(___(list_price), 2) AS avg_price\nFROM dim_product\nWHERE division = 'FMCG'\n___",
    blanks: ['AVG', 'GROUP BY brand'],
    solution: "SELECT brand, COUNT(*) AS sku_count, ROUND(AVG(list_price), 2) AS avg_price\nFROM dim_product\nWHERE division = 'FMCG'\nGROUP BY brand" },
  // Вт w1 — новый: бренды FMCG по средней цене, дорогие сверху. Nettora 201.6 первой.
  // Реплика «Посмотри на Nettora…» переезжает сюда с sql-009: сортировка её и показывает.
  'sql-096': { skill: 'sql-group-by', level: 2, mode: 'write',
    starter: "SELECT brand, ROUND(AVG(list_price), 2) AS avg_price\nFROM dim_product\nWHERE division = 'FMCG'\nGROUP BY brand\n",
    solution: "SELECT brand, ROUND(AVG(list_price), 2) AS avg_price\nFROM dim_product\nWHERE division = 'FMCG'\nGROUP BY brand\nORDER BY avg_price DESC" },
  // Ср w1 — новый: штуки и точки по месяцам 2025. Точек 132 в каждом месяце при волне
  // 26–50 тыс. штук: волна рынка — спрос, а не полка. Готовит пятничное разложение.
  'sql-097': { skill: 'sql-aggregate', level: 2, mode: 'fill',
    template: "SELECT substr(week_start, 1, 7) AS month,\n       SUM(units) AS units,\n       ___ AS outlets\nFROM fact_sellout\nWHERE week_start BETWEEN '2025-01-01' AND '2025-12-31'\nGROUP BY 1\nORDER BY month",
    blanks: ['COUNT(DISTINCT customer_id)'],
    solution: "SELECT substr(week_start, 1, 7) AS month,\n       SUM(units) AS units,\n       COUNT(DISTINCT customer_id) AS outlets\nFROM fact_sellout\nWHERE week_start BETWEEN '2025-01-01' AND '2025-12-31'\nGROUP BY 1\nORDER BY month" },
  // Чт w1 — вместо sql-012. Результат тот же (данные кончаются 2026-06-29), Nettora седьмая.
  // Форма «дата >= '2026-01-01'» впервые — показать её в подводке: её же просит суббота.
  'sql-098': { skill: 'sql-join-inner', level: 2, mode: 'fill',
    template: "SELECT p.brand, ROUND(SUM(f.revenue)) AS revenue\nFROM fact_sellout f\n___\n___\nGROUP BY p.brand\nORDER BY revenue DESC",
    blanks: ['JOIN dim_product p ON p.product_id = f.product_id', "WHERE f.week_start >= '2026-01-01'"],
    solution: "SELECT p.brand, ROUND(SUM(f.revenue)) AS revenue\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE f.week_start >= '2026-01-01'\nGROUP BY p.brand\nORDER BY revenue DESC" },
  // Чт w1 — вместо sql-049; HAVING остаётся в шаблоне
  'sql-099': { skill: 'sql-having', level: 3, mode: 'fill',
    template: "SELECT p.brand, ROUND(SUM(f.revenue)) AS revenue, COUNT(DISTINCT f.customer_id) AS outlets\nFROM fact_sellout f\n___\nWHERE f.week_start BETWEEN '2025-01-01' AND '2025-12-31'\n___\nHAVING SUM(f.revenue) > 5000000 AND COUNT(DISTINCT f.customer_id) >= 80\nORDER BY revenue DESC",
    blanks: ['JOIN dim_product p ON p.product_id = f.product_id', 'GROUP BY p.brand'],
    solution: "SELECT p.brand, ROUND(SUM(f.revenue)) AS revenue, COUNT(DISTINCT f.customer_id) AS outlets\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE f.week_start BETWEEN '2025-01-01' AND '2025-12-31'\nGROUP BY p.brand\nHAVING SUM(f.revenue) > 5000000 AND COUNT(DISTINCT f.customer_id) >= 80\nORDER BY revenue DESC" },
  // Сб w1 — чистый лист. Контроль к пятничному вердикту: «может, полки теряют все?»
  // С января 2026: Aqualis 88, Fruvia 86, Milvara 84, Krosti 81 — ровно как в 2025 (sql-099);
  // Nettora 79 → 37. Полку потеряла только Nettora.
  'sql-100': { skill: 'sql-join-inner', level: 3, mode: 'write', starter: '',
    solution: "SELECT p.brand, COUNT(DISTINCT f.customer_id) AS outlets\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE f.week_start >= '2026-01-01'\nGROUP BY p.brand\nORDER BY outlets DESC" },
  // Вт w2 — вместо sql-015 в кампании (sql-015 остаётся write/3 в треке). Пара IS NOT NULL / IS NULL — и есть урок.
  'sql-101': { skill: 'sql-case', level: 3, mode: 'fill',
    template: "SELECT p.brand,\n       ROUND(SUM(CASE WHEN f.promo_id ___ THEN f.revenue ELSE 0 END)) AS promo_revenue,\n       ROUND(SUM(CASE WHEN f.promo_id ___ THEN f.revenue ELSE 0 END)) AS base_revenue\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE f.week_start BETWEEN '2025-01-01' AND '2025-12-31'\nGROUP BY p.brand",
    blanks: ['IS NOT NULL', 'IS NULL'],
    solution: "SELECT p.brand,\n       ROUND(SUM(CASE WHEN f.promo_id IS NOT NULL THEN f.revenue ELSE 0 END)) AS promo_revenue,\n       ROUND(SUM(CASE WHEN f.promo_id IS NULL THEN f.revenue ELSE 0 END)) AS base_revenue\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE f.week_start BETWEEN '2025-01-01' AND '2025-12-31'\nGROUP BY p.brand" },
  // Вт w2 — новый: промо Nettora по годам. 2024: 496 432 из 7 447 407 (6.7%),
  // 2025: 1 372 440 из 6 761 207 (20.3%), 2026: 327 121 из 1 957 201 (16.7%).
  // «Может, раньше жил на акциях?» — нет, ни в одном году больше пятой части.
  'sql-102': { skill: 'sql-case', level: 3, mode: 'fill',
    template: "SELECT ___ AS year,\n       ROUND(SUM(CASE WHEN ___ THEN f.revenue ELSE 0 END)) AS promo_revenue,\n       ROUND(SUM(f.revenue)) AS revenue\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE p.brand = 'Nettora'\nGROUP BY 1\nORDER BY year",
    blanks: ['substr(f.week_start, 1, 4)', 'f.promo_id IS NOT NULL'],
    solution: "SELECT substr(f.week_start, 1, 4) AS year,\n       ROUND(SUM(CASE WHEN f.promo_id IS NOT NULL THEN f.revenue ELSE 0 END)) AS promo_revenue,\n       ROUND(SUM(f.revenue)) AS revenue\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE p.brand = 'Nettora'\nGROUP BY 1\nORDER BY year" },
  // Ср w2 — новый, первым шагом дня: Nettora по каналам с января, нули включительно.
  // ecom 8016 | modern_trade 1539 | traditional_trade 303 | pharmacy 0 | distributor 0.
  // Полугодие 2025 для сравнения: 15258 | 4432 | 560. Упало ВЕЗДЕ, в сетях втрое —
  // писать «e-com держит бренд» нельзя.
  'sql-103': { skill: 'sql-join-left', level: 3, mode: 'fill',
    template: "SELECT c.channel, ___(SUM(f.units), 0) AS units\nFROM dim_customer c\nLEFT JOIN fact_sellout f\n       ON f.customer_id = c.customer_id\n      AND f.product_id ___ (SELECT product_id FROM dim_product WHERE brand = 'Nettora')\n      AND f.week_start >= '2026-01-01'\nGROUP BY c.channel",
    blanks: ['COALESCE', 'IN'],
    solution: "SELECT c.channel, COALESCE(SUM(f.units), 0) AS units\nFROM dim_customer c\nLEFT JOIN fact_sellout f\n       ON f.customer_id = c.customer_id\n      AND f.product_id IN (SELECT product_id FROM dim_product WHERE brand = 'Nettora')\n      AND f.week_start >= '2026-01-01'\nGROUP BY c.channel" },
  // Сб w2 — чистый лист: сетевые точки без Nettora с января 2026, 27 строк — список для Ито-сан.
  // Посильность: цель прямо говорит, что условие на период стоит там же, где условие на товар
  // (в ON), первая подсказка — то же и почему (sql-039). Перенесённое в WHERE даёт 0 строк.
  'sql-104': { skill: 'sql-join-left', level: 4, mode: 'write', starter: '',
    solution: "SELECT c.customer_name, c.city\nFROM dim_customer c\nLEFT JOIN fact_sellout f\n       ON f.customer_id = c.customer_id\n      AND f.product_id IN (SELECT product_id FROM dim_product WHERE brand = 'Nettora')\n      AND f.week_start >= '2026-01-01'\nWHERE c.channel = 'modern_trade' AND f.sellout_id IS NULL" },
};

// Правки существующих заданий на месте (в треке тоже) — решено пользователем 2026-09-14.
export const EDITS = {
  // WHERE печатается в свой день, а не впервые в четверг (в треке чуть труднее)
  'sql-003': { starter: "SELECT sku_code, product_name, brand, list_price\nFROM dim_product\n" },
  // substr — пропуск: первый раз рукой в среду первой недели
  'sql-010': {
    template: "SELECT ___(week_start, 1, 7) AS month,\n       ___(units) AS units\nFROM fact_sellout\nWHERE week_start BETWEEN '2025-01-01' AND '2025-12-31'\nGROUP BY ___\nORDER BY month",
    blanks: ['substr', 'SUM', '1'],
  },
  // год через substr — в заготовке; рукой ROUND(AVG(...)), WHERE, GROUP BY, ORDER BY (в треке чуть легче).
  // Иначе sql-016 в среду второй недели получает три незакреплённых: SUM, ROUND и CTE.
  'sql-092': { starter: "SELECT substr(fp.month_start, 1, 4) AS year,\n       \nFROM fact_price fp\nJOIN dim_product p ON p.product_id = fp.product_id\n" },
};

// Раскладка: неделя → день → шаги. Сб — новый день каждой недели, id миссии
// новые (не перенумеровывать старые: прогресс хранится по id).
export const LAYOUT = {
  w1: [
    ['Пн', ['sql-085', 'sql-001', 'sql-003', 'sql-093']],
    ['Вт', ['sql-007', 'sql-094', 'sql-095', 'sql-096']],
    ['Ср', ['sql-010', 'sql-035', 'sql-097']],
    ['Чт', ['sql-098', 'sql-037', 'sql-099']],
    ['Пт', ['sql-023']],
    ['Сб', ['sql-100']],
  ],
  w2: [
    ['Пн', ['sql-086', 'sql-014', 'sql-039', 'sql-040']],
    ['Вт', ['sql-092', 'sql-042', 'sql-101', 'sql-102']],
    ['Ср', ['sql-103', 'sql-045', 'sql-044', 'sql-016']],
    ['Чт', ['sql-013', 'sql-041', 'sql-050']],
    ['Пт', ['sql-022']],
    ['Сб', ['sql-104']],
  ],
};
