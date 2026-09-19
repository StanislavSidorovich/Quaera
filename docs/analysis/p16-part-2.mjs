// Спецификация части 2 «Аналитик» (ROADMAP «Очередь на 2026-09-19 (тридцать восьмой заход)», п. 5;
// сорок второй заход, Opus, 2026-09-19).
//
// Нынешняя неделя w2 режется на две по вопросу дела (правило разреза w4/w5: у каждой половины
// свой вопрос, на который её пятница честно отвечает):
//   w2  «Кто занял 42 точки Nettora — и что про них знают наши данные?» — LEFT JOIN, NULL, CASE;
//       пятница: все 42 точки живы и покупают у нас другое (sql-117); суббота — список для поля.
//   w2b «Может, полку оставили мы сами: ушли из мелких точек или не довезли товар?» — CTE, размножение
//       строк, два факта рядом; пятница sql-022 (цепочка), суббота — запас у дистрибьюторов (sql-120).
// Дальше w3 без изменений состава. Кампания 6 → 7 недель (не 8, как стояло в ROADMAP 38-го захода:
// там w3 посчитана дважды). Часть 2 = w2, w2b, w3.
//
// Запуск самопроверки (из корня querium):  node docs/analysis/p16-part-2.mjs
//   1) каждый новый эталон исполняется на .cache/quaera.sqlite, результат печатается;
//   2) у fill шаблон с подставленными пропусками собирается ровно в эталон;
//   3) прототип трёх правил плотности (scripts/test-story-ladder.mjs) — по всей кампании:
//      часть 1 как стоит в storymode.ts, часть 2 по LAYOUT ниже, дальше w3–w5 как стоят.
// Настоящая проверка после того, как всё ляжет в пак и кампанию, — сам гейт:
//   npm run test:story-ladder   (и --density для таблицы)
//
// Что НЕ задано здесь: названия, бриф, goal, подсказки, разбор и английская накладка новых заданий;
// проза дней (бриф, подводки, реплики, суждение, крючок) — шаг 6 очереди (Sonnet) по BEATS ниже.
// Порядковые отсылки w2–w5 переписаны в этом же заходе прямо в storymode.ts и паках, правило и гейт —
// раздел 5.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// 1. Недели и вопросы
// ---------------------------------------------------------------------------

/**
 * id новой недели — `w2b`, тем же приёмом, что `w1b`: id не перенумеровываются, номер на экране
 * считается по позиции. Вопрос w2 уточнён: «можем ли мы это увидеть» заменено на «что про них знают
 * наши данные» — пятница теперь отвечает числом (точки живы), а не одной границей.
 *
 * Почему CASE в первой половине, а не во второй: вторая несёт CTE, размножение строк и пятницу
 * уровня 5 — три тяжёлых вещи; первая — LEFT JOIN и NULL, одна тяжёлая. CASE уравнивает, и сюжетно
 * версия «жил на акциях» — версия про точки («кто занял»), а не про поставку.
 */
export const WEEKS = [
  { id: 'w2', part: 'p2',
    ru: 'Кто занял 42 точки Nettora — и что про них знают наши данные?',
    en: 'Who took the 42 Nettora outlets, and what does our data know about them?',
    // Пятница sql-117: 42 точки, 76 571 штука с января. Суббота sql-104: 27 сетевых точек, 24 из них брали в 2025-м.
    answer: 'Имени в данных нет: чужих продаж у нас ни строки. Знают другое: все 42 точки живы и с января купили у нас 76 571 штуку других брендов, e-com бренд не держит, акции ни при чём. Где нас нет — список для поля.' },
  { id: 'w2b', part: 'p2',
    ru: 'Может, полку оставили мы сами — ушли из мелких точек или не довезли товар?',
    en: 'Did we leave the shelf ourselves, by pulling out of small outlets or failing to deliver?',
    // Пн sql-118: в 2024-м потерянные 42 точки дали 16 292 шт. из 38 413 (42%), в среднем 388 против 598.
    // Чт sql-119: отгрузки Nettora к продажам 1.04 / 1.06 / 1.04 по годам. Пт sql-022: 11 из 12 — 1.04–1.05,
    // Setouchi 2.44. Сб sql-120: запас Nettora у дистрибьюторов на июнь — 1 046 / 2 363 / 4 224.
    answer: 'Нет. Потеряли не мелочь — эти точки давали 42% штук бренда; товар доезжал (отгрузки к продажам 1.04–1.06) и лежит у дистрибьюторов, запас за два года вчетверо. Nettora перестали брать сами точки.' },
  // w3 — без изменений состава и прозы дней, кроме порядковых отсылок (раздел 5).
];

