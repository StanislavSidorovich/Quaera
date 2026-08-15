/**
 * Тесты сверки ответа текстом (`src/engine/textGrade.ts`).
 *
 * Здесь под тестом не код, а решение о том, что считать верным ответом.
 * У остальных треков этот вопрос закрыт исполнением: любой запрос с тем же
 * результатом принимается, и спорить не о чем. У `model` исполнителя нет,
 * поэтому граница «засчитать / не засчитать» проведена руками — и провести
 * её можно двумя способами, оба плохие по-своему.
 *
 * Слишком строго — человек, написавший верную меру строчными буквами,
 * получает «неверно» за регистр, которого в DAX не существует.
 * Слишком мягко — засчитывается ответ, который эталону не равен, и тогда
 * «Верно» перестаёт что-либо значить.
 *
 * Ровно поэтому набор ниже разделён надвое: первая половина требует
 * принимать написания, различающиеся тем, что языку безразлично,
 * вторая — не принимать ничего сверх этого.
 *
 * Запуск: npm run test:text-grade (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera--'));

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

try {
  execSync(
    `npx tsc "${path.join(root, 'src/engine/textGrade.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  const { gradeBlanks, normalizeFragment } = await import(
    pathToFileURL(path.join(outDir, 'engine', 'textGrade.js')).href
  );

  const verdict = (given, expected) => gradeBlanks(given, expected);

  // --- Принимать: различия, которых в DAX нет ---

  assertEqual('точное совпадение', verdict(['CALCULATE', 'SUM'], ['CALCULATE', 'SUM']).correct, true);

  // Имена функций, таблиц, колонок и мер в DAX регистронезависимы:
  // различать CALCULATE и calculate значило бы проверять попадание по Shift.
  assertEqual('регистр не важен', verdict(['calculate', 'sum'], ['CALCULATE', 'SUM']).correct, true);

  assertEqual(
    'обрамляющие пробелы не важны',
    verdict(['  CALCULATE  '], ['CALCULATE']).correct,
    true
  );

  // Поле ввода в шаблоне узкое, лишний пробел там от промаха пальцем.
  assertEqual(
    'внутренние пробелы сворачиваются',
    verdict(['SUM(  fact_sellout[revenue]  )'], ['SUM( fact_sellout[revenue] )']).correct,
    true
  );

  assertEqual(
    'перенос строки считается пробелом',
    verdict(['DATEADD(dim_date[date],\n-1,\nYEAR)'], ['DATEADD(dim_date[date], -1, YEAR)']).correct,
    true
  );

  // --- Не принимать: всё остальное ---

  assertEqual('другая функция — неверно', verdict(['SUMX'], ['SUM']).correct, false);

  // Пропущенный аргумент меняет меру, а не написание.
  assertEqual(
    'потерянный аргумент — неверно',
    verdict(['DATEADD(dim_date[date], -1)'], ['DATEADD(dim_date[date], -1, YEAR)']).correct,
    false
  );

  assertEqual('пустой пропуск — неверно', verdict([''], ['CALCULATE']).correct, false);
  assertEqual('пустой пропуск сосчитан отдельно', verdict(['', 'SUM'], ['CALCULATE', 'SUM']).emptyCount, 1);
  assertEqual(
    'пробелы вместо ответа — тоже пусто',
    verdict(['   '], ['CALCULATE']).emptyCount,
    1
  );

  // Недостающий элемент массива не должен падать: черновик задания может
  // прийти короче шаблона (см. blankDraft в TaskView).
  assertEqual('нехватка ответов — неверно, а не сбой', verdict([], ['CALCULATE']).correct, false);

  // --- Куда именно смотреть: адрес ошибки, а не факт ошибки ---

  assertEqual(
    'указаны все разошедшиеся пропуски',
    verdict(['CALCULATE', 'AVERAGE', 'YEAR'], ['CALCULATE', 'SUM', 'MONTH']).wrongIndexes,
    [1, 2]
  );
  assertEqual(
    'перепутанные местами считаются обоими неверными',
    verdict(['SUM', 'CALCULATE'], ['CALCULATE', 'SUM']).wrongIndexes,
    [0, 1]
  );
  assertEqual('верный ответ не даёт адресов', verdict(['CALCULATE'], ['CALCULATE']).wrongIndexes, []);

  // --- Нормализация как отдельная функция ---

  assertEqual('normalizeFragment сводит к сравнимому виду', normalizeFragment('  SUM(  X )\n'), 'sum( x )');

  /*
   * Инвариант, связывающий этот модуль с гейтом контента.
   *
   * verify-content.mjs требует, чтобы шаблон с подставленными эталонными
   * значениями посимвольно давал solution. Значит «все пропуски совпали»
   * и «собранный текст равен эталону» обязаны быть одним утверждением —
   * иначе UI засчитает ответ, который эталоном не является.
   */
  const template = 'Revenue LY :=\nCALCULATE(\n    ___,\n    ___\n)';
  const reference = ['SUM(fact_sellout[revenue])', 'DATEADD(dim_date[date], -1, YEAR)'];
  const parts = template.split('___');
  const build = (bs) => parts.reduce((acc, part, i) => acc + part + (bs[i] ?? ''), '');
  const solution = build(reference);

  /** Совпали ли два вердикта: «все пропуски верны» и «собранный текст равен эталону». */
  const agrees = (given) => gradeBlanks(given, reference).correct === (build(given) === solution);

  assertEqual('эталон: оба вердикта верны', agrees(reference), true);
  assertEqual('ошибка в первом пропуске: оба вердикта неверны', agrees(['SUMX(fact_sellout)', reference[1]]), true);
  assertEqual('ошибка во втором: оба вердикта неверны', agrees([reference[0], 'SAMEPERIODLASTYEAR(dim_date[date])']), true);
  assertEqual('пустые пропуски: оба вердикта неверны', agrees(['', '']), true);
  /*
   * Единственное место, где вердикты обязаны разойтись, и это намеренно:
   * регистр gradeBlanks прощает, а посимвольное равенство — нет. Тест
   * фиксирует, что расхождение ровно одно и лежит там, где ожидается,
   * а не появилось где-то ещё.
   */
  assertEqual(
    'регистр — единственное расхождение вердиктов',
    [gradeBlanks(reference.map((s) => s.toLowerCase()), reference).correct, build(reference.map((s) => s.toLowerCase())) === solution],
    [true, false]
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log(
  failed ? `\nПроверки сверки текстом провалены: ${failed}.` : '\nПроверки сверки текстом пройдены.'
);
process.exit(failed ? 1 : 0);
