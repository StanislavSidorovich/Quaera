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
import { loadPyodide } from 'pyodide';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
const db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'querium.sqlite'))));

/**
 * Pyodide поднимается лениво и один раз: инициализация занимает секунды,
 * и её не нужно платить, пока в python-core нет ни одного задания в режиме
 * write/fill. Источник обвязки — public/python-bootstrap.py, тот же файл,
 * что читает браузерный воркер: гейт обязан видеть код так же, как его
 * увидит ученик (см. пояснение в самом файле).
 */
let pyodidePromise = null;
async function getPyodide() {
  if (!pyodidePromise) {
    pyodidePromise = (async () => {
      const pyodide = await loadPyodide({ indexURL: path.join(root, 'public', 'pyodide') });
      await pyodide.loadPackage(['pandas', 'sqlite3']);
      let buf = readFileSync(path.join(root, 'public', 'data', 'querium.dataset'));
      if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
      pyodide.FS.writeFile('/data.sqlite', new Uint8Array(buf));
      await pyodide.runPythonAsync(`
import pandas as pd
import sqlite3
_con = sqlite3.connect('/data.sqlite')
_tables_list = [r[0] for r in _con.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
_TABLES = {name: pd.read_sql(f"SELECT * FROM {name}", _con) for name in _tables_list}
_con.close()
`);
      await pyodide.runPythonAsync(readFileSync(path.join(root, 'public', 'python-bootstrap.py'), 'utf8'));
      return pyodide;
    })();
  }
  return pyodidePromise;
}

/** Запускает код заданий ровно тем же путём, что и public/python-worker.js — контракт result=, чистая ошибка при провале. */
async function runPython(code) {
  const pyodide = await getPyodide();
  const runCellFn = pyodide.globals.get('_run_cell');
  let out;
  try {
    out = runCellFn(code).toJs({ dict_converter: Object.fromEntries });
  } finally {
    runCellFn.destroy();
  }
  if (!out.ok) throw new Error(out.message);
  return { columns: out.table.columns, rows: out.table.rows };
}

/**
 * Готовые паки — с исполнимым контентом (весь или частично). У domain-core
 * пока наполнена только часть графа: скиллы без единого задания — это не
 * дефект, а нормальное промежуточное состояние трека в процессе наполнения
 * (см. checkLessons ниже — покрытие карточками требуется только там, где уже
 * есть задания, а не на весь граф разом). python-core наполняется тем же
 * образом — на момент первого батча заполнен только один скилл из пятнадцати.
 */
const packs = ['sql-core', 'domain-core', 'python-core'];

/**
 * Черновые паки: граф навыков спроектирован, контента ещё нет вообще.
 *
 * Они лежат в репозитории до наполнения намеренно. Карта треков на главной
 * строится по ним, поэтому структура успевает поспорить сама с собой раньше,
 * чем в неё вложены десятки заданий: цикл в предпосылках или предпосылка
 * с более высоким уровнем стоит здесь минуты, а не переписывания пака.
 * Проверяется у них только граф — заданий и карточек спрашивать не с чего.
 */
