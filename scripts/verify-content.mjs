/**
 * Проверка пака заданий.
 *
 * Задание с эталоном, который не выполняется или возвращает пустоту, хуже,
 * чем отсутствие задания: человек будет уверен, что ошибается он. Поэтому
 * каждое решение реально прогоняется по датасету, а структура пака
 * проверяется целиком — граф скиллов, шаблоны с пропусками, варианты ответа.
 *
 * Запуск: npm run verify:content
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

const packs = ['sql-core'];

/**
 * Черновые паки: граф навыков спроектирован, контента ещё нет.
 *
 * Они лежат в репозитории до наполнения намеренно. Карта треков на главной
 * строится по ним, поэтому структура успевает поспорить сама с собой раньше,
 * чем в неё вложены десятки заданий: цикл в предпосылках или предпосылка
 * с более высоким уровнем стоит здесь минуты, а не переписывания пака.
 * Проверяется у них только граф — заданий и карточек спрашивать не с чего.
 */
const draftPacks = ['model-core', 'python-core', 'domain-core'];

let failed = 0;
const fail = (id, msg) => {
  console.log(` FAIL  ${id}: ${msg}`);
  failed++;
};

const readPack = (id) =>
  JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', `${id}.json`), 'utf8'));

/**
 * Граф навыков — общая проверка для готовых и черновых паков.
 *
 * Порядок выдачи заданий целиком выводится отсюда: планировщик разворачивает
 * границу графа по предпосылкам, и цикл или предпосылка с более высоким tier
 * означают не косметический дефект, а тему, которая либо не откроется никогда,
 * либо откроется раньше того, на чём держится.
 */
function checkGraph(pack) {
  const skillIds = new Set(pack.skills.map((s) => s.id));
  if (skillIds.size !== pack.skills.length) fail(pack.id, 'дублирующиеся id скиллов');
  for (const s of pack.skills) {
    if (s.track !== pack.track) {
      fail(s.id, `трек скилла «${s.track}» не совпадает с треком пака «${pack.track}»`);
    }
    // summary человек читает на карте навыков как проверку «умею или нет».
    // Огрызок вроде «Понимаю JOIN» проверить на себе невозможно.
    if (!s.summary || s.summary.length < 40) {
      fail(s.id, 'summary пустой или слишком короткий — по нему человек проверяет себя');
    }
    for (const p of s.prereqs) {
      if (!skillIds.has(p)) fail(s.id, `предпосылка «${p}» не существует`);
      const parent = pack.skills.find((x) => x.id === p);
      if (parent && parent.tier > s.tier) fail(s.id, `предпосылка «${p}» имеет более высокий tier`);
    }
  }
  // граф обязан быть ацикличным, иначе порядок выдачи не определён
  const seen = new Map();
  const visit = (id, stack) => {
    if (stack.includes(id)) return fail(id, `цикл в предпосылках: ${[...stack, id].join(' → ')}`);
    if (seen.get(id)) return;
    seen.set(id, true);
    const s = pack.skills.find((x) => x.id === id);
    s?.prereqs.forEach((p) => visit(p, [...stack, id]));
  };
  pack.skills.forEach((s) => visit(s.id, []));
  if (!pack.skills.some((s) => s.tier === 1 && s.prereqs.length === 0)) {
    fail(pack.id, 'нет ни одного скилла без предпосылок — треку не с чего начаться');
  }
}

/** Имена колонок датасета — заодно проверяем, что задания не ссылаются на несуществующее. */
const knownColumns = new Set();
for (const t of db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0].values.map((v) => v[0])) {
  for (const c of db.exec(`PRAGMA table_info(${t})`)[0].values) knownColumns.add(c[1]);
}

function runSql(sql) {
  const stmt = db.prepare(sql);
  const rows = [];
  let columns = [];
  try {
    while (stmt.step()) {
      if (!columns.length) columns = stmt.getColumnNames();
      rows.push(stmt.get());
    }
    if (!columns.length) columns = stmt.getColumnNames();
  } finally {
    stmt.free();
  }
  return { columns, rows };
}