// ---------------------------------------------------------------------------
// 2. Новые задания
// ---------------------------------------------------------------------------
// id — следующие свободные в sql-core (последний занятый — sql-115; проверено по паку, а не по
// комментарию: урок 39-го захода). Перед заведением — ещё раз `grep '"id": "sql-11[6-9]\|sql-120"'`.
// Товары бренда — подзапросом по имени, как в sql-103/104: входящий сразу в часть 2 номеров 19–23
// не видел (их достают во вторник части 1).
// Если verify-content скажет «конструкция не встречается в теории навыка» — перевесить на соседний
// навык с alsoTrains, как в 40-м заходе (sql-107, sql-112…114), а не дописывать теорию.

const NETTORA = "(SELECT product_id FROM dim_product WHERE brand = 'Nettora')";

export const NEW_TASKS = {
  // Ср w2 — второй шаг дня после sql-103 (каналы с января: e-com 8 016, сети 1 539, традиционная 303).
  // То же за первое полугодие 2025: e-com 15 258, сети 4 432, традиционная 560. Сейчас «пятнадцать»
  // стоит в реплике после sql-103 числом, которое ничто не считает, — теперь его считает человек.
  // Рукой — LEFT JOIN с условиями в ON и группировка; COALESCE в заготовке (он был пропуском в sql-103).
  'sql-116': { skill: 'sql-join-left', level: 3, mode: 'write',
    starter: 'SELECT c.channel, COALESCE(SUM(f.units), 0) AS units\nFROM dim_customer c\n',
    solution: `SELECT c.channel, COALESCE(SUM(f.units), 0) AS units\nFROM dim_customer c\nLEFT JOIN fact_sellout f\n       ON f.customer_id = c.customer_id\n      AND f.product_id IN ${NETTORA}\n      AND f.week_start BETWEEN '2025-01-01' AND '2025-06-30'\nGROUP BY c.channel` },

  // Пт w2 — ответ недели. Внутренний запрос — «точки, где Nettora была в 2025-м и нет с января»:
  // LEFT JOIN + IS NULL недели плюс условие на 2025-й через IN. Внешний — что эти точки купили у нас
  // с января: 42 точки, 76 571 штука (Nettora среди них нет по построению). Сейчас это число стоит
  // в суждении пятницы w2 и в брифе понедельника w3 без единого запроса.
  // Пропуски — две связки, на которых держится смысл: «в списке» и «пусто».
  // Подводка читает запрос изнутри наружу — это же подготовка к WITH в понедельник w2b:
  // «внутренний запрос — готовая таблица, у которой пока нет имени».
  'sql-117': { skill: 'sql-join-left', level: 3, mode: 'fill',
    template: `SELECT COUNT(DISTINCT customer_id) AS outlets,\n       SUM(units) AS units\nFROM fact_sellout\nWHERE week_start >= '2026-01-01'\n  AND customer_id ___ (\n    SELECT c.customer_id\n    FROM dim_customer c\n    LEFT JOIN fact_sellout f\n           ON f.customer_id = c.customer_id\n          AND f.product_id IN ${NETTORA}\n          AND f.week_start >= '2026-01-01'\n    WHERE f.sellout_id ___\n      AND c.customer_id IN (SELECT customer_id FROM fact_sellout\n                            WHERE product_id IN ${NETTORA}\n                              AND week_start BETWEEN '2025-01-01' AND '2025-12-31')\n  )`,
    blanks: ['IN', 'IS NULL'],
    solution: `SELECT COUNT(DISTINCT customer_id) AS outlets,\n       SUM(units) AS units\nFROM fact_sellout\nWHERE week_start >= '2026-01-01'\n  AND customer_id IN (\n    SELECT c.customer_id\n    FROM dim_customer c\n    LEFT JOIN fact_sellout f\n           ON f.customer_id = c.customer_id\n          AND f.product_id IN ${NETTORA}\n          AND f.week_start >= '2026-01-01'\n    WHERE f.sellout_id IS NULL\n      AND c.customer_id IN (SELECT customer_id FROM fact_sellout\n                            WHERE product_id IN ${NETTORA}\n                              AND week_start BETWEEN '2025-01-01' AND '2025-12-31')\n  )` },

  // Пн w2b — первый WITH. Честный повод для CTE — агрегат от агрегата: средняя точка — это AVG
  // от сумм по точкам, а AVG(SUM(...)) SQL не пишет. Прежний довод подводки sql-045 («агрегат нельзя
  // читаемо поделить на агрегат в одном SELECT») часть 1 опровергла: sql-114 так и делит. Его — снять.
  // Вопрос дня: может, ушли из мелких точек, и это нормальная чистка? 2024 год (до сползания):
  //   lost   | 42 | 388 | 16292
  //   stayed | 37 | 598 | 22121
  // Потерянные поменьше, но не мелочь: 16 292 из 38 413 штук бренда — 42%. CASE — вторая встреча
  // (первая — четверг w2), в заготовке; пропуски — имя и само слово.
  'sql-118': { skill: 'sql-cte', level: 3, mode: 'fill',
    template: `___ per_outlet AS (\n  SELECT customer_id, SUM(units) AS units\n  FROM fact_sellout\n  WHERE product_id IN ${NETTORA}\n    AND week_start BETWEEN '2024-01-01' AND '2024-12-31'\n  GROUP BY customer_id\n)\nSELECT CASE WHEN customer_id IN (SELECT customer_id FROM fact_sellout\n                                 WHERE product_id IN ${NETTORA}\n                                   AND week_start >= '2026-01-01')\n            THEN 'stayed' ELSE 'lost' END AS status,\n       COUNT(*) AS outlets,\n       ROUND(AVG(units)) AS avg_units,\n       SUM(units) AS units\nFROM ___\nGROUP BY status`,
    blanks: ['WITH', 'per_outlet'],
    solution: `WITH per_outlet AS (\n  SELECT customer_id, SUM(units) AS units\n  FROM fact_sellout\n  WHERE product_id IN ${NETTORA}\n    AND week_start BETWEEN '2024-01-01' AND '2024-12-31'\n  GROUP BY customer_id\n)\nSELECT CASE WHEN customer_id IN (SELECT customer_id FROM fact_sellout\n                                 WHERE product_id IN ${NETTORA}\n                                   AND week_start >= '2026-01-01')\n            THEN 'stayed' ELSE 'lost' END AS status,\n       COUNT(*) AS outlets,\n       ROUND(AVG(units)) AS avg_units,\n       SUM(units) AS units\nFROM per_outlet\nGROUP BY status` },

  // Чт w2b — второе лекарство от размножения: сначала свернуть каждый факт до строки на год, потом
  // соединять (первое — ключ, sql-050, тем же днём). Отгрузки Nettora к продажам:
  //   2024 | 39906 | 38413 | 1.04   2025 | 37041 | 34847 | 1.06   2026 | 10299 | 9858 | 1.04
  // Ответ w2b в миниатюре по бренду; пятница (sql-022) — то же по дистрибьюторам, и там Setouchi.
  // Пропуск — условие соединения свёрнутых; без него — sql-044 (каждая с каждой).
  'sql-119': { skill: 'sql-cte', level: 3, mode: 'fill',
    template: `WITH si AS (\n  SELECT substr(month_start, 1, 4) AS year, SUM(units) AS units\n  FROM fact_sellin\n  WHERE product_id IN ${NETTORA}\n  GROUP BY 1\n),\nso AS (\n  SELECT substr(week_start, 1, 4) AS year, SUM(units) AS units\n  FROM fact_sellout\n  WHERE product_id IN ${NETTORA}\n  GROUP BY 1\n)\nSELECT si.year, si.units AS sell_in, so.units AS sell_out,\n       ROUND(1.0 * si.units / so.units, 2) AS ratio\nFROM si\nJOIN so ON ___\nORDER BY si.year`,
    blanks: ['so.year = si.year'],
    solution: `WITH si AS (\n  SELECT substr(month_start, 1, 4) AS year, SUM(units) AS units\n  FROM fact_sellin\n  WHERE product_id IN ${NETTORA}\n  GROUP BY 1\n),\nso AS (\n  SELECT substr(week_start, 1, 4) AS year, SUM(units) AS units\n  FROM fact_sellout\n  WHERE product_id IN ${NETTORA}\n  GROUP BY 1\n)\nSELECT si.year, si.units AS sell_in, so.units AS sell_out,\n       ROUND(1.0 * si.units / so.units, 2) AS ratio\nFROM si\nJOIN so ON so.year = si.year\nORDER BY si.year` },

  // Сб w2b — чистый лист, контроль к пятничному вердикту (приём обеих суббот части 1: суббота
  // проверяет пятницу с другой стороны). «Доезжало — а где лежит?» Запас Nettora у дистрибьюторов
  // на июнь: 2024 | 1046   2025 | 2363   2026 | 4224. Сейчас «2 363 → 4 224» стоит в суждении пятницы w2
  // без запроса. fact_stock — первая встреча с таблицей в кампании: goal называет её и колонку
  // units_on_hand прямо; всё остальное закреплено частью 1. Уровень 2 — намеренно: WITH рукой
  // напечатан один раз (sql-118), на чистый лист его звать нельзя (правило плотности).
  'sql-120': { skill: 'sql-join-inner', level: 2, mode: 'write', starter: '',
    solution: "SELECT s.month_start, SUM(s.units_on_hand) AS units\nFROM fact_stock s\nJOIN dim_product p ON p.product_id = s.product_id\nWHERE p.brand = 'Nettora'\n  AND substr(s.month_start, 6, 2) = '06'\nGROUP BY s.month_start\nORDER BY s.month_start" },
};

