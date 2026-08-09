/**
 * Тесты решения «что можно нарисовать по этому результату».
 *
 * `src/ui/chartSpec.ts` отвечает на вопрос, который гейт по контенту поймать
 * не может в принципе: график, который врёт, выполняется без ошибок,
 * выглядит убедительно и не отличим от честного никакой проверкой данных.
 * Единственная защита — держать сами правила под тестом, поэтому здесь два
 * разных набора проверок:
 *
 * 1. Синтетические случаи — по одному на каждый способ соврать, перечисленный
 *    в шапке chartSpec.ts. Это регрессия на правила: если кто-то однажды
 *    решит «ну ранг ведь тоже число», тест упадёт с объяснением, почему нет.
 * 2. Инварианты на реальном корпусе — все эталоны трека sql прогоняются
 *    по базе, и от каждого получившегося графика требуется, чтобы точек
 *    было ровно столько же, сколько строк, в том же порядке, с нулём на оси
 *    у столбцов. Это ловит не опечатку в правиле, а подмену принципа:
 *    любую будущую «оптимизацию» вида топ-10, свёртки или пересортировки.
 *
 * Корпус берётся только из sql-core: форма результата от исполнителя
 * не зависит (те же колонки и строки), а поднимать ради теста Pyodide —
 * это плюс полминуты к каждому прогону verify без нового покрытия.
 *
 * Запуск: npm run test:chart (входит в npm run verify).
 */
