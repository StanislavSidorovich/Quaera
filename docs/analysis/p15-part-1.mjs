// Спецификация части 1 «Стажёр» (ROADMAP «Очередь на 2026-09-19 (тридцать восьмой заход)», п. 2;
// тридцать девятый заход, Opus, 2026-09-19).
//
// Нынешняя неделя 1 растягивается на две недели уровней 1–2, по одной идее в день:
//   w1 «Продажи Nettora правда упали — или это сезон?» — без JOIN: бренд отбирается
//      по product_id 19–23, которые человек сам достаёт из прайса во вторник;
//   w1b «Потерян спрос или полка — и чья это проблема?» — точки, JOIN, HAVING, цена,
//      пятница sql-023 (разложение), суббота sql-100 (контроль по соседям).
// После субботы w1b — экран «Часть 1 пройдена» и «Продолжить» (в нынешнюю w2).
//
// Запуск самопроверки (из корня querium):  node docs/analysis/p15-part-1.mjs
//   1) каждый новый эталон исполняется на .cache/quaera.sqlite, результат печатается;
//   2) у fill шаблон с подставленными пропусками собирается ровно в эталон;
//   3) прототип трёх правил плотности (scripts/test-story-ladder.mjs) — по новой
//      части 1 и следом нынешним неделям 2–5, как они стоят в storymode.ts.
// Настоящая проверка после того, как всё ляжет в пак и кампанию, — сам гейт:
//   npm run test:story-ladder   (и --density для таблицы)
//
// Что НЕ задано здесь: названия, бриф, goal, подсказки, разбор, английская накладка
// заданий (шаг 3 очереди: Opus или Sonnet); проза дней — бриф, подводки, реплики,
// суждение, крючок (тот же шаг, но BEATS ниже задаёт бит каждого дня); код частей
// (шаг 4, Sonnet) — по разделу PART_MODEL.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// 1. Недели и вопросы
// ---------------------------------------------------------------------------

/**
 * id недель не перенумеровываются: w2…w5 остаются как есть, новая вторая неделя
 * части 1 получает id `w1b`. Номер недели на экране считается по позиции в списке
 * (storymode.ts storyPastCases, StoryMode.tsx weeksAhead), а id встречаются в гейтах,
 * комментариях и ROADMAP сотни раз — переименование w2→w3 ничего не даёт человеку
 * и путает всю историю разборов.
 *
 * Вопросы — черновик для шага прозы; суть (на что честно отвечает пятница) — нет.
 */
export const WEEKS = [
  { id: 'w1', part: 'p1',
    ru: 'Продажи Nettora правда упали — или это сезон?',
    en: 'Did Nettora sales really fall, or is it just the season?',
    // Пятница отвечает: те же месяцы (январь–июнь) трёх лет — 20 740, 20 250, 9 858 штук.
    // Суббота-контроль: рынок за те же месяцы — 198 270, 225 261, 213 447 (−5% к 2025-му).
    answer: 'Упали по-настоящему: январь–июнь 2026 — 9 858 штук против 20 250 год назад, а рынок за те же месяцы −5%.' },
  { id: 'w1b', part: 'p1',
    ru: 'Потерян спрос или полка — и чья это проблема?',
    en: 'Lost demand or lost shelf, and whose problem is it?',
    // Пятница sql-023: точки 79 → 37, продажи на точку почти те же, цена та же.
    // Суббота sql-100: у соседей по FMCG с января 81–88 точек, у Nettora 37.
    answer: 'Полка: бренд перестали брать в 42 точках, спрос в оставшихся живой. Владелец — полевая команда.' },
  // дальше без изменений до спецификации части 2: w2, w3 (part p2), w4, w5 (part p3)
];

// ---------------------------------------------------------------------------
// 2. Новые задания
// ---------------------------------------------------------------------------
// id — следующие свободные в sql-core (последний занятый — sql-105).
// level — трудность вне кампании (правило четырнадцатого захода).
// Nettora в w1 отбирается по product_id IN (19, 20, 21, 22, 23): JOIN ещё не пройден,
// а IN — вторник. Это и есть приём аналитика «сначала достань ключи из справочника,
// потом фильтруй факты» — подводка четверга w1b (JOIN) называет его прямо: соединение
// делает то же самое, только само.