// ---------------------------------------------------------------------------
// 3. Раскладка
// ---------------------------------------------------------------------------
/**
 * id дней: где смысл дня пережил разрез, id прежний (меньше правок в гейтах и комментариях);
 * новые — с префиксом p2-. Миграции нет (живых прохождений, кроме авторского, нет).
 *
 * Уходит из кампании (остаётся в треке): **sql-092** «Прайс Nettora по годам» — цену закрыла часть 1
 * (sql-096 прайс, sql-115 цена штуки 194.0 → 198.5), вторник w2 с ним спрашивал бы второй раз.
 * Отсюда же ложь крючка понедельника w2 «Про цены мы ещё не смотрели вовсе» — снять в шаге 6.
 */
export const LAYOUT = {
  w2: [
    // Соединение, которое никого не теряет. Новое: LEFT JOIN, COALESCE, подзапрос; ловушка ON/WHERE.
    ['Пн', 'day-6-who-is-missing', ['sql-086', 'sql-014', 'sql-039']],
    // Пустота — не значение. Новое: IS NULL (сравнение с NULL — предсказанием), точки без Nettora поимённо.
    ['Вт', 'p2-day-empty', ['sql-005', 'sql-006', 'sql-040']],
    // Ноль вместо пустоты, LEFT JOIN второй раз: держит ли бренд e-com? Нет — просел везде.
    ['Ср', 'p2-day-channels', ['sql-103', 'sql-116']],
    // Условие внутри строки: жил ли бренд на акциях. sql-031 (= NULL на promo_id) — мост от вторника.
    ['Чт', 'day-7-promo-or-price', ['sql-031', 'sql-042', 'sql-101', 'sql-102']],
    // Ответ недели: 42 точки живы и покупают другое.
    ['Пт', 'p2-day-alive', ['sql-117']],
    // Список для поля с чистого листа (как был).
    ['Сб', 'w2-sat-list-for-ito', ['sql-104']],
  ],
  w2b: [
    // Промежуточный результат с именем: из мелких ли точек ушли? Новое: WITH.
    ['Пн', 'day-8-two-steps', ['sql-118', 'sql-045']],
    // Два WITH и забытое соединение между ними.
    ['Вт', 'p2-day-two-ctes', ['sql-044', 'sql-016']],
    // Размножение строк: увидеть и доказать счётом.
    ['Ср', 'day-9-two-facts', ['sql-013', 'sql-041']],
    // Два лекарства: соединять по ключу и соединять свёрнутое. Nettora: отгрузки ≈ продажи.
    ['Чт', 'p2-day-by-key', ['sql-050', 'sql-119']],
    // Цепочка по дистрибьюторам: доезжало; Setouchi 2.44 — отложено.
    ['Пт', 'day-10-supply-chain', ['sql-022']],
    // Контроль: товар лежит у дистрибьюторов.
    ['Сб', 'p2-w2b-sat-stock', ['sql-120']],
  ],
};

