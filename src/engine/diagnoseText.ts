import type { Feedback } from './types';
import type { Locale } from '../i18n/context';

/**
 * Тексты диагностики — то, что diagnose.ts говорит, когда уже решил, что сказать.
 *
 * Разделение то же, что у chartSpec/Chart: там решение «что можно нарисовать
 * честно» отделено от рисования, здесь решение «какая это ошибка» отделено
 * от формулировки. Причина та же и обратная по смыслу: **ошибку в диагнозе
 * не видно никогда, ошибку в формулировке видно сразу.** Держать их в одном
 * файле значило бы прятать двадцать регулярок и разбор коэффициентов между
 * абзацами прозы на двух языках.
 *
 * Почему не в i18n/ru.ts, где лежат остальные строки: там интерфейсная
 * облицовка — кнопки, заголовки, статусы. Это не она. «Ровный целый
 * коэффициент — почти всегда следствие соединения» — педагогический контент
 * вроде explain у задания, только вычисляемый на лету, и переводить его надо
 * с тем же вниманием, что разборы в паках, а не с тем, что подписи кнопок.
 *
 * Структура жёстко одна на обе локали (`Record<Locale, DiagnoseText>`): новое
 * сообщение по-русски роняет `tsc --noEmit` внутри `npm run build`, пока
 * такого же нет по-английски. Тот же приём, что держит en.ts вровень с ru.ts.
 *
 * Единственное, что здесь не проза: склонение и формат чисел. По-русски форма
 * слова зависит от последних цифр («1 строка», «2 строки», «5 строк»),
 * по-английски — только от единственности, и разделитель разрядов другой.
 * Поэтому rows() и fmt() входят в состав локали, а не стоят рядом с логикой.
 */
export interface DiagnoseText {
  /** «5 строк» / «5 rows» — со склонением и разделителем разрядов своей локали. */
  rows: (n: number) => string;
  /** Значение из результата в тексте разбора: числа по правилам локали, остальное как есть. */
  fmt: (v: unknown) => string;

  // -------------------------------------------------- ошибки движка
  noColumn: (name: string, hint: string | null) => Feedback;
  /**
   * Имя написано верно, но колонка живёт в другой таблице. Отдельное сообщение,
   * потому что подсказка про опечатку здесь превращается в бессмыслицу
   * («нет колонки unit — а в схеме есть unit»): ближайшее имя совпало
   * с искомым, и совет «проверьте написание» отправляет искать несуществующую
   * опечатку вместо недостающего соединения.
   */
  columnElsewhere: (name: string) => Feedback;
  noTable: (name: string, hint: string | null) => Feedback;
  ambiguousColumn: (name: string) => Feedback;
  misuseOfAggregate: () => Feedback;
  orderByMismatch: () => Feedback;
  syntaxNear: (token: string) => Feedback;
  sqlFallback: (message: string) => Feedback;
  /** Воркер отвалился, не сказав почему (WORKER_FAILURE) — прозы от него не пришло. */
  workerFailure: () => Feedback;
  pythonKeyError: (name: string, hint: string | null) => Feedback;
  pythonFallback: (kind: string | null, detail: string, traceback: string) => Feedback;

  // ---------------------------------------------- расхождение с эталоном
  ratioExact: (k: number) => Feedback;
  ratioOver: (ratio: number) => Feedback;
  ratioUnder: (ratio: number) => Feedback;
  inflatedVaried: (min: number, max: number) => Feedback;
  deflatedVaried: (min: number, max: number) => Feedback;
  wrongValues: (key: string, column: string, expected: unknown, got: unknown) => Feedback;
  columnsCount: (expectedCols: string[], userColsCount: number) => Feedback;
  columnsOrder: (expectedCols: string[]) => Feedback;
  wrongOrder: () => Feedback;
  missingRows: (n: number) => Feedback;
  extraRows: (n: number, multiple: number | null) => Feedback;
  bothWays: (userRows: number, expectedRows: number) => Feedback;
  mismatchFallback: (userRows: number, expectedRows: number) => Feedback;
  /** Замечание по оформлению — на правильность не влияет, живёт отдельным полем Feedback. */
  columnNamesStyle: (expectedCols: string[]) => string;
}

/** Русское склонение числительных — форма зависит от последних одной-двух цифр. */
const pluralRu = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};

