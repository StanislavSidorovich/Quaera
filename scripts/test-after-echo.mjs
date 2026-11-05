/**
 * Тесты сверки реплики after с таблицей результата (src/ui/afterEcho.ts).
 *
 * Правило под защитой: подсветка не должна указывать на строку, о которой
 * реплика не говорила. Поэтому половина случаев здесь про то, чего совпасть
 * не должно (короткие токены, общие слова, число внутри слова, id).
 *
 * Запуск: npm run test:after-echo (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-echo-'));
let failed = 0;
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.log(` FAIL  ${name}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
    failed++;
  } else console.log(` ok    ${name}`);
};

try {
  execSync(
    `npx tsc "${path.join(root, 'src/ui/afterEcho.ts')}" --target ES2020 --module ES2020 ` +
      `--moduleResolution bundler --rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  const { echoHits, splitTables } = await import(pathToFileURL(path.join(outDir, 'ui', 'afterEcho.js')).href);
  const rows = (text, columns, data) => echoHits(text, columns, data).rows;

  const brands = [['Vitanor', 3146133], ['Gastrivo', 2000000], ['Aqualis', 1754553], ['Pyrexan', 900000]];
  check('бренд по имени', rows('Top of the list is Vitanor and Pyrexan.', ['brand', 'rev'], brands), [0, 3]);
  check('регистр не важен', rows('vitanor again', ['brand', 'rev'], brands), [0]);
  check('только целое слово', rows('Vitanorium is a thing', ['brand', 'rev'], brands), []);
  check('слово после апострофа', rows("Vitanor's share", ['brand', 'rev'], brands), [0]);
  check('кириллица: граница слова', rows('Регион Север вырос', ['region', 'n'], [['Север', 1], ['Юг', 2]]), [0]);
  check('короткий токен не совпадает', rows('NA and ID everywhere', ['c', 'n'], [['NA', 1], ['ID', 2]]), []);
  check('общее слово не совпадает', rows('all other channels, total', ['c', 'n'], [['All', 1], ['Other', 2], ['Total', 3]]), []);
  check('фраза из двух слов', rows('Hot Beverages fell', ['cat', 'n'], [['Hot Beverages', 5], ['Cold', 6]]), [0]);
  check('фраза с переносом строки', rows('Hot\nBeverages fell', ['cat', 'n'], [['Hot Beverages', 5]]), [0]);

  check('число с тысячами', rows('revenue is 3,146,133 now', ['b', 'rev'], brands), [0]);
  check('число с пробелами', rows('выручка 3 146 133 всего', ['b', 'rev'], brands), [0]);
  check('дробь округляется до записанного', rows('about 41.3% of sales', ['ch', 'pct'], [['ecom', 41.2967], ['opt', 58.7]]), [0]);
  check('десятичная запятая', rows('доля 58,7 процента', ['ch', 'pct'], [['ecom', 41.2967], ['opt', 58.7]]), [1]);
  check('короткое целое не совпадает', rows('37 points and 10 brands', ['a', 'n'], [['x1', 37], ['x2', 10]]), []);
  check('число внутри слова не считается', rows('SKU4200 only', ['a', 'n'], [['xyz', 4200]]), []);
  check('id-колонка не сверяется', rows('product 12345 is odd', ['product_id', 'n'], [[12345, 1]]), []);
  check('дата строкой не токен', rows('in 2025-01 it fell', ['m', 'n'], [['2025-01', 1]]), []);

  const parts = splitTables('Look in dim_product and FACT_SALES, not dim_products.', ['dim_product', 'fact_sales', 'dim_region']);
  check('таблицы режутся на куски', parts.map((p) => `${p.kind}:${p.text}`), [
    'text:Look in ',
    'table:dim_product',
    'text: and ',
    'table:FACT_SALES',
    'text:, not dim_products.',
  ]);
  check('без таблиц один кусок', splitTables('nothing', ['dim_product']), [{ kind: 'text', text: 'nothing' }]);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
if (failed) {
  console.log(`\n${failed} провалено`);
  process.exit(1);
}
console.log('\nвсё зелёное');