const draftPacks = ['model-core'];

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
  // Уровень без названия выводится на карте навыков голым числом.
  for (const t of new Set(pack.skills.map((s) => s.tier))) {
    if (!pack.tierNames?.[t]) fail(pack.id, `у уровня ${t} нет названия в tierNames`);
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

/**
 * Покрытие навыка заданиями.
 *
 * «Пак кажется тонким» превращаем в измеримое условие сборки: у навыка,
 * которому уже дали хотя бы одно задание, должно быть не меньше трёх —
 * иначе SRS быстро выест единственное задание и повторять нечем. Требование
 * применяется только к затронутым скиллам: у domain-core часть графа ещё
 * пустая, и это нормальное промежуточное состояние (см. draftPacks и
 * checkLessons выше), а не дефект.
 *
 * Разнообразие режима проверяется только там, где режимов вообще несколько —
 * то есть в треке с исполнителем кода (sql). В domain единственный
 * допустимый режим — predict (см. проверку выше), и требовать от него
 * разнообразия было бы поводом всегда падать.
 */
function checkSkillCoverage(pack) {
  const bySkill = new Map();
  for (const t of pack.tasks) {
    if (!bySkill.has(t.skill)) bySkill.set(t.skill, []);
    bySkill.get(t.skill).push(t);
  }
  for (const [skillId, tasks] of bySkill) {
    if (tasks.length < 3) {
      fail(skillId, `у навыка ${tasks.length} задание(й), минимум 3 — SRS не наберёт повторений`);
      continue;
    }
    if ((pack.track === 'sql' || pack.track === 'python') && new Set(tasks.map((t) => t.mode)).size < 2) {
      fail(skillId, `все ${tasks.length} заданий в режиме «${tasks[0].mode}» — нет разнообразия ввода`);
    }
  }
}

for (const packId of packs) {
  const pack = readPack(packId);
  console.log(`\n=== Пак ${pack.id}: ${pack.tasks.length} заданий, ${pack.skills.length} скиллов`);

  checkGraph(pack);
  checkSkillCoverage(pack);
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
      // Предсказывать можно результат кода (predictSql) или последствие
      // решения (scenario) — но не то и другое сразу: плеер рисует что-то одно.
      if (!t.predictSql && !t.scenario) fail(t.id, 'нет ни запроса, ни ситуации для режима predict');
      if (t.predictSql && t.scenario) fail(t.id, 'заданы и predictSql, и scenario — плеер покажет только одно');
      if (!t.predictQuestion) fail(t.id, 'нет вопроса для режима predict');
      // На экране 375 px в моноширинном .scenario помещается около 39 знаков;
      // white-space: pre-wrap переносит всё, что длиннее, и таблица, выровненная
      // пробелами, разъезжается. Измерено в браузере (см. ROADMAP.md §5).
      if (t.scenario) {
        for (const line of t.scenario.split('\n')) {
          if (line.length > 39) fail(t.id, `строка scenario длиннее 39 знаков (${line.length}): «${line}»`);
        }
      }
      const correct = (t.options ?? []).filter((o) => o.correct);
      if (correct.length !== 1) fail(t.id, `должен быть ровно один верный вариант, найдено ${correct.length}`);
      if ((t.options ?? []).length < 3) fail(t.id, 'меньше трёх вариантов ответа');
      for (const o of t.options ?? []) {
        if (!o.why || o.why.length < 40) fail(t.id, `у варианта «${o.label}» нет содержательного разбора`);
      }
      continue;
    }

    // Треки без исполнителя кода (domain) работают только в predict: там нечего
    // выполнять, и write/fill означали бы поле ввода, которое некому проверить.
    if (pack.track !== 'sql' && pack.track !== 'python') {
      fail(t.id, `трек «${pack.track}» без исполнителя кода, а задание в режиме «${t.mode}» — допустим только predict`);
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

    if (pack.track === 'sql') {
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
      continue;
    }

    // pack.track === 'python'
    if (!/(^|\n)\s*result\s*=/.test(t.solution)) {
      fail(t.id, 'эталон не присваивает переменную result — см. контракт в ROADMAP.md §6');
      continue;
    }
    let res;
    try {
      res = await runPython(t.solution);
    } catch (e) {
      fail(t.id, `эталон не выполняется — ${e.message}`);
      continue;
    }
    if (!res.rows.length) fail(t.id, 'эталон возвращает пустой результат');
    // Аналог проверки ORDER BY в SQL-ветке: сортировка не встроена в структуру
    // pandas-результата, и если orderMatters, эталон обязан явно вызывать sort_values.
    if (t.orderMatters && !/\.sort_values\s*\(/.test(t.solution)) {
      fail(t.id, 'orderMatters, но в эталоне нет .sort_values(...)');
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
  const counts = tiers.map((t) => `${pack.tierNames?.[t] ?? t} — ${pack.skills.filter((s) => s.tier === t).length}`);
  console.log(`  ok   ${pack.title}: ${counts.join(', ')}`);
}

/**
 * Карточки теории для пака.
 *
 * Покрытие требуется не на весь граф, а только на скиллы, у которых уже есть
 * хотя бы одно задание: у domain-core большая часть скиллов ещё пустая, и это
 * нормальное состояние трека в процессе наполнения, а не дефект. Для sql-core
 * это условие эквивалентно старому «на все скиллы разом», потому что там
 * пустых скиллов нет.
 *
 * example/wrong исполняются как SQL только в треке sql — в domain это
 * иллюстративный текст или готовые цифры расчёта, а не запрос.
 */
function checkLessons(pack, lessonsFileId) {
  const { lessons } = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', `${lessonsFileId}.json`), 'utf8'));
  console.log(`\n=== Карточки теории (${pack.id}): ${lessons.length}`);

  const touchedSkills = new Set(pack.tasks.map((t) => t.skill));
  const covered = new Set(lessons.map((l) => l.skill));
  for (const skillId of touchedSkills) {
    if (!covered.has(skillId)) fail('lessons', `у скилла «${skillId}» есть задания, но нет карточки — человек встретит задачу без объяснения приёма`);
  }

  const seen = new Set();
  for (const l of lessons) {
    if (!pack.skills.some((s) => s.id === l.skill)) fail(l.skill, 'карточка ссылается на несуществующий скилл');
    if (seen.has(l.skill)) fail(l.skill, 'две карточки на один скилл');
    seen.add(l.skill);
    for (const field of ['why', 'form', 'example', 'reads', 'wrong', 'wrongWhy', 'selfCheck']) {
      if (!l[field] || String(l[field]).trim().length < 20) fail(l.skill, `блок «${field}» пустой или слишком короткий`);
    }

    if (pack.track !== 'sql') {
      console.log(`  ok   ${l.skill.padEnd(20)} карточка текстовая — не исполняется`);
      continue;
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

checkLessons(readPack('sql-core'), 'sql-lessons');
checkLessons(readPack('domain-core'), 'domain-lessons');

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

// sql-013 держится на том, что у бренда в dim_promo действительно несколько акций,
// и текст задания называет конкретный масштаб раздувания — «почти вдесятеро»,
// «по 9–11 акций». Это уже не общее свойство данных, а цитата, которую нужно сверять.
{
  const r = runSql(`SELECT MIN(n) AS lo, MAX(n) AS hi FROM (SELECT COUNT(*) n FROM dim_promo GROUP BY brand)`);
  const [lo, hi] = r.rows[0];
  if (lo < 2) fail('sql-013', 'у бренда всего одна акция — размножения строк не произойдёт');
  else if (lo < 9 || hi > 11) fail('sql-013', `в тексте задания «по 9–11 акций», в базе ${lo}–${hi}`);
  else console.log(`  ok   sql-013: акций на бренд — ${lo}–${hi} (совпадает с текстом задания)`);
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

// --- Цифры и факты, которые называет разбор (explain) заданий-предсказаний.
//
// У режима predict нет исполнимого эталона, поэтому проверка эталонов выше их не
// касается вообще: запрос в predictSql только показывается, а числа в разборе живут
// в тексте. Все проверки ниже поставлены при финальной вычитке разборов — каждое
// число там сверено с базой вручную, и эти блоки удерживают сверку в силе после
// любой правки генератора.

// sql-041: разбор утверждает, что соединение с dim_promo по бренду раздувает
// выборку «Чистовъ» ровно в 10 раз — это и есть весь смысл задания.
{
  const r = runSql(`
    SELECT
      (SELECT COUNT(*) FROM fact_sellout f
       JOIN dim_product p ON p.product_id = f.product_id
       WHERE p.brand = 'Чистовъ' AND f.week_start BETWEEN '2025-01-01' AND '2025-12-31') AS before,
      (SELECT COUNT(*) FROM fact_sellout f
       JOIN dim_product p ON p.product_id = f.product_id
       JOIN dim_promo m ON m.brand = p.brand
       WHERE p.brand = 'Чистовъ' AND f.week_start BETWEEN '2025-01-01' AND '2025-12-31') AS after`);
  const [before, after] = r.rows[0];
  if (before === 0 || after !== before * 10) {
    fail('sql-041', `в разборе «ровно в 10 раз», в базе ${before} → ${after}`);
  } else console.log(`  ok   sql-041: соединение по бренду раздувает выборку ${before} → ${after} (×10, как в разборе)`);
}

// sql-048: разбор говорит, что из трёх товаров по 98 ₽ на страницу LIMIT 3 OFFSET 33
// попадают два, а третий остаётся на предыдущей. Держится на местах 33–35 в рейтинге.
{
  const r = runSql(`
    SELECT (SELECT COUNT(*) FROM dim_product WHERE list_price = 98) AS at_98,
           (SELECT COUNT(*) FROM (SELECT list_price FROM dim_product ORDER BY list_price DESC LIMIT 3 OFFSET 33)
             WHERE list_price = 98) AS on_page`);
  const [at98, onPage] = r.rows[0];
  if (at98 !== 3 || onPage !== 2) {
    fail('sql-048', `в разборе три товара по 98 ₽ и два из них на странице, в базе ${at98} и ${onPage}`);
  } else console.log('  ok   sql-048: три товара по 98 ₽, на странице OFFSET 33 — два из них');
}

// sql-051: разбор объясняет тривиальный результат для Pharma тем, что канал сбыта
// у неё в базе один. Появится второй — объяснение станет неверным.
{
  const r = runSql(`
    SELECT COUNT(DISTINCT c.channel) AS n
    FROM fact_sellout f
    JOIN dim_product p ON p.product_id = f.product_id
    JOIN dim_customer c ON c.customer_id = f.customer_id
    WHERE p.division = 'Pharma'`);
  if (r.rows[0][0] !== 1) fail('sql-051', `в разборе «у Pharma один канал сбыта», в базе их ${r.rows[0][0]}`);
  else console.log('  ok   sql-051: у Pharma по-прежнему один канал сбыта — аптека');
}

// sql-052: разбор оправдывает выбор RANK вместо ROW_NUMBER оговоркой, что точных
// совпадений выручки внутри команды в этом году нет. Появятся — оговорку надо снимать.
{
  const r = runSql(`
    WITH rep_rev AS (
      SELECT c.rep_id, SUM(f.revenue) AS rev
      FROM fact_sellout f
      JOIN dim_customer c ON c.customer_id = f.customer_id
      WHERE f.week_start BETWEEN '2025-01-01' AND '2025-12-31'
      GROUP BY c.rep_id
    )
    SELECT COUNT(*) AS ties FROM (
      SELECT r.team, rr.rev FROM rep_rev rr JOIN dim_rep r ON r.rep_id = rr.rep_id
      WHERE r.role = 'rep' GROUP BY r.team, rr.rev HAVING COUNT(*) > 1)`);
  if (r.rows[0][0] !== 0) fail('sql-052', `в разборе «точных совпадений нет», в базе их ${r.rows[0][0]}`);
  else console.log('  ok   sql-052: одинаковой выручки внутри команды нет — оговорка в разборе верна');
}

// sql-056: вопрос и разбор называют две конкретные выручки — хвост ecom и первый
// месяц modern_trade. Именно на их подстановке друг вместо друга держится задание.
{
  const r = runSql(`
    WITH monthly AS (
      SELECT c.channel, substr(f.week_start, 1, 7) AS month, SUM(f.revenue) AS revenue
      FROM fact_sellout f
      JOIN dim_customer c ON c.customer_id = f.customer_id
      WHERE f.week_start BETWEEN '2025-01-01' AND '2025-03-31'
      GROUP BY c.channel, month
    )
    SELECT channel, month, ROUND(revenue) AS revenue FROM monthly
    WHERE (channel = 'ecom' AND month = '2025-03') OR (channel = 'modern_trade' AND month = '2025-01')
    ORDER BY channel, month`);
  const quoted = [['ecom', '2025-03', 2382221], ['modern_trade', '2025-01', 751734]];
  const same = r.rows.length === 2 && quoted.every((q, i) => q.every((v, j) => r.rows[i][j] === v));
  // Порядок ecom → modern_trade должен сохраниться и по алфавиту: на нём держится
  // сам сюжет — LAG берёт последнюю строку ecom как предыдущую для modern_trade.
  if (!same) fail('sql-056', `цифры в тексте задания разошлись с данными: в базе ${JSON.stringify(r.rows)}`);
  else console.log('  ok   sql-056: выручка ecom за март и modern_trade за январь совпадают с текстом');
}

// sql-057: разбор называет остаток в штуках и запас в неделях. Числа связаны
// делением, поэтому сверяются оба — иначе «почти 22 недели» может уехать молча.
{
  const r = runSql(`
    WITH weekly AS (
      SELECT f.week_start, SUM(f.units) AS units
      FROM fact_sellout f
      JOIN dim_customer c ON c.customer_id = f.customer_id
      WHERE c.served_by_distributor_id = (SELECT customer_id FROM dim_customer WHERE customer_name = 'ООО «Волга-Трейд»')
        AND f.product_id = (SELECT product_id FROM dim_product WHERE product_name = 'Ключевая негаз. 0.5 л')
        AND f.week_start BETWEEN '2025-10-06' AND '2025-12-29'
      GROUP BY f.week_start
    )
    SELECT
      (SELECT units_on_hand FROM fact_stock
         WHERE distributor_id = (SELECT customer_id FROM dim_customer WHERE customer_name = 'ООО «Волга-Трейд»')
           AND product_id = (SELECT product_id FROM dim_product WHERE product_name = 'Ключевая негаз. 0.5 л')
           AND month_start = '2025-12-01') AS on_hand,
      ROUND((SELECT units_on_hand FROM fact_stock
         WHERE distributor_id = (SELECT customer_id FROM dim_customer WHERE customer_name = 'ООО «Волга-Трейд»')
           AND product_id = (SELECT product_id FROM dim_product WHERE product_name = 'Ключевая негаз. 0.5 л')
           AND month_start = '2025-12-01') * 1.0 / AVG(units), 1) AS cover
    FROM weekly`);
  const [onHand, cover] = r.rows[0];
  if (onHand !== 1315 || Math.abs(cover - 21.9) > 0.3) {
    fail('sql-057', `в разборе 1315 штук и почти 22 недели, в базе ${onHand} и ${cover}`);
  } else console.log(`  ok   sql-057: остаток ${onHand} штук — ${cover} недели запаса (совпадает с разбором)`);
}

// sql-060: разбор называет «15 из 47 товаров» — и сам вывод о концентрации
// портфеля держится на этой доле, а не только на числе.
{
  const r = runSql(`
    WITH sku_rev AS (
      SELECT p.product_name, SUM(f.revenue) AS rev
      FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id
      WHERE f.week_start BETWEEN '2025-01-01' AND '2025-12-31'
      GROUP BY p.product_name
    ),
    ranked AS (
      SELECT rev,
             100.0 * (SUM(rev) OVER (ORDER BY rev DESC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) - rev)
               / (SELECT SUM(rev) FROM sku_rev) AS prev_share
      FROM sku_rev
    )
    SELECT (SELECT COUNT(*) FROM ranked WHERE prev_share < 50) AS leaders,
           (SELECT COUNT(*) FROM sku_rev) AS total`);
  const [leaders, total] = r.rows[0];
  if (leaders !== 15 || total !== 47) {
    fail('sql-060', `в разборе «15 из 47 товаров», в базе ${leaders} из ${total}`);
  } else console.log(`  ok   sql-060: половину выручки дают ${leaders} товаров из ${total} (как в разборе)`);
}

// sql-027: разбор утверждает не про данные, а про движок — что LOWER в SQLite
// не понижает кириллицу и потому не чинит регистронезависимый поиск. Проверка
// стоит копейки и переживёт смену версии sql.js, где поведение могло бы измениться.
{
  const r = runSql(`SELECT lower('Ключевая') AS cyr, lower('ABC') AS lat`);
  const [cyr, lat] = r.rows[0];
  if (lat !== 'abc') fail('sql-027', 'LOWER перестал работать даже на латинице — разбор надо перечитывать целиком');
  else if (cyr !== 'Ключевая') {
    fail('sql-027', `в разборе LOWER не трогает кириллицу, но эта сборка SQLite вернула «${cyr}»`);
  } else console.log('  ok   sql-027: LOWER в SQLite по-прежнему понижает только латиницу');
}

// Трек domain цитирует опорные числа бизнеса в тексте заданий и карточек.
// Проверять их особенно важно: исполнимого эталона там нет вообще, и разойтись
// с датасетом текст может совершенно молча.
{
  const year = runSql(`
    SELECT ROUND(SUM(revenue)) AS total
    FROM fact_sellout WHERE week_start BETWEEN '2025-01-01' AND '2025-12-31'`);
  // dom-010 (итог года), dom-011 («около 51.5 млн»), карточка dom-sanity-check
  if (Math.abs(year.rows[0][0] - 51_533_887) > 51_533_887 * 0.005) {
    fail('domain', `годовая выручка 2025 разошлась с текстом: в базе ${year.rows[0][0]}, в тексте 51 533 887`);
  } else {
    console.log(`\n  ok   domain: годовая выручка 2025 — ${year.rows[0][0]} ₽ (цифры в тексте совпадают)`);
  }

  // dom-010 показывает первые три месяца и декабрь конкретными числами.
  const months = runSql(`
    SELECT substr(week_start, 1, 7) AS month, ROUND(SUM(revenue) / 1000) AS th
    FROM fact_sellout WHERE week_start BETWEEN '2025-01-01' AND '2025-12-31'
    GROUP BY 1 ORDER BY 1`);
  if (months.rows.length !== 12) fail('dom-010', `в 2025 году ${months.rows.length} месяцев вместо 12`);
  const quotedMonths = { '2025-01': 3717, '2025-02': 4155, '2025-03': 4694, '2025-12': 4408 };
  for (const [m, th] of months.rows) {
    if (quotedMonths[m] && Math.abs(th - quotedMonths[m]) > 1) {
      fail('dom-010', `${m}: в базе ${th} тыс., в тексте задания ${quotedMonths[m]} тыс.`);
    }
  }

  // dom-002 сверяет дашборд с учётной системой на мартовской цифре.
  const march = months.rows.find((r) => r[0] === '2025-03');
  if (march && Math.abs(march[1] * 1000 - 4_694_330) > 4_694_330 * 0.005) {
    fail('dom-002', `март 2025 разошёлся с текстом: в базе ${march[1] * 1000}, в тексте 4 694 330`);
  }

  // dom-007 держится на том, что разница 144 − 132 равна числу дистрибьюторов.
  const cust = runSql(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN customer_type = 'distributor' THEN 1 ELSE 0 END) AS distributors
    FROM dim_customer`);
  const [total, distributors] = cust.rows[0];
  if (total !== 144 || distributors !== 12) {
    fail('dom-007', `в тексте 144 клиента и 12 дистрибьюторов, в базе ${total} и ${distributors}`);
  } else {
    console.log(`  ok   dom-007: ${total} клиентов, из них ${distributors} дистрибьюторов — разница ${total - distributors} совпадает с текстом`);
  }

  // dom-011 строит аномалию на реальных соседних регионах за декабрь.
  const regions = runSql(`
    SELECT r.region_name, ROUND(SUM(f.revenue)) AS rev
    FROM fact_sellout f
    JOIN dim_customer c ON c.customer_id = f.customer_id
    JOIN dim_region r ON r.region_id = c.region_id
    WHERE f.week_start BETWEEN '2025-12-01' AND '2025-12-31'
    GROUP BY 1 ORDER BY rev DESC LIMIT 3`);
  const quotedRegions = [['Ростовская область', 622299], ['Краснодарский край', 527583], ['Самарская область', 407593]];
  regions.rows.forEach((row, i) => {
    const q = quotedRegions[i];
    if (!q) return;
    if (row[0] !== q[0]) fail('dom-011', `регион на месте ${i + 1}: в базе «${row[0]}», в тексте «${q[0]}»`);
    // Ростовская область в тексте задания намеренно искажена (в этом суть задания),
    // поэтому сверяем только две строки-соседа, которые показаны как нормальные.
    else if (i > 0 && Math.abs(row[1] - q[1]) > q[1] * 0.005) {
      fail('dom-011', `${row[0]}: в базе ${row[1]}, в тексте ${q[1]}`);
    }
  });
}

// Tier 2 трека domain построен на реальных цифрах датасета: затоваривание
// канала и сезонность двух брендов. Если генератор поедет, тексты соврут молча.
{
  const near = (a, b, tol = 0.005) => Math.abs(a - b) <= Math.abs(b) * tol;

  // dom-019 и карточка dom-sellin-sellout: у одного дистрибьютора отношение
  // резко выше, у остальных — узкий коридор около единицы. Задание держится
  // именно на контрасте, а не на конкретном значении.
  const ratios = runSql(`
    WITH si AS (
      SELECT distributor_id, SUM(units) AS u FROM fact_sellin
      WHERE substr(month_start, 1, 7) IN ('2025-10', '2025-11', '2025-12') GROUP BY 1),
    so AS (
      SELECT c.served_by_distributor_id AS distributor_id, SUM(f.units) AS u
      FROM fact_sellout f JOIN dim_customer c ON c.customer_id = f.customer_id
      WHERE substr(f.week_start, 1, 7) IN ('2025-10', '2025-11', '2025-12') GROUP BY 1)
    SELECT d.customer_name, si.u AS sell_in, so.u AS sell_out, ROUND(1.0 * si.u / so.u, 2) AS ratio
    FROM si JOIN so ON so.distributor_id = si.distributor_id
    JOIN dim_customer d ON d.customer_id = si.distributor_id
    ORDER BY ratio DESC`);
  const top = ratios.rows[0];
  const rest = ratios.rows.slice(1).map((r) => r[3]);
  if (top[0] !== 'ООО «Волга-Трейд»' || !near(top[3], 2.44, 0.01) || !near(top[1], 28203) || !near(top[2], 11574)) {
    fail('dom-019', `лидер по затовариванию разошёлся с текстом: в базе ${top.join(' / ')}, в тексте Волга-Трейд / 28203 / 11574 / 2.44`);
  } else if (Math.max(...rest) > 1.06 || Math.min(...rest) < 1.03) {
    fail('dom-019', `остальные дистрибьюторы вышли из коридора 1.03–1.06 (${Math.min(...rest)}–${Math.max(...rest)}) — контраст в задании пропал`);
  } else {
    console.log(`  ok   dom-019: Волга-Трейд ${top[3]} против коридора ${Math.min(...rest)}–${Math.max(...rest)} у остальных одиннадцати`);
  }

  // dom-021 держится на том, что поток вернулся к норме, а остатки — нет.
  const stock = runSql(`
    SELECT month_start, SUM(units_on_hand) AS on_hand FROM fact_stock
    WHERE distributor_id = 1 AND month_start IN ('2025-08-01', '2025-12-01', '2026-01-01', '2026-04-01')
    GROUP BY 1 ORDER BY 1`);
  const byMonth = Object.fromEntries(stock.rows);
  const quotedStock = { '2025-08-01': 3949, '2025-12-01': 20846, '2026-01-01': 21120, '2026-04-01': 21757 };
  for (const [m, q] of Object.entries(quotedStock)) {
    if (!near(byMonth[m], q)) fail('dom-021', `остатки на ${m}: в базе ${byMonth[m]}, в тексте ${q}`);
  }
  if (byMonth['2026-04-01'] < byMonth['2025-12-01']) {
    fail('dom-021', 'излишек на складе всё-таки рассосался — задание учит выводу, которого в данных больше нет');
  } else {
    console.log(`  ok   dom-021: остатки ${byMonth['2025-08-01']} → ${byMonth['2025-12-01']} → ${byMonth['2026-04-01']} (излишек не ушёл)`);
  }

  // dom-025 и карточка dom-seasonality: три базы сравнения дают три ответа.
  const vitamins = runSql(`
    SELECT substr(f.week_start, 1, 7) AS m, SUM(f.units) AS units
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.brand = 'Витамакс' AND substr(f.week_start, 6, 2) IN ('08', '09')
      AND substr(f.week_start, 1, 4) IN ('2024', '2025')
    GROUP BY 1 ORDER BY 1`);
  const v = Object.fromEntries(vitamins.rows);
  const quotedV = { '2024-08': 481, '2024-09': 862, '2025-08': 282, '2025-09': 1174 };
  for (const [m, q] of Object.entries(quotedV)) {
    if (v[m] !== q) fail('dom-025', `Витамакс ${m}: в базе ${v[m]}, в тексте ${q}`);
  }
  const vYears = runSql(`
    SELECT substr(f.week_start, 1, 4) AS y, SUM(f.units) AS units
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.brand = 'Витамакс' AND f.week_start BETWEEN '2024-01-01' AND '2025-12-31'
    GROUP BY 1 ORDER BY 1`);
  const quotedYears = [['2024', 9126], ['2025', 9419]];
  vYears.rows.forEach((row, i) => {
    if (row[0] !== quotedYears[i][0] || row[1] !== quotedYears[i][1]) {
      fail('dom-025', `Витамакс за ${row[0]}: в базе ${row[1]}, в тексте ${quotedYears[i][1]}`);
    }
  });
  if (!failed) {
    console.log(`  ok   dom-025: Витамакс +316% за месяц / +36% год к году / +3.2% за год — все три базы совпали`);
  }

  // dom-027 сравнивает воду и витамины в августе — задание живо, только пока
  // сезоны действительно расходятся: вода падает, витамины растут.
  const water = runSql(`
    SELECT substr(f.week_start, 1, 7) AS m, SUM(f.units) AS units
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.brand = 'Ключевая' AND substr(f.week_start, 1, 7) IN ('2025-07', '2025-08')
    GROUP BY 1 ORDER BY 1`);
  const w = Object.fromEntries(water.rows);
  if (w['2025-07'] !== 15792 || w['2025-08'] !== 11711) {
    fail('dom-027', `Ключевая июль/август: в базе ${w['2025-07']}/${w['2025-08']}, в тексте 15792/11711`);
  } else if (!(w['2025-08'] < w['2025-07'] && v['2025-09'] > v['2025-08'])) {
    fail('dom-027', 'сезоны воды и витаминов перестали расходиться — задание потеряло смысл');
  } else {
    console.log('  ok   dom-027: в августе вода падает, витамины растут — противоположные сезоны воспроизводятся');
  }
}

// Tier 3 трека domain — «Метрики рынка». Здесь исполнимого эталона нет вообще,
// а числа стоят прямо в тексте заданий и карточек: обвал дистрибуции «Чистовъ»,
// две акции, доля рынка в фарме, раскатка новинки, ABC и вариация спроса.
// Проверяется не только совпадение цифр, но и условия, при которых задание
// вообще осмысленно: что численная и взвешенная дистрибуция расходятся, что
// сопоставимые точки выросли, что помесячная доля скачет сильнее годовой.
{
  const near = (a, b, tol = 0.005) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * tol);
  const rowsBy = (res, key = 0) => Object.fromEntries(res.rows.map((r) => [r[key], r]));

  // --- dom-028, dom-030, карточка dom-fmcg-distribution: обвал дистрибуции «Чистовъ».
  // Взвешенная считается по обороту точки во всём дивизионе FMCG — это ACV.
  const dist = runSql(`
    WITH acv AS (
      SELECT f.customer_id AS cid, SUM(f.revenue) AS w
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.division = 'FMCG' GROUP BY 1),
    tot AS (SELECT SUM(w) AS tw, COUNT(*) AS tn FROM acv),
    m AS (
      SELECT substr(f.week_start, 1, 7) AS ym, f.customer_id AS cid
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.brand = 'Чистовъ' GROUP BY 1, 2)
    SELECT m.ym AS month,
           ROUND(100.0 * COUNT(*) / tn, 1) AS numeric_d,
           ROUND(100.0 * SUM(acv.w) / tw, 1) AS weighted_d
    FROM m JOIN acv ON acv.cid = m.cid, tot GROUP BY m.ym ORDER BY m.ym`);
  const dm = rowsBy(dist);
  const quotedDist = {
    '2024-01': [81.9, 97.3], '2025-01': [78.7, 97.2], '2025-06': [68.1, 92.1],
    '2025-08': [56.4, 78.8], '2025-12': [42.6, 63.5], '2026-06': [33.0, 47.5],
  };
  for (const [m, [nd, wd]] of Object.entries(quotedDist)) {
    if (!dm[m] || !near(dm[m][1], nd) || !near(dm[m][2], wd)) {
      fail('dom-028', `${m}: в базе ${dm[m]?.slice(1).join(' / ')}, в тексте ${nd} / ${wd}`);
    }
  }
  // Задание держится на том, что показатели расходятся и что численная поехала первой.
  if (!(dm['2025-06'][2] - dm['2025-06'][1] > dm['2024-01'][2] - dm['2024-01'][1])) {
    fail('dom-028', 'численная и взвешенная перестали расходиться — разбирать в задании нечего');
  }

  // dom-030: цена двух формулировок одной цели. Проверяем, что возврат горстки
  // крупных точек всё ещё закрывает взвешенную, а численную — нет.
  const back = runSql(`
    WITH acv AS (
      SELECT f.customer_id AS cid, SUM(f.revenue) AS w
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.division = 'FMCG' GROUP BY 1),
    tot AS (SELECT SUM(w) AS tw, COUNT(*) AS tn FROM acv),
    cur AS (
      SELECT DISTINCT f.customer_id AS cid
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.brand = 'Чистовъ' AND f.week_start >= '2026-04-01'),
    base AS (
      SELECT DISTINCT f.customer_id AS cid
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.brand = 'Чистовъ' AND f.week_start BETWEEN '2024-04-01' AND '2024-06-30'),
    lost AS (
      SELECT a.cid, a.w FROM acv a
      WHERE a.cid IN (SELECT cid FROM base) AND a.cid NOT IN (SELECT cid FROM cur)),
    r AS (SELECT w, ROW_NUMBER() OVER (ORDER BY w DESC) AS rn, SUM(w) OVER (ORDER BY w DESC) AS cum FROM lost)
    SELECT (SELECT COUNT(*) FROM cur) AS points_now,
           (SELECT COUNT(*) FROM lost) AS points_lost,
           (SELECT tn FROM tot) AS universe,
           (SELECT ROUND(100.0 * SUM(w) / (SELECT tw FROM tot), 1) FROM acv WHERE cid IN (SELECT cid FROM cur)) AS weighted_now,
           (SELECT ROUND(100.0 * cum / (SELECT tw FROM tot), 1) FROM r WHERE rn = 5) AS weighted_plus5`);
  const [pNow, pLost, universe, wNow, wPlus5] = back.rows[0];
  if (pNow !== 33 || pLost !== 46 || universe !== 94 || !near(wNow, 47.6) || !near(wPlus5 + wNow, 80.1, 0.01)) {
    fail('dom-030', `в базе ${pNow} точек / потеряно ${pLost} / из ${universe} / взвешенная ${wNow} / +5 точек = ${(wNow + wPlus5).toFixed(1)}, в тексте 33 / 46 / 94 / 47.6 / 80.1`);
  } else {
    console.log(`\n  ok   dom-030: пять крупных точек дают взвешенную ${(wNow + wPlus5).toFixed(1)}%, численная при этом ${(100 * (pNow + 5) / universe).toFixed(1)}%`);
  }

  // --- dom-031, dom-033: три сомножителя объёма и скорость продажи.
  const velocity = runSql(`
    WITH b AS (
      SELECT p.sku_code AS sku, f.customer_id AS cid, f.week_start AS ws, SUM(f.units) AS u
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE f.week_start >= '2025-07-01' AND f.week_start < '2026-07-01' GROUP BY 1, 2, 3),
    c AS (SELECT sku, cid, COUNT(*) AS wks, SUM(u) AS u FROM b GROUP BY 1, 2)
    SELECT sku, COUNT(*) AS points, ROUND(AVG(wks), 1) AS weeks_per_point,
           ROUND(1.0 * SUM(u) / SUM(wks), 2) AS units_per_week,
           SUM(u) AS units, ROUND(1.0 * SUM(u) / COUNT(*) / 52, 2) AS rate_of_sale
    FROM c GROUP BY sku`);
  const vm = rowsBy(velocity);
  const quotedVel = {
    'ФРУТ001': [46, 36.5, 13.09, 21972], 'ФРУТ002': [52, 33.0, 9.87, 16934],
  };
  for (const [sku, q] of Object.entries(quotedVel)) {
    const r = vm[sku];
    if (!r || r[1] !== q[0] || !near(r[2], q[1]) || !near(r[3], q[2]) || r[4] !== q[3]) {
      fail('dom-031', `${sku}: в базе ${r?.slice(1, 5).join(' / ')}, в тексте ${q.join(' / ')}`);
    }
  }
  // Задание живо, только пока у Яблока дистрибуция шире, а объём меньше.
  if (!(vm['ФРУТ002'][1] > vm['ФРУТ001'][1] && vm['ФРУТ002'][4] < vm['ФРУТ001'][4])) {
    fail('dom-031', 'Яблоко перестало быть шире по дистрибуции и меньше по объёму — парадокс задания исчез');
  }
  const quotedRos = {
    'КЛЮЧ001': [41, 13.16], 'КЛЮЧ002': [52, 10.79], 'КЛЮЧ005': [40, 8.80],
    'КЛЮЧ003': [46, 8.73], 'КЛЮЧ004': [48, 6.97], 'КЛЮЧ006': [46, 4.48],
  };
  for (const [sku, [pts, ros]] of Object.entries(quotedRos)) {
    if (vm[sku][1] !== pts || !near(vm[sku][5], ros, 0.01)) {
      fail('dom-033', `${sku}: в базе ${vm[sku][1]} точек, скорость ${vm[sku][5]}; в тексте ${pts} / ${ros}`);
    }
  }
  // Вся соль dom-033 — что у «Спорта» дистрибуция как у лидеров, а скорость худшая.
  if (vm['КЛЮЧ006'][5] !== Math.min(...Object.keys(quotedRos).map((s) => vm[s][5]))) {
    fail('dom-033', '«Спорт 0.75 л» больше не самый медленный в портфеле — задание теряет ответ');
  } else {
    console.log(`  ok   dom-033: «Спорт» ${vm['КЛЮЧ006'][1]} точек при скорости ${vm['КЛЮЧ006'][5]} против ${vm['КЛЮЧ003'][5]} у газированной 0.5 л с тем же числом точек`);
  }

  // --- dom-034 и карточка dom-fmcg-promo: акция «Молочный Дом», август 2025.
  const promoWeekly = (brand, from, to) => runSql(`
    SELECT ROUND(AVG(u), 1) AS units, ROUND(AVG(r)) AS revenue, ROUND(SUM(r) / SUM(u), 2) AS price
    FROM (SELECT f.week_start AS ws, SUM(f.units) AS u, SUM(f.revenue) AS r
          FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
          WHERE p.brand = '${brand}' AND f.week_start BETWEEN '${from}' AND '${to}'
          GROUP BY 1)`).rows[0];
  const milkPre = promoWeekly('Молочный Дом', '2025-07-07', '2025-07-28');
  const milkOn = promoWeekly('Молочный Дом', '2025-08-04', '2025-08-18');
  const milkPost = promoWeekly('Молочный Дом', '2025-08-25', '2025-09-15');
  const quotedMilk = [[1353.3, 104645, 77.33], [3327.0, 180157, 54.15], [1376.0, 106344, 77.28]];
  [milkPre, milkOn, milkPost].forEach((row, i) => {
    if (row.some((v, j) => !near(v, quotedMilk[i][j]))) {
      fail('dom-034', `период ${i + 1}: в базе ${row.join(' / ')}, в тексте ${quotedMilk[i].join(' / ')}`);
    }
  });
  // Задание объясняет разрыв штук и денег ценой, а не закупкой впрок: провала после акции быть не должно.
  if (milkPost[0] < milkPre[0] * 0.95) {
    fail('dom-034', 'после акции появился провал — объяснение задания «дело только в цене» перестало быть верным');
  } else {
    console.log(`  ok   dom-034: штуки ×${(milkOn[0] / milkPre[0]).toFixed(2)}, выручка ×${(milkOn[1] / milkPre[1]).toFixed(2)}, после акции ${(100 * milkPost[0] / milkPre[0] - 100).toFixed(1)}% к базе`);
  }

  // dom-035: акция «Хрустик» только в сетях — эффект на бренде разбавлен каналами вне охвата.
  const crispChannels = runSql(`
    WITH w AS (
      SELECT f.week_start AS ws, c.customer_type AS ct, SUM(f.units) AS u
      FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id
      JOIN dim_customer c ON c.customer_id = f.customer_id
      WHERE p.brand = 'Хрустик' GROUP BY 1, 2)
    SELECT ct AS channel,
           ROUND(AVG(CASE WHEN ws BETWEEN '2025-07-07' AND '2025-08-04' THEN u END), 1) AS before_promo,
           ROUND(AVG(CASE WHEN ws BETWEEN '2025-08-11' AND '2025-09-08' THEN u END), 1) AS during_promo
    FROM w GROUP BY ct`);
  const cm = rowsBy(crispChannels);
  const quotedCrisp = { chain: [303, 973.8], ecom: [852.4, 897.2], traditional: [26.0, 25.4] };
  for (const [ch, q] of Object.entries(quotedCrisp)) {
    if (!cm[ch] || !near(cm[ch][1], q[0], 0.01) || !near(cm[ch][2], q[1], 0.01)) {
      fail('dom-035', `${ch}: в базе ${cm[ch]?.slice(1).join(' → ')}, в тексте ${q.join(' → ')}`);
    }
  }
  const crispBrandBefore = Object.values(cm).reduce((s, r) => s + r[1], 0);
  const crispBrandDuring = Object.values(cm).reduce((s, r) => s + r[2], 0);
  if (!near(crispBrandBefore, 1181.4, 0.01) || !near(crispBrandDuring, 1896.4, 0.01)) {
    fail('dom-035', `бренд целиком: в базе ${crispBrandBefore.toFixed(1)} → ${crispBrandDuring.toFixed(1)}, в тексте 1181.4 → 1896.4`);
  } else {
    console.log(`  ok   dom-035: в сетях +${(100 * cm.chain[2] / cm.chain[1] - 100).toFixed(0)}%, по бренду +${(100 * crispBrandDuring / crispBrandBefore - 100).toFixed(0)}% — разбавление воспроизводится`);
  }

  // --- dom-038 и карточка dom-pharma-rx: помесячная доля скачет, годовая стоит.
  const share = runSql(`
    WITH m AS (
      SELECT substr(f.week_start, 1, 7) AS ym, p.brand AS brand, SUM(f.units) AS u
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.division = 'Pharma' GROUP BY 1, 2),
    b AS (
      SELECT ym, brand, u,
             SUM(u) OVER (PARTITION BY brand ORDER BY ym ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS mat,
             COUNT(*) OVER (PARTITION BY brand ORDER BY ym ROWS BETWEEN 11 PRECEDING AND CURRENT ROW) AS n
      FROM m),
    t AS (SELECT ym, SUM(u) AS tu, SUM(mat) AS tmat FROM b GROUP BY ym)
    SELECT b.ym AS month, ROUND(100.0 * b.u / t.tu, 1) AS month_share,
           CASE WHEN b.n = 12 THEN ROUND(100.0 * b.mat / t.tmat, 1) END AS mat_share
    FROM b JOIN t ON t.ym = b.ym WHERE b.brand = 'Витамакс' ORDER BY b.ym`);
  const sm = rowsBy(share);
  const quotedShare = {
    '2024-03': [11.0, null], '2025-02': [49.5, null], '2025-08': [13.5, null], '2026-06': [24.4, 26.1],
    '2025-03': [null, 29.4], '2025-09': [null, 29.5], '2025-12': [null, 27.1],
  };
  for (const [m, [ms, mat]] of Object.entries(quotedShare)) {
    if (ms !== null && !near(sm[m][1], ms)) fail('dom-038', `${m}: помесячная доля в базе ${sm[m][1]}, в тексте ${ms}`);
    if (mat !== null && !near(sm[m][2], mat)) fail('dom-038', `${m}: доля в MAT в базе ${sm[m][2]}, в тексте ${mat}`);
  }
  const monthly = share.rows.map((r) => r[1]);
  const mats = share.rows.map((r) => r[2]).filter((v) => v !== null);
  const spread = (a) => Math.max(...a) - Math.min(...a);
  if (spread(monthly) < spread(mats) * 3) {
    fail('dom-038', `размах помесячной доли (${spread(monthly).toFixed(1)}) перестал заметно превышать размах MAT (${spread(mats).toFixed(1)}) — задание учит различию, которого в данных нет`);
  } else {
    console.log(`  ok   dom-038: помесячная доля гуляет на ${spread(monthly).toFixed(1)} пункта, в скользящем году — на ${spread(mats).toFixed(1)}`);
  }

  // dom-039: раскатка новинки встала на 19 аптеках при 37 доступных.
  const launch = runSql(`
    SELECT substr(f.week_start, 1, 7) AS month, SUM(f.units) AS units,
           COUNT(DISTINCT f.customer_id) AS pharmacies
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.sku_code = 'ВИТА005' GROUP BY 1 ORDER BY 1`);
  const lm = rowsBy(launch);
  const quotedLaunch = {
    '2025-09': [1, 1], '2025-10': [9, 4], '2025-11': [19, 7], '2025-12': [41, 10],
    '2026-01': [135, 15], '2026-02': [91, 19], '2026-03': [104, 16],
    '2026-04': [161, 19], '2026-05': [127, 19], '2026-06': [68, 19],
  };
  for (const [m, [u, ph]] of Object.entries(quotedLaunch)) {
    if (!lm[m] || lm[m][1] !== u || lm[m][2] !== ph) {
      fail('dom-039', `${m}: в базе ${lm[m]?.slice(1).join(' / ')}, в тексте ${u} / ${ph}`);
    }
  }
  const brandPharmacies = runSql(`
    SELECT COUNT(DISTINCT f.customer_id) AS pharmacies
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.brand = 'Витамакс' AND p.sku_code <> 'ВИТА005'`).rows[0][0];
  if (brandPharmacies !== 36) {
    fail('dom-039', `остальные препараты «Витамакс» продаются в ${brandPharmacies} аптеках, в тексте 36`);
  } else if (!(lm['2026-06'][2] < brandPharmacies / 1.5)) {
    fail('dom-039', 'новинка доехала почти до всех аптек бренда — вывод «раскатка встала на полпути» пропал');
  } else {
    console.log(`  ok   dom-039: новинка в ${lm['2026-06'][2]} аптеках из ${brandPharmacies}, число не двигается с февраля`);
  }

  // --- dom-043, dom-044 и карточка dom-decomposition: разложение падения «Чистовъ».
  const q2 = runSql(`
    WITH b AS (
      SELECT substr(f.week_start, 1, 4) AS y, f.customer_id AS cid, SUM(f.revenue) AS r, SUM(f.units) AS u
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.brand = 'Чистовъ' AND substr(f.week_start, 6, 2) IN ('04', '05', '06') GROUP BY 1, 2)
    SELECT y AS year, COUNT(*) AS points, ROUND(SUM(r)) AS revenue,
           ROUND(SUM(r) / COUNT(*)) AS revenue_per_point, ROUND(SUM(r) / SUM(u), 2) AS price
    FROM b WHERE y IN ('2024', '2026') GROUP BY y ORDER BY y`);
  const qm = rowsBy(q2);
  const quotedQ2 = { '2024': [79, 2121702, 26857, 199.43], '2026': [33, 1079055, 32699, 194.42] };
  for (const [y, q] of Object.entries(quotedQ2)) {
    const r = qm[y];
    if (!r || r[1] !== q[0] || !near(r[2], q[1]) || !near(r[3], q[2]) || !near(r[4], q[3])) {
      fail('dom-043', `${y}: в базе ${r?.slice(1).join(' / ')}, в тексте ${q.join(' / ')}`);
    }
  }
  // Смысл задания — в том, что множители разошлись: точек меньше, а выручка на точку больше.
  if (!(qm['2026'][1] < qm['2024'][1] && qm['2026'][3] > qm['2024'][3])) {
    fail('dom-043', 'множители перестали расходиться — задание учит выводу, которого в данных больше нет');
  }

  const lfl = runSql(`
    WITH b AS (
      SELECT substr(f.week_start, 1, 4) AS y, f.customer_id AS cid, SUM(f.revenue) AS r
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.brand = 'Чистовъ' AND substr(f.week_start, 6, 2) IN ('04', '05', '06') GROUP BY 1, 2),
    a AS (SELECT cid, r FROM b WHERE y = '2024'),
    c AS (SELECT cid, r FROM b WHERE y = '2026')
    SELECT (SELECT COUNT(*) FROM a JOIN c ON c.cid = a.cid) AS same_points,
           (SELECT ROUND(SUM(a.r)) FROM a JOIN c ON c.cid = a.cid) AS revenue_2024,
           (SELECT ROUND(SUM(c.r)) FROM a JOIN c ON c.cid = a.cid) AS revenue_2026,
           (SELECT ROUND(AVG(r)) FROM a WHERE cid IN (SELECT cid FROM c)) AS kept_avg,
           (SELECT ROUND(AVG(r)) FROM a WHERE cid NOT IN (SELECT cid FROM c)) AS lost_avg`);
  const [samePts, lfl24, lfl26, keptAvg, lostAvg] = lfl.rows[0];
  const quotedLfl = [33, 983740, 1079055, 29810, 24738];
  if ([samePts, lfl24, lfl26, keptAvg, lostAvg].some((v, i) => !near(v, quotedLfl[i]))) {
    fail('dom-044', `в базе ${[samePts, lfl24, lfl26, keptAvg, lostAvg].join(' / ')}, в тексте ${quotedLfl.join(' / ')}`);
  } else if (!(lostAvg < keptAvg && lfl26 > lfl24)) {
    fail('dom-044', 'выбывшие точки перестали быть мельче оставшихся или сопоставимый рост исчез — эффект состава разбирать не на чем');
  } else {
    console.log(`  ok   dom-044: сопоставимые точки +${(100 * lfl26 / lfl24 - 100).toFixed(1)}%, эффект состава +${(100 * keptAvg / qm['2024'][3] - 100).toFixed(1)}% — вместе дают наблюдаемые +${(100 * qm['2026'][3] / qm['2024'][3] - 100).toFixed(0)}%`);
  }

  // --- dom-046, dom-047 и карточка dom-abc-xyz: ABC на ровном ассортименте и вариация спроса.
  const abc = runSql(`
    WITH m AS (
      SELECT p.sku_code AS sku, substr(f.week_start, 1, 7) AS ym, SUM(f.revenue) AS r
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.division = 'FMCG' AND f.week_start >= '2025-07-01' AND f.week_start < '2026-07-01'
      GROUP BY 1, 2),
    a AS (SELECT sku, SUM(r) AS total, AVG(r) AS mu, SQRT(AVG(r * r) - AVG(r) * AVG(r)) AS sd FROM m GROUP BY 1)
    SELECT sku, ROW_NUMBER() OVER (ORDER BY total DESC) AS rank,
           ROUND(100.0 * total / (SELECT SUM(total) FROM a), 2) AS share,
           ROUND(100.0 * SUM(total) OVER (ORDER BY total DESC) / (SELECT SUM(total) FROM a), 1) AS cumulative,
           ROUND(100.0 * sd / mu, 1) AS cv
    FROM a ORDER BY rank`);
  const byRank = Object.fromEntries(abc.rows.map((r) => [r[1], r]));
  const bySku = rowsBy(abc);
  if (abc.rows.length !== 29) fail('dom-046', `в дивизионе FMCG ${abc.rows.length} SKU, в тексте 29`);
  const quotedAbc = { 1: 8.5, 6: 36.3, 10: 52.4, 15: 68.2, 19: 79.5, 20: 82.2 };
  for (const [rank, cum] of Object.entries(quotedAbc)) {
    if (!near(byRank[rank][3], cum, 0.01)) {
      fail('dom-046', `накопленная доля на месте ${rank}: в базе ${byRank[rank][3]}, в тексте ${cum}`);
    }
  }
  // Вся суть dom-046 — что правило 20/80 не выполняется. Если ассортимент станет
  // концентрированным, верным окажется противоположный вариант ответа.
  const top20pct = byRank[Math.round(abc.rows.length * 0.2)][3];
  if (top20pct > 60) {
    fail('dom-046', `верхние 20% SKU дают ${top20pct}% выручки — правило 20/80 заработало, и задание учит обратному`);
  } else {
    console.log(`  ok   dom-046: верхние 20% SKU дают ${top20pct}%, до 80% выручки нужно ${abc.rows.findIndex((r) => r[3] >= 80) + 1} SKU из ${abc.rows.length}`);
  }
  const quotedCv = { 'КЛЮЧ005': 28.5, 'ХРУС002': 35.1, 'МОЛО005': 16.9 };
  for (const [sku, cv] of Object.entries(quotedCv)) {
    if (!near(bySku[sku][4], cv, 0.02)) fail('dom-047', `${sku}: коэффициент вариации в базе ${bySku[sku][4]}, в тексте ${cv}`);
  }

  // dom-047 цитирует два месячных ряда целиком: сезон воды и всплеск от акции.
  const series = runSql(`
    SELECT p.sku_code AS sku, substr(f.week_start, 1, 7) AS month, ROUND(SUM(f.revenue) / 1000) AS thousands
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.sku_code IN ('КЛЮЧ005', 'ХРУС002')
      AND f.week_start >= '2025-07-01' AND f.week_start < '2026-07-01'
    GROUP BY 1, 2 ORDER BY 1, 2`);
  const quotedSeries = {
    'КЛЮЧ005': [277, 231, 253, 157, 123, 168, 165, 131, 156, 154, 182, 285],
    'ХРУС002': [89, 113, 131, 92, 85, 112, 94, 90, 114, 85, 88, 230],
  };
  for (const [sku, values] of Object.entries(quotedSeries)) {
    const got = series.rows.filter((r) => r[0] === sku).map((r) => r[2]);
    if (got.length !== 12 || got.some((v, i) => Math.abs(v - values[i]) > 1)) {
      fail('dom-047', `${sku}: ряд в базе ${got.join(' ')}, в тексте ${values.join(' ')}`);
    }
  }
  // Задание держится на том, что всплеск снека приходится на собственную акцию.
  const promoJune = runSql(`
    SELECT COUNT(*) AS promos FROM dim_promo
    WHERE brand = 'Хрустик' AND start_date <= '2026-06-30' AND end_date >= '2026-06-01'`).rows[0][0];
  if (!promoJune) {
    fail('dom-047', 'июньского всплеска «Хрустика» больше нечем объяснить — акции в dim_promo на этот месяц нет');
  } else {
    console.log(`  ok   dom-047: вода даёт сезонную волну, снек — один всплеск в месяц собственной акции`);
  }
}

// --- Tier 4 трека domain: «Суждение и влияние».
//
// Уровень концептуальный, но половина заданий опирается на конкретные числа
// датасета — и именно эти числа несут вывод. Если корреляция после снятия
// сезона перестанет падать или e-com-склад перестанет быть аномалией портфеля,
// задания начнут учить неверному, оставаясь безупречными на вид.
{
  const near = (a, b, tol = 0.005) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * tol);

  // dom-049: весь вывод держится на паре корреляций. Первая описывает общую
  // сезонную волну, вторая — то, что от связи остаётся после её снятия.
  const corr = (xa, xb) => {
    const ma = xa.reduce((s, v) => s + v, 0) / xa.length;
    const mb = xb.reduce((s, v) => s + v, 0) / xb.length;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < xa.length; i++) {
      num += (xa[i] - ma) * (xb[i] - mb);
      da += (xa[i] - ma) ** 2;
      db += (xb[i] - mb) ** 2;
    }
    return num / Math.sqrt(da * db);
  };
  {
    const all = runSql(`
      SELECT substr(f.week_start, 1, 7) AS month,
             SUM(CASE WHEN p.brand = 'Ключевая' THEN f.units ELSE 0 END) AS water,
             SUM(CASE WHEN p.brand = 'Фрутта' THEN f.units ELSE 0 END) AS juice
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      GROUP BY 1 ORDER BY 1`);
    const byMonth = Object.fromEntries(all.rows.map((r) => [r[0], { w: r[1], j: r[2] }]));
    const y2025 = all.rows.filter((r) => r[0].startsWith('2025'));
    const rLevels = corr(y2025.map((r) => r[1]), y2025.map((r) => r[2]));
    const wYoY = [], jYoY = [];
    for (const [month, v] of Object.entries(byMonth)) {
      const [y, m] = month.split('-');
      const prev = byMonth[`${+y - 1}-${m}`];
      if (prev) { wYoY.push(v.w / prev.w); jYoY.push(v.j / prev.j); }
    }
    const rYoY = corr(wYoY, jYoY);
    // Задание цитирует ещё и семь месяцев ряда — их читают глазами рядом с коэффициентом.
    const quoted = { '2025-01': [6510, 5756], '2025-02': [5663, 4357], '2025-04': [17482, 10567], '2025-06': [21181, 9266], '2025-07': [15792, 8702], '2025-11': [6499, 4291], '2025-12': [8162, 5396] };
    for (const [month, [w, j]] of Object.entries(quoted)) {
      if (byMonth[month].w !== w || byMonth[month].j !== j) {
        fail('dom-049', `${month}: в базе ${byMonth[month].w}/${byMonth[month].j}, в тексте ${w}/${j}`);
      }
    }
    if (!near(rLevels, 0.84, 0.02)) fail('dom-049', `корреляция уровней в базе ${rLevels.toFixed(2)}, в тексте 0.84`);
    else if (rYoY > 0.3) fail('dom-049', `после снятия сезона корреляция ${rYoY.toFixed(2)} — вывод задания «связь исчезает» больше не верен`);
    else if (wYoY.length !== 18) fail('dom-049', `пар месяцев год к году ${wYoY.length}, в тексте 18`);
    else console.log(`\n  ok   dom-049: корреляция вода/сок ${rLevels.toFixed(2)} по уровням против ${rYoY.toFixed(2)} год к году`);
  }

  // dom-050: задание живёт, только пока рейтинг по выручке ранжирует каналы,
  // а не людей — то есть пока портфель из одного e-com-склада берёт второе место.
  {
    const reps = runSql(`
      WITH rep_rev AS (
        SELECT c.rep_id, COUNT(DISTINCT c.customer_id) AS outlets, SUM(f.revenue) AS rev
        FROM dim_customer c JOIN fact_sellout f ON f.customer_id = c.customer_id
        WHERE f.week_start BETWEEN '2025-01-01' AND '2025-12-31'
        GROUP BY c.rep_id
      )
      SELECT r.rep_name, rr.outlets, ROUND(rr.rev) AS rev
      FROM rep_rev rr JOIN dim_rep r ON r.rep_id = rr.rep_id
      WHERE r.role = 'rep' ORDER BY rr.rev DESC LIMIT 3`);
    const quotedTop = [['Анна Егоров', 8, 5042930], ['Юлия Ковалёв', 2, 4616915], ['Екатерина Дьякова', 7, 4335843]];
    quotedTop.forEach((q, i) => {
      const row = reps.rows[i];
      if (!row || row[0] !== q[0] || row[1] !== q[1] || !near(row[2], q[2])) {
        fail('dom-050', `место ${i + 1}: в базе ${row?.join(' / ')}, в тексте ${q.join(' / ')}`);
      }
    });
    const portfolio = runSql(`
      SELECT c.customer_name, ROUND(SUM(f.revenue)) AS rev
      FROM dim_customer c JOIN fact_sellout f ON f.customer_id = c.customer_id
      JOIN dim_rep r ON r.rep_id = c.rep_id
      WHERE r.rep_name = 'Юлия Ковалёв' AND f.week_start BETWEEN '2025-01-01' AND '2025-12-31'
      GROUP BY c.customer_id ORDER BY rev DESC`);
    if (portfolio.rows.length !== 2 || !near(portfolio.rows[0][1], 4591844) || !near(portfolio.rows[1][1], 25071)) {
      fail('dom-050', `портфель в базе ${JSON.stringify(portfolio.rows)}, в тексте 4591844 и 25071`);
    }
    const byChannel = runSql(`
      SELECT c.channel, ROUND(SUM(f.revenue) / COUNT(DISTINCT c.customer_id)) AS per_outlet
      FROM dim_customer c JOIN fact_sellout f ON f.customer_id = c.customer_id
      WHERE f.week_start BETWEEN '2025-01-01' AND '2025-12-31'
      GROUP BY c.channel`);
    const quotedChannels = { ecom: 3222912, pharmacy: 345636, modern_trade: 277651, traditional_trade: 21706 };
    for (const [channel, per] of byChannel.rows) {
      if (!near(per, quotedChannels[channel])) fail('dom-050', `${channel}: в базе ${per} на точку, в тексте ${quotedChannels[channel]}`);
    }
    const ratio = quotedChannels.ecom / quotedChannels.traditional_trade;
    if (Math.round(ratio) !== 148) fail('dom-050', `разрыв между каналами в базе ×${ratio.toFixed(0)}, в тексте ×148`);
    else if (!failed) console.log(`  ok   dom-050: один e-com-склад даёт 99.5% портфеля второго места, разрыв каналов ×${ratio.toFixed(0)}`);
  }

  // dom-051: доказательство эффекта акции держится на контрольных группах.
  // Если хоть одна из них тоже вырастет, задание начнёт учить неверному выводу.
  {
    const period = (from, to) => `SUM(CASE WHEN f.week_start BETWEEN '${from}' AND '${to}' THEN f.units ELSE 0 END)`;
    const r = runSql(`
      SELECT CASE WHEN p.brand = 'Хрустик' THEN c.channel ELSE 'other_mt' END AS grp,
             ${period('2025-07-07', '2025-08-04')} AS before,
             ${period('2025-08-11', '2025-09-08')} AS during
      FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id
      JOIN dim_customer c ON c.customer_id = f.customer_id
      WHERE p.division = 'FMCG' AND (p.brand = 'Хрустик' OR c.channel = 'modern_trade')
      GROUP BY 1`);
    const got = Object.fromEntries(r.rows.map((row) => [row[0], [row[1], row[2]]]));
    const quoted = { modern_trade: [1515, 4869], traditional_trade: [130, 127], ecom: [4262, 4486], other_mt: [13809, 11448] };
    for (const [grp, [before, during]] of Object.entries(quoted)) {
      if (!got[grp] || got[grp][0] !== before || got[grp][1] !== during) {
        fail('dom-051', `${grp}: в базе ${got[grp]?.join(' → ')}, в тексте ${before} → ${during}`);
      }
    }
    // Смысл задания: воздействие выросло, все контроли — нет.
    const lift = got.modern_trade[1] / got.modern_trade[0];
    const controlsFlat = ['traditional_trade', 'ecom', 'other_mt'].every((g) => got[g][1] / got[g][0] < 1.1);
    if (lift < 3 || !controlsFlat) fail('dom-051', 'контрольные группы больше не «стоят на месте» — конструкция доказательства сломалась');
    else console.log(`  ok   dom-051: акция ×${lift.toFixed(2)} в сетях, все три контрольные группы не выросли`);
  }

  // dom-052 и dom-053 пересказывают декомпозицию «Чистовъ» из dom-043 словами —
  // те же четыре числа, но уже внутри текста письма, где их никто не пересчитает.
  {
    const r = runSql(`
      SELECT d.year, ROUND(SUM(f.revenue)) AS revenue, COUNT(DISTINCT f.customer_id) AS outlets
      FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id
      JOIN dim_date d ON d.date_id = f.week_start
      WHERE p.brand = 'Чистовъ' AND d.quarter = 2 AND d.year IN (2024, 2026)
      GROUP BY d.year ORDER BY d.year`);
    const quoted = [[2024, 2121702, 79], [2026, 1079055, 33]];
    quoted.forEach((q, i) => {
      const row = r.rows[i];
      if (!row || row[0] !== q[0] || !near(row[1], q[1]) || row[2] !== q[2]) {
        fail('dom-052', `в базе ${row?.join(' / ')}, в письме ${q.join(' / ')}`);
      }
    });
    const lost = quoted[0][2] - quoted[1][2];
    if (lost !== 46) fail('dom-052', `в письме «46 точек из 79», в базе потеряно ${lost}`);
    else if (!failed) console.log('  ok   dom-052: «46 точек из 79» и обе выручки в письме совпадают с датасетом');
  }

  // dom-058: три верные выручки — вся суть задания в том, что расходятся
  // не расчёты, а вопросы. Разрыв обязан сохраняться и быть объяснимым.
  {
    const sellIn = runSql(`
      SELECT ROUND(SUM(gross_amount)) AS gross, ROUND(SUM(discount_amount)) AS discount,
             ROUND(SUM(net_amount)) AS net, ROUND(100.0 * SUM(discount_amount) / SUM(gross_amount), 1) AS pct
      FROM fact_sellin WHERE month_start BETWEEN '2025-01-01' AND '2025-12-01'`).rows[0];
    const sellOut = runSql(`
      SELECT ROUND(SUM(revenue)) AS total FROM fact_sellout
      WHERE week_start BETWEEN '2025-01-01' AND '2025-12-31'`).rows[0][0];
    const quoted = [42713947, 3609138, 39104808, 8.4];
    if (quoted.some((q, i) => !near(sellIn[i], q))) {
      fail('dom-058', `sell-in в базе ${sellIn.join(' / ')}, в тексте ${quoted.join(' / ')}`);
    } else if (!near(sellOut, 51533887)) {
      fail('dom-058', `sell-out в базе ${sellOut}, в тексте 51533887`);
    } else if (!(sellOut > sellIn[0] && sellIn[0] > sellIn[2])) {
      fail('dom-058', 'порядок трёх выручок изменился — объяснение разрывов в разборе больше не верно');
    } else {
      console.log(`  ok   dom-058: три выручки 2025 — ${sellOut} / ${sellIn[0]} / ${sellIn[2]} (скидки ${sellIn[3]}%)`);
    }
  }
}

console.log(failed ? `\n${failed} проблем в контенте` : '\nКонтент в порядке');
process.exit(failed ? 1 : 0);