const NETTORA_IDS = '(19, 20, 21, 22, 23)';

export const NEW_TASKS = {
  // Вт w1 — последний шаг дня. Результат: 19..23, пять позиций Home care.
  // Порядок по product_id — не украшение: id понадобятся завтра, их выписывают подряд.
  'sql-106': { skill: 'sql-where', level: 1, mode: 'write',
    starter: 'SELECT product_id, product_name, list_price\nFROM dim_product\n',
    solution: "SELECT product_id, product_name, list_price\nFROM dim_product\nWHERE brand = 'Nettora'\nORDER BY product_id" },

  // Ср w1 — первый факт из продаж. Январь 2026: 1 216 штук.
  // BETWEEN впервые — в шаблоне; подводка среды обязана показать его в рабочей форме.
  'sql-107': { skill: 'sql-aggregate', level: 2, mode: 'fill',
    template: `SELECT ___(units) AS units\nFROM fact_sellout\nWHERE product_id ___ ${NETTORA_IDS}\n  AND week_start BETWEEN '2026-01-01' AND '2026-01-31'`,
    blanks: ['SUM', 'IN'],
    solution: `SELECT SUM(units) AS units\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\n  AND week_start BETWEEN '2026-01-01' AND '2026-01-31'` },

  // Ср w1 — то же за июнь 2025: 4 702. «Вчетверо!» — число из брифа среды (так считает
  // отчёт продаж: пик прошлого лета против этого января). Суждение среды: зиму сравнили
  // с летом, вывода пока нет.
  'sql-108': { skill: 'sql-aggregate', level: 2, mode: 'write',
    starter: 'SELECT SUM(units) AS units\nFROM fact_sellout\n',
    solution: `SELECT SUM(units) AS units\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\n  AND week_start BETWEEN '2025-06-01' AND '2025-06-30'` },

  // Пт w1 — ответ недели. Те же месяцы трёх лет:
  //   2024 | 20740   2025 | 20250   2026 | 9858
  // Условие «первые шесть месяцев» — в заготовке, с разбором в подводке пятницы:
  // substr(week_start, 6, 2) — месяц, '06' и меньше — январь…июнь. Новой конструкции нет
  // (substr и сравнение уже пройдены), новая только мысль: сравнивать одинаковые месяцы.
  // Рукой: год через substr, GROUP BY, ORDER BY — ровно два незакреплённых.
  'sql-109': { skill: 'sql-group-by', level: 2, mode: 'write',
    starter: `SELECT \n       SUM(units) AS units\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\n  AND substr(week_start, 6, 2) <= '06'\n`,
    solution: `SELECT substr(week_start, 1, 4) AS year,\n       SUM(units) AS units\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\n  AND substr(week_start, 6, 2) <= '06'\nGROUP BY 1\nORDER BY year` },

  // Сб w1 — чистый лист, контроль к пятничному вердикту: «может, просел весь рынок?»
  //   2024 | 198270   2025 | 225261   2026 | 213447  → −5% к 2025-му; у Nettora −51%.
  // Всё закреплено (см. отчёт плотности ниже). goal называет условие на месяцы словами
  // «те же месяцы, что в пятницу» — приём виден в пятничной заготовке, не в голове.
  'sql-110': { skill: 'sql-group-by', level: 2, mode: 'write', starter: '',
    solution: "SELECT substr(week_start, 1, 4) AS year,\n       SUM(units) AS units\nFROM fact_sellout\nWHERE substr(week_start, 6, 2) <= '06'\nGROUP BY 1\nORDER BY year" },

  // Пн w1b — полка по месяцам (пятничный запрос w1 + колонка точек, с 2025):
  //   точек 74 в январе 2025 → 64 в июне → 40 в декабре → 31 с февраля 2026.
  // Сползание началось летом 2025-го — это пригодится части 2 («кто занял»).
  'sql-111': { skill: 'sql-aggregate', level: 2, mode: 'fill',
    template: `SELECT substr(week_start, 1, 7) AS month,\n       SUM(units) AS units,\n       ___ AS outlets\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\n  AND week_start >= '2025-01-01'\nGROUP BY 1\nORDER BY month`,
    blanks: ['COUNT(DISTINCT customer_id)'],
    solution: `SELECT substr(week_start, 1, 7) AS month,\n       SUM(units) AS units,\n       COUNT(DISTINCT customer_id) AS outlets\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\n  AND week_start >= '2025-01-01'\nGROUP BY 1\nORDER BY month` },

  // Пн w1b — те же точки по годам: 79 | 79 | 37. Разница 42 — число из вопроса части 2
  // («Кто занял 42 точки Nettora»), здесь оно рождается.
  'sql-112': { skill: 'sql-aggregate', level: 2, mode: 'write',
    starter: `SELECT substr(week_start, 1, 4) AS year,\n       \nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\nGROUP BY 1\nORDER BY year`,
    solution: `SELECT substr(week_start, 1, 4) AS year,\n       COUNT(DISTINCT customer_id) AS outlets\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\nGROUP BY 1\nORDER BY year` },

  // Чт w1b — продажи на точку по месяцам с 2025 (новая идея дня: деление агрегатов;
  // 1.0 * — в шаблоне, подводка объясняет целочисленное деление одной фразой).
  //   2025: 29.7 31.5 50.4 43.9 63.2 73.5 … ; 2026: 34.7 42.2 57.5 65.5 64.2 47.3.
  // Те же месяцы: 2026 выше в пяти из шести (ниже только июнь). Спрос в оставшихся точках жив.
  'sql-113': { skill: 'sql-aggregate', level: 2, mode: 'fill',
    template: `SELECT substr(week_start, 1, 7) AS month,\n       ROUND(1.0 * SUM(units) / ___, 1) AS per_outlet\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\n  AND week_start >= '2025-01-01'\nGROUP BY 1\nORDER BY month`,
    blanks: ['COUNT(DISTINCT customer_id)'],
    solution: `SELECT substr(week_start, 1, 7) AS month,\n       ROUND(1.0 * SUM(units) / COUNT(DISTINCT customer_id), 1) AS per_outlet\nFROM fact_sellout\nWHERE product_id IN ${NETTORA_IDS}\n  AND week_start >= '2025-01-01'\nGROUP BY 1\nORDER BY month` },

  // Чт w1b — реальная цена штуки по годам: 193.9 | 194.0 | 198.5 (+2%). Не цена.
  // После sql-096 (по прайсу Nettora дороже всех в FMCG — 201.6) — «может, дорогая
  // и отпугнула?»: дорогой она была и в 2024-м, когда стояла в 79 точках.
  'sql-114': { skill: 'sql-join-inner', level: 2, mode: 'fill',
    template: "SELECT substr(f.week_start, 1, 4) AS year,\n       ROUND(___ / ___, 1) AS price\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE p.brand = 'Nettora'\nGROUP BY 1\nORDER BY year",
    blanks: ['SUM(f.revenue)', 'SUM(f.units)'],
    solution: "SELECT substr(f.week_start, 1, 4) AS year,\n       ROUND(SUM(f.revenue) / SUM(f.units), 1) AS price\nFROM fact_sellout f\nJOIN dim_product p ON p.product_id = f.product_id\nWHERE p.brand = 'Nettora'\nGROUP BY 1\nORDER BY year" },
};

