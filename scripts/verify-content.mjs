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
import { existsSync, readdirSync, readFileSync } from 'node:fs';
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
const packs = ['sql-core', 'domain-core', 'python-core', 'model-core'];

/**
 * Черновые паки: граф навыков спроектирован, контента ещё нет вообще.
 *
 * Они лежат в репозитории до наполнения намеренно. Карта треков на главной
 * строится по ним, поэтому структура успевает поспорить сама с собой раньше,
 * чем в неё вложены десятки заданий: цикл в предпосылках или предпосылка
 * с более высоким уровнем стоит здесь минуты, а не переписывания пака.
 * Проверяется у них только граф — заданий и карточек спрашивать не с чего.
 */
const draftPacks = [];

let failed = 0;
const fail = (id, msg) => {
  console.log(` FAIL  ${id}: ${msg}`);
  failed++;
};

const readPack = (id) =>
  JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', `${id}.json`), 'utf8'));

const schemaDoc = JSON.parse(readFileSync(path.join(root, 'public', 'data', 'schema.json'), 'utf8'));
const schemaTableNames = new Set(schemaDoc.tables.map((t) => t.table));

/**
 * Опечатка или переименованная таблица в коде задания — ловится тут,
 * потому что нигде больше: чипы таблиц на карточке задания (см. taskTables
 * в src/content/index.ts) просто молча не покажут имя, которого нет в схеме,
 * и в приложении это выглядело бы как задание без единой таблицы, а не как
 * ошибка. Копия регулярки нарочная — тот же приём, что и в checkOptionPositions:
 * гейт обязан считать сам, а не звать код приложения.
 */
function checkTaskTableNames(pack) {
  for (const t of pack.tasks) {
    const code = [t.starter, t.template, t.solution, t.predictSql].filter(Boolean).join('\n');
    if (!code) continue;
    const found = new Set(code.match(/\b(?:dim|fact|staging)_[a-z_]+\b/g) ?? []);
    for (const name of found) {
      if (!schemaTableNames.has(name)) fail(t.id, `код ссылается на таблицу «${name}», которой нет в schema.json`);
    }
  }
}

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

/**
 * Вводная карточка трека (`Pack.intro`) необязательна — трек может быть
 * в начале наполнения и без неё. Но если она есть, пустое или огрызочное
 * поле хуже отсутствия карточки: человек открывает «О треке» и утыкается
 * в заглушку на первом же экране трека.
 */