for (const packId of packs) {
  const pack = readPack(packId);
  console.log(`\n=== Пак ${pack.id}: ${pack.tasks.length} заданий, ${pack.skills.length} скиллов`);

  checkGraph(pack);
  const skillIds = new Set(pack.skills.map((s) => s.id));

  // --- задания
  const taskIds = new Set();
  for (const t of pack.tasks) {
    if (taskIds.has(t.id)) fail(t.id, 'дублирующийся id задания');
    taskIds.add(t.id);
    if (!skillIds.has(t.skill)) fail(t.id, `неизвестный скилл «${t.skill}»`);
    for (const s of t.alsoTrains ?? []) if (!skillIds.has(s)) fail(t.id, `неизвестный скилл в alsoTrains: «${s}»`);
    if (!t.hints?.length) fail(t.id, 'нет подсказок');
    if (!t.explain || t.explain.length < 80) fail(t.id, 'разбор слишком короткий или отсутствует');
    if (!t.brief || !t.goal) fail(t.id, 'нет бизнес-постановки или формулировки результата');

    if (t.mode === 'predict') {
      if (!t.predictSql || !t.predictQuestion) fail(t.id, 'нет запроса или вопроса для режима predict');
      const correct = (t.options ?? []).filter((o) => o.correct);
      if (correct.length !== 1) fail(t.id, `должен быть ровно один верный вариант, найдено ${correct.length}`);
      if ((t.options ?? []).length < 3) fail(t.id, 'меньше трёх вариантов ответа');
      for (const o of t.options ?? []) {
        if (!o.why || o.why.length < 40) fail(t.id, `у варианта «${o.label}» нет содержательного разбора`);
      }
      continue;
    }

    if (!t.solution) {
      fail(t.id, 'нет эталонного решения');
      continue;
    }

    // Шаблон с пропусками обязан достраиваться ровно до эталона —
    // иначе человек введёт «правильный» ответ и получит расхождение.
    if (t.mode === 'fill') {
      if (!t.template || !t.blanks) {
        fail(t.id, 'режим fill без шаблона или значений пропусков');
      } else {
        const parts = t.template.split('___');
        if (parts.length - 1 !== t.blanks.length) {
          fail(t.id, `пропусков в шаблоне ${parts.length - 1}, значений ${t.blanks.length}`);
        } else {
          const built = parts.reduce((acc, part, i) => acc + part + (t.blanks[i] ?? ''), '');
          if (built !== t.solution) fail(t.id, 'шаблон с подставленными значениями не совпадает с эталоном');
        }
      }
    }

    let res;
    try {
      res = runSql(t.solution);
    } catch (e) {
      fail(t.id, `эталон не выполняется — ${e.message}`);
      continue;
    }
    if (!res.rows.length) fail(t.id, 'эталон возвращает пустой результат');
    if (res.columns.some((c) => /^(sum|count|avg|round|min|max)\(/i.test(c))) {
      fail(t.id, `в эталоне колонка без алиаса: ${res.columns.find((c) => /^\w+\(/.test(c))}`);
    }
    // Задание требует сортировки — значит, эталон обязан её содержать.
    if (t.orderMatters && !/order\s+by/i.test(t.solution)) fail(t.id, 'orderMatters, но в эталоне нет ORDER BY');
    if (!t.orderMatters && /order\s+by/i.test(t.solution) && !/over\s*\(/i.test(t.solution)) {
      fail(t.id, 'в эталоне есть ORDER BY, но orderMatters не выставлен — порядок не будет проверяться');
    }
    console.log(`  ok   ${t.id} ${String(res.rows.length).padStart(5)} строк × ${res.columns.length} — ${t.title}`);
  }
}

// --- Черновые треки: проверяем только структуру графа.
for (const packId of draftPacks) {
  const pack = readPack(packId);
  console.log(`\n=== Черновик ${pack.id}: ${pack.skills.length} скиллов, контента пока нет`);

  // Пак без явного признака черновика плеер подхватит как готовый и выдаст
  // человеку тему, за которой нет ни одного задания.
  if (pack.status !== 'draft') fail(pack.id, 'нет status: "draft" — пак выглядит как готовый к выдаче');
  if ((pack.tasks ?? []).length) {
    fail(pack.id, 'в черновом паке есть задания — их эталоны никто здесь не прогоняет');
  }

  checkGraph(pack);

  const tiers = [...new Set(pack.skills.map((s) => s.tier))].sort();
  for (const t of tiers) {
    if (!pack.tierNames?.[t]) fail(pack.id, `у уровня ${t} нет названия в tierNames`);
  }
  const counts = tiers.map((t) => `${pack.tierNames?.[t] ?? t} — ${pack.skills.filter((s) => s.tier === t).length}`);
  console.log(`  ok   ${pack.title}: ${counts.join(', ')}`);
}

// --- Карточки теории.
{
  const pack = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', 'sql-core.json'), 'utf8'));
  const { lessons } = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', 'sql-lessons.json'), 'utf8'));
  console.log(`\n=== Карточки теории: ${lessons.length}`);

  const covered = new Set(lessons.map((l) => l.skill));
  for (const s of pack.skills) {
    if (!covered.has(s.id)) fail('lessons', `у скилла «${s.id}» нет карточки — человек встретит задачу без объяснения приёма`);
  }
  const seen = new Set();
  for (const l of lessons) {
    if (!pack.skills.some((s) => s.id === l.skill)) fail(l.skill, 'карточка ссылается на несуществующий скилл');
    if (seen.has(l.skill)) fail(l.skill, 'две карточки на один скилл');
    seen.add(l.skill);
    for (const field of ['why', 'form', 'example', 'reads', 'wrong', 'wrongWhy', 'selfCheck']) {
      if (!l[field] || String(l[field]).trim().length < 20) fail(l.skill, `блок «${field}» пустой или слишком короткий`);
    }

    let ok;
    try {
      ok = runSql(l.example);
    } catch (e) {
      fail(l.skill, `пример не выполняется — ${e.message}`);
      continue;
    }
    if (!ok.rows.length) fail(l.skill, 'пример возвращает пустой результат — объяснять на нём нечего');

    // Ошибочный вариант обязан отличаться от правильного: либо падать, либо давать
    // другой результат. Иначе карточка учит различию, которого в данных нет.
    let wrongRes = null;
    let wrongErr = null;
    try {
      wrongRes = runSql(l.wrong);
    } catch (e) {
      wrongErr = e.message;
    }
    if (wrongRes) {
      const same =
        JSON.stringify(wrongRes.columns) === JSON.stringify(ok.columns) &&
        JSON.stringify(wrongRes.rows) === JSON.stringify(ok.rows);
      if (same) fail(l.skill, 'ошибочный вариант даёт тот же результат, что и правильный');
    } else if (/syntax error/i.test(wrongErr)) {
      // Синтаксическая ошибка означает, что антипример написан обрывком запроса.
      // Тогда проверка проходит по неверной причине — она ловит незакрытый SELECT,
      // а не ту ошибку, которой посвящена карточка. И скопировать такой антипример,
      // чтобы увидеть последствия своими глазами, человек тоже не сможет.
      fail(l.skill, `антипример не выполняется как запрос (${wrongErr}) — нужен целый запрос, а не фрагмент`);
    }
    const verdict = wrongErr ? `ошибка: ${wrongErr.slice(0, 40)}` : `${wrongRes.rows.length} строк, результат иной`;
    console.log(`  ok   ${l.skill.padEnd(20)} пример ${String(ok.rows.length).padStart(4)} строк · антипример — ${verdict}`);
  }
}

// --- Проверки, специфичные для отдельных заданий: смысл, а не только исполнимость.

// sql-014 бессмысленно, если новинка доехала во все регионы: без нулевых строк
// LEFT JOIN ничего не доказывает и задание вырождается в обычный INNER JOIN.
{
  const r = runSql(`
    SELECT r.region_name, COALESCE(SUM(f.units), 0) AS units
    FROM dim_region r
    LEFT JOIN dim_customer c ON c.region_id = r.region_id
    LEFT JOIN fact_sellout f
           ON f.customer_id = c.customer_id
          AND f.product_id = (SELECT product_id FROM dim_product WHERE product_name = 'Витамакс Форте №30')
    GROUP BY r.region_name`);
  const zeros = r.rows.filter((row) => row[1] === 0).length;
  if (r.rows.length !== 16) fail('sql-014', `ожидается 16 регионов, вернулось ${r.rows.length}`);
  if (zeros === 0) fail('sql-014', 'новинка доехала во все регионы — задание на LEFT JOIN теряет смысл');
  else if (zeros === 16) fail('sql-014', 'новинка не продаётся нигде — сравнивать нечего');
  else console.log(`\n  ok   sql-014: регионов без новинки — ${zeros} из 16 (LEFT JOIN оправдан)`);
}

// sql-013 держится на том, что у бренда в dim_promo действительно несколько акций.
{
  const r = runSql(`SELECT brand, COUNT(*) n FROM dim_promo GROUP BY brand ORDER BY n DESC LIMIT 1`);
  if (r.rows[0][1] < 2) fail('sql-013', 'у брендов по одной акции — размножения строк не произойдёт');
  else console.log(`  ok   sql-013: максимум акций на бренд — ${r.rows[0][1]} (fan-out воспроизводится)`);
}

// sql-023 цитирует конкретные цифры в тексте задания. Если данные поехали, текст соврёт.
{
  const r = runSql(`
    SELECT d.year, SUM(f.units) AS units, COUNT(DISTINCT f.customer_id) AS outlets,
           ROUND(1.0 * SUM(f.units) / COUNT(DISTINCT f.customer_id), 1) AS per_outlet,
           ROUND(SUM(f.revenue) / SUM(f.units), 1) AS avg_price
    FROM fact_sellout f
    JOIN dim_product p ON p.product_id = f.product_id
    JOIN dim_date d ON d.date_id = f.week_start
    WHERE p.brand = 'Чистовъ' AND d.quarter = 1
    GROUP BY d.year ORDER BY d.year`);
  const quoted = [
    [2024, 10101, 79, 127.9, 184.7],
    [2025, 8158, 79, 103.3, 200.9],
    [2026, 4308, 37, 116.4, 203.8],
  ];
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.15, Math.abs(b) * 0.005);
  r.rows.forEach((row, i) => {
    const q = quoted[i];
    if (!q) return;
    if (row[0] !== q[0] || !near(row[1], q[1]) || row[2] !== q[2] || !near(row[3], q[3]) || !near(row[4], q[4])) {
      fail('sql-023', `цифры в тексте задания разошлись с данными: в базе ${row.join(' / ')}, в тексте ${q.join(' / ')}`);
    }
  });
  if (!failed) console.log('  ok   sql-023: цифры в тексте задания совпадают с датасетом');
}

// sql-059 цитирует конкретные цифры в тексте задания. Если данные поехали, текст соврёт.
{
  const r = runSql(`
    SELECT d.year, SUM(f.units) AS units, ROUND(SUM(f.revenue)) AS revenue,
           ROUND(SUM(f.revenue) / SUM(f.units), 1) AS avg_price,
           COUNT(DISTINCT f.customer_id) AS outlets
    FROM fact_sellout f
    JOIN dim_product p ON p.product_id = f.product_id
    JOIN dim_date d ON d.date_id = f.week_start
    WHERE p.brand = 'Ключевая' AND d.quarter = 1 AND d.year IN (2024, 2025)
    GROUP BY d.year ORDER BY d.year`);
  const quoted = [
    [2024, 26531, 1406408, 53.0, 88],
    [2025, 20482, 1298947, 63.4, 88],
  ];
  const near = (a, b) => Math.abs(a - b) <= Math.max(0.15, Math.abs(b) * 0.005);
  r.rows.forEach((row, i) => {
    const q = quoted[i];
    if (!q) return;
    if (row[0] !== q[0] || row[1] !== q[1] || !near(row[2], q[2]) || !near(row[3], q[3]) || row[4] !== q[4]) {
      fail('sql-059', `цифры в тексте задания разошлись с данными: в базе ${row.join(' / ')}, в тексте ${q.join(' / ')}`);
    }
  });
  if (r.rows.length === 2 && !quoted.some((q, i) => !r.rows[i])) console.log('  ok   sql-059: цифры в тексте задания совпадают с датасетом');
}

console.log(failed ? `\n${failed} проблем в контенте` : '\nКонтент в порядке');
process.exit(failed ? 1 : 0);