// ---------------------------------------------------------------------------
// 3. Раскладка
// ---------------------------------------------------------------------------
/**
 * id дней. Где смысл дня пережил перестройку, id остаётся прежним — только чтобы
 * не плодить правок в гейтах и комментариях; переносить прогресс не нужно:
 *   day-1-first-day        Пн w1   — прайс насквозь (как был)
 *   day-2-counting         Ср w1   — считаем (был Вт; WHERE он уже прошёл в старом Пн)
 *   day-3-shape-of-the-year Чт w1  — форма года (был Ср)
 *   day-4-join             Вт w1b  — соединение (был Чт)
 *   day-5-shelf-or-demand  Пт w1b  — разложение sql-023 (был Пт w1)
 *   w1-sat-everyone-or-us  Сб w1b  — контроль по соседям sql-100 (был Сб w1)
 * Новые дни — с префиксом p1-. Кроме автора кампанию никто не проходил (подтверждено
 * пользователем 2026-09-19), поэтому ни карты STORY_MISSION_RENAMED, ни миграции:
 * id дней и недель можно менять свободно, пока нет живых прохождений.
 */
export const LAYOUT = {
  w1: [
    // Прайс насквозь: колонки, имя колонки, порядок строк. Новые: ORDER BY, DESC.
    ['Пн', 'day-1-first-day', ['sql-085', 'sql-001', 'sql-093']],
    // Отбор. Новые: WHERE, IN. В конце — id Nettora, которые понадобятся в среду.
    ['Вт', 'p1-day-filter', ['sql-002', 'sql-003', 'sql-025', 'sql-106']],
    // Считаем, без группировки; впервые fact_sellout. Новые: COUNT, DISTINCT, SUM, BETWEEN.
    ['Ср', 'day-2-counting', ['sql-007', 'sql-094', 'sql-107', 'sql-108']],
    // Группировка: форма года рынка. Новые: GROUP BY, AVG, substr.
    ['Чт', 'day-3-shape-of-the-year', ['sql-095', 'sql-010', 'sql-035', 'sql-097']],
    // Ответ недели: те же месяцы трёх лет.
    ['Пт', 'p1-day-same-months', ['sql-109']],
    // Контроль: рынок за те же месяцы.
    ['Сб', 'p1-w1-sat-market', ['sql-110']],
  ],
  w1b: [
    // Полка измеряется точками. Нового синтаксиса нет — новая мера.
    ['Пн', 'p1-day-outlets', ['sql-111', 'sql-112']],
    // Соединение: бренд по имени, а не по списку id. Новое: JOIN.
    ['Вт', 'day-4-join', ['sql-098', 'sql-037']],
    // Соединение в работе и фильтр после группировки. Новое: HAVING (в шаблоне).
    ['Ср', 'p1-day-wide-shelf', ['sql-036', 'sql-099']],
    // Может, спрос или цена? Деление агрегатов: на точку и за штуку.
    ['Чт', 'p1-day-per-outlet', ['sql-113', 'sql-096', 'sql-114']],
    // Разложение: точки, на точку, цена — вердикт.
    ['Пт', 'day-5-shelf-or-demand', ['sql-023']],
    // Контроль по соседям с чистого листа.
    ['Сб', 'w1-sat-everyone-or-us', ['sql-100']],
  ],
};