/**
 * Запас, НЕ взятый в часть 2, и почему:
 *   sql-015 — тот же ответ, что sql-101, но write с семью незакреплёнными (решение 14-го захода в силе).
 *   sql-028 — сортировка NULL: верно, но ни одному ответу недели не нужно.
 *   sql-030 — COALESCE с подписью по аптекам: вне дела; COALESCE и так напечатан в sql-086/103.
 *   sql-043 — CASE сегментами прайса: вне дела; если живой проход покажет, что четвергу w2 мало
 *             рукописного CASE, — первый кандидат (CASE рукой в кампании не пишется ни разу).
 *   sql-064 — WITH + CASE, лифт Milvara: хорошая задача, но уровень промо-навыка и чужой бренд.
 *   sql-057 — запас в неделях (L5): вторая пятница уровня 5 подряд с sql-022.
 */

// ---------------------------------------------------------------------------
// 4. Бит каждого дня — для шага прозы (Sonnet)
// ---------------------------------------------------------------------------
/**
 * found — черновик строки в папку дела (факт расследования, а не приём). Числа сняты самопроверкой;
 * править прозу можно, числа — только вместе с запросом. Роли прежние: заказчик — Аоки-сан,
 * руководитель — наставник, Ито-сан — поле. Дни с прежним id правятся на месте: вырезать шаги,
 * уехавшие в другой день, переписать подводки под новое место (приём 40-го захода).
 */
