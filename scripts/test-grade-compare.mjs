/**
 * Тесты сверки результата с эталоном (`public/grade-lib.js`).
 *
 * Сравнитель — единственное место, где решается «верно / неверно» для трёх
 * треков из четырёх, и до сих пор он оставался без единой проверки: гейт
 * контента прогоняет запросы и смотрит, что эталон исполняется, но не
 * спрашивает, что скажет сравнитель на неверный ответ. Молчаливая порча
 * здесь дороже любой другой в проекте: «Верно» на неверном ответе не видно
 * ни глазом, ни сборкой.
 *
 * Половина набора поэтому не про совпадение, а про диагноз: reason выбирает
 * текст подсказки, и подсказка не по делу («проверьте GROUP BY» на задании
 * без группировки) уводит человека дальше, чем честное «неверно».
 *
 * Запуск: npm run test:grade-compare (входит в npm run verify).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const ok = (name) => console.log(` ok    ${name}`);
const fail = (name, detail) => {
  console.log(` FAIL  ${name}: ${detail}`);
  failed++;
};
const assertEqual = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(name, `ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  } else ok(name);
};

// grade-lib.js раздаётся воркерам через importScripts и потому не имеет
// экспортов. Подключаем исходник как есть, дописав экспорт только для теста, —
// иначе пришлось бы держать вторую копию правил сверки.
const src = readFileSync(path.join(root, 'public', 'grade-lib.js'), 'utf8');
const mod = await import(
  'data:text/javascript;charset=utf-8,' + encodeURIComponent(`${src}\nexport { compare };`)
);
const { compare } = mod;

const t = (columns, rows) => ({ columns, rows });

// Эталон первого задания трека SQL: тот самый случай, на котором дефект
// и нашёлся живым прохождением с телефона.
const expected = t(
  ['sku_code', 'product_name', 'brand', 'price'],
  [
    ['AQUA001', 'Aqualis Still 0.5 L', 'Aqualis', 38],
    ['AQUA002', 'Aqualis Still 1.5 L', 'Aqualis', 54],
    ['GAST010', 'Gastrivo x20', 'Gastrivo', 412],
  ]
);

// --- Совпадение и его границы ---

assertEqual('точное совпадение', compare(expected, expected, {}).ok, true);

assertEqual(
  'алиасы другие, данные те же — верно',
  compare(t(['a', 'b', 'c', 'd'], expected.rows), expected, {}).ok,
  true
);

assertEqual(
  'другие имена колонок отмечены как стилевое замечание',
  compare(t(['a', 'b', 'c', 'd'], expected.rows), expected, {}).columnNamesDiffer,
  true
);

assertEqual(
  'порядок строк не важен, пока не сказано обратное',
  compare(t(expected.columns, [...expected.rows].reverse()), expected, {}).ok,
  true
);

assertEqual(
  'при orderMatters переставленные строки — не совпадение',
  compare(t(expected.columns, [...expected.rows].reverse()), expected, { orderMatters: true }).reason,
  'order'
);

// --- Перестановка колонок ---

// Позиционное сравнение расходит на перестановке разом все строки, и до
// правки это выглядело как «вернулось 47 строк, ожидается 47 строк: часть
// лишняя, часть отсутствует» с подсказкой про GROUP BY.
const swapped = t(
  ['sku_code', 'brand', 'product_name', 'price'],
  expected.rows.map(([sku, name, brand, price]) => [sku, brand, name, price])
);

assertEqual('перестановка колонок — не совпадение', compare(swapped, expected, {}).ok, false);
assertEqual('перестановка колонок опознана', compare(swapped, expected, {}).reason, 'columns_order');

// Имена тут не помогут — человек забыл алиас и переставил колонки разом;
// перестановка ищется по значениям.
const swappedNoAlias = t(
  ['sku_code', 'brand', 'product_name', 'list_price'],
  swapped.rows
);
assertEqual(
  'перестановка без алиасов опознана по значениям',
  compare(swappedNoAlias, expected, {}).reason,
  'columns_order'
);

// Перестановка числовых колонок при неизменных разрезах: раньше уходила
// в 'values' и объяснялась расхождением цифр, которого нет.
const numeric = t(
  ['brand', 'units', 'revenue'],
  [
    ['Aqualis', 10, 380],
    ['Gastrivo', 4, 1648],
  ]
);
const numericSwapped = t(
  ['brand', 'revenue', 'units'],
  [
    ['Aqualis', 380, 10],
    ['Gastrivo', 1648, 4],
  ]
);
assertEqual(
  'перестановка мер не выдаётся за расхождение цифр',
  compare(numericSwapped, numeric, {}).reason,
  'columns_order'
);

// Обратная сторона: диагноз ставится только после пересборки, поэтому
// по-настоящему неверный ответ им не прикрывается.
const aliasOnWrongColumn = t(
  ['sku_code', 'product_name', 'brand', 'price'],
  [
    ['AQUA001', 'Aqualis Still 0.5 L', 'Aqualis', 99],
    ['AQUA002', 'Aqualis Still 1.5 L', 'Aqualis', 99],
    ['GAST010', 'Gastrivo x20', 'Gastrivo', 99],
  ]
);
assertEqual(
  'неверные значения не выдаются за перестановку',
  compare(aliasOnWrongColumn, expected, {}).reason !== 'columns_order',
  true
);

// --- Остальные диагнозы не сдвинулись ---

assertEqual(
  'лишняя колонка',
  compare(t([...expected.columns, 'extra'], expected.rows.map((r) => [...r, 1])), expected, {}).reason,
  'columns_count'
);

assertEqual(
  'недостающие строки',
  compare(t(expected.columns, expected.rows.slice(0, 2)), expected, {}).reason,
  'missing'
);

assertEqual(
  'лишние строки',
  compare(t(expected.columns, [...expected.rows, ['XXX999', 'Nettora x10', 'Nettora', 120]]), expected, {}).reason,
  'extra'
);

assertEqual(
  'разрезы те же, цифры разошлись',
  compare(aliasOnWrongColumn, expected, {}).reason,
  'values'
);

console.log(
  failed
    ? `\nПроверки сверки с эталоном: ${failed} не прошло.`
    : '\nПроверки сверки с эталоном пройдены.'
);
process.exit(failed ? 1 : 0);