/**
 * Запас уровней 1–2, НЕ взятый в часть 1, и почему:
 *   sql-004 — дубль sql-093 (тот же goal); остаётся в треке.
 *   sql-024 — арифметика с ROUND и WHERE про «Риглу»: три идеи и не про Nettora.
 *   sql-026 — LIKE; решение «OR/LIKE/OVER — демонстрация или рукой» принадлежит части 2.
 *   sql-029 — OFFSET: вне словаря плотности, вне сюжета.
 *   sql-048 — связки при LIMIT/OFFSET: хорошее чтение, но пятый шаг понедельника.
 *   sql-008, sql-009 — дубли sql-094/sql-095 в режиме write.
 *   sql-032 — MIN/MAX: единственная конструкция, которую пришлось бы вводить ради
 *             одного задания; в часть 1 не нужна ни одному ответу.
 *   sql-033, sql-034 — вне сюжета; кандидаты в разгрузку, если живой проход покажет,
 *             что вторнику/среде w1b мало повторов.
 *   sql-null 005/006/028/030/031 — NULL целиком уходит в часть 2 A (LEFT JOIN, NULL,
 *             CASE): входящий сразу во вторую часть не должен зависеть от первой в том,
 *             что вторая сама вводит.
 *   sql-012 — тот же ответ, что sql-098 (выручка брендов с января), только BETWEEN.
 */