export const BEATS = {
  'day-6-who-is-missing': {
    keep: 'бриф Аоки-сан («кто занял? мне нужно имя») и граница наставника — как есть. Шаг sql-040 уезжает во вторник.',
    found: 'Обычное соединение показывает только тех, у кого продажи были. LEFT JOIN показывает всех: у новинки пять регионов из шестнадцати — нули.',
    hook: 'Завтра — те, у кого пусто: точки без Nettora поимённо. «Про цены мы ещё не смотрели» — снять: цену закрыла часть 1.' },
  'p2-day-empty': {
    brief: 'Наставник: пустота в SQL — не ноль и не «нет»; прежде чем искать точки без Nettora, научись её спрашивать.',
    found: 'Точки без Nettora названы поимённо. Пустоту спрашивают только словом IS NULL: сравнение с NULL не бывает истинным.',
    hook: 'Завтра — где бренд ещё держится: может, e-com тянет его, пока остальные проседают?' },
  'p2-day-channels': {
    brief: 'Команда e-com уверена, что Nettora держится на них (просьба из нынешней среды w2).',
    found: 'Бренд не держит никто: с января e-com 8 016 штук против 15 258 за то же полугодие 2025-го, сети 1 539 против 4 432.',
    hook: 'Остаётся версия внутри: бренд жил на акциях, акции кончились.' },
  'day-7-promo-or-price': {
    keep: 'CASE и интерлюдия Ито-сан про собственную марку сетей — как есть; sql-092 и абзацы про прайс вырезать, день теперь только про скидку. Название дня — без «цены».',
    found: 'Бренд жил не на скидке: в 2025-м 5.4 млн базовых продаж против 1.4 млн в акциях, а доля акций росла (6.7% → 20.3%), когда бренд падал.',
    hook: 'Завтра — ответ Аоки-сан: что про сорок две точки знают наши данные.' },
  'p2-day-alive': {
    brief: 'Аоки-сан: «Имя я уже не прошу. Скажи, что мы про эти точки знаем точно».',
    found: 'Все 42 точки, потерянные Nettora, живы: с января купили у нас 76 571 штуку других брендов. Перестали брать только её.',
    reflection: 'Кто занял полку — на наших данных не устанавливается. Но точки не закрылись, и значит, у поля есть двери. (Два абзаца нынешнего суждения пятницы w2 про «границу» и «76 571» переезжают сюда.)',
    hook: 'Суббота: Ито-сан просит адреса.' },
  'w2-sat-list-for-ito': {
    keep: 'как есть; подводка «из понедельника … из среды» — по новой раскладке (LEFT JOIN с понедельника, подзапрос с товарами бренда и период в ON — со среды).',
    hook: 'Список ушёл в поле. Прежде чем нести разбор бренду, Аоки-сан хочет закрыть последнее: не мы ли сами оставили полку? (Setouchi и «другой инструмент» уезжают в крючок субботы w2b.)' },
  'day-8-two-steps': {
    brief: 'Аоки-сан: «Прежде чем идти к бренду — убедись, что это не мы. Может, мы сами ушли из мелких точек, и правильно сделали?»',
    note: 'Подводка WITH — повод «агрегат от агрегата» (sql-118), не «деление агрегатов» (его часть 1 уже делала в одном SELECT). sql-103 из нынешней среды уехал в среду w2.',
    found: 'Ушли не из мелочи: в 2024-м эти 42 точки дали 16 292 штуки из 38 413 — 42% бренда. Средняя из них брала 388 штук в год, из оставшихся — 598.',
    hook: 'Завтра — два WITH в одном запросе и ловушка между ними.' },
  'p2-day-two-ctes': {
    brief: 'Наставник: второй WITH читает первый; соединять свёрнутое надо условием, иначе каждая строка с каждой.',
    found: 'Доля Nettora в дивизионе FMCG — 17.6%, четвёртое место из пяти; год назад бренд был вторым.',
    hook: 'Завтра — отгрузки рядом с продажами, и почему это опасно.' },
  'day-9-two-facts': {
    keep: 'как есть (sql-050 уезжает в четверг).',
    found: 'Соединение не по ключу размножает строки: 4 370 строк продаж Nettora превращаются в 43 700.' },
  'p2-day-by-key': {
    found: 'Отгрузки Nettora идут вровень с продажами: 1.04, 1.06, 1.04 по годам. Товар до точек доезжал.',
    hook: 'Завтра то же — по каждому дистрибьютору, и вывод Аоки-сан.' },
  'day-10-supply-chain': {
    keep: 'бриф и sql-022 — как есть. Суждение: абзацы про «границу» и «76 571» уехали в пятницу w2; про «на точку 52.9 против 48.3» — снять (одинокое число, спрос часть 1 уже показала на штуках).',
    found: 'Цепочка сбалансирована: у одиннадцати дистрибьюторов из двенадцати отгрузили столько же, сколько продали. Исключение — Setouchi, 2.44.' },
  'p2-w2b-sat-stock': {
    brief: 'Ито-сан: «Товар есть? Мне в точках говорят — не привозят».',
    found: 'Товар есть и копится: запас Nettora у дистрибьюторов на июнь — 1 046, 2 363, 4 224 штуки. Его не берут точки.',
    hook: 'Нынешний крючок субботы w2 целиком (итог двух недель по содержанию, Setouchi 2.44 отложен, в понедельник — «что просят, когда просят дашборд»).' },
};