function checkIntro(pack) {
  if (!pack.intro) return;
  const fields = ['what', 'where', 'idea', 'limits', 'bridge'];
  for (const field of fields) {
    const value = pack.intro[field];
    if (!value || value.trim().length < 40) {
      fail(pack.id, `intro.${field} пустой или слишком короткий`);
    }
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

/**
 * Позиция верного варианта после перемешивания.
 *
 * В файлах верный вариант стоит первым — так задание пишется и правится,
 * и менять это неудобно. Но показывать его первым нельзя: до перемешивания
 * 158 заданий из 159 держали верный ответ на первой позиции, то есть весь
 * режим predict проходился по признаку положения, мимо вопроса.
 *
 * Гейт повторяет ту же детерминированную перестановку, что и приложение
 * (см. shuffleOptions в src/content/index.ts), и смотрит на итог. Проверяются
 * две вещи, каждая ловит свою поломку: перестановка вообще применяется
 * (иначе первая позиция соберёт почти всё) и она не выродилась на этом
 * наборе id (зерно от id — величина фиксированная, и перекос теоретически
 * возможен без единой ошибки в коде). Порог 55% — заведомо выше случайного
 * разброса на десятках заданий и заведомо ниже той картины, ради которой
 * проверка написана.
 *
 * Копия алгоритма здесь намеренная: гейт обязан считать сам, а не звать
 * код приложения, иначе он подтвердит любую перестановку, включая её
 * отсутствие.
 */
function checkOptionPositions(pack) {
  const seedFrom = (s) => {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  const rngFrom = (seed) => {
    let a = seed;
    return () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const positions = new Map();
  let total = 0;
  for (const t of pack.tasks) {
    if (!t.options || t.options.length < 2) continue;
    const rnd = rngFrom(seedFrom(t.id));
    const options = [...t.options];
    for (let i = options.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    const at = options.findIndex((o) => o.correct);
    positions.set(at, (positions.get(at) ?? 0) + 1);
    total++;
  }
  if (total < 10) return; // на горстке заданий разброс ничего не значит

  const worst = [...positions.entries()].sort((a, b) => b[1] - a[1])[0];
  const share = worst[1] / total;
  const layout = [...positions.entries()].sort((a, b) => a[0] - b[0]).map(([p, n]) => `${p + 1}: ${n}`).join(', ');
  if (share > 0.55) {
    fail(pack.id, `верный вариант оказывается на позиции ${worst[0] + 1} у ${Math.round(share * 100)}% заданий (${layout}) — задание решается по положению ответа`);
  } else {
    console.log(`  ok   позиция верного варианта после перемешивания — ${layout} из ${total}`);
  }
}

for (const packId of packs) {
  const pack = readPack(packId);
  console.log(`\n=== Пак ${pack.id}: ${pack.tasks.length} заданий, ${pack.skills.length} скиллов`);

  checkGraph(pack);
  checkIntro(pack);
  checkSkillCoverage(pack);
  checkOptionPositions(pack);
  checkTaskTableNames(pack);
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
  checkIntro(pack);

  const tiers = [...new Set(pack.skills.map((s) => s.tier))].sort();
  const counts = tiers.map((t) => `${pack.tierNames?.[t] ?? t} — ${pack.skills.filter((s) => s.tier === t).length}`);
  console.log(`  ok   ${pack.title}: ${counts.join(', ')}`);
}

/**
 * Задание, дословно повторяющее пример своей карточки теории.
 *
 * Карточка приёма показывается один раз, перед первой задачей на навык
 * (см. Lesson в content/types.ts), и это осознанный компромисс: готовый
 * образец помогает новичку и начинает мешать по мере роста навыка. Если же
 * первое задание на навык — точная копия того, что человек только что видел
 * в примере, компромисс не работает вообще: задание в режиме write проверяет
 * способность скопировать экран, а не вспомнить приём.
 *
 * Найдено разбором 2026-08-08: 10 заданий совпадали посимвольно (9 из них
 * в python — 21% трека), см. ROADMAP §6, пункт B. Порог — точное совпадение
 * после нормализации пробелов, а не похожесть: почти любое второе задание
 * на новый навык неизбежно похоже на пример структурно (та же конструкция
 * на том же датасете), и жёсткий порог по сходству ловил бы это же самое
 * методическое решение, а не дефект.
 */
const normCode = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

function checkTaskLessonDuplicate(pack, lessons) {
  const lessonBySkill = new Map(lessons.map((l) => [l.skill, l]));
  for (const t of pack.tasks) {
    const lesson = lessonBySkill.get(t.skill);
    if (!lesson) continue;
    const code = t.solution ?? t.predictSql ?? t.template;
    if (!code) continue;
    if (normCode(code) === normCode(lesson.example)) {
      fail(t.id, `дословно повторяет example карточки «${t.skill}» — проверяет копирование экрана, а не приём`);
    }
  }
}

/**
 * Конструкции в заданиях, которых нет в теории на пути к ним.
 *
 * Найдено разбором 2026-08-08 (ROADMAP §6, пункт A): человек узнаёт о приёме
 * из разбора после задания, а не до него — LIKE требовался в трёх заданиях
 * и не был введён нигде, OFFSET — в двух, BETWEEN и IN — в трёх каждый.
 * Проверка раньше объяснения — то, чего не делают в хороших продуктах.
 *
 * «Теория на пути к заданию» — это карточка собственного навыка задания
 * плюс карточки всех его предпосылок, взятые транзитивно: скилл открывается
 * только когда предпосылки пройдены (см. isUnlocked в srs/scheduler.ts),
 * значит к моменту задания человек мог видеть любую из этих карточек.
 * Требовать введения в карточке именно своего навыка было бы неверно —
 * INSTR может быть закреплена ещё в sql-where, а не в задании, которое её
 * использует три навыка спустя.
 *
 * Список конструкций свой на трек — синтаксис разный, и то, что нужно
 * объяснить, тоже разное. sql проверен и починен первым (ROADMAP §6, п. A);
 * python дописан следом тем же способом: замер, разбор причины у каждой
 * находки, починка — либо в карточке, либо в графе, если конструкция
 * не введена потому, что путь предпосылок обходит скилл, который её учит.
 *
 * В python-списке нет .head()/.tail()/.copy(): это не пробел в объяснении,
 * а операции, самоочевидные по названию, — они не создают того риска, ради
 * которого существует эта проверка (сравнение с SQL: сам SELECT тоже
 * не входит в SQL_CONSTRUCTS).
 */
const SQL_CONSTRUCTS = [
  'like', 'offset', 'coalesce', 'ifnull', 'nullif', 'distinct', 'between',
  'in (', 'union', 'exists', 'substr', 'replace', 'trim', 'upper', 'lower',
  'cast', 'round', 'strftime', 'date(', 'julianday', 'printf', 'case',
  'over (', 'partition by', 'row_number', 'rank(', 'dense_rank', 'lag(',
  'lead(', 'ntile', 'sum(', 'avg(', 'count(', 'min(', 'max(', 'having',
  'left join', 'inner join', 'group by', 'order by', 'limit', 'with ',
  'as (', 'abs(', 'length(',
];

const PYTHON_CONSTRUCTS = [
  '.loc[', '.isin(', '.str.', '.astype(', '.assign(', '.fillna(', '.rank(',
  '.apply(', 'axis=1', 'lambda', '.groupby(', '.merge(', 'dropna=',
  '.transform(', '.agg(', '.pivot(', '.pivot_table(', '.melt(', '.resample(',
  '.rolling(', 'np.where(', '.value_counts(', '.nunique(', 'pd.to_datetime(',
  '.dt.', '.isna(', '.reset_index(', '.set_index(', '.sort_index(',
  '.sort_values(', 'validate=', '.describe(', '.duplicated(',
  '.drop_duplicates(', '.shift(', '.diff(', '.cumsum(', '.clip(',
  '.replace(', '.map(', '.query(',
];

const TRACK_CONSTRUCTS = { sql: SQL_CONSTRUCTS, python: PYTHON_CONSTRUCTS };

function checkTheoryIntroducesConstructs(pack, lessons) {
  const constructs = TRACK_CONSTRUCTS[pack.track];
  if (!constructs) return;
  const skillById = new Map(pack.skills.map((s) => [s.id, s]));
  const lessonBySkill = new Map(lessons.map((l) => [l.skill, l]));

  /**
   * Считаем приём введённым, только если он есть в form, example или wrong —
   * то есть в коде, который человек видит целиком и может выполнить кнопкой.
   *
   * Раньше сюда шли все поля карточки, и упоминание приёма в прозе гейт
   * успокаивало. Это ровно та дыра, ради которой проверка писалась: исходная
   * жалоба и была про COALESCE, который стоял в блоке «Как это пишется»
   * и один раз в самопроверке, а объяснения и показа не имел. Прозаическое
   * упоминание отличить от введения нельзя, показ в коде — можно.
   *
   * Ужесточение бесплатное: на момент правки строгое правило давало ноль
   * находок на обоих треках, то есть весь контент уже ему удовлетворял.
   * Ценность не в сегодняшних находках, а в том, что назвать приём в прозе
   * и тем закрыть гейт больше нельзя.
   */
  function corpus(skillId, seen = new Set()) {
    if (seen.has(skillId)) return '';
    seen.add(skillId);
    const skill = skillById.get(skillId);
    if (!skill) return '';
    const l = lessonBySkill.get(skillId);
    let text = l ? [l.form, l.example, l.wrong].filter(Boolean).join(' ') : '';
    for (const p of skill.prereqs) text += ' ' + corpus(p, seen);
    return text.toLowerCase();
  }

  for (const t of pack.tasks) {
    const code = [t.solution, t.predictSql, t.template].filter(Boolean).join('\n').toLowerCase();
    if (!code) continue;
    const available = corpus(t.skill);
    for (const kw of constructs) {
      if (code.includes(kw) && !available.includes(kw.trim())) {
        fail(t.id, `использует «${kw.trim()}», но эта конструкция не встречается в теории навыка «${t.skill}» и его предпосылок`);
      }
    }
  }
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
 * example/wrong исполняются в треках с исполнителем кода (sql, python) —
 * в domain это иллюстративный текст или готовые цифры расчёта, а не код.
 */
async function checkLessons(pack, lessonsFileId) {
  const { lessons } = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', `${lessonsFileId}.json`), 'utf8'));
  console.log(`\n=== Карточки теории (${pack.id}): ${lessons.length}`);

  checkTaskLessonDuplicate(pack, lessons);
  checkTheoryIntroducesConstructs(pack, lessons);

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

    const run = pack.track === 'sql' ? runSql : pack.track === 'python' ? runPython : null;
    if (!run) {
      console.log(`  ok   ${l.skill.padEnd(20)} карточка текстовая — не исполняется`);
      continue;
    }

    let ok;
    try {
      ok = await run(l.example);
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
      wrongRes = await run(l.wrong);
    } catch (e) {
      wrongErr = e.message;
    }
    if (wrongRes) {
      const same =
        JSON.stringify(wrongRes.columns) === JSON.stringify(ok.columns) &&
        JSON.stringify(wrongRes.rows) === JSON.stringify(ok.rows);
      if (same) fail(l.skill, 'ошибочный вариант даёт тот же результат, что и правильный');
    } else if (/syntax error|синтаксическая ошибка|не создаёт переменную result/i.test(wrongErr)) {
      // Синтаксическая ошибка означает, что антипример написан обрывком кода.
      // Тогда проверка проходит по неверной причине — она ловит незакрытую скобку,
      // а не ту ошибку, которой посвящена карточка. И скопировать такой антипример,
      // чтобы увидеть последствия своими глазами, человек тоже не сможет.
      // Для python в ту же категорию попадает код без result: он не «падает
      // по существу», а просто не доходит до сравнения.
      fail(l.skill, `антипример не выполняется как целый фрагмент кода (${wrongErr}) — нужен работающий код, а не огрызок`);
    }
    const verdict = wrongErr ? `ошибка: ${wrongErr.slice(0, 40)}` : `${wrongRes.rows.length} строк, результат иной`;
    console.log(`  ok   ${l.skill.padEnd(20)} пример ${String(ok.rows.length).padStart(4)} строк · антипример — ${verdict}`);
  }
}

await checkLessons(readPack('model-core'), 'model-lessons');
await checkLessons(readPack('sql-core'), 'sql-lessons');
await checkLessons(readPack('domain-core'), 'domain-lessons');
await checkLessons(readPack('python-core'), 'python-lessons');

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
          AND f.product_id = (SELECT product_id FROM dim_product WHERE product_name = 'Vitanor Forte x30')
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
    WHERE p.brand = 'Nettora' AND d.quarter = 1
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
    WHERE p.brand = 'Aqualis' AND d.quarter = 1 AND d.year IN (2024, 2025)
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
// выборку «Nettora» ровно в 10 раз — это и есть весь смысл задания.
{
  const r = runSql(`
    SELECT
      (SELECT COUNT(*) FROM fact_sellout f
       JOIN dim_product p ON p.product_id = f.product_id
       WHERE p.brand = 'Nettora' AND f.week_start BETWEEN '2025-01-01' AND '2025-12-31') AS before,
      (SELECT COUNT(*) FROM fact_sellout f
       JOIN dim_product p ON p.product_id = f.product_id
       JOIN dim_promo m ON m.brand = p.brand
       WHERE p.brand = 'Nettora' AND f.week_start BETWEEN '2025-01-01' AND '2025-12-31') AS after`);
  const [before, after] = r.rows[0];
  if (before === 0 || after !== before * 10) {
    fail('sql-041', `в разборе «ровно в 10 раз», в базе ${before} → ${after}`);
  } else console.log(`  ok   sql-041: соединение по бренду раздувает выборку ${before} → ${after} (×10, как в разборе)`);
}

// sql-048: разбор говорит, что из трёх товаров по 98 ¥ на страницу LIMIT 3 OFFSET 33
// попадают два, а третий остаётся на предыдущей. Держится на местах 33–35 в рейтинге.
{
  const r = runSql(`
    SELECT (SELECT COUNT(*) FROM dim_product WHERE list_price = 98) AS at_98,
           (SELECT COUNT(*) FROM (SELECT list_price FROM dim_product ORDER BY list_price DESC LIMIT 3 OFFSET 33)
             WHERE list_price = 98) AS on_page`);
  const [at98, onPage] = r.rows[0];
  if (at98 !== 3 || onPage !== 2) {
    fail('sql-048', `в разборе три товара по 98 ¥ и два из них на странице, в базе ${at98} и ${onPage}`);
  } else console.log('  ok   sql-048: три товара по 98 ¥, на странице OFFSET 33 — два из них');
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
      WHERE c.served_by_distributor_id = (SELECT customer_id FROM dim_customer WHERE customer_name = 'Setouchi Trading Co.')
        AND f.product_id = (SELECT product_id FROM dim_product WHERE product_name = 'Aqualis Still 0.5 L')
        AND f.week_start BETWEEN '2025-10-06' AND '2025-12-29'
      GROUP BY f.week_start
    )
    SELECT
      (SELECT units_on_hand FROM fact_stock
         WHERE distributor_id = (SELECT customer_id FROM dim_customer WHERE customer_name = 'Setouchi Trading Co.')
           AND product_id = (SELECT product_id FROM dim_product WHERE product_name = 'Aqualis Still 0.5 L')
           AND month_start = '2025-12-01') AS on_hand,
      ROUND((SELECT units_on_hand FROM fact_stock
         WHERE distributor_id = (SELECT customer_id FROM dim_customer WHERE customer_name = 'Setouchi Trading Co.')
           AND product_id = (SELECT product_id FROM dim_product WHERE product_name = 'Aqualis Still 0.5 L')
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

// sql-027: разбор утверждает не про данные, а про движок — что LIKE в SQLite
// сравнивает латиницу без учёта регистра, а `=` с учётом. Проверка стоит копейки
// и переживёт смену версии sql.js, где поведение могло бы измениться. Числа
// в тексте задания (163 строки, из них 107 и 56) сверяются здесь же: у predict
// нет исполнимого эталона, и разойтись с базой они могут только молча.
{
  const r = runSql(`
    SELECT SUM(sku_code = 'AQUA001') AS eq,
           SUM(sku_code LIKE 'AQUA001') AS lk,
           SUM(sku_code = 'aqua001') AS lower_eq
    FROM staging_raw_sellout`);
  const [eq, lk, lowerEq] = r.rows[0];
  if (lk !== 163 || eq !== 107 || lowerEq !== 56) {
    fail('sql-027', `в тексте 163 строки (107 + 56), в базе LIKE ${lk}, = ${eq}, строчных ${lowerEq}`);
  } else if (lk === eq) {
    fail('sql-027', 'LIKE перестал отличаться от = по регистру — задание держится ровно на этой разнице');
  } else console.log(`  ok   sql-027: LIKE находит ${lk} строк там, где = находит ${eq}`);
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
    console.log(`\n  ok   domain: годовая выручка 2025 — ${year.rows[0][0]} ¥ (цифры в тексте совпадают)`);
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
  const quotedRegions = [['Saitama', 622299], ['Aichi', 527583], ['Miyagi', 407593]];
  regions.rows.forEach((row, i) => {
    const q = quotedRegions[i];
    if (!q) return;
    if (row[0] !== q[0]) fail('dom-011', `регион на месте ${i + 1}: в базе «${row[0]}», в тексте «${q[0]}»`);
    // Первый регион в тексте задания намеренно искажён (в этом суть задания),
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
  if (top[0] !== 'Setouchi Trading Co.' || !near(top[3], 2.44, 0.01) || !near(top[1], 28203) || !near(top[2], 11574)) {
    fail('dom-019', `лидер по затовариванию разошёлся с текстом: в базе ${top.join(' / ')}, в тексте Volga-Trade / 28203 / 11574 / 2.44`);
  } else if (Math.max(...rest) > 1.06 || Math.min(...rest) < 1.03) {
    fail('dom-019', `остальные дистрибьюторы вышли из коридора 1.03–1.06 (${Math.min(...rest)}–${Math.max(...rest)}) — контраст в задании пропал`);
  } else {
    console.log(`  ok   dom-019: Volga-Trade ${top[3]} против коридора ${Math.min(...rest)}–${Math.max(...rest)} у остальных одиннадцати`);
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
    WHERE p.brand = 'Vitanor' AND substr(f.week_start, 6, 2) IN ('08', '09')
      AND substr(f.week_start, 1, 4) IN ('2024', '2025')
    GROUP BY 1 ORDER BY 1`);
  const v = Object.fromEntries(vitamins.rows);
  const quotedV = { '2024-08': 481, '2024-09': 862, '2025-08': 282, '2025-09': 1174 };
  for (const [m, q] of Object.entries(quotedV)) {
    if (v[m] !== q) fail('dom-025', `Vitanor ${m}: в базе ${v[m]}, в тексте ${q}`);
  }
  const vYears = runSql(`
    SELECT substr(f.week_start, 1, 4) AS y, SUM(f.units) AS units
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.brand = 'Vitanor' AND f.week_start BETWEEN '2024-01-01' AND '2025-12-31'
    GROUP BY 1 ORDER BY 1`);
  const quotedYears = [['2024', 9126], ['2025', 9419]];
  vYears.rows.forEach((row, i) => {
    if (row[0] !== quotedYears[i][0] || row[1] !== quotedYears[i][1]) {
      fail('dom-025', `Vitanor за ${row[0]}: в базе ${row[1]}, в тексте ${quotedYears[i][1]}`);
    }
  });
  if (!failed) {
    console.log(`  ok   dom-025: Vitanor +316% за месяц / +36% год к году / +3.2% за год — все три базы совпали`);
  }

  // dom-027 сравнивает воду и витамины в августе — задание живо, только пока
  // сезоны действительно расходятся: вода падает, витамины растут.
  const water = runSql(`
    SELECT substr(f.week_start, 1, 7) AS m, SUM(f.units) AS units
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.brand = 'Aqualis' AND substr(f.week_start, 1, 7) IN ('2025-07', '2025-08')
    GROUP BY 1 ORDER BY 1`);
  const w = Object.fromEntries(water.rows);
  if (w['2025-07'] !== 15792 || w['2025-08'] !== 11711) {
    fail('dom-027', `Aqualis июль/август: в базе ${w['2025-07']}/${w['2025-08']}, в тексте 15792/11711`);
  } else if (!(w['2025-08'] < w['2025-07'] && v['2025-09'] > v['2025-08'])) {
    fail('dom-027', 'сезоны воды и витаминов перестали расходиться — задание потеряло смысл');
  } else {
    console.log('  ok   dom-027: в августе вода падает, витамины растут — противоположные сезоны воспроизводятся');
  }
}

// Tier 3 трека domain — «Метрики рынка». Здесь исполнимого эталона нет вообще,
// а числа стоят прямо в тексте заданий и карточек: обвал дистрибуции «Nettora»,
// две акции, доля рынка в фарме, раскатка новинки, ABC и вариация спроса.
// Проверяется не только совпадение цифр, но и условия, при которых задание
// вообще осмысленно: что численная и взвешенная дистрибуция расходятся, что
// сопоставимые точки выросли, что помесячная доля скачет сильнее годовой.
{
  const near = (a, b, tol = 0.005) => Math.abs(a - b) <= Math.max(0.05, Math.abs(b) * tol);
  const rowsBy = (res, key = 0) => Object.fromEntries(res.rows.map((r) => [r[key], r]));

  // --- dom-028, dom-030, карточка dom-fmcg-distribution: обвал дистрибуции «Nettora».
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
      WHERE p.brand = 'Nettora' GROUP BY 1, 2)
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
      WHERE p.brand = 'Nettora' AND f.week_start >= '2026-04-01'),
    base AS (
      SELECT DISTINCT f.customer_id AS cid
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.brand = 'Nettora' AND f.week_start BETWEEN '2024-04-01' AND '2024-06-30'),
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
    'FRUV001': [46, 36.5, 13.09, 21972], 'FRUV002': [52, 33.0, 9.87, 16934],
  };
  for (const [sku, q] of Object.entries(quotedVel)) {
    const r = vm[sku];
    if (!r || r[1] !== q[0] || !near(r[2], q[1]) || !near(r[3], q[2]) || r[4] !== q[3]) {
      fail('dom-031', `${sku}: в базе ${r?.slice(1, 5).join(' / ')}, в тексте ${q.join(' / ')}`);
    }
  }
  // Задание живо, только пока у Яблока дистрибуция шире, а объём меньше.
  if (!(vm['FRUV002'][1] > vm['FRUV001'][1] && vm['FRUV002'][4] < vm['FRUV001'][4])) {
    fail('dom-031', 'Яблоко перестало быть шире по дистрибуции и меньше по объёму — парадокс задания исчез');
  }
  const quotedRos = {
    'AQUA001': [41, 13.16], 'AQUA002': [52, 10.79], 'AQUA005': [40, 8.80],
    'AQUA003': [46, 8.73], 'AQUA004': [48, 6.97], 'AQUA006': [46, 4.48],
  };
  for (const [sku, [pts, ros]] of Object.entries(quotedRos)) {
    if (vm[sku][1] !== pts || !near(vm[sku][5], ros, 0.01)) {
      fail('dom-033', `${sku}: в базе ${vm[sku][1]} точек, скорость ${vm[sku][5]}; в тексте ${pts} / ${ros}`);
    }
  }
  // Вся соль dom-033 — что у «Спорта» дистрибуция как у лидеров, а скорость худшая.
  if (vm['AQUA006'][5] !== Math.min(...Object.keys(quotedRos).map((s) => vm[s][5]))) {
    fail('dom-033', '«Спорт 0.75 л» больше не самый медленный в портфеле — задание теряет ответ');
  } else {
    console.log(`  ok   dom-033: «Спорт» ${vm['AQUA006'][1]} точек при скорости ${vm['AQUA006'][5]} против ${vm['AQUA003'][5]} у газированной 0.5 л с тем же числом точек`);
  }

  // --- dom-034, dom-061 и карточка dom-fmcg-promo: акция «Milvara», август 2025.
  // dom-061 цитирует те же три пары чисел: там они уже не предмет расчёта,
  // а плохая новость, которую надо сообщить автору акции.
  const promoWeekly = (brand, from, to) => runSql(`
    SELECT ROUND(AVG(u), 1) AS units, ROUND(AVG(r)) AS revenue, ROUND(SUM(r) / SUM(u), 2) AS price
    FROM (SELECT f.week_start AS ws, SUM(f.units) AS u, SUM(f.revenue) AS r
          FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
          WHERE p.brand = '${brand}' AND f.week_start BETWEEN '${from}' AND '${to}'
          GROUP BY 1)`).rows[0];
  const milkPre = promoWeekly('Milvara', '2025-07-07', '2025-07-28');
  const milkOn = promoWeekly('Milvara', '2025-08-04', '2025-08-18');
  const milkPost = promoWeekly('Milvara', '2025-08-25', '2025-09-15');
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

  // dom-035: акция «Krosti» только в сетях — эффект на бренде разбавлен каналами вне охвата.
  const crispChannels = runSql(`
    WITH w AS (
      SELECT f.week_start AS ws, c.customer_type AS ct, SUM(f.units) AS u
      FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id
      JOIN dim_customer c ON c.customer_id = f.customer_id
      WHERE p.brand = 'Krosti' GROUP BY 1, 2)
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
    FROM b JOIN t ON t.ym = b.ym WHERE b.brand = 'Vitanor' ORDER BY b.ym`);
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
    WHERE p.sku_code = 'VITA005' GROUP BY 1 ORDER BY 1`);
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
    WHERE p.brand = 'Vitanor' AND p.sku_code <> 'VITA005'`).rows[0][0];
  if (brandPharmacies !== 36) {
    fail('dom-039', `остальные препараты «Vitanor» продаются в ${brandPharmacies} аптеках, в тексте 36`);
  } else if (!(lm['2026-06'][2] < brandPharmacies / 1.5)) {
    fail('dom-039', 'новинка доехала почти до всех аптек бренда — вывод «раскатка встала на полпути» пропал');
  } else {
    console.log(`  ok   dom-039: новинка в ${lm['2026-06'][2]} аптеках из ${brandPharmacies}, число не двигается с февраля`);
  }

  // --- dom-043, dom-044 и карточка dom-decomposition: разложение падения «Nettora».
  // На эти же числа опираются конфликтные задания dom-063, dom-064 и dom-065:
  // средняя выбывшей точки против оставшейся (24 738 / 29 810) и сопоставимый
  // рост 9.7% там не пересчитываются, а цитируются как результат разбора.
  const q2 = runSql(`
    WITH b AS (
      SELECT substr(f.week_start, 1, 4) AS y, f.customer_id AS cid, SUM(f.revenue) AS r, SUM(f.units) AS u
      FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
      WHERE p.brand = 'Nettora' AND substr(f.week_start, 6, 2) IN ('04', '05', '06') GROUP BY 1, 2)
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
      WHERE p.brand = 'Nettora' AND substr(f.week_start, 6, 2) IN ('04', '05', '06') GROUP BY 1, 2),
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

  // --- dom-062: дашборд BI и разбор считают активные точки за разные окна.
  // Всё задание держится на том, что разрыв между окнами большой и виден:
  // если скользящий год сойдётся с кварталом, спор о определении в сценарии
  // станет спором ни о чём.
  const activePoints = runSql(`
    SELECT
      (SELECT COUNT(DISTINCT f.customer_id) FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
        WHERE p.brand = 'Nettora' AND f.week_start >= '2025-07-01' AND f.week_start < '2026-07-01') AS rolling_year,
      (SELECT COUNT(DISTINCT f.customer_id) FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
        WHERE p.brand = 'Nettora' AND f.week_start >= '2026-04-01' AND f.week_start < '2026-07-01') AS quarter`);
  const [rollingYear, quarterPoints] = activePoints.rows[0];
  if (rollingYear !== 60 || quarterPoints !== 33) {
    fail('dom-062', `в базе ${rollingYear} точек за скользящий год и ${quarterPoints} за квартал, в тексте 60 и 33`);
  } else {
    console.log(`  ok   dom-062: 60 активных точек за скользящий год против 33 за квартал — расхождение определений воспроизводится`);
  }

  // --- dom-066: таблица по каналам, из которой выпал e-commerce.
  // Задание учит тому, что ошибка меняет не вывод, а приоритет, — значит,
  // проверять надо две вещи: доли каналов и то, что без e-commerce сети
  // выглядят главным каналом (86% против настоящих 17%).
  const channels = runSql(`
    WITH c AS (
      SELECT cu.channel AS ch, SUM(f.revenue) AS r
      FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id
      JOIN dim_customer cu ON cu.customer_id = f.customer_id
      WHERE p.brand = 'Nettora' AND f.week_start >= '2026-04-01' AND f.week_start < '2026-07-01'
      GROUP BY 1)
    SELECT ch, ROUND(r / 1000) AS thousands, ROUND(100.0 * r / (SELECT SUM(r) FROM c), 1) AS share,
           ROUND(100.0 * r / (SELECT SUM(r) FROM c WHERE ch <> 'ecom'), 1) AS share_without_ecom
    FROM c ORDER BY 2 DESC`);
  const chm = rowsBy(channels);
  // Доли в тексте округлены до целых процентов и подобраны так, чтобы давать
  // в сумме сто, — поэтому сверяются с допуском в пол-пункта, а не побитово.
  const quotedChannels = { ecom: [869, 80], modern_trade: [180, 17], traditional_trade: [30, 3] };
  for (const [ch, [th, share]] of Object.entries(quotedChannels)) {
    const row = chm[ch];
    if (!row || Math.abs(row[1] - th) > 1 || Math.abs(row[2] - share) > 0.6) {
      fail('dom-066', `${ch}: в базе ${row?.slice(1).join(' / ')}, в тексте ${th} тыс. / ${share}%`);
    }
  }
  if (Math.abs(chm['modern_trade'][3] - 86) > 0.6 || Math.abs(chm['traditional_trade'][3] - 14) > 0.6) {
    fail('dom-066', `без e-commerce в базе ${chm['modern_trade'][3]} / ${chm['traditional_trade'][3]}, в тексте 86 / 14`);
  } else if (chm['ecom'][2] < chm['modern_trade'][2]) {
    fail('dom-066', 'e-commerce перестал быть крупнейшим каналом бренда — потерянная строка больше не меняет приоритет');
  } else {
    console.log(`  ok   dom-066: e-commerce ${chm['ecom'][2]}% выручки бренда, но без него сети выглядят на ${chm['modern_trade'][3]}%`);
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
  const quotedCv = { 'AQUA005': 28.5, 'KROS002': 35.1, 'MILV005': 16.9 };
  for (const [sku, cv] of Object.entries(quotedCv)) {
    if (!near(bySku[sku][4], cv, 0.02)) fail('dom-047', `${sku}: коэффициент вариации в базе ${bySku[sku][4]}, в тексте ${cv}`);
  }

  // dom-047 цитирует два месячных ряда целиком: сезон воды и всплеск от акции.
  const series = runSql(`
    SELECT p.sku_code AS sku, substr(f.week_start, 1, 7) AS month, ROUND(SUM(f.revenue) / 1000) AS thousands
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
    WHERE p.sku_code IN ('AQUA005', 'KROS002')
      AND f.week_start >= '2025-07-01' AND f.week_start < '2026-07-01'
    GROUP BY 1, 2 ORDER BY 1, 2`);
  const quotedSeries = {
    'AQUA005': [277, 231, 253, 157, 123, 168, 165, 131, 156, 154, 182, 285],
    'KROS002': [89, 113, 131, 92, 85, 112, 94, 90, 114, 85, 88, 230],
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
    WHERE brand = 'Krosti' AND start_date <= '2026-06-30' AND end_date >= '2026-06-01'`).rows[0][0];
  if (!promoJune) {
    fail('dom-047', 'июньского всплеска «Krosti» больше нечем объяснить — акции в dim_promo на этот месяц нет');
  } else {
    console.log(`  ok   dom-047: вода даёт сезонную волну, снек — один всплеск в месяц собственной акции`);
  }
}

// --- model-core: числа, которыми описана модель.
//
// У трека model нет исполнителя: DAX в браузере выполнить нечем, и мера,
// показанная человеку, остаётся текстом. Поэтому проверяется не она, а то,
// на чём она стоит: гранулярность таблиц, кардинальность ключей и результат
// соединения. Каждое такое утверждение выражается запросом к той же базе,
// на которой считают sql и python, — и если генератор датасета изменится,
// разбор в model упадёт здесь, а не останется тихо неверным.
//
// Эквивалентность «мера в задании = запрос здесь» проверяется человеком
// один раз при написании задания; гейт после этого держит числа. Это тот же
// уровень гарантий, что у domain, и он честно ограничен: подмену смысла
// в прозе не ловит ни то, ни другое.

// mdl-004: гранулярность fact_sellout названа как «неделя × точка × SKU».
// Доказательство — совпадение числа строк с числом различных сочетаний;
// на нём же держится верный вариант и разбор всего задания.
{
  const r = runSql(`
    SELECT (SELECT COUNT(*) FROM fact_sellout) AS rows,
           (SELECT COUNT(*) FROM (SELECT DISTINCT week_start, customer_id, product_id FROM fact_sellout)) AS combos`);
  const [rows, combos] = r.rows[0];
  if (rows !== 118449 || combos !== rows) {
    fail('mdl-004', `в задании 118 449 строк и столько же сочетаний, в базе ${rows} и ${combos}`);
  } else console.log(`  ok   mdl-004: гранулярность fact_sellout — ${rows} строк = ${combos} сочетаний`);
}

// mdl-005 и mdl-006: гранулярности fact_target и fact_sellin. Задания строятся
// на том, что товара в плане нет вовсе, а у отгрузок нет ни недели, ни точки.
{
  const r = runSql(`
    SELECT (SELECT COUNT(*) FROM fact_target) AS t_rows,
           (SELECT COUNT(*) FROM (SELECT DISTINCT month_start, rep_id, division FROM fact_target)) AS t_combos,
           (SELECT COUNT(*) FROM fact_sellin) AS s_rows,
           (SELECT COUNT(*) FROM (SELECT DISTINCT month_start, distributor_id, product_id FROM fact_sellin)) AS s_combos`);
  const [tRows, tCombos, sRows, sCombos] = r.rows[0];
  const cols = new Set(db.exec('PRAGMA table_info(fact_target)')[0].values.map((c) => c[1]));
  if (tRows !== 750 || tCombos !== tRows) {
    fail('mdl-005', `в задании 750 строк плана на уникальном ключе, в базе ${tRows} и ${tCombos}`);
  } else if (cols.has('product_id')) {
    fail('mdl-005', 'в fact_target появился product_id — задание утверждает, что товара в плане нет вовсе');
  } else console.log(`  ok   mdl-005: план — ${tRows} строк, товара в нём по-прежнему нет`);
  if (sRows !== 15362 || sCombos !== sRows) {
    fail('mdl-006', `в задании 15 362 отгрузки на уникальном ключе, в базе ${sRows} и ${sCombos}`);
  } else console.log(`  ok   mdl-006: отгрузки — ${sRows} строк, гранулярность «месяц × дистрибьютор × SKU»`);
}

// mdl-007, mdl-008, mdl-011: размеры справочников и уникальность ключей.
// На них держатся и «47 названий против 118 449 повторов», и вывод о том,
// что связь по бренду — многие-ко-многим.
{
  const r = runSql(`
    SELECT (SELECT COUNT(*) FROM dim_product) AS products,
           (SELECT COUNT(DISTINCT brand) FROM dim_product) AS prod_brands,
           (SELECT COUNT(*) FROM dim_customer) AS customers,
           (SELECT COUNT(DISTINCT category) FROM dim_product) AS cats,
           (SELECT COUNT(*) FROM dim_promo) AS promos,
           (SELECT COUNT(DISTINCT brand) FROM dim_promo) AS promo_brands,
           (SELECT COUNT(*) FROM dim_product WHERE brand = 'Nettora') AS nettora_products,
           (SELECT COUNT(*) FROM dim_promo WHERE brand = 'Nettora') AS nettora_promos`);
  const [products, prodBrands, customers, cats, promos, promoBrands, cProd, cPromo] = r.rows[0];
  const quoted = { products: 47, prodBrands: 9, customers: 144, cats: 5, promos: 89, promoBrands: 9, cProd: 5, cPromo: 10 };
  const actual = { products, prodBrands, customers, cats, promos, promoBrands, cProd, cPromo };
  const bad = Object.keys(quoted).filter((k) => quoted[k] !== actual[k]);
  if (bad.length) {
    fail('mdl-007/008/011', `цифры справочников разошлись: ${bad.map((k) => `${k} ${quoted[k]}→${actual[k]}`).join(', ')}`);
  } else console.log(`  ok   mdl-007/008/011: справочники ${products}/${customers}/${promos}, «Nettora» — ${cProd} товаров и ${cPromo} акций`);
  // Многие-ко-многим требует неуникальности С ОБЕИХ сторон: станет ключ
  // уникальным хоть где-то — и mdl-011 будет учить несуществующему случаю.
  if (prodBrands >= products || promoBrands >= promos) {
    fail('mdl-011', 'brand стал уникален в одном из справочников — связь больше не многие-ко-многим');
  }
}

// mdl-013: главное число трека. Соединение по бренду вместо promo_id раздувает
// и строки, и выручку примерно вдесятеро — на этом держатся и вопрос, и разбор,
// и подсказка «сравните с полной выручкой таблицы».
{
  const r = runSql(`
    SELECT (SELECT ROUND(SUM(revenue)) FROM fact_sellout) AS total,
           (SELECT COUNT(*) FROM fact_sellout) AS rows_ok,
           (SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f
              JOIN dim_product p ON p.product_id = f.product_id
              JOIN dim_promo m ON m.brand = p.brand) AS inflated,
           (SELECT COUNT(*) FROM fact_sellout f
              JOIN dim_product p ON p.product_id = f.product_id
              JOIN dim_promo m ON m.brand = p.brand) AS rows_inflated,
           (SELECT MIN(c) FROM (SELECT COUNT(*) c FROM dim_promo GROUP BY brand)) AS min_promos,
           (SELECT MAX(c) FROM (SELECT COUNT(*) c FROM dim_promo GROUP BY brand)) AS max_promos`);
  const [total, rowsOk, inflated, rowsInflated, minPromos, maxPromos] = r.rows[0];
  if (total !== 126911191 || inflated !== 1262668596 || rowsOk !== 118449 || rowsInflated !== 1173847) {
    fail('mdl-013', `цифры задания разошлись с базой: выручка ${total} (в тексте 126 911 191), раздутая ${inflated} (в тексте 1 262 668 596), строк ${rowsOk} → ${rowsInflated} (в тексте 118 449 → 1 173 847)`);
  } else if (minPromos !== 9 || maxPromos !== 11) {
    fail('mdl-013', `в задании «акций на бренд 9–11», в базе ${minPromos}–${maxPromos}`);
  } else {
    // Разбор учит признаку «превысило полный итог — значит посчитано многократно».
    // Если раздутая сумма вдруг перестанет превышать полную, признак исчезнет.
    if (inflated <= total) fail('mdl-013', 'раздутая выручка перестала превышать полную — признак из разбора не работает');
    console.log(`  ok   mdl-013: соединение по бренду ${rowsOk} → ${rowsInflated} строк, выручка ${total} → ${inflated} (×${(inflated / total).toFixed(1)})`);
  }
}

// --- model-core, tier 2: мера/колонка, фильтр-контекст, контекст строки,
// аддитивность, таблица дат. Тот же приём, что и на tier 1 mdl-013: числа
// в задании закрепляются запросом к той же базе.

// mdl-016, mdl-020, mdl-021: доля Nettora в выручке — 12.7% по всей базе,
// 19.1% по Москве. На них стоит и mdl-016 (мера vs колонка), и разбивка
// по регионам в mdl-021, где сумма регионов обязана сойтись с общим итогом.
{
  const r = runSql(`
    SELECT ROUND(SUM(f.revenue)) AS total,
           ROUND(SUM(CASE WHEN p.brand = 'Nettora' THEN f.revenue ELSE 0 END)) AS nettora,
           (SELECT ROUND(SUM(f2.revenue)) FROM fact_sellout f2
              JOIN dim_customer c2 ON c2.customer_id = f2.customer_id
              JOIN dim_region r2 ON r2.region_id = c2.region_id WHERE r2.region_name = 'Tokyo') AS msk_total,
           (SELECT ROUND(SUM(f2.revenue)) FROM fact_sellout f2
              JOIN dim_product p2 ON p2.product_id = f2.product_id
              JOIN dim_customer c2 ON c2.customer_id = f2.customer_id
              JOIN dim_region r2 ON r2.region_id = c2.region_id
              WHERE r2.region_name = 'Tokyo' AND p2.brand = 'Nettora') AS msk_nettora
    FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id`);
  const [total, nettora, mskTotal, mskNettora] = r.rows[0];
  const share = Math.round((nettora / total) * 1000) / 10;
  const mskShare = Math.round((mskNettora / mskTotal) * 1000) / 10;
  if (nettora !== 16165815 || share !== 12.7) fail('mdl-016/020', `доля Nettora в тексте 12.7% (16 165 815 ¥), в базе ${share}% (${nettora} ¥)`);
  if (mskNettora !== 1691942 || mskTotal !== 8876489 || mskShare !== 19.1) {
    fail('mdl-016/020', `доля по Москве в тексте 19.1% (1 691 942 из 8 876 489), в базе ${mskShare}% (${mskNettora} из ${mskTotal})`);
  } else console.log(`  ok   mdl-016/020: доля Nettora ${share}% всего, ${mskShare}% по Москве`);

  const byRegion = runSql(`
    SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id WHERE p.brand = 'Nettora'`);
  if (byRegion.rows[0][0] !== nettora) fail('mdl-021', 'сумма выручки Nettora разошлась сама с собой между запросами');
  else console.log('  ok   mdl-021: сумма по регионам сходится с общим итогом Nettora');
}

// mdl-019: конкретная ячейка матрицы — Москва × 2025 × Nettora против Москвы
// без среза по бренду. На двух этих числах держится весь разбор фильтр-контекста.
{
  const r = runSql(`
    SELECT
      (SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f
         JOIN dim_product p ON p.product_id = f.product_id
         JOIN dim_customer c ON c.customer_id = f.customer_id
         JOIN dim_region rg ON rg.region_id = c.region_id
         WHERE rg.region_name = 'Tokyo' AND f.week_start LIKE '2025%' AND p.brand = 'Nettora') AS with_brand,
      (SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f
         JOIN dim_customer c ON c.customer_id = f.customer_id
         JOIN dim_region rg ON rg.region_id = c.region_id
         WHERE rg.region_name = 'Tokyo' AND f.week_start LIKE '2025%') AS all_brands`);
  const [withBrand, allBrands] = r.rows[0];
  if (withBrand !== 819771 || allBrands !== 3718723) {
    fail('mdl-019', `в задании 819 771 ¥ со срезом и 3 718 723 ¥ без него, в базе ${withBrand} и ${allBrands}`);
  } else console.log(`  ok   mdl-019: Москва×2025×Nettora ${withBrand} ¥, без среза по бренду ${allBrands} ¥`);
}

// mdl-023: три первые строки fact_sellout — на их revenue/units держится
// разбор про SUM внутри и вне контекста строки.
{
  const r = runSql(`SELECT sellout_id, revenue, units FROM fact_sellout WHERE sellout_id IN (1, 2, 3) ORDER BY sellout_id`);
  const quoted = [[1, 398.31, 2], [2, 399.28, 2], [3, 601.4, 3]];
  const same = r.rows.length === 3 && quoted.every((q, i) => q.every((v, j) => r.rows[i][j] === v));
  if (!same) fail('mdl-023', `первые три строки fact_sellout разошлись с текстом: в базе ${JSON.stringify(r.rows)}`);
  else console.log('  ok   mdl-023: первые три строки fact_sellout совпадают с текстом задания');
}

// mdl-026: остаток одного дистрибьютора (все товары) на конец Q4 2025 —
// на этих трёх числах и их арифметической сумме держится разбор.
{
  const r = runSql(`
    SELECT month_start, SUM(units_on_hand) FROM fact_stock
    WHERE distributor_id = (SELECT customer_id FROM dim_customer WHERE customer_type = 'distributor' LIMIT 1)
      AND month_start IN ('2025-10-01', '2025-11-01', '2025-12-01')
    GROUP BY month_start ORDER BY month_start`);
  const byMonth = Object.fromEntries(r.rows);
  const [oct, nov, dec] = ['2025-10-01', '2025-11-01', '2025-12-01'].map((m) => byMonth[m]);
  const sum = oct + nov + dec;
  if (oct !== 10325 || nov !== 15108 || dec !== 20846 || sum !== 46279) {
    fail('mdl-026', `в задании 10 325 / 15 108 / 20 846 = 46 279, в базе ${oct} / ${nov} / ${dec} = ${sum}`);
  } else console.log(`  ok   mdl-026: остаток дистрибьютора Q4 2025 — ${oct} / ${nov} / ${dec}, сумма ${sum}`);
}

// mdl-027: годовой остаток всех дистрибьюторов — то же расхождение, что уже
// поймано в датасете (см. verify-dataset.mjs), но здесь оно часть разбора,
// а не структурная проверка, и его число тоже обязано остаться неизменным.
{
  const r = runSql(`
    SELECT
      (SELECT SUM(units_on_hand) FROM fact_stock WHERE month_start LIKE '2025%') AS year_sum,
      (SELECT SUM(units_on_hand) FROM fact_stock WHERE month_start = '2025-12-01') AS december`);
  const [yearSum, december] = r.rows[0];
  if (yearSum !== 370142 || december !== 52350) {
    fail('mdl-027', `в задании 370 142 за год и 52 350 на декабрь, в базе ${yearSum} и ${december}`);
  } else console.log(`  ok   mdl-027: годовой остаток ${yearSum} против декабрьского ${december} (×${(yearSum / december).toFixed(1)})`);
}

// mdl-029, mdl-030: строка dim_date за 2025-03-03 — week_start совпадает
// с самой датой, month_start уходит на 1 марта, quarter=1. И следствие —
// выручка/отгрузки по кварталу 1 через разные колонки dim_date.
{
  const r = runSql(`SELECT date_id, week_start, month_start, quarter FROM dim_date WHERE date_id = '2025-03-03'`);
  const [dateId, weekStart, monthStart, quarter] = r.rows[0] ?? [];
  if (weekStart !== '2025-03-03' || monthStart !== '2025-03-01' || quarter !== 1) {
    fail('mdl-029', `в задании week_start=2025-03-03, month_start=2025-03-01, quarter=1; в базе ${weekStart}, ${monthStart}, ${quarter}`);
  } else console.log(`  ok   mdl-029: dim_date 2025-03-03 — неделя ${weekStart}, месяц ${monthStart}, квартал ${quarter}`);

  const sellinOnThatDate = runSql(`SELECT COUNT(*) FROM fact_sellin WHERE month_start = '2025-03-03'`);
  if (sellinOnThatDate.rows[0][0] !== 0) fail('mdl-029', 'в fact_sellin неожиданно появилась строка с датой 2025-03-03');

  const q1 = runSql(`
    SELECT
      (SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f
         WHERE f.week_start IN (SELECT week_start FROM dim_date WHERE year = 2025 AND quarter = 1)) AS sellout_q1,
      (SELECT ROUND(SUM(f.net_amount)) FROM fact_sellin f
         WHERE f.month_start IN (SELECT DISTINCT month_start FROM dim_date WHERE year = 2025 AND quarter = 1)) AS sellin_q1`);
  const [selloutQ1, sellinQ1] = q1.rows[0];
  if (selloutQ1 !== 13512252 || sellinQ1 !== 9186879) {
    fail('mdl-030', `в задании продажи Q1 13 512 252 ¥, отгрузки 9 186 879 ¥; в базе ${selloutQ1} и ${sellinQ1}`);
  } else console.log(`  ok   mdl-030: Q1 2025 через общий календарь — продажи ${selloutQ1} ¥, отгрузки ${sellinQ1} ¥`);
}

// --- model-core, tier 3-4: роль календаря, мост, CALCULATE, time intelligence,
// слой подготовки, версионирование, размер модели. Тот же приём.

// mdl-031, mdl-054: две даты в fact_sellin расходятся по месяцу ровно
// у 1979 строк, и март 2025 по заказу и по отгрузке даёт разные суммы.
// Это и повод для роли календаря, и аргумент выбора колонки разбиения.
{
  const r = runSql(`
    SELECT
      (SELECT COUNT(*) FROM fact_sellin WHERE substr(ship_date,1,7) <> substr(order_date,1,7)) AS crossing,
      (SELECT COUNT(*) FROM fact_sellin) AS total,
      (SELECT ROUND(SUM(net_amount)) FROM fact_sellin WHERE substr(order_date,1,7) = '2025-03') AS by_order,
      (SELECT ROUND(SUM(net_amount)) FROM fact_sellin WHERE substr(ship_date,1,7) = '2025-03') AS by_ship,
      (SELECT ROUND(SUM(net_amount)) FROM fact_sellin WHERE substr(order_date,1,4) = '2025') AS year_order,
      (SELECT ROUND(SUM(net_amount)) FROM fact_sellin WHERE substr(ship_date,1,4) = '2025') AS year_ship`);
  const [crossing, total, byOrder, byShip, yearOrder, yearShip] = r.rows[0];
  if (crossing !== 1979 || total !== 15362 || byOrder !== 3303414 || byShip !== 3570458) {
    fail('mdl-031', `в задании 1979 из 15 362 и март 3 303 414 / 3 570 458; в базе ${crossing} из ${total} и ${byOrder} / ${byShip}`);
  } else console.log(`  ok   mdl-031: март по заказу ${byOrder} ¥, по отгрузке ${byShip} ¥ (${crossing} строк через границу)`);
  if (yearOrder !== 39104808 || yearShip !== 39023501) {
    fail('mdl-031', `в разборе год 39 104 808 / 39 023 501, в базе ${yearOrder} / ${yearShip}`);
  }
  // Разбор утверждает, что на годовом горизонте разница почти исчезает,
  // а на месячном заметна. Если это перестанет быть так — вывод сломается.
  const monthGap = Math.abs(byShip - byOrder) / byOrder;
  const yearGap = Math.abs(yearShip - yearOrder) / yearOrder;
  if (!(monthGap > yearGap * 3)) fail('mdl-031', 'разница по месяцу перестала заметно превышать годовую — вывод разбора не работает');
}

// mdl-034, mdl-035: размер моста «товар × акция». 465 пар — сумма произведений
// внутри каждого бренда, у «Nettora» это 5 × 10 = 50.
{
  const r = runSql(`
    SELECT
      (SELECT COUNT(*) FROM dim_product p JOIN dim_promo m ON m.brand = p.brand) AS bridge,
      (SELECT COUNT(*) FROM dim_product p JOIN dim_promo m ON m.brand = p.brand WHERE p.brand = 'Nettora') AS nettora_pairs,
      (SELECT MIN(c) FROM (SELECT COUNT(*) c FROM dim_product GROUP BY brand)) AS min_products,
      (SELECT MAX(c) FROM (SELECT COUNT(*) c FROM dim_product GROUP BY brand)) AS max_products`);
  const [bridge, nettoraPairs, minProducts, maxProducts] = r.rows[0];
  if (bridge !== 465 || nettoraPairs !== 50) {
    fail('mdl-035', `в задании мост 465 строк и 50 пар у «Nettora», в базе ${bridge} и ${nettoraPairs}`);
  } else console.log(`  ok   mdl-035: мост товар×акция — ${bridge} пар, у «Nettora» ${nettoraPairs}`);
  if (minProducts !== 4 || maxProducts !== 6) {
    fail('mdl-035', `в задании «товаров от 4 до 6» на бренд, в базе от ${minProducts} до ${maxProducts}`);
  }
}

// mdl-037, mdl-038, mdl-039: выручка брендов и срез по Москве — на них стоят
// разборы про замену фильтра и про долю через ALL.
{
  const r = runSql(`
    SELECT
      (SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id WHERE p.brand = 'Aqualis') AS klyuch,
      (SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id WHERE p.brand = 'Nettora') AS nettora,
      (SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id
         JOIN dim_customer c ON c.customer_id = f.customer_id JOIN dim_region rg ON rg.region_id = c.region_id
         WHERE rg.region_name = 'Tokyo' AND p.brand = 'Aqualis') AS klyuch_msk,
      (SELECT ROUND(SUM(f.revenue)) FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id WHERE p.brand = 'Fruvia') AS frutta,
      (SELECT ROUND(SUM(revenue)) FROM fact_sellout) AS total`);
  const [klyuch, nettora, klyuchMsk, frutta, total] = r.rows[0];
  if (klyuch !== 18841733 || klyuchMsk !== 1323959) {
    fail('mdl-037/038', `в заданиях «Aqualis» 18 841 733 ¥ и 1 323 959 ¥ по Москве, в базе ${klyuch} и ${klyuchMsk}`);
  } else console.log(`  ok   mdl-037/038: «Aqualis» ${klyuch} ¥ всего, ${klyuchMsk} ¥ в Москве`);
  if (klyuch + nettora !== 35007548) fail('mdl-037', `в разборе варианта сумма двух брендов 35 007 548, в базе ${klyuch + nettora}`);
  // mdl-039: доля «Fruvia» в разборе названа как 20.1%.
  const share = Math.round((frutta / total) * 1000) / 10;
  if (frutta !== 25465980 || share !== 20.1) {
    fail('mdl-039', `в разборе «Fruvia» 25 465 980 ¥ и доля 20.1%, в базе ${frutta} и ${share}%`);
  } else console.log(`  ok   mdl-039/040: «Fruvia» ${frutta} ¥ — доля ${share}% от ${total} ¥`);
}

// mdl-043, mdl-044: YTD к марту 2025 и сравнение с мартом 2024.
{
  const r = runSql(`
    SELECT
      (SELECT ROUND(SUM(revenue)) FROM fact_sellout WHERE week_start >= '2025-03-01' AND week_start < '2025-04-01') AS mar25,
      (SELECT ROUND(SUM(revenue)) FROM fact_sellout WHERE week_start >= '2024-03-01' AND week_start < '2024-04-01') AS mar24,
      (SELECT ROUND(SUM(revenue)) FROM fact_sellout WHERE week_start >= '2025-01-01' AND week_start < '2025-04-01') AS ytd,
      (SELECT ROUND(SUM(revenue)) FROM fact_sellout WHERE week_start LIKE '2024%') AS y2024`);
  const [mar25, mar24, ytd, y2024] = r.rows[0];
  const growth = Math.round(((mar25 / mar24) - 1) * 1000) / 10;
  if (mar25 !== 4694330 || mar24 !== 4392846 || ytd !== 12566159) {
    fail('mdl-043/044', `в заданиях март-25 4 694 330, март-24 4 392 846, YTD 12 566 159; в базе ${mar25}, ${mar24}, ${ytd}`);
  } else if (growth !== 6.9) {
    fail('mdl-044', `в разборе рост 6.9%, в базе ${growth}%`);
  } else console.log(`  ok   mdl-043/044: март-25 ${mar25} против марта-24 ${mar24} (+${growth}%), YTD ${ytd}`);
  if (y2024 !== 49518071) fail('mdl-044', `в разборе варианта выручка 2024 — 49 518 071, в базе ${y2024}`);
}

// mdl-045: календарь обязан быть непрерывным — на этом стоит весь разбор
// про time intelligence на календаре из фактов.
{
  const r = runSql(`
    SELECT COUNT(*) AS rows,
           CAST(julianday(MAX(date_id)) - julianday(MIN(date_id)) + 1 AS INTEGER) AS span,
           (SELECT COUNT(*) FROM dim_date WHERE year = 2025) AS y2025
    FROM dim_date`);
  const [rows, span, y2025] = r.rows[0];
  if (rows !== 912 || rows !== span || y2025 !== 365) {
    fail('mdl-045', `календарь: в задании 912 подряд идущих дней и 365 дней в 2025; в базе ${rows} строк на ${span} дней, в 2025 — ${y2025}`);
  } else console.log(`  ok   mdl-045: dim_date непрерывен — ${rows} дней подряд, 2025 год полный (${y2025})`);
}

// mdl-046, mdl-047: грязный слой. Четыре написания одной точки и четыре
// формата даты — это и есть предмет обоих заданий.
{
  const spellings = runSql(`
    SELECT COUNT(DISTINCT customer_name) FROM staging_raw_sellout
    WHERE REPLACE(TRIM(customer_name), 'Itiba', 'Ichiba') = 'Ichiba #1026'`);
  const formats = runSql(`
    SELECT COUNT(*) FROM (SELECT DISTINCT
      CASE WHEN sale_date LIKE '__.__.____' THEN 'dot'
           WHEN sale_date LIKE '__/__/____' THEN 'slash'
           WHEN length(sale_date) = 10 THEN 'iso' ELSE 'short' END AS f FROM staging_raw_sellout)`);
  const rows = runSql(`SELECT COUNT(*) FROM staging_raw_sellout`);
  if (spellings.rows[0][0] !== 4) {
    fail('mdl-046', `в задании «Ichiba #1026» в четырёх написаниях, в базе их ${spellings.rows[0][0]}`);
  } else console.log(`  ok   mdl-046: одна точка в ${spellings.rows[0][0]} написаниях (романизация × пробелы)`);
  if (formats.rows[0][0] !== 4 || rows.rows[0][0] !== 3110) {
    fail('mdl-047', `в задании 4 формата даты на 3110 строк, в базе ${formats.rows[0][0]} на ${rows.rows[0][0]}`);
  } else console.log(`  ok   mdl-047: ${formats.rows[0][0]} формата даты на ${rows.rows[0][0]} строк грязного слоя`);
}

// mdl-052, mdl-056: распределение строк факта по годам и свежий хвост —
// на них стоят и расчёт доли обновления, и разбор про обрезание истории.
{
  const r = runSql(`
    SELECT
      (SELECT COUNT(*) FROM fact_sellout WHERE week_start LIKE '2024%') AS y24,
      (SELECT COUNT(*) FROM fact_sellout WHERE week_start LIKE '2025%') AS y25,
      (SELECT COUNT(*) FROM fact_sellout WHERE week_start LIKE '2026%') AS y26,
      (SELECT COUNT(*) FROM fact_sellout WHERE week_start >= '2026-04-01') AS fresh,
      (SELECT COUNT(*) FROM fact_sellout) AS total`);
  const [y24, y25, y26, fresh, total] = r.rows[0];
  if (y24 !== 48391 || y25 !== 47122 || y26 !== 22936 || fresh !== 11353 || total !== 118449) {
    fail('mdl-052', `в заданиях 48 391 / 47 122 / 22 936, свежих 11 353 из 118 449; в базе ${y24} / ${y25} / ${y26}, ${fresh} из ${total}`);
  } else console.log(`  ok   mdl-052: по годам ${y24} / ${y25} / ${y26}, свежих ${fresh} (${Math.round((fresh / total) * 100)}%)`);
  if (total - y24 !== 70058) fail('mdl-056', `в задании после удаления 2024 остаётся 70 058 строк, в базе ${total - y24}`);
}

// mdl-055, mdl-057: кардинальность колонок факта. Весь разбор про размер
// модели держится на том, что sellout_id уникален, а product_id — нет.
{
  const r = runSql(`
    SELECT
      (SELECT COUNT(DISTINCT sellout_id) FROM fact_sellout) AS ids,
      (SELECT COUNT(DISTINCT revenue) FROM fact_sellout) AS rev,
      (SELECT COUNT(DISTINCT units) FROM fact_sellout) AS units,
      (SELECT COUNT(DISTINCT week_start) FROM fact_sellout) AS weeks,
      (SELECT COUNT(DISTINCT product_id) FROM fact_sellout) AS prods,
      (SELECT COUNT(*) FROM fact_sellout) AS total`);
  const [ids, rev, units, weeks, prods, total] = r.rows[0];
  const quoted = { ids: 118449, rev: 86389, units: 154, weeks: 131, prods: 47 };
  const actual = { ids, rev, units, weeks, prods };
  const bad = Object.keys(quoted).filter((k) => quoted[k] !== actual[k]);
  if (bad.length) {
    fail('mdl-055', `кардинальность разошлась: ${bad.map((k) => `${k} ${quoted[k]}→${actual[k]}`).join(', ')}`);
  } else console.log(`  ok   mdl-055/057: кардинальность sellout_id ${ids} / revenue ${rev} / units ${units} / week ${weeks} / product ${prods}`);
  // Задание держится на том, что суррогатный ключ уникален, а значит несжимаем:
  // появится в нём хоть один повтор — и «самая дорогая колонка» перестанет быть таковой.
  if (ids !== total) fail('mdl-055', `sellout_id перестал быть уникальным: ${ids} значений на ${total} строк`);
  if (!(rev < total)) fail('mdl-057', 'revenue стала уникальной — разбор про округление копеек потерял смысл');
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
             SUM(CASE WHEN p.brand = 'Aqualis' THEN f.units ELSE 0 END) AS water,
             SUM(CASE WHEN p.brand = 'Fruvia' THEN f.units ELSE 0 END) AS juice
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
    const quotedTop = [['Haruka Yamada', 8, 5042930], ['Sakura Tanaka', 2, 4616915], ['Miyu Hayashi', 7, 4335843]];
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
      WHERE r.rep_name = 'Sakura Tanaka' AND f.week_start BETWEEN '2025-01-01' AND '2025-12-31'
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
      SELECT CASE WHEN p.brand = 'Krosti' THEN c.channel ELSE 'other_mt' END AS grp,
             ${period('2025-07-07', '2025-08-04')} AS before,
             ${period('2025-08-11', '2025-09-08')} AS during
      FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id
      JOIN dim_customer c ON c.customer_id = f.customer_id
      WHERE p.division = 'FMCG' AND (p.brand = 'Krosti' OR c.channel = 'modern_trade')
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

  // dom-052 и dom-053 пересказывают декомпозицию «Nettora» из dom-043 словами —
  // те же четыре числа, но уже внутри текста письма, где их никто не пересчитает.
  {
    const r = runSql(`
      SELECT d.year, ROUND(SUM(f.revenue)) AS revenue, COUNT(DISTINCT f.customer_id) AS outlets
      FROM fact_sellout f
      JOIN dim_product p ON p.product_id = f.product_id
      JOIN dim_date d ON d.date_id = f.week_start
      WHERE p.brand = 'Nettora' AND d.quarter = 2 AND d.year IN (2024, 2026)
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

    // Те же три выручки процитированы во вводной карточке трека (intro.idea) —
    // на них держится её главный тезис «расходятся вопросы, а не расчёты».
    // Число в тексте становится условием сборки независимо от того, в каком
    // поле пака оно лежит: до этой проверки текст вне задания гейт не видел
    // вовсе и мог разойтись с датасетом молча.
    const introIdea = readPack('domain-core').intro?.idea ?? '';
    const expectedMln = [sellOut, sellIn[0], sellIn[2]].map((v) => (v / 1e6).toFixed(1));
    const missing = expectedMln.filter((m) => !introIdea.includes(m));
    if (missing.length) {
      fail('domain-core', `intro.idea не цитирует выручки ${missing.join(' / ')} млн — карточка разошлась с датасетом`);
    } else {
      console.log(`  ok   domain-core intro: три выручки ${expectedMln.join(' / ')} млн совпадают с датасетом`);
    }
  }
}

// --- python-core: утверждения о движке, которые называет разбор.
//
// Проверка эталонов выше запускает только write/fill. Код predict-заданий гейт
// не исполняет вовсе — у них нет эталона, — а между тем почти каждый разбор
// в этом паке утверждает что-то о поведении pandas: какой будет текст ошибки,
// сколько строк вернёт transform, что сделает groupby с пропущенным ключом.
// Такое утверждение ничем не отличается от числа в тексте: человек выполнит его
// ровно на том движке, о котором оно говорит (история sql-027, §2 ROADMAP).
// Блок поставлен при финальной вычитке разборов python-пака; каждая строка
// здесь — предложение, которое сейчас напечатано в explain или в варианте ответа.
{
  const py = async (code) => (await runPython(code)).rows[0][0];
  const pyExpect = async (id, code, want, note) => {
    const got = await py(code);
    if (String(got) !== want) fail(id, `${note}: ожидалось «${want}», движок дал «${got}»`);
    else console.log(`  ok   ${id}: ${note}`);
  };

  // py-002: вариант ответа цитирует сообщение ValueError дословно.
  await pyExpect('py-002', `
try:
    dim_product[(dim_product['list_price'] > 100) and (dim_product['brand'] == 'Aqualis')]
    result = 'ошибки не было'
except Exception as e:
    result = f'{type(e).__name__}: {str(e).split(".")[0]}'
`, 'ValueError: The truth value of a Series is ambiguous', 'and на Series по-прежнему даёт процитированный ValueError');

  // py-001: разбор объясняет, что без скобок первым вычисляется 'Aqualis' & (...)
  // и это именно TypeError, а не тихо неверная выборка.
  await pyExpect('py-001', `
try:
    dim_product[dim_product['brand'] == 'Aqualis' & (dim_product['list_price'] > 100)]
    result = 'ошибки не было'
except Exception as e:
    result = type(e).__name__
`, 'TypeError', 'приоритет & над == по-прежнему роняет фильтр без скобок');

  // py-006: вариант ответа разделяет два случая — чего у Series нет вовсе
  // и что у неё есть, но не принимает columns=.
  await pyExpect('py-006', `
s = dim_product['brand']
try:
    s.rename(columns={'brand': 'b'})
    ren = 'ошибки не было'
except Exception as e:
    ren = type(e).__name__
result = f"{hasattr(s, 'columns')}/{hasattr(s, 'merge')}/{ren}"
`, 'False/False/TypeError', 'у Series нет .columns и .merge, а .rename(columns=) даёт TypeError');

  // py-014: разбор объясняет, почему именованная агрегация лучше списка функций.
  // Оба утверждения о списке — падение на всей таблице и двухуровневый заголовок
  // при сужении до колонки — проверяются, а не принимаются на веру.
  await pyExpect('py-014', `
try:
    dim_product.groupby('division').agg(['count', 'mean'])
    whole = 'ошибки не было'
except Exception as e:
    whole = type(e).__name__
multi = isinstance(dim_product.groupby('division')[['list_price']].agg(['count', 'mean']).columns, pd.MultiIndex)
result = f'{whole}/{multi}'
`, 'TypeError/True', 'список функций падает на всей таблице и даёт MultiIndex на колонке');

  // py-017: разбор называет масштаб таблицы и обещает проверку «сумма долей
  // равна числу дистрибьюторов». Второе — не украшение, а способ поймать
  // подмену transform на agg: при неверной группировке доли не сойдутся в 12.
  await pyExpect('py-017', `
r = fact_sellin.copy()
r['line_share'] = r['net_amount'] / r.groupby('distributor_id')['net_amount'].transform('sum')
result = f"{len(fact_sellin)}/{fact_sellin['distributor_id'].nunique()}/{round(float(r['line_share'].sum()), 6)}"
`, '15362/12/12.0', 'в fact_sellin 15 362 строки и 12 дистрибьюторов, сумма долей = 12');

  // py-018: разбор утверждает, что выравнивание по индексу оставляет ровно
  // 47 посчитанных строк и 118 402 пустых. Это опаснее сплошного NaN, и обе
  // цифры названы в тексте.
  await pyExpect('py-018', `
a = fact_sellout.groupby('product_id')['units'].sum()
r = fact_sellout['units'] / a
result = f'{int(r.notna().sum())}/{int(r.isna().sum())}'
`, '47/118402', 'деление с разными индексами даёт 47 чисел и 118 402 NaN');

  // py-026: разбор называет границы разброса по брендам — шесть позиций
  // у самых широких линеек и четыре у самых узких, с поимённым перечислением.
  await pyExpect('py-026', `
vc = dim_product['brand'].value_counts()
top = sorted(vc[vc == vc.max()].index)
bottom = sorted(vc[vc == vc.min()].index)
result = f"{len(vc)}/{vc.max()}:{','.join(top)}/{vc.min()}:{','.join(bottom)}"
`, '9/6:Aqualis,Fruvia,Krosti,Milvara/4:Gastrivo,Rhinolar', 'девять брендов, от шести позиций до четырёх — совпадает с разбором');

  // py-030: вариант ответа цитирует сообщение ValueError дословно.
  await pyExpect('py-030', `
m = fact_sellout.merge(dim_product[['product_id', 'brand']], on='product_id')
m['week_start'] = pd.to_datetime(m['week_start'])
m['quarter'] = m['week_start'].dt.to_period('Q').astype(str)
sub = m[(m['week_start'] >= '2025-01-01') & (m['week_start'] < '2026-01-01')]
try:
    sub.pivot(index='brand', columns='quarter', values='revenue')
    result = 'ошибки не было'
except Exception as e:
    result = f'{type(e).__name__}: {e}'
`, 'ValueError: Index contains duplicate entries, cannot reshape', 'pivot на сырых данных по-прежнему падает процитированным сообщением');

  // py-032: числа 58 → 29 напечатаны в условии и в разборе.
  await pyExpect('py-032', `
result = f"{staging_raw_sellout['sku_code'].nunique()}/{staging_raw_sellout['sku_code'].str.upper().nunique()}"
`, '58/29', 'приведение регистра схлопывает 58 кодов в 29');

  /*
   * py-033 держится на разрыве между двумя числами: строковая нормализация
   * даёт 52, а реальных точек 45. Разрыв создают семь точек сети, записанных
   * в двух системах романизации, — его и проверяем отдельно. Совпади эти числа,
   * задание начнёт учить обратному тому, ради чего написано: что регистр
   * и пробелы — это ещё не нормализация сущности.
   */
  await pyExpect('py-033', `
s = staging_raw_sellout['customer_name']
canon = s.str.strip().str.upper().str.replace('ITIBA', 'ICHIBA', regex=False)
result = f"{s.nunique()}/{s.str.strip().str.upper().nunique()}/{canon.nunique()}"
`, '104/52/45', 'нормализация формы даёт 52 при 45 настоящих точках');

  // py-038: разбор держится на том, что pandas предупреждает, но не падает,
  // и колонка не появляется. В pandas 3 с copy-on-write это поведение меняется —
  // проверка обязана уронить сборку в день обновления Pyodide, а не после.
  await pyExpect('py-038', `
import warnings
df = fact_sellout.copy()
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter('always')
    df[df['revenue'] > 3000]['flag'] = 1
    kinds = sorted({type(x.message).__name__ for x in w})
result = f"{'flag' in df.columns}/{','.join(kinds)}"
`, 'False/SettingWithCopyWarning', 'цепочечное присваивание молча теряет колонку и даёт SettingWithCopyWarning');
}

// --- Песочница: вопросы к данным (src/content/sandbox.json).
//
// У песочницы нет эталона по замыслу — это единственный экран, где никто
// не проверяет ответ. Но список вопросов делает собственное утверждение,
// и оно проверяемо: «на этих данных у каждого есть ответ» (так и написано
// в i18n, sandbox.questionsIntro). Вопрос, явление которого из датасета ушло,
// хуже отсутствующего вопроса — человек ищет то, чего нет, и винит себя,
// а гейта, который бы это поймал, у песочницы иначе нет вовсе.
//
// Поэтому у каждого вопроса здесь проба: запрос плюс утверждение о его
// результате. Пробы живут в гейте, а не рядом с вопросами, чтобы готовый
// ответ не уезжал в бандл экрана, который принципиально ничего не проверяет.
// Связь «вопрос ↔ проба» проверяется в обе стороны: незакрытый вопрос —
// это дыра, осиротевшая проба — след удалённого вопроса. Захардкоженный
// список уже однажды промолчал о непроверенном файле (см. блок переводов
// ниже), и здесь та же ловушка обезврежена явной сверкой ключей.
//
// Утверждения намеренно сформулированы отношениями («вчетверо дороже»,
// «выбивается втрое»), а не точными числами: числа генератор двигает
// при каждой правке сюжета, а явление обязано пережить правку — иначе
// вопрос перестаёт иметь смысл. Точное число закрепляется только там,
// где оно процитировано в тексте вопроса.
{
  const { questions } = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'sandbox.json'), 'utf8'));
  const GROUPS = new Set(['overview', 'trend', 'distribution', 'stock', 'promo', 'people', 'quality']);
  const schemaTables = new Set(
    JSON.parse(readFileSync(path.join(root, 'public', 'data', 'schema.json'), 'utf8')).tables.map((t) => t.table)
  );

  /** Одна строка результата пробы — почти все утверждения ниже смотрят ровно на неё. */
  const one = (sql) => runSql(sql).rows[0];

  /**
   * Проба: запрос доказывает, что явление, о котором спрашивает вопрос,
   * ещё в данных. Возвращает строку для лога при успехе или строку с причиной
   * при провале — так в логе видно не «ok», а что именно сейчас в датасете.
   */
  const probes = {
    'q-portfolio': () => {
      const rows = runSql(`
        SELECT p.division, COUNT(DISTINCT p.brand) brands, COUNT(DISTINCT p.product_id) skus, SUM(s.revenue) rev
        FROM fact_sellout s JOIN dim_product p ON p.product_id = s.product_id
        GROUP BY p.division ORDER BY p.division`).rows;
      if (rows.length !== 2) return { ok: false, why: `дивизионов ${rows.length}, а вопрос обещает два (FMCG и Pharma)` };
      if (rows.some((r) => r[1] < 2 || r[3] <= 0)) return { ok: false, why: 'в дивизионе меньше двух брендов или нет выручки' };
      return { ok: true, note: rows.map((r) => `${r[0]}: ${r[1]} брендов, ${r[2]} SKU`).join('; ') };
    },

    'q-channels': () => {
      const rows = runSql(`
        SELECT c.channel, SUM(s.revenue) rev FROM fact_sellout s
        JOIN dim_customer c ON c.customer_id = s.customer_id
        GROUP BY c.channel ORDER BY rev DESC`).rows;
      if (rows.length < 3) return { ok: false, why: `каналов ${rows.length} — раскладывать нечего` };
      const gap = rows[0][1] / rows[1][1];
      if (gap < 1.3) return { ok: false, why: `лидер отрывается всего в ${gap.toFixed(2)} раза — «насколько он отрывается» потеряло смысл` };
      return { ok: true, note: `лидер ${rows[0][0]}, отрыв от второго в ${gap.toFixed(2)} раза` };
    },

    'q-abc': () => {
      const rows = runSql(`
        SELECT p.product_id, SUM(s.revenue) rev FROM fact_sellout s
        JOIN dim_product p ON p.product_id = s.product_id GROUP BY p.product_id ORDER BY rev DESC`).rows;
      const total = rows.reduce((a, r) => a + r[1], 0);
      const topCount = Math.ceil(rows.length * 0.2);
      const topShare = (rows.slice(0, topCount).reduce((a, r) => a + r[1], 0) / total) * 100;
      // Весь смысл вопроса в том, что правило НЕ выполняется. Если верхние 20%
      // однажды дадут около 80%, проверять станет нечего — вопрос выродится
      // в подтверждение общего места, и его надо будет переписать.
      if (topShare > 60) return { ok: false, why: `верхние 20% SKU дают ${topShare.toFixed(1)}% — правило 20/80 почти выполняется, проверять нечего` };
      return { ok: true, note: `верхние 20% SKU (${topCount} из ${rows.length}) дают ${topShare.toFixed(1)}% выручки, а не 80%` };
    },

    'q-water-season': () => {
      const rows = runSql(`
        SELECT CAST(strftime('%m', s.week_start) AS INT) mon, SUM(s.units) units
        FROM fact_sellout s JOIN dim_product p ON p.product_id = s.product_id
        WHERE p.subcategory = 'Water' GROUP BY mon ORDER BY units DESC`).rows;
      if (rows.length !== 12) return { ok: false, why: `месяцев с продажами воды ${rows.length}, а не 12` };
      const ratio = rows[0][1] / rows[rows.length - 1][1];
      if (ratio < 2) return { ok: false, why: `пик выше провала лишь в ${ratio.toFixed(1)} раза — сезона, о котором спрашивают, больше нет` };
      return { ok: true, note: `пик месяц ${rows[0][0]}, провал месяц ${rows[rows.length - 1][0]}, разрыв в ${ratio.toFixed(1)} раза` };
    },

    'q-false-correlation': () => {
      // Премиса вопроса — «в 2025 году шли почти синхронно». Считаем Пирсона
      // по месяцам прямо в SQL: без высокой сырой корреляции вопрос начинается
      // с неправды. Год назван в тексте не для красоты — на всём периоде связь
      // заметно слабее (0.69 против 0.84), и «почти синхронно» было бы
      // преувеличением. Тот же 2025-й стоит в dom-049, где эта корреляция
      // разбирается заданием: ответы треков обязаны сходиться.
      const rho = (from, to) =>
        one(`
          WITH m AS (
            SELECT strftime('%Y-%m', s.week_start) ym,
              SUM(CASE WHEN p.subcategory = 'Water' THEN s.units ELSE 0 END) w,
              SUM(CASE WHEN p.subcategory = 'Juices' THEN s.units ELSE 0 END) j
            FROM fact_sellout s JOIN dim_product p ON p.product_id = s.product_id
            WHERE s.week_start BETWEEN '${from}' AND '${to}' GROUP BY ym)
          SELECT COUNT(*), (AVG(w * j) - AVG(w) * AVG(j)) /
                 (SQRT(AVG(w * w) - AVG(w) * AVG(w)) * SQRT(AVG(j * j) - AVG(j) * AVG(j))) FROM m`);
      const [months, r2025] = rho('2025-01-01', '2025-12-31');
      if (months !== 12) return { ok: false, why: `в 2025 году ${months} месяцев с продажами, а не 12` };
      if (r2025 === null || r2025 < 0.75) return { ok: false, why: `корреляция воды и сока за 2025 год ${r2025}, вопрос же говорит «шли почти синхронно»` };
      // Вопрос отправляет сравнить с тем же месяцем 2024 года — этот год
      // обязан быть в данных целиком, иначе вторая половина вопроса повисает.
      const [months2024] = rho('2024-01-01', '2024-12-31');
      if (months2024 !== 12) return { ok: false, why: `в 2024 году ${months2024} месяцев — сравнивать «с тем же месяцем прошлого года» не с чем` };
      return { ok: true, note: `корреляция воды и сока за 2025 год ${r2025.toFixed(2)}, 2024-й для сравнения на месте` };
    },

    'q-launch': () => {
      const newest = one(`SELECT product_name, launch_date FROM dim_product ORDER BY launch_date DESC LIMIT 1`);
      if (newest[0] !== 'Vitanor Forte x30') return { ok: false, why: `самая новая позиция теперь «${newest[0]}», а вопрос называет «Vitanor Forte x30»` };
      if (!String(newest[1]).startsWith('2025-09')) return { ok: false, why: `дата вывода ${newest[1]}, а вопрос говорит «осенью 2025-го»` };
      const pts = runSql(`
        SELECT strftime('%Y-%m', s.week_start) m, COUNT(DISTINCT s.customer_id) pts
        FROM fact_sellout s JOIN dim_product p ON p.product_id = s.product_id
        WHERE p.product_name = 'Vitanor Forte x30' GROUP BY m ORDER BY m`).rows;
      if (pts.length < 6) return { ok: false, why: `месяцев продаж новинки ${pts.length} — раскатку не разглядеть` };
      const first = pts[0][1];
      const last = pts[pts.length - 1][1];
      if (!(last >= first * 3)) return { ok: false, why: `точек было ${first}, стало ${last} — раскатки, о которой спрашивают, не видно` };
      return { ok: true, note: `новинка разошлась с ${first} точек до ${last} за ${pts.length} месяцев` };
    },

    'q-brand-drop': () => {
      const r = one(`
        WITH b AS (
          SELECT strftime('%Y-%m', s.week_start) m, COUNT(DISTINCT s.customer_id) pts, SUM(s.revenue) rev
          FROM fact_sellout s JOIN dim_product p ON p.product_id = s.product_id
          WHERE p.brand = 'Nettora' AND s.units > 0 GROUP BY m)
        SELECT (SELECT pts FROM b ORDER BY m LIMIT 1), (SELECT rev FROM b ORDER BY m LIMIT 1),
               (SELECT pts FROM b ORDER BY m DESC LIMIT 1), (SELECT rev FROM b ORDER BY m DESC LIMIT 1)`);
      const [pts0, rev0, pts1, rev1] = r;
      const dropPts = 1 - pts1 / pts0;
      if (dropPts < 0.3) return { ok: false, why: `точек «Nettora» стало меньше лишь на ${(dropPts * 100).toFixed(0)}% — падения, о котором спрашивают, нет` };
      // Главное в вопросе — что выручка на точку при этом не упала, иначе
      // разложение «точки против объёма» перестаёт что-либо различать.
      const perPoint0 = rev0 / pts0;
      const perPoint1 = rev1 / pts1;
      if (perPoint1 <= perPoint0) return { ok: false, why: 'выручка на точку тоже упала — разложение «меньше точек или меньше берут» больше не даёт контраста' };
      return {
        ok: true,
        note: `точек ${pts0} → ${pts1} (−${(dropPts * 100).toFixed(0)}%), выручка на точку ${perPoint0.toFixed(0)} → ${perPoint1.toFixed(0)} (растёт)`,
      };
    },

    'q-chain-weight': () => {
      const rows = runSql(`
        SELECT c.chain_name, COUNT(DISTINCT c.customer_id) pts, SUM(s.revenue) rev
        FROM fact_sellout s JOIN dim_customer c ON c.customer_id = s.customer_id
        WHERE c.chain_name IN ('Bazario', 'Prima') GROUP BY c.chain_name`).rows;
      const wb = rows.find((r) => r[0] === 'Bazario');
      const dixy = rows.find((r) => r[0] === 'Prima');
      if (!wb || !dixy) return { ok: false, why: 'в данных больше нет сети Bazario или «Prima», а вопрос называет обе' };
      if (wb[1] !== 3 || dixy[1] !== 5) return { ok: false, why: `точек Bazario ${wb[1]} и «Prima» ${dixy[1]}, а в тексте вопроса три и пять` };
      if (!(wb[2] > dixy[2] * 3)) return { ok: false, why: 'выручка Bazario больше не превышает «Prima» втрое — парадокс «меньше точек, больше денег» исчез' };
      return { ok: true, note: `Bazario ${wb[1]} точки / ${Math.round(wb[2])}, «Prima» ${dixy[1]} точек / ${Math.round(dixy[2])}` };
    },

    'q-weeks-of-supply': () => {
      const rows = runSql(`
        WITH so AS (
          SELECT c.served_by_distributor_id d, SUM(s.units) / 26.0 weekly
          FROM fact_sellout s JOIN dim_customer c ON c.customer_id = s.customer_id
          WHERE s.week_start >= '2026-01-01' GROUP BY d),
        st AS (
          SELECT distributor_id d, SUM(units_on_hand) onhand FROM fact_stock
          WHERE month_start = (SELECT MAX(month_start) FROM fact_stock) GROUP BY d)
        SELECT dc.customer_name, st.onhand / so.weekly weeks FROM st
        JOIN so ON so.d = st.d JOIN dim_customer dc ON dc.customer_id = st.d
        ORDER BY weeks DESC`).rows;
      if (rows.length < 5) return { ok: false, why: `дистрибьюторов с остатком и продажами ${rows.length} — сравнивать не с чем` };
      const median = rows[Math.floor(rows.length / 2)][1];
      const ratio = rows[0][1] / median;
      if (ratio < 2.5) return { ok: false, why: `худший запас всего в ${ratio.toFixed(1)} раза выше медианы — «выбивается из общего ряда» больше не про кого` };
      return { ok: true, note: `${rows[0][0]}: ${rows[0][1].toFixed(1)} недели против медианных ${median.toFixed(1)}` };
    },

    'q-sellin-sellout': () => {
      const rows = runSql(`
        WITH si AS (SELECT strftime('%Y', month_start) || '-' || ((CAST(strftime('%m', month_start) AS INT) + 2) / 3) q, SUM(units) u FROM fact_sellin GROUP BY q),
             so AS (SELECT strftime('%Y', week_start) || '-' || ((CAST(strftime('%m', week_start) AS INT) + 2) / 3) q, SUM(units) u FROM fact_sellout GROUP BY q)
        SELECT si.q, 1.0 * si.u / so.u ratio FROM si JOIN so ON so.q = si.q ORDER BY ratio DESC`).rows;
      if (rows.length < 8) return { ok: false, why: `кварталов с обеими метриками ${rows.length} — ряда не выйдет` };
      const worst = rows[0];
      const rest = rows.slice(1);
      if (worst[1] < 1.15) return { ok: false, why: `максимальное расхождение отгрузки и полки ${worst[1].toFixed(2)} — квартала, где они разошлись, больше нет` };
      const restMax = Math.max(...rest.map((r) => r[1]));
      if (restMax > 1.12) return { ok: false, why: `остальные кварталы тоже разъехались (до ${restMax.toFixed(2)}) — искомый перестал быть единственным` };
      return { ok: true, note: `${worst[0]}: отгрузка / полка = ${worst[1].toFixed(2)} против ${restMax.toFixed(2)} в остальных` };
    },

    'q-promo-cost': () => {
      // Глубина скидки берётся ровно та, что названа в тексте (30%), а не
      // «самая глубокая»: у бренда есть и 33% (механика 2+1), и на первом
      // заходе проба сверяла именно её — то есть подтверждала не то, о чём
      // спрашивает вопрос. Числа в тексте закрепляются буквально, иначе
      // проверка зелёная, а человек смотрит на другую акцию.
      const rows = runSql(`
        SELECT pr.discount_pct, SUM(s.units) units, SUM(s.revenue) / SUM(s.units) per_unit
        FROM fact_sellout s JOIN dim_promo pr ON pr.promo_id = s.promo_id
        WHERE pr.brand = 'Milvara' GROUP BY pr.discount_pct`).rows;
      const deep = rows.find((r) => r[0] === 30);
      const shallow = rows.filter((r) => r[0] <= 10).sort((a, b) => b[1] - a[1])[0];
      if (!deep) return { ok: false, why: 'у «Milvara» больше нет акции со скидкой 30%, которую называет вопрос' };
      if (!shallow) return { ok: false, why: 'у «Milvara» не осталось акции с мелкой скидкой — сравнивать глубокую не с чем' };
      if (!(deep[1] > shallow[1] * 3)) return { ok: false, why: `глубокая скидка дала ${deep[1]} штук против ${shallow[1]} — «кратного роста в штуках» больше нет` };
      const base = one(`
        SELECT SUM(s.revenue) / SUM(s.units) FROM fact_sellout s
        JOIN dim_product p ON p.product_id = s.product_id
        WHERE p.brand = 'Milvara' AND s.promo_id IS NULL`)[0];
      // Порядок «глубокая < мелкая < без промо» и есть ответ на вопрос
      // «во что обошёлся объём»: каждая ступень скидки срезает выручку со штуки.
      if (!(deep[2] < shallow[2] && shallow[2] < base)) {
        return { ok: false, why: `выручка на штуку ${deep[2].toFixed(1)} / ${shallow[2].toFixed(1)} / ${base.toFixed(1)} — ступени «глубокая, мелкая, без промо» перестали идти по возрастанию` };
      }
      return { ok: true, note: `на штуку: ${deep[2].toFixed(1)} при 30%, ${shallow[2].toFixed(1)} при ${shallow[0]}%, ${base.toFixed(1)} без промо` };
    },

    'q-price-mix': () => {
      const rows = runSql(`
        SELECT c.channel, AVG(s.avg_price) price, COUNT(DISTINCT p.division) divisions
        FROM fact_sellout s JOIN dim_customer c ON c.customer_id = s.customer_id
        JOIN dim_product p ON p.product_id = s.product_id GROUP BY c.channel`).rows;
      const pharmacy = rows.find((r) => r[0] === 'pharmacy');
      const mt = rows.find((r) => r[0] === 'modern_trade');
      if (!pharmacy || !mt) return { ok: false, why: 'в данных нет канала pharmacy или modern_trade, о которых спрашивает вопрос' };
      const ratio = pharmacy[1] / mt[1];
      // «Почти вчетверо» стоит в тексте вопроса — это цитата числа, и она
      // закрепляется, а не проверяется на глаз.
      if (ratio < 3.4 || ratio > 4.6) return { ok: false, why: `аптека дороже сетей в ${ratio.toFixed(2)} раза, а вопрос говорит «почти вчетверо»` };
      // Разгадка вопроса — что в аптеке продаётся только один дивизион.
      if (pharmacy[2] !== 1) return { ok: false, why: `в аптечном канале теперь ${pharmacy[2]} дивизиона — разгадка «дело не в цене, а в ассортименте» пропала` };
      return { ok: true, note: `аптека ${pharmacy[1].toFixed(0)} против сетей ${mt[1].toFixed(0)} (в ${ratio.toFixed(2)} раза), в аптеке один дивизион` };
    },

    'q-target-hit': () => {
      const reps = one(`SELECT COUNT(DISTINCT rep_id) FROM fact_target WHERE month_start >= '2026-01-01'`)[0];
      if (reps !== 25) return { ok: false, why: `представителей с планом ${reps}, а вопрос называет 25` };
      const rows = runSql(`
        WITH f AS (
          SELECT c.rep_id, p.division, date(s.week_start, 'start of month') m, SUM(s.revenue) rev
          FROM fact_sellout s JOIN dim_customer c ON c.customer_id = s.customer_id
          JOIN dim_product p ON p.product_id = s.product_id GROUP BY c.rep_id, p.division, m)
        SELECT t.month_start, COUNT(*) plans, SUM(CASE WHEN f.rev >= t.target_revenue THEN 1 ELSE 0 END) hit
        FROM fact_target t LEFT JOIN f ON f.rep_id = t.rep_id AND f.division = t.division AND f.m = t.month_start
        WHERE t.month_start >= '2026-01-01' GROUP BY t.month_start ORDER BY t.month_start`).rows;
      const worstRate = Math.max(...rows.map((r) => r[2] / r[1]));
      // Суть вопроса — что план не выполняет подавляющее большинство и это
      // говорит о нормативе, а не о людях. Если план начнёт выполнять половина,
      // вывод перестанет следовать из данных.
      if (worstRate > 0.5) return { ok: false, why: `в лучший месяц план выполнили ${(worstRate * 100).toFixed(0)}% — перекос норматива исчез` };
      return { ok: true, note: `план выполняют от ${Math.min(...rows.map((r) => r[2]))} до ${Math.max(...rows.map((r) => r[2]))} из 25 в месяц` };
    },

    'q-per-capita': () => {
      const rows = runSql(`
        SELECT r.region_name, r.population, SUM(s.revenue) / r.population per_capita
        FROM fact_sellout s JOIN dim_customer c ON c.customer_id = s.customer_id
        JOIN dim_region r ON r.region_id = c.region_id GROUP BY r.region_id ORDER BY per_capita DESC`).rows;
      if (rows.length < 8) return { ok: false, why: `регионов с продажами ${rows.length} — рейтинг не построить` };
      const biggest = [...rows].sort((a, b) => b[1] - a[1])[0];
      const rank = rows.findIndex((r) => r[0] === biggest[0]) + 1;
      // Вопрос построен на том, что ожидание «крупнейшие регионы сверху»
      // не подтверждается. Если крупнейший однажды окажется в верхних строках,
      // спрашивать «предположите, почему складывается именно так» будет не о чем.
      if (rank <= rows.length / 2) return { ok: false, why: `самый населённый регион (${biggest[0]}) стоит ${rank}-м из ${rows.length} — контринтуитивности, ради которой вопрос написан, больше нет` };
      return { ok: true, note: `самый населённый регион (${biggest[0]}) — ${rank}-й из ${rows.length} по выручке на душу` };
    },

    'q-dirty-export': () => {
      const r = one(`
        SELECT (SELECT COUNT(*) FROM staging_raw_sellout) total,
               (SELECT COUNT(*) FROM staging_raw_sellout r LEFT JOIN dim_product p ON p.sku_code = r.sku_code WHERE p.sku_code IS NULL) unmatched,
               (SELECT COUNT(*) FROM staging_raw_sellout WHERE revenue LIKE '%,%') comma,
               (SELECT COUNT(*) FROM staging_raw_sellout WHERE sale_date LIKE '__.__.____') dotted,
               (SELECT COUNT(*) FROM staging_raw_sellout WHERE customer_name <> TRIM(customer_name)) padded`);
      const [total, unmatched, comma, dotted, padded] = r;
      if (!(unmatched > 0)) return { ok: false, why: 'выгрузка полностью сходится с dim_product — считать «сколько строк не находит пару» нечего' };
      if (!(comma > 0 && dotted > 0 && padded > 0)) return { ok: false, why: `грязь ушла из выгрузки: запятых ${comma}, дат через точку ${dotted}, строк с пробелами ${padded}` };
      /*
       * Ловушка вопроса — в том, что несовпадение объясняется регистром
       * и лечится приведением к нему, а не потерянными товарами. Проверяем
       * обе половины: строки без пары есть, и после UPPER их не остаётся.
       * Провал второй половины означал бы, что часть кодов не находит пару
       * по другой причине, — и «разберитесь почему» вело бы не туда.
       */
      const byUpper = one(`
        SELECT COUNT(*) FROM staging_raw_sellout r
        LEFT JOIN dim_product p ON UPPER(p.sku_code) = UPPER(r.sku_code) WHERE p.sku_code IS NULL`)[0];
      if (byUpper !== 0) return { ok: false, why: `после приведения регистра без пары остаются ${byUpper} строк — причина расхождения уже не только в регистре` };
      return { ok: true, note: `${unmatched} из ${total} строк не находят пару по регистру, после UPPER не остаётся ни одной` };
    },
  };

  const ids = questions.map((q) => q.id);
  if (new Set(ids).size !== ids.length) fail('sandbox', 'дублирующиеся id вопросов');

  for (const q of questions) {
    if (!GROUPS.has(q.group)) fail(q.id, `неизвестная группа «${q.group}»`);
    for (const table of q.tables) {
      if (!schemaTables.has(table)) fail(q.id, `вопрос отсылает к таблице «${table}», которой нет в schema.json`);
    }
    for (const locale of ['ru', 'en']) {
      const text = q[locale];
      if (!text?.title || !text?.question) fail(q.id, `нет заголовка или текста на локали ${locale}`);
      else if (text.question.length < 60) fail(q.id, `текст на ${locale} короче 60 символов — это заголовок, а не постановка задачи`);
    }
    // Таблицы вопроса должны хотя бы упоминаться в его пробе: иначе проба
    // проверяет одно, а человека посылают смотреть в другое место.
    const probe = probes[q.id];
    if (!probe) {
      fail(q.id, 'у вопроса нет пробы в verify-content.mjs — некому подтвердить, что ответ на него в данных есть');
      continue;
    }
    const res = probe();
    if (!res.ok) fail(q.id, res.why);
    else console.log(`  ok   ${q.id}: ${res.note}`);
  }

  for (const id of Object.keys(probes)) {
    if (!ids.includes(id)) fail('sandbox', `проба «${id}» не соответствует ни одному вопросу — вопрос удалили, а проверку забыли`);
  }

  if (!failed) console.log(`  ok   песочница: ${questions.length} вопросов, у каждого проба на датасете`);
}

// --- Онбординг: один вопрос — три ответа (src/content/tools-compare.json).
//
// Карточка на экране «С чего начать» показывает новичку один и тот же вопрос,
// решённый в SQL, в pandas и мерой DAX. Утверждение карточки сформулировано
// прямо в её тексте: данные одни, инструменты разные, **ответы обязаны
// сойтись**. Здесь оно и проверяется — единственным честным способом:
// оба исполнимых фрагмента прогоняются теми же исполнителями, что и эталоны
// заданий, и результаты сверяются между собой.
//
// Без этого блока три фрагмента были бы единственным местом в приложении,
// где код живёт на честном слове. Эталон задания падает вместе с базой,
// число в разборе сверяется с датасетом, вопрос песочницы подтверждается
// пробой — а код, показанный на первом экране, тихо протух бы при первой
// правке генератора, и именно у того читателя, которому не с чем сверить.
//
// **Эталона у карточки нет намеренно, и это не дыра, а суть проверки:**
// правильного ответа мы не знаем и не обязаны знать — важно, что два разных
// движка на одних данных приходят к одному. Захардкодить сюда ожидаемые
// девять брендов значило бы завести третий источник правды рядом с датасетом.
//
// У DAX исполнителя нет и не будет — движок закрытый, в браузер не переносится.
// Проверяется ровно это: фрагмент помечен runnable: false и сам говорит,
// почему. Асимметрия названа вслух в тексте карточки, а не оставлена
// читателю в качестве упражнения.
{
  const compare = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'tools-compare.json'), 'utf8'));
  const byTrack = new Map(compare.answers.map((a) => [a.track, a]));

  for (const locale of ['ru', 'en']) {
    if (!compare.question?.[locale]) fail('tools-compare', `нет текста вопроса на локали ${locale}`);
  }
  for (const a of compare.answers) {
    for (const locale of ['ru', 'en']) {
      if (!a.note?.[locale]) fail('tools-compare', `${a.track}: нет пояснения на локали ${locale}`);
    }
    // Пояснения локализованы, а `code` — одна строка на обе локали, и это
    // честно ровно до тех пор, пока в нём нет естественного языка. Проверка
    // появилась по следу реального дефекта: DAX-фрагмент нёс три строки
    // русских комментариев, и в английской локали карточка показывала
    // английский заголовок, английский вопрос, английское пояснение —
    // и русский код между ними. Комментарий в коде здесь вдобавок всегда
    // дубль: то, что он объясняет, объясняет и `note` под блоком.
    if (/[А-Яа-яЁё]/.test(a.code)) {
      fail(
        'tools-compare',
        `${a.track}: в коде есть кириллица — этот текст не переводится (code один на обе локали), объяснению место в note`
      );
    }
  }

  const sqlAnswer = byTrack.get('sql');
  const pyAnswer = byTrack.get('python');
  const daxAnswer = byTrack.get('model');

  if (!sqlAnswer?.runnable || !pyAnswer?.runnable) {
    fail('tools-compare', 'ответы sql и python обязаны быть исполнимыми — иначе сверять между собой нечего');
  } else {
    const a = runSql(sqlAnswer.code);
    const b = await runPython(pyAnswer.code);
    if (!a.rows.length) fail('tools-compare', 'sql-фрагмент вернул пустоту');
    else if (a.rows.length !== b.rows.length) {
      fail('tools-compare', `строк не поровну: sql ${a.rows.length}, pandas ${b.rows.length}`);
    } else if (a.columns.length !== b.columns.length) {
      fail('tools-compare', `колонок не поровну: sql ${a.columns.join(', ')}, pandas ${b.columns.join(', ')}`);
    } else {
      // Сверка по порядку: оба фрагмента сортируют явно, и порядок строк —
      // часть ответа на вопрос («от большего к меньшему»). Допуск в рубль —
      // не небрежность: сумма float складывается движками в разном порядке,
      // и расхождение в последнем разряде говорит о порядке сложения,
      // а не о разной цифре. Всё, что больше, — уже разные ответы.
      let mismatch = null;
      for (let i = 0; i < a.rows.length && !mismatch; i++) {
        for (let j = 0; j < a.columns.length; j++) {
          const x = a.rows[i][j];
          const y = b.rows[i][j];
          const same = typeof x === 'number' && typeof y === 'number' ? Math.abs(x - y) <= 1 : x === y;
          if (!same) mismatch = `строка ${i + 1}, колонка ${a.columns[j]}: sql «${x}», pandas «${y}»`;
        }
      }
      if (mismatch) fail('tools-compare', `ответы разошлись — ${mismatch}`);
      else {
        console.log(
          `  ok   онбординг: sql и pandas на одном вопросе дают одно и то же (${a.rows.length} строк, колонки ${a.columns.join(', ')})`
        );
      }
    }
  }

  if (daxAnswer?.runnable !== false) {
    fail('tools-compare', 'фрагмент DAX помечен исполнимым, хотя движка DAX не существует ни в браузере, ни в гейте');
  } else if (!/DAX/.test(daxAnswer.note.ru) && !/DAX/.test(daxAnswer.note.en)) {
    // Непроверяемый фрагмент обязан сам сказать, что он непроверяемый:
    // иначе читатель, привыкший к «здесь всё выполняется», решит, что
    // и эта формула прогнана по данным.
    fail('tools-compare', 'пояснение к DAX не называет причину, по которой его нельзя выполнить');
  } else {
    console.log('  ok   онбординг: фрагмент DAX помечен неисполнимым и объясняет почему');
  }
}

// --- Переводы на английский: параллельные файлы `<pack>.en.json`
// и `<lessons>.en.json` (см. PackTranslation/LessonTranslation в content/types.ts).
// Перевод накладывается на русский пак по id в рантайме (content/index.ts,
// applyTranslation) — здесь не пересчитывается сам мёрдж, а ловится то же,
// что ловит validateTranslation() в рантайме, но на этапе сборки, без запуска
// приложения: перевод, ссылающийся на несуществующий id, или расходящееся
// число вариантов predict-задания.
{
  const checkPackTranslation = (packId) => {
    const enPath = path.join(root, 'src', 'content', 'packs', `${packId}.en.json`);
    if (!existsSync(enPath)) return;
    const pack = readPack(packId);
    const tr = JSON.parse(readFileSync(enPath, 'utf8'));
    const skillIds = new Set(pack.skills.map((s) => s.id));
    const taskById = new Map(pack.tasks.map((t) => [t.id, t]));
    let ok = true;
    for (const s of tr.skills ?? []) {
      if (!skillIds.has(s.id)) {
        fail(`${packId}.en`, `скилл перевода ${s.id} не существует в паке ${packId}`);
        ok = false;
      }
    }
    for (const t of tr.tasks ?? []) {
      const orig = taskById.get(t.id);
      if (!orig) {
        fail(`${packId}.en`, `задание перевода ${t.id} не существует в паке ${packId}`);
        ok = false;
        continue;
      }
      if (t.options && (orig.options ?? []).length !== t.options.length) {
        fail(`${packId}.en`, `у задания ${t.id} ${t.options.length} переведённых вариантов вместо ${(orig.options ?? []).length}`);
        ok = false;
      }
    }
    if (ok) {
      console.log(
        `  ok   ${packId}.en: перевод покрывает ${(tr.skills ?? []).length} из ${pack.skills.length} скиллов и ${(tr.tasks ?? []).length} из ${pack.tasks.length} заданий, все id существуют`
      );
    }
  };

  const checkLessonsTranslation = (lessonsFileId) => {
    const enPath = path.join(root, 'src', 'content', 'packs', `${lessonsFileId}.en.json`);
    if (!existsSync(enPath)) return;
    const { lessons } = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', `${lessonsFileId}.json`), 'utf8'));
    const { lessons: lessonsEn } = JSON.parse(readFileSync(enPath, 'utf8'));
    const skillIds = new Set(lessons.map((l) => l.skill));
    let ok = true;
    for (const l of lessonsEn) {
      if (!skillIds.has(l.skill)) {
        fail(`${lessonsFileId}.en`, `перевод карточки ссылается на несуществующий скилл ${l.skill}`);
        ok = false;
      }
    }
    if (ok) console.log(`  ok   ${lessonsFileId}.en: перевод покрывает ${lessonsEn.length} из ${lessons.length} карточек, все id существуют`);
  };

  // Список файлов перевода берётся с диска, а не задаётся руками. Захардкоженный
  // список уже один раз промолчал: `model-lessons.en.json` появился, а в перечне
  // его не было — гейт четыре карточки tier 4 просто не проверял и отрапортовал
  // «в порядке». Тот же класс дефекта, что «новый трек надо подключать к плееру
  // вручную»: пропуск не виден, потому что проверка не падает, а исчезает.
  const packsDir = path.join(root, 'src', 'content', 'packs');
  const enFiles = readdirSync(packsDir).filter((f) => f.endsWith('.en.json'));
  for (const f of enFiles) {
    const id = f.replace(/\.en\.json$/, '');
    if (id.endsWith('-lessons')) checkLessonsTranslation(id);
    else checkPackTranslation(id);
  }
  console.log(`  ok   файлов перевода на диске: ${enFiles.length}, все проверены`);
}

console.log(failed ? `\n${failed} проблем в контенте` : '\nКонтент в порядке');
process.exit(failed ? 1 : 0);