const ru: DiagnoseText = {
  rows: (n) => `${n.toLocaleString('ru-RU')} ${pluralRu(n, 'строка', 'строки', 'строк')}`,
  fmt: (v) => (typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : String(v)),

  noColumn: (name, hint) => ({
    tone: 'error',
    title: `Нет колонки ${name}`,
    body: hint
      ? `Похоже на опечатку: в схеме есть ${hint}.`
      : 'Такой колонки нет ни в одной из таблиц запроса. Откройте схему и проверьте, в какой таблице она живёт.',
    nudges: [
      'Эта колонка точно в той таблице, которую вы присоединили?',
      'Если таблиц несколько и имена совпадают — нужен префикс алиаса, например f.units.',
    ],
  }),

  columnElsewhere: (name) => ({
    tone: 'error',
    title: `Колонки ${name} нет в этих таблицах`,
    body: `Имя написано верно — такая колонка в датасете есть, но лежит в другой таблице, а в запросе её нет. Откройте схему и посмотрите, где ${name} живёт на самом деле.`,
    nudges: [
      'Скорее всего, не хватает соединения: нужную таблицу надо присоединить по ключу.',
      'Если таблица уже в запросе — проверьте алиас: колонка ищется в той, что названа в FROM и JOIN, а не во всём датасете.',
    ],
  }),

  noTable: (name, hint) => ({
    tone: 'error',
    title: `Нет таблицы ${name}`,
    body: hint ? `Возможно, имелась в виду ${hint}.` : 'Проверьте список таблиц в схеме данных.',
    nudges: ['Имена таблиц: dim_* — справочники, fact_* — факты, staging_* — сырой слой.'],
  }),

  ambiguousColumn: (name) => ({
    tone: 'error',
    title: `Неоднозначная колонка ${name}`,
    body: 'Такая колонка есть больше чем в одной из соединённых таблиц, и SQLite не знает, какую вы имеете в виду.',
    nudges: ['Добавьте префикс: f.product_id или p.product_id.'],
  }),

  misuseOfAggregate: () => ({
    tone: 'error',
    title: 'Агрегат не на своём месте',
    body: 'SUM, COUNT, AVG нельзя использовать в WHERE: WHERE отбирает строки до группировки, когда агрегата ещё не существует.',
    nudges: [
      'Условие на агрегат переносится в HAVING — он работает уже после GROUP BY.',
      'WHERE — фильтр строк, HAVING — фильтр групп.',
    ],
  }),

  orderByMismatch: () => ({
    tone: 'error',
    title: 'ORDER BY ссылается в пустоту',
    body: 'Сортировка идёт по выражению, которого нет в результате.',
    nudges: ['Сортируйте по алиасу колонки или по её номеру: ORDER BY 2 DESC.'],
  }),

  syntaxNear: (token) => ({
    tone: 'error',
    title: `Синтаксис ломается рядом с «${token}»`,
    body: 'Ошибка обычно не в самом этом слове, а прямо перед ним: пропущенная запятая, скобка или ключевое слово.',
    nudges: [
      'Проверьте порядок: SELECT → FROM → JOIN → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT.',
      'Посчитайте открывающие и закрывающие скобки.',
    ],
  }),

  sqlFallback: (message) => ({ tone: 'error', title: 'Запрос не выполнился', body: message, nudges: [] }),

  workerFailure: () => ({
    tone: 'error',
    title: 'Движок не ответил',
    body: 'Выполнение прервалось до того, как движок успел что-то сообщить, — дело не в вашем коде. Обычно помогает перезагрузка страницы.',
    nudges: [],
  }),

  pythonKeyError: (name, hint) => ({
    tone: 'error',
    title: `Нет колонки «${name}»`,
    body: hint
      ? `Похоже на опечатку: в таблицах есть «${hint}».`
      : 'Такой колонки нет ни в одной из использованных таблиц — проверьте имя в схеме, включая регистр.',
    nudges: [],
  }),

  pythonFallback: (kind, detail, traceback) => ({
    tone: 'error',
    title: kind ?? 'Код не выполнился',
    body: detail,
    nudges: traceback ? traceback.split('\n').filter(Boolean) : [],
  }),

  ratioExact: (k) => ({
    tone: 'warn',
    title: `Все значения завышены ровно в ${k} ${pluralRu(k, 'раз', 'раза', 'раз')}`,
    body: 'Ровный целый коэффициент — почти всегда следствие соединения: каждая строка факта совпала с несколькими строками справочника и посчиталась несколько раз.',
    nudges: [
      'Проверьте гранулярность таблиц: на одну строку факта должна приходиться ровно одна строка справочника.',
      'Условие соединения полное? Если ключ составной, в ON должны быть все его части.',
      'Быстрая проверка: сравните COUNT(*) до соединения и после — число строк меняться не должно.',
    ],
  }),

  ratioOver: (ratio) => ({
    tone: 'warn',
    title: `Значения завышены примерно в ${ratio.toFixed(2)} раза`,
    body: 'Разрезы совпали, а суммы больше эталонных — в расчёт попали строки, которых там быть не должно.',
    nudges: [
      'Все ли фильтры на месте: период, дивизион, канал, признак активности?',
      'Не попадают ли в сумму строки других категорий или другого типа клиента?',
    ],
  }),

  ratioUnder: (ratio) => ({
    tone: 'warn',
    title: `Значения занижены примерно в ${(1 / ratio).toFixed(2)} раза`,
    body: 'Разрезы совпали, но суммы меньше эталонных — часть строк отсеялась.',
    nudges: [
      'Фильтр не слишком строгий? Границы периода включаются или отсекаются?',
      'Сравнение с NULL всегда даёт ложь: строки с пустым значением молча выпадают. Нужен IS NULL или COALESCE.',
    ],
  }),

  inflatedVaried: (min, max) => ({
    tone: 'warn',
    title: 'Значения завышены во всех строках, но по-разному',
    body: `Разрезы совпали, а суммы больше эталонных — от ${min.toFixed(2)} до ${max.toFixed(2)} раза. Множитель неодинаковый, поэтому дело не в размножении строк соединением, а в том, что в каждую группу попали лишние строки.`,
    nudges: [
      'Самая частая причина — не перенесённый в запрос фильтр периода. Сверьте даты в задании и в WHERE.',
      'Проверьте остальные условия из постановки: дивизион, канал, тип клиента, признак промо.',
      'Если фильтр стоит в ON внешнего соединения вместо WHERE, он тоже не сработает так, как ожидается.',
    ],
  }),

  deflatedVaried: (min, max) => ({
    tone: 'warn',
    title: 'Значения занижены во всех строках, но по-разному',
    body: `Разрезы совпали, а суммы меньше эталонных — от ${min.toFixed(2)} до ${max.toFixed(2)} от ожидаемого. В каждой группе не хватает части строк.`,
    nudges: [
      'Период задан ýже, чем в задании? Проверьте обе границы: BETWEEN включает концы, > и < — нет.',
      'Лишнее условие в WHERE отсекает часть строк — сверьте список условий с постановкой.',
      'Строки со значением NULL в колонке фильтра выпадают молча. Нужен IS NULL или COALESCE.',
    ],
  }),

  wrongValues: (key, column, expected, got) => ({
    tone: 'warn',
    title: 'Разрезы верные, значения — нет',
    body: `Например, для «${key}» в колонке ${column} ожидалось ${ru.fmt(expected)}, а получилось ${ru.fmt(got)}. Где-то больше, где-то меньше — то есть считается не та величина, а не «слегка не тот набор строк».`,
    nudges: [
      'Проверьте, по какой колонке считается мера — units или revenue, до скидки или после.',
      'COUNT(*) считает строки, COUNT(DISTINCT ...) — уникальные значения. Это разные ответы.',
      'Если в задании есть округление, оно должно быть на том же шаге, что и в эталоне.',
    ],
  }),

  columnsCount: (expectedCols, userColsCount) => ({
    tone: 'error',
    title: `Ожидается ${expectedCols.length} ${pluralRu(expectedCols.length, 'колонка', 'колонки', 'колонок')}, вернулось ${userColsCount}`,
    body: `Эталон возвращает: ${expectedCols.join(', ')}.`,
    nudges: ['Лишние колонки в SELECT так же плохи, как недостающие: результат должен точно соответствовать постановке.'],
  }),

  columnsOrder: (expectedCols) => ({
    tone: 'warn',
    title: 'Колонки не в том порядке',
    body: `Данные сошлись с эталоном полностью, расходится только последовательность колонок. Ожидается: ${expectedCols.join(', ')}.`,
    nudges: [
      'Порядок колонок в SELECT — часть ответа: отчёт отдают в том виде, в каком его перечислили в постановке.',
    ],
  }),

  wrongOrder: () => ({
    tone: 'warn',
    title: 'Данные верные, порядок — нет',
    body: 'Все строки совпали с эталоном, но идут в другой последовательности. В этом задании порядок важен: без явной сортировки СУБД вправе вернуть строки в любом порядке.',
    nudges: [
      'Добавьте ORDER BY по той колонке, о которой говорится в задании.',
      'Для рейтингов почти всегда нужен DESC, и разумно добавить второй ключ сортировки для устойчивости при равных значениях.',
    ],
  }),

  missingRows: (n) => ({
    tone: 'warn',
    title: `Не хватает ${ru.rows(n)}`,
    body: 'Все возвращённые строки правильные, но часть результата потерялась.',
    nudges: [
      'Фильтр не отсекает лишнего? Проверьте границы периода и точность написания значений в кавычках.',
      'INNER JOIN выбрасывает строки без пары. Если нужны все периоды или все клиенты, включая те, где продаж не было, нужен LEFT JOIN.',
      'В этом датасете отсутствие строки в fact_sellout означает «не продавалось», а не ноль. Недели без продаж сами не появятся — их надо взять из календаря.',
    ],
  }),

  extraRows: (n, multiple) => ({
    tone: 'warn',
    title: `Лишних строк: ${ru.rows(n)}`,
    body: multiple
      ? `Строк ровно в ${multiple} ${pluralRu(multiple, 'раз', 'раза', 'раз')} больше эталона — типичный признак того, что соединение размножило факты.`
      : 'Все ожидаемые строки на месте, но к ним добавились лишние.',
    nudges: multiple
      ? [
          'Проверьте, не соединяете ли факт со справочником по неуникальному ключу.',
          'Если справочник содержит историю (несколько строк на один объект), нужно взять актуальную версию, а не все.',
        ]
      : [
          'Какой фильтр из постановки не перенесён в запрос: период, канал, дивизион, тип клиента?',
          'Если нужны только уникальные значения — GROUP BY или DISTINCT.',
        ],
  }),

  bothWays: (userRows, expectedRows) => ({
    tone: 'warn',
    title: 'Набор строк не совпадает',
    body: `Вернулось ${ru.rows(userRows)}, ожидается ${ru.rows(expectedRows)}: часть строк лишняя, часть отсутствует. Скорее всего, группировка идёт не по тем колонкам.`,
    nudges: [
      'В GROUP BY должны быть ровно те неагрегированные колонки, что стоят в SELECT.',
      'Сверьте гранулярность: задание про месяцы, а группировка по неделям — или наоборот.',
    ],
  }),

  mismatchFallback: (userRows, expectedRows) => ({
    tone: 'warn',
    title: 'Результат не совпал с эталоном',
    body: `Вернулось ${ru.rows(userRows)}, ожидается ${ru.rows(expectedRows)}.`,
    nudges: ['Сравните свой результат с образцом первых строк эталона ниже.'],
  }),

  columnNamesStyle: (expectedCols) =>
    `Имена колонок отличаются от ожидаемых (${expectedCols.join(', ')}). На правильность это не влияет, но отчёт с колонкой вида SUM(units) в работу не отдают — давайте колонкам осмысленные алиасы.`,
};