// ---------------------------------------------------------------------------
// 4. Бит каждого дня — для шага прозы
// ---------------------------------------------------------------------------
/**
 * found — черновик строки в папку дела (правило StoryMission.found: факт расследования,
 * а не выученный приём). Числа сняты самопроверкой ниже; править прозу — можно,
 * числа — только вместе с запросом.
 *
 * Правило ролей из нынешней кампании не меняется: заказчик — коммерческий директор,
 * руководитель — наставник, Ито-сан — поле. Кто пишет бриф, задаёт шаг прозы.
 */
export const BEATS = {
  'day-1-first-day': {
    brief: 'Директор: «Nettora упала вчетверо, разберись к пятнице». Наставник: сначала прочитай прайс — что у нас вообще есть.',
    found: 'Прайс читается насквозь: колонки, их имена, порядок строк. Продаж в нём нет ни одной.',
    hook: 'Завтра — только нужные строки: сорок семь позиций, из них наши пять.' },
  'p1-day-filter': {
    brief: 'Наставник: отчёт продаж знает товар не по имени, а по номеру. Найди номера Nettora.',
    found: 'У Nettora пять позиций, все Home care, product_id с 19 по 23.',
    note: 'sql-002 держит COUNT(*) в predict-запросе — подводка вторника показывает COUNT(*) одной строкой («сколько строк нашлось»), иначе гейт рабочей формы; если проза не хочет — заменить sql-002 на sql-048 и переставить его в Пн.',
    hook: 'Завтра открываем продажи — и проверяем «вчетверо».' },
  'day-2-counting': {
    brief: 'Отчёт продаж: «январь 2026 — худший месяц бренда, вчетверо ниже июня». Проверь сам.',
    found: 'Январь 2026 — 1 216 штук, июнь 2025 — 4 702. Вчетверо — если сравнивать зиму с летом.',
    reflection: 'Это ответ директору? Нет: в июне продают больше всегда — или только у нас?',
    hook: 'Завтра — форма года: весь рынок по месяцам.' },
  'day-3-shape-of-the-year': {
    brief: 'Наставник: прежде чем винить бренд, посмотри, как дышит рынок.',
    found: 'У рынка есть форма года: в 2025-м от 26 тыс. штук в ноябре до 49,6 тыс. в июне при тех же 132 точках. Январь с июнем не сравнивают.',
    hook: 'Сравнивать надо одинаковые месяцы. Завтра — январь–июнь трёх лет.' },
  'p1-day-same-months': {
    brief: 'Директор ждёт ответ: правда упали или сезон?',
    found: 'Упали по-настоящему: январь–июнь 2026 — 9 858 штук против 20 250 и 20 740 в те же месяцы двух прошлых лет.',
    reflection: 'Сезон отпал: те же месяцы. Но мы смотрим на один бренд — может, просел весь рынок?',
    hook: 'Суббота: тот же вопрос — ко всему рынку.' },
  'p1-w1-sat-market': {
    found: 'Рынок за те же месяцы почти не сдвинулся: 213 тыс. против 225 тыс. (−5%). Падает Nettora, не рынок.',
    reflection: 'Итог недели 1: падение настоящее и своё. Но «продали меньше» — это меньше покупают или меньше где купить?',
    hook: 'Неделя 2: спрос или полка.' },
  'p1-day-outlets': {
    brief: 'Ито-сан (поле): «По моим точкам Nettora берут как брали». Наставник: а точек сколько?',
    found: 'Точек с Nettora было 79 в 2024-м и 2025-м, с января — 37. Сползание началось летом 2025-го: 64 в июне, 40 в декабре.',
    hook: 'Номера 19–23 надоели? Завтра таблицы соединятся сами.' },
  'day-4-join': {
    found: 'Бренд соединяется с продажами по имени. С января Nettora седьмая по выручке из девяти брендов; дистрибьюторы в продажи не попадают — точек 132, клиентов 144.' },
  'p1-day-wide-shelf': {
    found: 'В 2025-м четыре бренда FMCG стояли в 81–88 точках с выручкой выше 5 млн. Nettora с 79 точками до клуба не дотянула по выручке, но по полке была рядом.',
    hook: 'Полка сжалась. Но, может, и спрос упал — или цена отпугнула?' },
  'p1-day-per-outlet': {
    found: 'Спрос в оставшихся точках жив: на точку в 2026-м продают столько же или больше, чем в те же месяцы 2025-го (5 из 6). Цена штуки почти не менялась: 194.0 → 198.5.',
    hook: 'Завтра — все три числа в одной таблице, и вердикт директору.' },
  'day-5-shelf-or-demand': {
    found: 'Причина названа: бренд потерял полку, а не спрос. Владелец проблемы — полевая команда.' },
  'w1-sat-everyone-or-us': {
    found: 'Полку потеряла одна Nettora: у соседей по FMCG с января 81–88 точек, у неё 37.',
    finish: 'Экран «Часть 1 пройдена» — после суждения субботы, перед крючком части 2.' },
};