// ---------------------------------------------------------------------------
// 5. Порядковые отсылки — правило и что сделано в этом заходе
// ---------------------------------------------------------------------------
/**
 * Правило (в CLAUDE.md не выносится — оно проверяется гейтом):
 *
 * 1. **Отсылка к другой неделе — по содержанию, а не по номеру.** «когда искали точки без Nettora»,
 *    «в деле Nettora», «запросом с двумя WITH, которым ты нашёл Setouchi» — вместо «на второй неделе»,
 *    «две недели назад», «с прошлой недели». Номер недели считает код по позиции, проза его не знает.
 * 2. **День недели («в среду», «вчерашний», «с понедельника») — только внутри той же недели.**
 *    Раскладку внутри недели разрез не трогает; межнедельная ссылка по дню ломается при любой вставке.
 * 3. **Итог «N недель позади» не пишется числом** — перечислением сделанного: «Позади дело Nettora
 *    и месячный отчёт…». Исключение — финиш части (StoryPart.finish) о своей же части: её состав
 *    меняется только вместе с финишем.
 * 4. **Подсказки и разбор заданий пака не ссылаются на кампанию вовсе:** задание живёт и в треке,
 *    где «вторая неделя» ничего не значит (sql-106, py-061 — переписаны).
 *
 * Гейт: test-story-ladder, «проза: отсылки к другим неделям — по содержанию» — порядковое слово
 * + «недел…», «N недель назад/позади», «прошлая неделя», en — first…eighth week, week one…eight,
 * last/previous week, N weeks ago/behind. Проверяет все тексты дней обеих локалей (не финиши частей).
 * Межнедельные ссылки по дню недели («понедельника второй недели» ловится, «Четверговый JOIN» — нет):
 * их гейт не видит, найдены чтением — список ниже.
 *
 * Сделано в этом заходе (storymode.ts ru+en, sql-core, python-core): все 35+36 порядковых отсылок
 * w1–w5 и две пары в паках — по содержанию; плюс «Четверговый JOIN» и «Ито-сан в среду называл» в w2
 * (JOIN теперь во вторник w1b, коридор Ито-сан — в четверг w1).
 *
 * НЕ сделано, шаг 6 (ломаются разрезом, чинить дважды незачем): отсылки по дням ВНУТРИ нынешней w2 —
 * «понедельничное IS NULL» (sql-101), «понедельничным LEFT JOIN», «Как в понедельнике» (sql-103),
 * «понадобится в пятницу» (sql-016), «как в понедельнике» (sql-041), «из среды» (sql-022),
 * «в понедельник… из понедельника… из среды… Приём понедельника в третий раз» (суббота w2),
 * «Вчера ты соединял справочник с фактом» (бриф четверга), «вчерашним промо-числом» (sql-050).
 * После раскладки выше каждое из них либо остаётся верным, либо переписывается — проверять по LAYOUT.
 */