const en: DiagnoseText = {
  rows: (n) => `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'}`,
  fmt: (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(v)),

  noColumn: (name, hint) => ({
    tone: 'error',
    title: `No column ${name}`,
    body: hint
      ? `Looks like a typo: the schema has ${hint}.`
      : 'No table in this query has that column. Open the schema and check which table it lives in.',
    nudges: [
      'Is that column really in the table you joined?',
      'With several tables and matching names you need an alias prefix — f.units, for instance.',
    ],
  }),

  columnElsewhere: (name) => ({
    tone: 'error',
    title: `No ${name} in these tables`,
    body: `The name is spelled right — the dataset does have that column, but it lives in another table, and that table is not in your query. Open the schema and see where ${name} actually sits.`,
    nudges: [
      'Most likely a join is missing: the table it belongs to has to be joined in on its key.',
      'If the table is already in the query, check the alias: a column is looked up in what FROM and JOIN name, not across the whole dataset.',
    ],
  }),

  noTable: (name, hint) => ({
    tone: 'error',
    title: `No table ${name}`,
    body: hint ? `You may have meant ${hint}.` : 'Check the list of tables in the data schema.',
    nudges: ['Table names: dim_* are lookups, fact_* are facts, staging_* is the raw layer.'],
  }),

  ambiguousColumn: (name) => ({
    tone: 'error',
    title: `Ambiguous column ${name}`,
    body: 'More than one of the joined tables has that column, and SQLite cannot tell which one you mean.',
    nudges: ['Add a prefix: f.product_id or p.product_id.'],
  }),

  misuseOfAggregate: () => ({
    tone: 'error',
    title: 'An aggregate in the wrong place',
    body: 'SUM, COUNT and AVG cannot be used in WHERE: WHERE picks rows before grouping, when the aggregate does not exist yet.',
    nudges: [
      'A condition on an aggregate belongs in HAVING — that runs after GROUP BY.',
      'WHERE filters rows, HAVING filters groups.',
    ],
  }),

  orderByMismatch: () => ({
    tone: 'error',
    title: 'ORDER BY points at nothing',
    body: 'The sort is on an expression that is not in the result.',
    nudges: ['Sort by the column alias or by its position: ORDER BY 2 DESC.'],
  }),

  syntaxNear: (token) => ({
    tone: 'error',
    title: `Syntax breaks near "${token}"`,
    body: 'The mistake is usually not in that word but immediately before it: a missing comma, bracket or keyword.',
    nudges: [
      'Check the order: SELECT → FROM → JOIN → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT.',
      'Count the opening and closing brackets.',
    ],
  }),

  sqlFallback: (message) => ({ tone: 'error', title: 'The query did not run', body: message, nudges: [] }),

  workerFailure: () => ({
    tone: 'error',
    title: 'The engine did not answer',
    body: 'Execution stopped before the engine could report anything — this is not about your code. Reloading the page usually clears it.',
    nudges: [],
  }),

  pythonKeyError: (name, hint) => ({
    tone: 'error',
    title: `No column "${name}"`,
    body: hint
      ? `Looks like a typo: the tables have "${hint}".`
      : 'None of the tables you used has that column — check the name in the schema, including its case.',
    nudges: [],
  }),

  pythonFallback: (kind, detail, traceback) => ({
    tone: 'error',
    title: kind ?? 'The code did not run',
    body: detail,
    nudges: traceback ? traceback.split('\n').filter(Boolean) : [],
  }),

  ratioExact: (k) => ({
    tone: 'warn',
    title: `Every value is inflated by exactly ${k}×`,
    body: 'A clean whole-number factor is almost always the join: each fact row matched several lookup rows and got counted several times.',
    nudges: [
      'Check the grain of the tables: one fact row should meet exactly one lookup row.',
      'Is the join condition complete? With a composite key, every part of it belongs in ON.',
      'Quick check: compare COUNT(*) before and after the join — the row count must not change.',
    ],
  }),

  ratioOver: (ratio) => ({
    tone: 'warn',
    title: `Values are inflated by roughly ${ratio.toFixed(2)}×`,
    body: 'The breakdown matches, but the totals are above the reference — rows that do not belong got into the calculation.',
    nudges: [
      'Are all the filters there: period, division, channel, an active flag?',
      'Could rows from other categories or another customer type be adding to the total?',
    ],
  }),

  ratioUnder: (ratio) => ({
    tone: 'warn',
    title: `Values are understated by roughly ${(1 / ratio).toFixed(2)}×`,
    body: 'The breakdown matches, but the totals are below the reference — some rows were filtered out.',
    nudges: [
      'Is the filter too strict? Are the period boundaries included or cut off?',
      'A comparison with NULL is always false, so rows with an empty value drop out silently. You need IS NULL or COALESCE.',
    ],
  }),

  inflatedVaried: (min, max) => ({
    tone: 'warn',
    title: 'Every row is inflated, but by a different amount',
    body: `The breakdown matches, but the totals are above the reference — between ${min.toFixed(2)}× and ${max.toFixed(2)}×. The factor is uneven, so this is not a join multiplying rows: extra rows landed in every group.`,
    nudges: [
      'The usual cause is a period filter that never made it into the query. Compare the dates in the brief with your WHERE.',
      'Check the rest of the conditions in the brief: division, channel, customer type, promo flag.',
      'A filter placed in the ON of an outer join instead of WHERE will not do what you expect either.',
    ],
  }),

  deflatedVaried: (min, max) => ({
    tone: 'warn',
    title: 'Every row is understated, but by a different amount',
    body: `The breakdown matches, but the totals are below the reference — between ${min.toFixed(2)}× and ${max.toFixed(2)}× of what was expected. Every group is missing some of its rows.`,
    nudges: [
      'Is the period narrower than the brief asks? Check both ends: BETWEEN includes them, > and < do not.',
      'An extra condition in WHERE cuts rows out — compare your conditions against the brief.',
      'Rows with NULL in the filtered column drop out silently. You need IS NULL or COALESCE.',
    ],
  }),

  wrongValues: (key, column, expected, got) => ({
    tone: 'warn',
    title: 'The breakdown is right, the values are not',
    body: `For "${key}" in column ${column}, for instance, ${en.fmt(expected)} was expected and ${en.fmt(got)} came back. Some are higher, some lower — so this is the wrong quantity being computed, not a slightly wrong set of rows.`,
    nudges: [
      'Check which column the measure is built on — units or revenue, before the discount or after.',
      'COUNT(*) counts rows, COUNT(DISTINCT ...) counts distinct values. Those are different answers.',
      'If the brief asks for rounding, it has to happen at the same step as in the reference.',
    ],
  }),

  columnsCount: (expectedCols, userColsCount) => ({
    tone: 'error',
    title: `${expectedCols.length} ${expectedCols.length === 1 ? 'column' : 'columns'} expected, ${userColsCount} returned`,
    body: `The reference returns: ${expectedCols.join(', ')}.`,
    nudges: ['Extra columns in SELECT are as wrong as missing ones: the result has to match the brief exactly.'],
  }),

  columnsOrder: (expectedCols) => ({
    tone: 'warn',
    title: 'The columns are in the wrong order',
    body: `The data matches the reference exactly; only the sequence of columns differs. Expected: ${expectedCols.join(', ')}.`,
    nudges: [
      'Column order in SELECT is part of the answer: a report is handed over in the order the brief lists.',
    ],
  }),

  wrongOrder: () => ({
    tone: 'warn',
    title: 'The data is right, the order is not',
    body: 'Every row matches the reference, but they come back in a different sequence. Order matters in this task: without an explicit sort a database is free to return rows in any order.',
    nudges: [
      'Add an ORDER BY on the column the brief talks about.',
      'Rankings almost always want DESC, and a second sort key keeps ties stable.',
    ],
  }),

  missingRows: (n) => ({
    tone: 'warn',
    title: `${en.rows(n)} missing`,
    body: 'Every row you returned is correct, but part of the result got lost.',
    nudges: [
      'Is the filter cutting too much? Check the period boundaries and the exact spelling of the quoted values.',
      'INNER JOIN throws away rows without a match. If you need every period or every customer, including those with no sales, you need LEFT JOIN.',
      'In this dataset a missing row in fact_sellout means "nothing was sold", not zero. Weeks without sales will not appear on their own — they have to come from the calendar.',
    ],
  }),

  extraRows: (n, multiple) => ({
    tone: 'warn',
    title: `${en.rows(n)} too many`,
    body: multiple
      ? `There are exactly ${multiple}× as many rows as the reference — the classic sign of a join multiplying the facts.`
      : 'Every expected row is there, but extra ones came along with them.',
    nudges: multiple
      ? [
          'Check whether you are joining a fact to a lookup on a non-unique key.',
          'If the lookup keeps history (several rows per object), you need the current version, not all of them.',
        ]
      : [
          'Which filter from the brief never made it into the query: period, channel, division, customer type?',
          'If you only need distinct values — GROUP BY or DISTINCT.',
        ],
  }),

  bothWays: (userRows, expectedRows) => ({
    tone: 'warn',
    title: 'The set of rows does not match',
    body: `${en.rows(userRows)} came back where ${en.rows(expectedRows)} were expected: some rows are extra, some are missing. Most likely the grouping is on the wrong columns.`,
    nudges: [
      'GROUP BY has to hold exactly the non-aggregated columns that appear in SELECT.',
      'Check the grain: the task is about months and the grouping is by week, or the other way round.',
    ],
  }),

  mismatchFallback: (userRows, expectedRows) => ({
    tone: 'warn',
    title: 'The result does not match the reference',
    body: `${en.rows(userRows)} came back where ${en.rows(expectedRows)} were expected.`,
    nudges: ['Compare your result with the sample of the reference rows below.'],
  }),

  columnNamesStyle: (expectedCols) =>
    `The column names differ from the expected ones (${expectedCols.join(', ')}). It does not affect correctness, but nobody hands over a report with a column called SUM(units) — give your columns meaningful aliases.`,
};

export const diagnoseText: Record<Locale, DiagnoseText> = { ru, en };