// ---------------------------------------------------------------------------
// 5. Сущность «часть» — для шага кода (Sonnet)
// ---------------------------------------------------------------------------
/**
 * Решено здесь:
 *
 * 1. **Поле у недели, а не список недель у части.** `StoryWeek.part: string` — тот же
 *    приём, что `StoryMission.week`: принадлежность пишется у дочернего, порядок задаёт
 *    плоский список. Плюс `StoryCampaign.parts: StoryPart[]` для заголовков и финиша:
 *
 *      interface StoryPart {
 *        id: string;          // 'p1' | 'p2' | 'p3'
 *        title: string;       // «Стажёр» / «Аналитик» / «Другой инструмент»
 *        finish: string[];    // абзацы экрана «Часть N пройдена»: что умеете, что дальше
 *        recap: string[];     // 3–4 строки для входящего сразу в эту часть (у p1 пусто)
 *      }
 *
 *    Функции рядом со storyClosesWeek: `storyPartOf(campaign, missionId)`,
 *    `storyClosesPart(campaign, missionId)`, `storyFirstMissionOf(campaign, partId)`.
 *
 * 2. **Экран финиша — фаза миссии**, как итог недели (`StoryWeekSummary`), и стоит
 *    после него: суббота → итог недели → «Часть 1 пройдена» → «Продолжить» = переход
 *    в следующий день тем же storyMissionAfter. Отдельного хранения нет: позиция —
 *    по-прежнему id дня. Кнопка «Потом» на финише не нужна — главная и так рядом.
 *    Правило `quaera-product-ux`: у части есть конец — «если конца нет, отдачи не будет».
 *    Финиш называет сделанное числами (две недели, N заданий, вывод дела), не хвалит.
 *
 * 3. **Вход сразу в часть 2** — только до первого шага кампании (сохранённого id нет):
 *    на карточке кампании главной вторая, тише основной, ссылка «Знаю SELECT и JOIN —
 *    начать с части 2». Сохраняет id первого дня части 2 (нынешний day-6-who-is-missing).
 *    Бриф этого дня при входе без части 1 показывает `recap` части 1 вместо двенадцати
 *    строк found (storyPastCases) — признак: в папке дела нет ни одного дня части 1,
 *    пройденного в этом браузере, то есть флаг `quaera.story.skipped = 'p1'` в
 *    localStorage, ставится той же ссылкой. Вернуться в часть 1 можно всегда:
 *    полоса дела части 1 доступна, как и сейчас доступны прошедшие недели.
 *
 * 4. **Гейты.** Лестница и плотность считаются сквозь всю кампанию, как сейчас: для
 *    входящего в часть 2 это допущение «SELECT…HAVING знакомы» — он его сам заявил.
 *    Добавить: у каждой части последний день — суббота с чистым листом (сейчас это
 *    правило недели), у каждой части есть finish ru+en, recap у всех, кроме первой.
 *    `week-preview` («дальше ещё N недель, последняя — pandas») — считать недели до
 *    конца части и назвать следующую часть, а не до конца кампании: новичку «ещё
 *    7 недель» на брифе первого дня — то самое «испугался и спрыгнул».
 *
 * 5. **Миграции прогресса нет** — живых прохождений, кроме авторского, нет. Шаг кода
 *    не пишет ни карту переходов, ни `test:storage-migration` под части; свой прогресс
 *    автор сбрасывает сам. Нынешняя неделя w1 распадается на w1 + w1b, дни w2…w5 не трогаются.
 */