// ---------------------------------------------------------------------------
// 6. Остальные решения части 2
// ---------------------------------------------------------------------------
/**
 * 1. **OVER(/LAG(, OR, LIKE — демонстрация, не навык кампании.** Каждое набирается рукой один раз
 *    (sql-020, sql-105), и так остаётся: w3 — неделя про отчёт, не про глубину SQL, а часть 3 меняет
 *    инструмент. Честность держит проза: финиш части 2 не пишет «умеете LAG» — пишет «видели, как
 *    считают против прошлого периода»; трек SQL это разворачивает с повторами. Шаг 6: в гейт лестницы
 *    вместо печати «напечатано один раз: …» — сверка со списком DEMO = [over(, lag(, OR, like,
 *    python:as_index=False]; новое одноразовое — провал, чтобы демонстрация оставалась решением.
 *
 * 2. **«Уровень 5» у sql-023 в части 1 — метку уровня в режиме истории не показывать вовсе.** Ступень
 *    в кампании задаёт день, а не уровень трека; L5 на пятнице новичка пугает, L2 на субботе w2b
 *    (sql-120) после L5 выглядит откатом. В треках метка остаётся. Правка — один экран (TaskView в
 *    storymode), шаг 6.
 *
 * 3. **Ссылка «Уже знаю SELECT и JOIN: начать с части 2» — условие «в кампании нет сохранённого
 *    шага», а не isNewUser** (как и было в спецификации части 1, п. 5.3). Знающий SQL, решивший одно
 *    задание в треке, — ровно тот, кому ссылка нужна. Шаг 6.
 *
 * 4. **recap части 2 не меняется** (пересказывает часть 1). **finish части 2** — перечислить три недели
 *    по содержанию; «три недели» в финише своей части допустимы (правило 5.3).
 *
 * 5. **Одинокие числа** (правило 23-го захода: число в прозе, которого не считает ни один шаг, не
 *    проверяет ничто): «76 571» → sql-117, «15 258» → sql-116, «2 363 → 4 224» → sql-120 (на июнь;
 *    в прозе было «за год» — теперь три года), «52.9 против 48.3» — снять.
 */