import initSqlJs from 'sql.js';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'querium-chart-'));

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const assertEq = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(name, `ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  } else ok(name);
};
const assertTrue = (name, cond, detail = '') => {
  if (!cond) fail(name, detail || 'условие ложно');
  else ok(name);
};

try {
  execSync(
    `npx tsc "${path.join(root, 'src/ui/chartSpec.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  const { chartSpec } = await import(pathToFileURL(path.join(outDir, 'ui', 'chartSpec.js')).href);

  /** Результат в том виде, в каком его получает ResultTable. */
  const preview = (columns, rows, totalRows = rows.length) => ({ columns, rows, totalRows });
  const months = (n) => Array.from({ length: n }, (_, i) => `2025-${String(i + 1).padStart(2, '0')}`);

  // ── 1. Форма: столбцы для категорий, линия для времени ──────────────────
  const bars = chartSpec(
    preview(
      ['brand', 'revenue'],
      [
        ['Ключевая', 8012489],
        ['Молочный Дом', 5673447],
        ['Витамакс', 3146133],
        ['Фрутта', 1754553],
      ]
    )
  );
  assertEq('категория + число → столбцы', bars.kind, 'bar');
  assertEq('подписи — по строке на строку', bars.labels.length, 4);
  assertEq('одна величина — один вид', bars.views.length, 1);
  assertTrue('ось столбцов включает ноль', bars.views[0].min === 0, `min=${bars.views[0].min}`);

  const line = chartSpec(preview(['month', 'units'], months(6).map((m, i) => [m, 100 + i])));
  assertEq('месяц + число → линия', line.kind, 'line');
  assertEq('позиции по времени, от нуля до единицы', [line.positions[0], line.positions[5]], [0, 1]);

  const gap = chartSpec(
    preview(
      ['month', 'units'],
      [
        ['2025-01', 10],
        ['2025-02', 12],
        ['2025-06', 14],
      ]
    )
  );
  assertTrue(
    'неравные интервалы остаются неравными',
    Math.abs(gap.positions[1] - 0.2) < 0.02,
    `позиция второй точки ${gap.positions[1]}`
  );

  const shuffled = chartSpec(
    preview(
      ['month', 'units'],
      [
        ['2025-03', 10],
        ['2025-01', 12],
        ['2025-02', 14],
      ]
    )
  );
  assertEq('даты вразнобой — не линия', shuffled.kind, 'bar');

  const twoDims = chartSpec(
    preview(
      ['channel', 'month', 'revenue'],
      [
        ['ecom', '2025-01', 100],
        ['ecom', '2025-02', 120],
        ['opt', '2025-01', 300],
        ['opt', '2025-02', 310],
      ]
    )
  );
  assertEq('два измерения — не линия, а столбцы по строкам', twoDims.kind, 'bar');
  assertEq('подпись склеена из обоих измерений', twoDims.labels[0], 'ecom · 2025-01');

  // ── 2. Что величиной не является ────────────────────────────────────────
  const withRank = chartSpec(
    preview(
      ['brand', 'product_name', 'revenue', 'rnk'],
      [
        ['Витамакс', 'Омега-3', 1754553, 1],
        ['Витамакс', 'D3', 1259055, 2],
        ['Фрутта', 'Апельсин', 900000, 1],
      ]
    )
  );
  assertEq('ранг не рисуется как величина', withRank.views.length, 1);
  assertEq('подпись — правое измерение, различающее строки', withRank.labels[0], 'Омега-3');

  const withId = chartSpec(
    preview(
      ['region_id', 'region_name', 'units'],
      [
        [1, 'Москва', 500],
        [2, 'Питер', 400],
        [3, 'Казань', 300],
      ]
    )
  );
  assertEq('id не рисуется и не подписывает', withId.views.length, 1);
  assertEq('подпись — название, а не номер', withId.labels[0], 'Москва');

  const byYear = chartSpec(
    preview(
      ['year', 'units'],
      [
        [2023, 12000],
        [2024, 10101],
        [2025, 8158],
      ]
    )
  );
  assertEq('год — измерение, а не столбик высотой 2025', byYear.views.length, 1);
  assertEq('год + число → линия', byYear.kind, 'line');

  // ── 3. Одна ось — только для сопоставимого ──────────────────────────────
  const pair = chartSpec(
    preview(
      ['rep_name', 'target_revenue', 'actual_revenue'],
      [
        ['Иванов', 100, 90],
        ['Петров', 120, 130],
        ['Сидоров', 90, 60],
      ]
    )
  );
  assertEq('одна величина в разных условиях — на одну ось', pair.views.length, 1);
  assertEq('оба ряда в одном виде', pair.views[0].series.length, 2);

  const mixedUnits = chartSpec(
    preview(
      ['brand', 'revenue', 'share_pct'],
      [
        ['Ключевая', 8012489, 20.9],
        ['Молочный Дом', 5673447, 14.8],
        ['Витамакс', 3146133, 8.2],
      ]
    )
  );
  assertEq('рубли и проценты — разные виды', mixedUnits.views.length, 2);

  const mixedScale = chartSpec(
    preview(
      ['year', 'units', 'units_per_outlet'],
      [
        [2023, 12000, 151.9],
        [2024, 10101, 127.9],
        [2025, 8158, 103.3],
      ]
    )
  );
  assertEq('общее слово, но разный масштаб — разные виды', mixedScale.views.length, 2);

  const countingWord = chartSpec(
    preview(
      ['division', 'avg_price', 'avg_units'],
      [
        ['FMCG', 184.7, 10101],
        ['Pharma', 200.9, 8158],
        ['Other', 150.0, 9000],
      ]
    )
  );
  assertEq('avg — не единица измерения', countingWord.views.length, 2);

  // ── 4. Когда не рисуем вовсе ────────────────────────────────────────────
  assertEq(
    'две строки — не график',
    chartSpec(preview(['brand', 'revenue'], [['a', 1], ['b', 2]])),
    null
  );
  assertEq(
    'обрезанный результат не рисуется',
    chartSpec(preview(['brand', 'revenue'], [['a', 1], ['b', 2], ['c', 3]], 40)),
    null
  );
  assertEq(
    'эталон, обрезанный без флага, тоже не рисуется',
    chartSpec({
      columns: ['brand', 'revenue'],
      rows: [['a', 1], ['b', 2], ['c', 3]],
      totalRows: 16,
      truncated: undefined,
    }),
    null
  );
  assertEq(
    'нет величин — нет графика',
    chartSpec(preview(['customer', 'chain'], [['a', 'x'], ['b', 'y'], ['c', 'z']])),
    null
  );
  assertEq(
    'нет измерений — нет графика',
    chartSpec(preview(['a', 'b'], [[1, 2], [3, 4], [5, 6]])),
    null
  );
  assertEq(
    'полсотни с лишним столбцов — не сравнение, а частокол',
    chartSpec(preview(['name', 'v'], Array.from({ length: 51 }, (_, i) => [`n${i}`, i + 1]))),
    null
  );
  assertTrue(
    'пятьдесят две недели линией — нормально',
    chartSpec(
      preview(
        ['week_start', 'units'],
        Array.from({ length: 52 }, (_, i) => [
          new Date(Date.UTC(2025, 0, 6 + i * 7)).toISOString().slice(0, 10),
          1000 + i,
        ])
      )
    )?.kind === 'line'
  );

  // ── 5. Пропуски и знак ──────────────────────────────────────────────────
  const holes = chartSpec(
    preview(
      ['month', 'units', 'prev_units'],
      [
        ['2025-01', 100, null],
        ['2025-02', 120, 100],
        ['2025-03', 90, 120],
        ['2025-04', 110, 90],
      ]
    )
  );
  assertEq('пропуск остаётся пропуском, а не нулём', holes.views[0].series[1].values[0], null);
  assertTrue('ось не считает пропуск за ноль', holes.views[0].min === 90, `min=${holes.views[0].min}`);

  const negative = chartSpec(
    preview(
      ['brand', 'delta_units'],
      [
        ['Ключевая', 500],
        ['Витамакс', -300],
        ['Фрутта', 100],
      ]
    )
  );
  assertTrue(
    'отрицательные столбцы законны — ноль остаётся на оси',
    negative.views[0].min === -300 && negative.views[0].max === 500,
    JSON.stringify(negative.views[0])
  );

  const allNull = chartSpec(
    preview(
      ['brand', 'revenue', 'avg_price'],
      [
        ['a', 1, null],
        ['b', 2, null],
        ['c', 3, null],
      ]
    )
  );
  assertEq('колонка из одних NULL выпадает', allNull.views.length, 1);

  // ── 6. Инварианты на реальных эталонах sql-core ─────────────────────────
  const SQL = await initSqlJs({
    locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f),
  });
  const db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'querium.sqlite'))));
  const run = (sql) => {
    const stmt = db.prepare(sql);
    const rows = [];
    let columns = [];
    while (stmt.step()) {
      if (!columns.length) columns = stmt.getColumnNames();
      rows.push(stmt.get());
    }
    if (!columns.length) columns = stmt.getColumnNames();
    stmt.free();
    return { columns, rows, totalRows: rows.length };
  };

  const pack = JSON.parse(readFileSync(path.join(root, 'src/content/packs/sql-core.json'), 'utf8'));
  let charted = 0;
  let checked = 0;
  const problems = [];
  for (const task of pack.tasks) {
    const sql = task.solution || task.predictSql;
    if (!sql) continue;
    let result;
    try {
      result = run(sql);
    } catch {
      // Неисполнимые эталоны — забота verify:content, здесь они не при чём.
      continue;
    }
    checked++;
    const spec = chartSpec(result);
    if (!spec) continue;
    charted++;
    const note = (msg) => problems.push(`${task.id}: ${msg}`);
    if (spec.labels.length !== result.rows.length) note('подписей не столько же, сколько строк');
    for (const view of spec.views) {
      for (const s of view.series) {
        if (s.values.length !== result.rows.length) note(`ряд ${s.column} не по строке на строку`);
        const ci = result.columns.indexOf(s.column);
        const same = s.values.every((v, i) => v === (result.rows[i][ci] ?? null));
        if (!same) note(`ряд ${s.column} не совпадает с колонкой построчно`);
      }
      if (spec.kind === 'bar' && !(view.min <= 0 && view.max >= 0)) note('ось столбцов без нуля');
      if (view.series.length > 1) {
        const mags = view.series.map((s) => Math.max(...s.values.filter((v) => v !== null).map(Math.abs)));
        const ratio = Math.max(...mags) / Math.min(...mags.filter((m) => m > 0));
        if (Number.isFinite(ratio) && ratio > 25) note(`на одной оси ряды с разрывом в ${ratio.toFixed(0)}×`);
      }
    }
    if (spec.kind === 'line') {
      const rising = spec.positions.every((p, i) => i === 0 || p > spec.positions[i - 1]);
      if (!rising) note('точки линии не по возрастанию времени');
    }
  }
  assertTrue(
    'корпус: график строится там, где ему есть на чём строиться',
    charted >= 20,
    `из ${checked} эталонов график получили ${charted} — правило стало отказывать почти всегда`
  );
  assertTrue('корпус: инварианты соблюдены', problems.length === 0, problems.join('; '));

  console.log(
    problems.length === 0
      ? `\nКорпус sql-core: ${charted} из ${checked} эталонов получают график, инварианты целы.`
      : ''
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed > 0) {
  console.log(`\nПровалено проверок: ${failed}`);
  process.exit(1);
}
console.log('\nВсе проверки chartSpec пройдены.');