export const PART_MODEL = {
  parts: [
    { id: 'p1', title: 'Стажёр', weeks: ['w1', 'w1b'] },
    { id: 'p2', title: 'Аналитик', weeks: ['w2', 'w3'] }, // w2 режется на две — спецификация части 2
    { id: 'p3', title: 'Другой инструмент', weeks: ['w4', 'w5'] },
  ],
};

// ---------------------------------------------------------------------------
// 6. Самопроверка
// ---------------------------------------------------------------------------
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const require = createRequire(path.join(root, 'package.json'));
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
  const db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'quaera.sqlite'))));
  let failed = 0;

  console.log('== эталоны новых заданий ==');
  for (const [id, t] of Object.entries(NEW_TASKS)) {
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

  const pack = JSON.parse(readFileSync(path.join(root, 'src/content/packs/sql-core.json'), 'utf8'));
  const packTasks = Array.isArray(pack) ? pack : pack.tasks;
  const taskOf = (id) => NEW_TASKS[id] ? { id, ...NEW_TASKS[id] } : packTasks.find((t) => t.id === id);

  // Недели 2–5 — как они стоят в русской кампании сейчас.
  const src = readFileSync(path.join(root, 'src/content/storymode.ts'), 'utf8');
  const ru = src.slice(src.indexOf('const ru: StoryCampaign'), src.indexOf('const en: StoryCampaign'));
  const rest = [];
  for (const m of ru.matchAll(/\n {6}id: '([^']+)',\n {6}week: '([^']+)',([\s\S]*?)(?=\n {6}id: '|$)/g)) {
    if (m[2] === 'w1') continue;
    const short = (m[3].match(/short: '([^']+)'/) ?? [])[1];
    const track = (m[3].match(/track: '([^']+)'/) ?? [])[1];
    rest.push({ week: m[2], short, id: m[1], track, steps: [...m[3].matchAll(/taskId: '([^']+)'/g)].map((x) => x[1]) });
  }
  const days = [
    ...Object.entries(LAYOUT).flatMap(([week, ds]) => ds.map(([short, id, steps]) => ({ week, short, id, track: 'sql', steps }))),
    ...rest,
  ];

  console.log('\n== плотность (¹ впервые, ² второй раз, * чистый лист) ==');
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
      if (d.week === 'w1' || d.week === 'w1b' || process.argv.includes('--all'))
        console.log(`  ${where.padEnd(26)} ${(t.mode + (blank ? '*' : '')).padEnd(8)} L${t.level}  ${ty.map((c) => c + (['¹', '²'][times.get(c) ?? 0] ?? '')).join(', ')}`);
      for (const c of ty) times.set(c, (times.get(c) ?? 0) + 1);
    }
  });
  if (problems.length) { failed += problems.length; console.log(problems.map((p) => ` FAIL ${p}`).join('\n')); }
  else console.log(' ok   три правила плотности — по части 1 и дальше по неделям 2–5 без единой строки');

  const levels = days.filter((d) => d.week === 'w1' || d.week === 'w1b').flatMap((d) => d.steps.map(taskOf)).filter((t) => t.level > 2);
  console.log(`\n уровни выше 2 в части 1 (осознанно, из нынешней недели 1): ${levels.map((t) => `${t.id} L${t.level} ${t.mode}`).join(', ')}`);
  process.exit(failed ? 1 : 0);
}