// ---------------------------------------------------------------------------
// 7. Самопроверка
// ---------------------------------------------------------------------------
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const require = createRequire(path.join(root, 'package.json'));
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
  const db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'quaera.sqlite'))));
  let failed = 0;

  const pack = JSON.parse(readFileSync(path.join(root, 'src/content/packs/sql-core.json'), 'utf8'));
  const packTasks = Array.isArray(pack) ? pack : pack.tasks;

  console.log('== эталоны новых заданий ==');
  for (const [id, t] of Object.entries(NEW_TASKS)) {
    const taken = packTasks.find((x) => x.id === id);
    if (taken && taken.title) { console.log(` FAIL ${id}: id уже занят в паке («${taken.title}»)`); failed++; }
    if (t.mode === 'fill') {
      let i = 0;
      const built = t.template.replace(/_{3}/g, () => t.blanks[i++]);
      if (built !== t.solution || i !== t.blanks.length) {
        console.log(` FAIL ${id}: шаблон с пропусками не собирается в эталон`);
        failed++;
      }
    }
    const [r] = db.exec(t.solution);
    const rows = r ? r.values.map((v) => v.join(' | ')) : [];
    console.log(` ${id} (${t.mode}, L${t.level}) — ${rows.length} стр.: ${rows.slice(0, 18).join('  ·  ')}`);
  }

  // Прототип плотности: та же логика, что reportDensity в scripts/test-story-ladder.mjs.
  const DENSITY = [
    ['WHERE', /\bWHERE\b/], ['OR', /\bOR\b/], ['IN', /\bIN\b/], ['BETWEEN', /\bBETWEEN\b/],
    ['ORDER BY', /\bORDER\s+BY\b/], ['DESC', /\bDESC\b/], ['LIMIT', /\bLIMIT\b/],
    ['COUNT', /\bCOUNT\s*\(/], ['DISTINCT', /\bDISTINCT\b/], ['SUM', /\bSUM\s*\(/],
    ['AVG', /\bAVG\s*\(/], ['MIN/MAX', /\b(MIN|MAX)\s*\(/], ['ROUND', /\bROUND\s*\(/],
    ['substr', /\bsubstr\s*\(/i], ['GROUP BY', /\bGROUP\s+BY\b/], ['HAVING', /\bHAVING\b/],
    ['LEFT JOIN', /\bLEFT\s+JOIN\b/], ['IS NULL', /\bIS\s+NULL\b/], ['IS NOT NULL', /\bIS\s+NOT\s+NULL\b/],
    ['COALESCE', /\bCOALESCE\s*\(/], ['подзапрос', /(?<!\bAS\s{0,4})\(\s*SELECT\b/],
    ['CASE', /\bCASE\s+WHEN\b/], ['ELSE', /\bELSE\b/], ['WITH', /\bWITH\b/],
  ];
  const count = (s, re) => (s ? (String(s).match(new RegExp(re.source, 'g')) ?? []).length : 0);
  const units = (s) => {
    const m = new Map();
    for (const [n, re] of DENSITY) if (count(s, re)) m.set(n, count(s, re));
    const plain = count(s, /\bJOIN\b/) - count(s, /\bLEFT\s+JOIN\b/);
    if (plain > 0) m.set('JOIN', plain);
    return m;
  };
  const typed = (t) => {
    const out = new Set();
    if (t.mode !== 'write' && t.mode !== 'fill') return out;
    const given = units(t.mode === 'write' ? t.starter : String(t.template ?? '').replace(/_{2,}/g, ''));
    for (const [n, k] of units(t.solution)) if (k > (given.get(n) ?? 0)) out.add(n);
    if (t.mode === 'fill') for (const n of units((t.blanks ?? []).join('\n')).keys()) out.add(n);
    return out;
  };
  const taskOf = (id) => NEW_TASKS[id] ? { id, ...NEW_TASKS[id] } : packTasks.find((t) => t.id === id);

  // Кампания как стоит в русском storymode.ts; нынешняя w2 заменяется LAYOUT после w1b.
  const src = readFileSync(path.join(root, 'src/content/storymode.ts'), 'utf8');
  const ru = src.slice(src.indexOf('const ru: StoryCampaign'), src.indexOf('const en: StoryCampaign'));
  const current = [];
  for (const m of ru.matchAll(/\n {6}id: '([^']+)',\n {6}week: '([^']+)',([\s\S]*?)(?=\n {6}id: '|$)/g)) {
    const short = (m[3].match(/short: '([^']+)'/) ?? [])[1];
    const track = (m[3].match(/track: '([^']+)'/) ?? [])[1];
    current.push({ week: m[2], short, id: m[1], track, steps: [...m[3].matchAll(/taskId: '([^']+)'/g)].map((x) => x[1]) });
  }
  const p2 = Object.entries(LAYOUT).flatMap(([week, ds]) => ds.map(([short, id, steps]) => ({ week, short, id, track: 'sql', steps })));
  const cut = current.findIndex((d) => d.week === 'w2');
  const days = [...current.slice(0, cut), ...p2, ...current.filter((d) => d.week !== 'w2').slice(cut)];

  // Каждое задание нынешней w2 должно найтись в новой раскладке — или быть снято осознанно.
  const DROPPED = ['sql-092'];
  const wasW2 = current.filter((d) => d.week === 'w2').flatMap((d) => d.steps);
  const nowP2 = p2.flatMap((d) => d.steps);
  const lost = wasW2.filter((id) => !nowP2.includes(id) && !DROPPED.includes(id));
  if (lost.length) { console.log(` FAIL задания нынешней w2 потерялись в раскладке: ${lost.join(', ')}`); failed++; }
  const twice = nowP2.filter((id, i) => nowP2.indexOf(id) !== i);
  const used = days.filter((d) => !p2.includes(d)).flatMap((d) => d.steps);
  const clash = nowP2.filter((id) => used.includes(id));
  if (twice.length || clash.length) { console.log(` FAIL задание в кампании дважды: ${[...twice, ...clash].join(', ')}`); failed++; }

  console.log('\n== плотность части 2 (¹ впервые, ² второй раз, * чистый лист) ==');
  const times = new Map();
  const problems = [];
  days.forEach((d, i) => {
    const weekDays = days.filter((x) => x.week === d.week);
    const closes = weekDays[weekDays.length - 1] === d;
    for (const tid of d.steps) {
      if (d.track !== 'sql') continue;
      const t = taskOf(tid);
      if (!t) { problems.push(`${tid}: нет в паке`); continue; }
      const ty = [...typed(t)];
      const loose = ty.filter((c) => (times.get(c) ?? 0) < 2);
      const blank = t.mode === 'write' && !String(t.starter ?? '').trim();
      const where = `д${i + 1} ${d.week} ${d.short} · ${tid}`;
      if (loose.length > 2) problems.push(`${where}: больше двух незакреплённых — ${loose.join(', ')}`);
      if (blank && !closes) problems.push(`${where}: чистый лист не в последний день недели`);
      if (blank && loose.length) problems.push(`${where}: чистый лист просит незакреплённое — ${loose.join(', ')}`);
      if (d.week === 'w2' || d.week === 'w2b' || process.argv.includes('--all'))
        console.log(`  ${where.padEnd(27)} ${(t.mode + (blank ? '*' : '')).padEnd(8)} L${t.level}  ${ty.map((c) => c + (['¹', '²'][times.get(c) ?? 0] ?? '')).join(', ')}`);
      for (const c of ty) times.set(c, (times.get(c) ?? 0) + 1);
    }
  });
  if (problems.length) { failed += problems.length; console.log(problems.map((p) => ` FAIL ${p}`).join('\n')); }
  else console.log(' ok   три правила плотности — по всей кампании с новой частью 2');
  const once = [...times].filter(([, n]) => n === 1).map(([c]) => c);
  console.log(` напечатано за кампанию один раз (sql): ${once.join(', ') || '—'}`);
  console.log(` недель в кампании: ${new Set(days.map((d) => d.week)).size}, дней: ${days.length}`);
  process.exit(failed ? 1 : 0);
}
