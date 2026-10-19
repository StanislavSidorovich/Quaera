/**
 * Гейт ссылки «Открыть в Lab» (src/labLink.ts).
 *
 * Принимающую сторону (lab.quaera.app, src/core/shareLink.ts в StrataLab)
 * отсюда не видно, и разошедшийся формат молчит до клика живого человека:
 * Lab покажет «ссылка повреждена», а тренажёр останется зелёным. Поэтому
 * здесь roundtrip тем же путём, каким читает Lab (base64url → inflate-raw →
 * JSON), и правила, которые Lab проверяет у входящей ссылки: v=1, id
 * датасетов по его шаблону, непустой список вкладок, `l` только известный.
 *
 * Второе — переписывание кода: SQL получает схему `quaera.` у имён таблиц
 * и только у них, pandas получает ячейку загрузки таблиц. Каждое правило
 * проверено и в отрицательную сторону (что НЕ должно меняться): гейт,
 * который проверяет только «приписалось», прошёл бы на функции,
 * приписывающей схему всему подряд.
 *
 * Запуск: npm run test:lab-link (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-lab-link-'));

try {
  // Модуль без импортов, поэтому компилируется одним файлом; CommonJS по той же причине, что в test-merge.mjs.
  execSync(
    `npx tsc "${path.join(root, 'src/labLink.ts')}" --target ES2022 --module CommonJS ` +
      `--lib ES2022,DOM --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');
  const { labSql, labPython, labShare, labUrl, tablesInCode, needsDatePrelude, LAB_URL } = await import(
    pathToFileURL(path.join(outDir, 'labLink.js')).href
  );

  let failed = 0;
  const assertEq = (name, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) console.log(` ok    ${name}`);
    else {
      console.log(` FAIL  ${name}: получено ${JSON.stringify(got)}, ожидалось ${JSON.stringify(want)}`);
      failed++;
    }
  };

  /** Чтение ссылки так, как его делает Lab (unpackText + parseShare). */
  const readLink = async (url) => {
    const m = /#s=([A-Za-z0-9_-]+)$/.exec(url);
    if (!m) throw new Error(`нет #s= в ${url}`);
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const out = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return JSON.parse(await new Response(out).text());
  };

  const TABLES = ['dim_product', 'fact_sellout', 'fact_sellin', 'dim_customer'];

  // --- SQL
  assertEq(
    'SQL: голые имена таблиц получают схему',
    labSql('SELECT p.brand FROM fact_sellout s JOIN dim_product p ON p.product_id = s.product_id', TABLES),
    'SELECT p.brand FROM quaera.fact_sellout s JOIN quaera.dim_product p ON p.product_id = s.product_id'
  );
  assertEq(
    'SQL: регистр имени сохраняется, схема приписывается',
    labSql('select * from Fact_Sellout', TABLES),
    'select * from quaera.Fact_Sellout'
  );
  assertEq(
    'SQL: строки, комментарии и имена в кавычках не трогаются',
    labSql(`-- fact_sellout\nSELECT 'fact_sellout', "dim_product" /* dim_product */ FROM fact_sellin`, TABLES),
    `-- fact_sellout\nSELECT 'fact_sellout', "dim_product" /* dim_product */ FROM quaera.fact_sellin`
  );
  assertEq(
    'SQL: экранированная кавычка не обрывает строку',
    labSql(`SELECT 'it''s fact_sellout' FROM fact_sellout`, TABLES),
    `SELECT 'it''s fact_sellout' FROM quaera.fact_sellout`
  );
  assertEq(
    'SQL: уже квалифицированное имя и квалификатор колонки остаются',
    labSql('SELECT dim_product.brand FROM quaera.dim_product', TABLES),
    'SELECT dim_product.brand FROM quaera.dim_product'
  );
  assertEq(
    'SQL: имя с общим префиксом (fact_sellout_x, my_dim_product) не задевается',
    labSql('SELECT fact_sellout_x, my_dim_product FROM t', TABLES),
    'SELECT fact_sellout_x, my_dim_product FROM t'
  );

  // --- pandas
  const py = labPython("result = fact_sellout.merge(dim_product, on='product_id')", ['fact_sellout', 'dim_product']);
  assertEq('pandas: две ячейки', py.split('\n').filter((l) => l === '# %%').length, 2);
  assertEq(
    'pandas: ячейка загрузки с pd, np и lab.table по схеме quaera',
    py.split('\n\n# %%\n')[0],
    '# %%\nimport pandas as pd\nimport numpy as np\nfact_sellout = lab.table("quaera.fact_sellout")\ndim_product = lab.table("quaera.dim_product")'
  );
  assertEq(
    'pandas: код человека как есть и строка result в конце для показа',
    py.split('\n\n# %%\n')[1],
    "result = fact_sellout.merge(dim_product, on='product_id')\nresult\n"
  );
  assertEq(
    'pandas: result уже последней строкой — не дублируется',
    labPython('result = 1\nresult', []).endsWith('result = 1\nresult\n'),
    true
  );
  assertEq('pandas: сравнение result == x не считается присваиванием', labPython('x = result == 1', []).endsWith('x = result == 1\n'), true);
  assertEq(
    'tablesInCode: по границе слова, без родственных имён',
    tablesInCode('fact_sellin.groupby("x")', TABLES),
    ['fact_sellin']
  );

  // --- roundtrip
  const code = "SELECT brand, 'Ёж — «кавычки»' AS t FROM dim_product";
  const url = await labUrl(labShare('Бренды и выручка', code, 'sql', TABLES));
  assertEq('ссылка начинается с адреса Lab и #s=', url.startsWith(`${LAB_URL}#s=`), true);
  assertEq('в данных нет паддинга и символов вне base64url', /#s=[A-Za-z0-9_-]+$/.test(url), true);
  const back = await readLink(url);
  assertEq('roundtrip SQL: JSON целиком', back, {
    v: 1,
    d: ['quaera'],
    t: [{ n: 'Бренды и выручка', q: "SELECT brand, 'Ёж — «кавычки»' AS t FROM quaera.dim_product" }],
  });

  // Даты текстом: substr(DATE, …) в DuckDB без old_implicit_casting падает (22 эталона из 82).
  const dateSql = 'SELECT substr(week_start, 1, 7) AS month FROM fact_sellout';
  const dateTab = labShare('Месяцы', dateSql, 'sql', TABLES).t[0].q;
  assertEq('даты текстом: SET old_implicit_casting стоит первой инструкцией', /^(--[^\n]*\n)*SET old_implicit_casting = true;\n/.test(dateTab), true);
  assertEq('даты текстом: после строки SET код как без неё', dateTab.endsWith(labSql(dateSql, TABLES)), true);
  assertEq('даты текстом: LIKE тоже включает строку SET', needsDatePrelude("WHERE week_start LIKE '2025-%'"), true);
  assertEq('без работы с датой как с текстом строки SET нет', back.t[0].q.includes('SET '), false);
  assertEq('слово с общим корнем (substrate) строку SET не включает', needsDatePrelude('SELECT substrate FROM t'), false);
  assertEq('pandas строку SET не получает', labShare('P', 'result = x.str[:7]  # substr', 'python', []).t[0].q.includes('SET '), false);

  const pyUrl = await labUrl(labShare('Pandas', 'result = dim_product', 'python', ['dim_product']));
  const pyBack = await readLink(pyUrl);
  assertEq('roundtrip pandas: l = python', pyBack.t[0].l, 'python');
  assertEq('roundtrip pandas: код вкладки совпал', pyBack.t[0].q, labPython('result = dim_product', ['dim_product']));

  // Правила parseShare в Lab: v=1, датасеты по шаблону, 1..30 вкладок, l из известных.
  for (const [name, b] of [
    ['SQL', back],
    ['pandas', pyBack],
  ]) {
    const ok =
      b.v === 1 &&
      Array.isArray(b.d) &&
      b.d.every((x) => /^[a-z0-9_-]{1,40}$/i.test(x)) &&
      Array.isArray(b.t) &&
      b.t.length >= 1 &&
      b.t.length <= 30 &&
      b.t.every((x) => typeof x.q === 'string' && typeof x.n === 'string' && (x.l === undefined || ['duckdb', 'tsql', 'postgres', 'python'].includes(x.l)));
    assertEq(`${name}: ссылка проходит проверку parseShare в Lab`, ok, true);
  }

  if (failed) {
    console.log(`\n${failed} проверок не прошло`);
    process.exitCode = 1;
  } else console.log('\nСсылка «Открыть в Lab»: всё сходится');
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
