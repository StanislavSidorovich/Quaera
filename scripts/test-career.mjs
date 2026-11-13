/**
 * Гейт экрана «Путь к роли»: данные (src/content/career.json) и формула
 * готовности (src/career/readiness.ts).
 *
 * Данные. Привязка навыков к осям — мост между 78 навыками паков и ролями,
 * и рвётся он молча: новый навык без оси просто не войдёт в готовность,
 * переименованный — даст ось, которую нельзя закрыть. Поэтому проверка
 * в обе стороны: каждый навык паков стоит хотя бы в одной оси, каждый id
 * в career.json существует. Плюс достижимость: цель роли выше того, что
 * тренажёр способен засчитать по оси, обязана иметь отметку-доказательство
 * нужного уровня, иначе полоса «можно откликаться» для роли недостижима.
 *
 * Текст. Обе локали заполнены, тире нет ни в одной (правило публичных
 * текстов семьи), в английских строках нет кириллицы, имени школы нет.
 *
 * Формула. Фикстуры на каждое правило readiness.ts, и у каждого правила
 * есть отрицательная сторона: гейт, проверяющий только «уровень вырос»,
 * прошёл бы на формуле, которая растит его всегда.
 *
 * Самопроверка (src/content/career-quiz.json, src/career/quiz.ts). Банк:
 * ровно один верный вариант из четырёх, разбор у каждого, обе локали,
 * без тире и имени школы, и длина не выдаёт ответ: верный вариант не самый
 * длинный в большинстве вопросов оси и не длиннее полутора средних
 * дистракторов. Тест-разумный человек угадывает по длине раньше, чем
 * по смыслу, и тогда зачёт меряет не то. Правило зачёта: подход 8 из 10,
 * второй сданный не раньше чем через три дня, один подход в день.
 *
 * Запуск: npm run test:career (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-career-'));
const readJson = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const assertEq = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(name, `ожидалось ${e}, получено ${a}`);
  else ok(name);
};
const assertTrue = (name, cond, detail = '') => {
  if (!cond) fail(name, detail || 'условие ложно');
  else ok(name);
};

try {
  execSync(
    `npx tsc "${path.join(root, 'src/career/readiness.ts')}" "${path.join(root, 'src/career/quiz.ts')}" "${path.join(root, 'src/career/wrote.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  const { isCodeTask, wroteSkills } = await import(pathToFileURL(path.join(outDir, 'career', 'wrote.js')).href);
  const { AXES, skillLevel, legacySkillLevel, axisReading, roleReadiness, overdueSkills, pacePlan, labDoneEvidence, RETAINED_INTERVAL_DAYS } = await import(
    pathToFileURL(path.join(outDir, 'career', 'readiness.js')).href
  );

  // ── Данные ──────────────────────────────────────────────────────────────
  const career = readJson('src/content/career.json');
  const packSkills = new Map();
  for (const track of ['sql', 'model', 'python', 'domain']) {
    for (const s of readJson(`src/content/packs/${track}-core.json`).skills) packSkills.set(s.id, s);
  }
  const familyApps = new Set(readJson('family/family.json').apps.map((a) => a.id));

  assertEq('оси: ровно восемь, в порядке AXES', career.axes.map((a) => a.id), AXES);

  const unknown = [];
  const used = new Set();
  for (const a of career.axes) {
    for (const id of a.skills) {
      used.add(id);
      if (!packSkills.has(id)) unknown.push(`${a.id}:${id}`);
    }
    if (new Set(a.skills).size !== a.skills.length) fail(`ось ${a.id}`, 'навык повторён внутри оси');
    if (![1, 2].includes(a.trainerMax)) fail(`ось ${a.id}`, `trainerMax ${a.trainerMax}: тренажёр засчитывает 1 или 2`);
  }
  assertEq('оси: все навыки существуют в паках', unknown, []);

  // Г1 (2026-11-13): уровень 2 по тренажёру только с кодом. Ось может иметь trainerMax 2,
  // лишь если 70% её навыков закрываются заданием, где код набирают (write); иначе двойка недостижима.
  const writeSkillIds = new Set();
  for (const track of ['sql', 'model', 'python', 'domain']) {
    for (const tk of readJson(`src/content/packs/${track}-core.json`).tasks) {
      if (!isCodeTask(tk)) continue;
      writeSkillIds.add(tk.skill);
      for (const s of tk.alsoTrains ?? []) writeSkillIds.add(s);
    }
  }
  const unreachable2 = career.axes
    .filter((a) => a.trainerMax >= 2 && a.skills.filter((id) => writeSkillIds.has(id)).length < Math.ceil(a.skills.length * 0.7))
    .map((a) => a.id);
  assertEq('оси: trainerMax 2 только там, где хватает навыков с write-заданиями', unreachable2, []);
  assertEq('оси: у BI и моделирования потолок тренажёра 1 (Г1)', [career.axes.find((a) => a.id === 'bi').trainerMax, career.axes.find((a) => a.id === 'modeling').trainerMax], [1, 1]);
  assertEq(
    'оси: строка «сборка в Lab» (ceilingLab) стоит только у осей с потолком 1',
    career.axes.filter((a) => a.ceilingLab && a.trainerMax >= 2).map((a) => a.id),
    []
  );
  assertEq('оси: ceilingLab у BI и моделирования', career.axes.filter((a) => a.ceilingLab).map((a) => a.id), ['modeling', 'bi']);
  assertEq('оси: legacyMax не ниже trainerMax', career.axes.filter((a) => a.legacyMax !== undefined && a.legacyMax < a.trainerMax).map((a) => a.id), []);
  // Какие виды заданий считаются «написал сам».
  assertEq('wrote: write считается', isCodeTask({ id: 'a', skill: 's', mode: 'write' }), true);
  for (const m of ['fill', 'predict', 'order', 'spot', 'waves', 'relate']) assertEq(`wrote: ${m} не считается`, isCodeTask({ id: 'a', skill: 's', mode: m }), false);
  assertEq('wrote: многошаг с расчётом write считается', isCodeTask({ id: 'a', skill: 's', mode: 'write', steps: [{ kind: 'compute', mode: 'write' }, { kind: 'interpret' }] }), true);
  assertEq('wrote: расчётный шаг fill не считается', isCodeTask({ id: 'a', skill: 's', mode: 'fill', steps: [{ kind: 'compute', mode: 'fill' }, { kind: 'interpret' }] }), false);
  const wt = [{ id: 't1', skill: 'a', alsoTrains: ['b'], mode: 'write' }, { id: 't2', skill: 'c', mode: 'predict' }, { id: 't3', skill: 'd', mode: 'write' }];
  assertEq('wrote: навык с решённым write и его alsoTrains; нерешённое и выбор не считаются', [...wroteSkills(wt, (id) => id !== 't3')].sort(), ['a', 'b']);
  assertEq(
    'оси: каждый навык паков стоит хотя бы в одной оси',
    [...packSkills.keys()].filter((id) => !used.has(id)),
    []
  );

  const roleIds = career.roles.map((r) => r.id);
  assertTrue('роли: id уникальны', new Set(roleIds).size === roleIds.length);
  const evidence = career.evidence;
  assertTrue('отметки: id уникальны', new Set(evidence.map((e) => e.id)).size === evidence.length);
  for (const e of evidence) {
    if (!AXES.includes(e.axis)) fail(`отметка ${e.id}`, `ось ${e.axis} не существует`);
    if (![1, 2, 3].includes(e.level)) fail(`отметка ${e.id}`, `уровень ${e.level}`);
  }

  for (const r of career.roles) {
    const keys = Object.keys(r.targets).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...AXES].sort())) fail(`роль ${r.id}`, `цели не по восьми осям: ${keys}`);
    for (const [axis, t] of Object.entries(r.targets)) {
      if (![0, 1, 2, 3].includes(t)) fail(`роль ${r.id}`, `цель ${axis}=${t}`);
      const def = career.axes.find((a) => a.id === axis);
      if (def && t > def.trainerMax && !evidence.some((e) => e.axis === axis && e.level >= t)) {
        fail(`роль ${r.id}`, `цель ${axis}=${t} выше потолка тренажёра (${def.trainerMax}), а отметки такого уровня нет`);
      }
    }
    if (!r.core.length) fail(`роль ${r.id}`, 'пустое ядро');
    for (const a of r.core) if (!(r.targets[a] > 0)) fail(`роль ${r.id}`, `ось ядра ${a} без цели`);
  }
  ok('роли: цели по восьми осям, ядро с целями, цели достижимы');

  // Цели, принятые по вакансиям (ROLE-TARGETS, 2026-11-07): гейт держит именно эти числа,
  // чтобы случайная правка career.json не откатила разбор молча.
  const tg = (id) => career.roles.find((r) => r.id === id).targets;
  assertEq('цели: DA bi 2, engineering 1', [tg('da').bi, tg('da').engineering], [2, 1]);
  assertEq('цели: AE bi 2, business 2', [tg('ae').bi, tg('ae').business], [2, 2]);
  assertEq('цели: BA process остаётся 2', tg('ba').process, 2);
  assertEq('цели: sql у AE остаётся 3 (глубину вакансии не меряют)', tg('ae').sql, 3);
  // Решения хаба 2026-11-08 по 142 вакансиям (ROLE-TARGETS, разделы 10-12).
  assertEq('цели: DA python остаётся 2, stats 1', [tg('da').python, tg('da').stats], [2, 1]);
  assertEq('цели: DE business 1', tg('de').business, 1);
  assertEq('цели: gov modeling 1, bi 1', [tg('gov').modeling, tg('gov').bi], [1, 1]);
  assertEq('цели: BA modeling 0', tg('ba').modeling, 0);
  assertEq('цели: DS не тронуты', tg('ds'), { sql: 2, modeling: 0, bi: 0, python: 3, stats: 3, engineering: 1, business: 1, process: 0 });
  assertEq('роли: «мало данных» только у DS', career.roles.filter((r) => r.lowData).map((r) => r.id), ['ds']);

  // Выборка вакансий: число одно, у роли доли, где выборки хватает.
  const vac = career.vacancies;
  assertTrue('вакансии: общее число и порог заданы', Number.isInteger(vac.total) && vac.total > 0 && Number.isInteger(vac.minRoleAds));
  for (const r of career.roles) {
    if (!Number.isInteger(r.ads) || r.ads < 0) fail(`роль ${r.id}`, `ads ${r.ads}`);
    if (r.ads >= vac.minRoleAds && !r.outside) fail(`роль ${r.id}`, 'выборка есть, а долей «вне Quaera» нет');
    for (const k of ['excel', 'english', 'comms']) {
      if (r.outside && !(r.outside[k] >= 0 && r.outside[k] <= r.ads)) fail(`роль ${r.id}`, `outside.${k}=${r.outside[k]} вне 0..${r.ads}`);
    }
  }
  // Спрос по ролям и грейдам: ссылки на подписи существуют, счётчики не больше выборки, малая группа без навыков.
  const askProblems = [];
  for (const r of career.roles) {
    if (!roleIds.includes(r.neighbor) || r.neighbor === r.id) askProblems.push(`${r.id}: соседняя роль ${r.neighbor}`);
    if (r.ask.length < 2 || r.ask.length > 3) askProblems.push(`${r.id}: ask ${r.ask.length}, нужно 2-3`);
    for (const [id, n] of r.ask) {
      if (!vac.skillLabels[id]?.ru || !vac.skillLabels[id]?.en) askProblems.push(`${r.id}: нет подписи ${id}`);
      if (!(n >= 1 && n <= r.ads)) askProblems.push(`${r.id}: ${id}=${n} вне 1..${r.ads}`);
    }
    let sum = 0;
    for (const g of ['entry', 'mid', 'senior']) {
      const cell = r.grades[g];
      if (!cell) { askProblems.push(`${r.id}: нет группы ${g}`); continue; }
      sum += cell.n;
      if (cell.n < vac.minRoleAds && cell.top.length) askProblems.push(`${r.id}/${g}: N=${cell.n} меньше порога, а навыки показаны`);
      for (const [id, n] of cell.top) {
        if (!vac.skillLabels[id]) askProblems.push(`${r.id}/${g}: нет подписи ${id}`);
        if (!(n >= 1 && n <= cell.n)) askProblems.push(`${r.id}/${g}: ${id}=${n} вне 1..${cell.n}`);
      }
    }
    if (sum > r.ads) askProblems.push(`${r.id}: грейды ${sum} больше вакансий роли ${r.ads}`);
  }
  assertEq('вакансии: спрос по ролям и грейдам согласован', askProblems, []);
  assertEq('вакансии: источники складываются в общее число', vac.linkedin + vac.boards, vac.total);
  assertEq('вакансии: подпись источника 142 = 83 + 59', [vac.total, vac.linkedin, vac.boards], [142, 83, 59]);
  assertTrue('вакансии: сумма по ролям не больше общего числа', career.roles.reduce((n, r) => n + r.ads, 0) <= vac.total);
  for (const a of career.axes) if (!a.short?.ru || !a.short?.en) fail(`ось ${a.id}`, 'нет короткого имени для паутинки');
  ok('вакансии и короткие имена осей');

  const stageIds = career.stages.map((s) => s.id);
  assertTrue('этапы: id уникальны', new Set(stageIds).size === stageIds.length);
  for (const s of career.stages) {
    for (const w of s.who) if (!roleIds.includes(w)) fail(`этап ${s.id}`, `роль ${w} не существует`);
    for (const id of s.skills) if (!packSkills.has(id)) fail(`этап ${s.id}`, `навык ${id} не существует`);
    for (const a of s.apps) if (!familyApps.has(a) || a === 'quaera') fail(`этап ${s.id}`, `приложение ${a}`);
    if (!s.who.length || !s.tools.length) fail(`этап ${s.id}`, 'пустые who или tools');
  }
  assertEq(
    'этапы: у каждой роли есть хотя бы один этап',
    roleIds.filter((id) => !career.stages.some((s) => s.who.includes(id))),
    []
  );

  // ── Критерии уровней по осям (docs/career-axis-levels-2026-11.md, раздел 11) ──
  const packTasks = new Set();
  for (const track of ['sql', 'model', 'python', 'domain']) {
    for (const tk of readJson(`src/content/packs/${track}-core.json`).tasks) packTasks.add(tk.id);
  }
  const familyUrls = readJson('family/family.json').apps.map((a) => a.url);
  const KINDS = ['skills', 'tasks', 'app', 'story', 'quiz', 'evidence', 'outside'];
  const levelProblems = [];
  for (const a of career.axes) {
    if (!a.market?.ru || !a.market?.en) levelProblems.push(`${a.id}: нет market`);
    if (!Array.isArray(a.levels) || a.levels.length !== 3 || a.levels.some((l, i) => l.level !== i + 1)) {
      levelProblems.push(`${a.id}: уровни должны идти 1, 2, 3`);
      continue;
    }
    for (const l of a.levels) {
      const where = `${a.id} L${l.level}`;
      if (!l.does?.ru?.trim() || !l.does?.en?.trim()) levelProblems.push(`${where}: нет does`);
      if (!Array.isArray(l.steps) || l.steps.length < 1 || l.steps.length > 3) levelProblems.push(`${where}: шагов ${l.steps?.length}, нужно 1-3`);
      for (const s of l.steps ?? []) {
        if (!KINDS.includes(s.kind)) levelProblems.push(`${where}: kind ${s.kind}`);
        if (!s.text?.ru?.trim() || !s.text?.en?.trim()) levelProblems.push(`${where}: шаг без текста`);
        if (s.kind === 'skills') {
          if (!s.skills?.length) levelProblems.push(`${where}: skills пуст`);
          for (const id of s.skills ?? []) if (!packSkills.has(id)) levelProblems.push(`${where}: навык ${id} не существует`);
        }
        if (s.kind === 'tasks') {
          if (!s.tasks?.length) levelProblems.push(`${where}: tasks пуст`);
          for (const id of s.tasks ?? []) if (!packTasks.has(id)) levelProblems.push(`${where}: задание ${id} не существует`);
        }
        if (s.kind === 'evidence') {
          const ev = evidence.find((e) => e.id === s.evidence);
          if (!ev) levelProblems.push(`${where}: отметка ${s.evidence} не существует`);
          else if (ev.axis !== a.id) levelProblems.push(`${where}: отметка ${s.evidence} стоит на оси ${ev.axis}`);
        }
        if (s.kind === 'app') {
          if (!familyApps.has(s.app) || s.app === 'quaera') levelProblems.push(`${where}: app ${s.app}`);
          if (!s.href || !(familyUrls.some((u) => s.href.startsWith(u)) || s.href.startsWith('https://quaera.app/'))) levelProblems.push(`${where}: href ${s.href}`);
        }
      }
    }
  }
  assertEq('уровни осей: три уровня, шаги и ссылки существуют', levelProblems, []);
  // Каждая отметка оси названа хотя бы в одном шаге этой оси или стоит у самопроверки/Lab: иначе человек не узнает, что она есть.
  const namedEvidence = new Set(career.axes.flatMap((a) => a.levels.flatMap((l) => l.steps.filter((s) => s.kind === 'evidence').map((s) => s.evidence))));
  assertEq(
    'уровни осей: отметки-тройки названы в шагах',
    evidence.filter((e) => e.level === 3 && !namedEvidence.has(e.id)).map((e) => e.id),
    []
  );

  // ── Текст ───────────────────────────────────────────────────────────────
  const texts = [];
  const walk = (node, where) => {
    if (Array.isArray(node)) node.forEach((n, i) => walk(n, `${where}[${i}]`));
    else if (node && typeof node === 'object') {
      if ('ru' in node || 'en' in node) texts.push({ where, ru: node.ru, en: node.en });
      else for (const [k, v] of Object.entries(node)) walk(v, `${where}.${k}`);
    }
  };
  walk(career, 'career');
  const allStrings = JSON.stringify(career);
  assertEq('текст: обе локали заполнены', texts.filter((t) => !t.ru?.trim() || !t.en?.trim()).map((t) => t.where), []);
  assertEq('текст: в английских строках нет кириллицы', texts.filter((t) => /[А-Яа-яЁё]/.test(t.en)).map((t) => t.where), []);
  assertTrue('текст: тире нет', !/[—–]/.test(allStrings), (allStrings.match(/.{20}[—–].{20}/g) || []).join(' | '));
  assertTrue('текст: имени школы нет', !/nova|ims/i.test(allStrings));

  // ── Формула: навык ──────────────────────────────────────────────────────
  const sig = (reps, lapses, lastGrade, intervalDays, wrote = true) => ({ reps, lapses, lastGrade, intervalDays, wrote });
  assertEq('навык: нет состояния → 0', skillLevel(undefined), 0);
  assertEq('навык: одна попытка, провал → 0', skillLevel(sig(1, 1, 1, 0)), 0);
  assertEq('навык: решён с подсказкой → 1', skillLevel(sig(1, 0, 3, 2)), 1);
  assertEq('навык: без подсказки, но в тот же присест (интервал 2) → 1', skillLevel(sig(3, 0, 4, 2)), 1);
  assertEq('навык: без подсказки и после паузы → 2', skillLevel(sig(2, 0, 4, RETAINED_INTERVAL_DAYS)), 2);
  assertEq('навык: интервал есть, но последняя с подсказкой → 1', skillLevel(sig(3, 0, 3, 13)), 1);
  assertEq('навык: провал после успехов держит единицу', skillLevel(sig(4, 1, 1, 0)), 1);
  // Г1: выбор из вариантов выше единицы не поднимает, как бы уверенно ни держался навык.
  assertEq('навык: «уверенно» без решённого write → 1, не 2', skillLevel(sig(2, 0, 4, RETAINED_INTERVAL_DAYS, false)), 1);
  assertEq('навык: поле wrote не задано → 1', skillLevel({ reps: 2, lapses: 0, lastGrade: 4, intervalDays: 13 }), 1);
  assertEq('навык: по старым правилам такой навык был 2', legacySkillLevel(sig(2, 0, 4, RETAINED_INTERVAL_DAYS, false)), 2);

  // ── Формула: ось ────────────────────────────────────────────────────────
  const ten = Array.from({ length: 10 }, (_, i) => `s${i}`);
  const axis = (id, trainerMax, skills = ten) => ({ id, trainerMax, skills });
  const signals = (n2, n1) => {
    const out = {};
    ten.forEach((id, i) => {
      if (i < n2) out[id] = sig(2, 0, 4, 13);
      else if (i < n2 + n1) out[id] = sig(1, 0, 3, 2);
    });
    return out;
  };
  const none = new Set();
  assertEq('ось: 7 из 10 на двойке → 2', axisReading(axis('sql', 2), signals(7, 3), [], none).level, 2);
  assertEq('ось: 6 из 10 на двойке → 1, не 2', axisReading(axis('sql', 2), signals(6, 4), [], none).level, 1);
  assertEq('ось: 6 из 10 тронуты → 0', axisReading(axis('sql', 2), signals(0, 6), [], none).level, 0);
  assertEq('ось: потолок тренажёра режет двойку до единицы', axisReading(axis('stats', 1), signals(10, 0), [], none).level, 1);
  const noWrote = Object.fromEntries(Object.entries(signals(10, 0)).map(([k, v]) => [k, { ...v, wrote: false }]));
  const choiceOnly = axisReading(axis('sql', 2), noWrote, [], none);
  assertEq('ось: все навыки «уверенно» по выбору без кода → 1, не 2', choiceOnly.level, 1);
  assertEq('ось: старые правила дали бы 2, экран пометит', choiceOnly.legacyLevel, 2);
  assertEq('ось: с кодом пометки «было по-старому» нет', axisReading(axis('sql', 2), signals(10, 0), [], none).legacyLevel, undefined);
  assertEq('ось: потолок 1 при старом потолке 2 помечает потерю', axisReading({ ...axis('bi', 1), legacyMax: 2 }, signals(10, 0), [], none).legacyLevel, 2);
  assertEq('ось: потолок 1 без старого потолка метку не ставит', axisReading(axis('stats', 1), signals(10, 0), [], none).legacyLevel, undefined);
  const biReal = career.axes.find((a) => a.id === 'bi');
  const biAllChoice = Object.fromEntries(biReal.skills.map((id) => [id, sig(3, 0, 4, 13, false)]));
  assertEq('BI: все навыки на «уверенно» без кода → потолок 1 (настоящая ось)', axisReading(biReal, biAllChoice, [], none).level, 1);
  const labEv = [{ id: 'lb', axis: 'sql', level: 2, source: 'labDone', labKeys: ['build:x'] }, { id: 'tick', axis: 'sql', level: 2 }];
  assertEq('Lab: возврат даёт 2 при нуле в тренажёре, галочка нет', [axisReading(axis('sql', 2), {}, labEv, new Set(['lb'])).level, axisReading(axis('sql', 2), {}, labEv, new Set(['tick'])).level], [2, 1]);

  const evSql = [{ id: 'm', axis: 'sql', level: 3 }];
  const capped = axisReading(axis('sql', 2), {}, evSql, new Set(['m']));
  assertEq('ось: отметка при нуле в тренажёре поднимает только на ступень', capped.level, 1);
  assertEq('ось: упёршаяся отметка названа', capped.evidenceCapped, ['m']);
  assertEq('ось: отметка при двойке в тренажёре даёт тройку', axisReading(axis('sql', 2), signals(10, 0), evSql, new Set(['m'])).level, 3);
  assertEq('ось: неотмеченная отметка не считается', axisReading(axis('sql', 2), signals(10, 0), evSql, none).level, 2);
  const evEng = [{ id: 'dbt', axis: 'engineering', level: 3 }];
  assertEq('ось: где тренажёр слеп, отметке верим целиком', axisReading(axis('engineering', 1), {}, evEng, new Set(['dbt'])).level, 3);
  assertEq('ось: отметка чужой оси не считается', axisReading(axis('sql', 2), {}, evEng, new Set(['dbt'])).level, 0);

  // ── Формула: роль ───────────────────────────────────────────────────────
  const A = (id, max = 2) => ({ id, trainerMax: max, skills: [`${id}1`, `${id}2`] });
  const axes2 = [A('sql'), A('python'), A('stats', 1)];
  const targets = { sql: 2, modeling: 0, bi: 0, python: 2, stats: 2, engineering: 0, business: 0, process: 0 };
  const role = { id: 'r', targets, core: ['sql', 'python'] };
  const two = sig(2, 0, 4, 13);
  const one = sig(1, 0, 3, 2);
  const ev = [{ id: 'ab', axis: 'stats', level: 2 }, { id: 'proj', axis: 'python', level: 3 }];
  const tier = (id) => (id.endsWith('2') ? 1 : 2);

  const r0 = roleReadiness(role, axes2, {}, ev, none, tier);
  assertEq('роль: пусто → start', r0.band, 'start');
  assertEq('роль: целей столько, сколько осей с target > 0', r0.total, 3);
  assertEq('роль: разрывы начинаются с ядра', r0.gaps.map((g) => g.axis), ['sql', 'python', 'stats']);
  assertEq('роль: навыки разрыва по tier', r0.gaps[0].skills, ['sql2', 'sql1']);
  assertEq('роль: разрыв выше потолка предлагает отметку', r0.gaps[2].evidence, ['ab']);

  const r1 = roleReadiness(role, axes2, { sql1: two, sql2: two, python1: one, python2: one }, ev, new Set(['ab']), tier);
  assertEq('роль: ядро на единице и 2 из 3 целей → prejunior', r1.band, 'prejunior');
  const r1a = roleReadiness(role, axes2, { sql1: two, sql2: two, python1: one, python2: one }, ev, none, tier);
  assertEq('роль: ядро на единице, но 1 из 3 целей → start', r1a.band, 'start');
  const r1b = roleReadiness(role, axes2, { sql1: one, sql2: one, python1: one, python2: one }, ev, none, tier);
  assertEq('роль: ядро на единице, но целей закрыто 0 из 3 → start', r1b.band, 'start');

  const all2 = { sql1: two, sql2: two, python1: two, python2: two, stats1: one, stats2: one };
  const r2 = roleReadiness(role, axes2, all2, ev, none, tier);
  assertEq('роль: ядро закрыто, статистика нет → nearly', r2.band, 'nearly');
  assertEq('роль: ось уже на потолке тренажёра → навыков не предлагает', r2.gaps.find((g) => g.axis === 'stats').skills, []);
  assertEq('роль: ось ниже потолка тренажёра → предлагает навыки до потолка', r0.gaps[2].skills, ['stats2', 'stats1']);

  const r3 = roleReadiness(role, axes2, all2, ev, new Set(['ab']), tier);
  assertEq('роль: все цели, но ни одной тройки → не ready', r3.band, 'nearly');
  const r4 = roleReadiness(role, axes2, all2, ev, new Set(['ab', 'proj']), tier);
  assertEq('роль: все цели и тройка → ready', r4.band, 'ready');
  assertEq('роль: 3 из 3', [r4.met, r4.total], [3, 3]);

  // ── «Ждут повторения», разрыв в навыках, темп к дате ────────────────────
  const NOW = new Date('2026-11-07T12:00:00Z');
  const past = '2026-11-01T00:00:00Z';
  const future = '2026-11-20T00:00:00Z';
  const dueAxis = { id: 'sql', trainerMax: 2, skills: ['a', 'b', 'c', 'd'] };
  const mk = (grade, interval, dueAt) => ({ ...sig(2, 0, grade, interval), dueAt });
  const dueSignals = { a: mk(4, 13, past), b: mk(4, 13, future), c: mk(3, 13, past), d: undefined };
  assertEq('повторение: просрочена только двойка, срок которой прошёл', overdueSkills(dueAxis, dueSignals, NOW), ['a']);
  assertEq('повторение: единица с прошедшим сроком не считается', overdueSkills(dueAxis, { c: mk(3, 13, past) }, NOW), []);
  assertEq('повторение: самая давняя первой', overdueSkills(dueAxis, { a: mk(4, 13, '2026-11-03T00:00:00Z'), b: mk(4, 13, '2026-10-01T00:00:00Z') }, NOW), ['b', 'a']);
  assertEq(
    'повторение: уровень по времени не снижается',
    [axisReading(dueAxis, { a: mk(4, 13, past), b: mk(4, 13, past), c: mk(4, 13, past), d: mk(4, 13, past) }, [], none).level, overdueSkills(dueAxis, { a: mk(4, 13, past), b: mk(4, 13, past), c: mk(4, 13, past), d: mk(4, 13, past) }, NOW).length],
    [2, 4]
  );
  const ax10 = [{ id: 'sql', trainerMax: 2, skills: ten }];
  const roleSql = { id: 'q', targets: { sql: 2, modeling: 0, bi: 0, python: 0, stats: 0, engineering: 0, business: 0, process: 0 }, core: ['sql'] };
  const gapOf = (n2, n1) => roleReadiness(roleSql, ax10, signals(n2, n1), [], none).gaps[0];
  assertEq('разрыв: с нуля до двойки нужно 7 навыков (70% от 10)', gapOf(0, 0).skillsLeft, 7);
  assertEq('разрыв: три уже на двойке, нужно ещё 4', gapOf(3, 0).skillsLeft, 4);
  assertEq('разрыв: единицы до двойки не засчитываются', gapOf(3, 5).skillsLeft, 4);
  const evOnly = roleReadiness({ ...roleSql, targets: { ...roleSql.targets, sql: 3 } }, ax10, signals(10, 0), [], none).gaps[0];
  assertEq('разрыв: выше потолка тренажёра навыков не требуется', evOnly.skillsLeft, 0);
  assertEq('темп: 13,5 дня и 7 навыков → 2 недели, 4 в неделю', pacePlan(7, '2026-11-20', NOW), { weeks: 2, perWeek: 4 });
  assertEq('темп: меньше недели считается неделей', pacePlan(3, '2026-11-09', NOW), { weeks: 1, perWeek: 3 });
  assertEq('темп: прошедшая дата → нет плана', pacePlan(3, '2026-11-01', NOW), null);
  assertEq('темп: нечего закрывать → 0 в неделю', pacePlan(0, '2026-12-01', NOW).perWeek, 0);

  // ── Лестница отметок: «где подтянуть» показывает ближайшую ступень ────────
  const evE = [
    { id: 'q', axis: 'engineering', level: 1, source: 'quiz' },
    { id: 'lab', axis: 'engineering', level: 1, source: 'labDone', labKeys: ['pipeline:x', 'build:x'] },
    { id: 'pipe', axis: 'engineering', level: 2 },
    { id: 'dbt', axis: 'engineering', level: 3 },
  ];
  const roleDe = { id: 'de', targets: { sql: 0, modeling: 0, bi: 0, python: 0, stats: 0, engineering: 3, business: 0, process: 0 }, core: ['engineering'] };
  const gE = roleReadiness(roleDe, [axis('engineering', 1)], {}, evE, none).gaps[0];
  assertEq('разрыв: при нуле первой идёт нижняя ступень, dbt последним', gE.evidence, ['q', 'lab', 'pipe', 'dbt']);
  assertEq('разрыв: ближайшая ступень = имею + 1', gE.step, 1);
  const gE2 = roleReadiness(roleDe, [axis('engineering', 1)], {}, evE, new Set(['q'])).gaps[0];
  assertEq('разрыв: на единице нижние отметки уходят, ближайшая — двойка', [gE2.evidence, gE2.step], [['pipe', 'dbt'], 2]);
  const roleMid = { ...roleDe, targets: { ...roleDe.targets, engineering: 1 } };
  assertEq('разрыв: отметки выше цели не предлагаются', roleReadiness(roleMid, [axis('engineering', 1)], {}, evE, none).gaps[0].evidence, ['q', 'lab']);

  // ── Отметка Lab: приходит из quaera.labDone, галочки нет ─────────────────
  assertEq('Lab: ключ в хранилище → отметка засчитана', labDoneEvidence(evE, { 'pipeline:x': '2026-11-08T00:00:00Z' }), ['lab']);
  assertEq('Lab: пустое хранилище → не засчитана', labDoneEvidence(evE, {}), []);
  assertEq('Lab: второй ключ той же отметки тоже засчитывает', labDoneEvidence(evE, { 'build:x': '2026-11-09T00:00:00Z' }), ['lab']);
  assertEq('Lab: чужой ключ → не засчитана', labDoneEvidence(evE, { 'pipeline:y': 'z' }), []);
  assertEq('Lab: отметка без source не берётся по случайному ключу', labDoneEvidence([{ id: 'p', axis: 'engineering', level: 1, labKeys: ['pipeline:x'] }], { 'pipeline:x': 'z' }), []);
  assertEq('Lab: засчитанная отметка поднимает инженерию до единицы', axisReading(axis('engineering', 1), {}, evE, new Set(labDoneEvidence(evE, { 'pipeline:x': 'z' }))).level, 1);

  // Настоящие данные на пустом прогрессе: ни одна роль не готова.
  const real = career.roles.map((r) => roleReadiness(r, career.axes, {}, evidence, none).band);
  assertEq('настоящие роли на пустом прогрессе → start', [...new Set(real)], ['start']);

  // ── Самопроверка: банк ──────────────────────────────────────────────────
  const Q = await import(pathToFileURL(path.join(outDir, 'career', 'quiz.js')).href);
  const bank = readJson('src/content/career-quiz.json').questions;
  /** Сколько вопросов на ось как минимум. Подход берёт 10, второй должен быть из новых. */
  const MIN_BANK = 15;
  /** Во скольких вопросах оси верный вариант может оказаться самым длинным. */
  const LONGEST_SHARE = 0.4;
  /** Во сколько раз верный вариант может быть длиннее среднего дистрактора. */
  const LENGTH_RATIO = 1.5;

  const quizEvidence = evidence.filter((e) => e.source === 'quiz');
  const quizAxes = quizEvidence.map((e) => e.axis);
  assertEq('отметки-тесты: по одной на статистику, инженерию и процессы', [...quizAxes].sort(), ['engineering', 'process', 'stats']);
  for (const e of quizEvidence) {
    if (e.level !== 1) fail(`отметка ${e.id}`, `тест засчитывает уровень 1, а не ${e.level}`);
    if (career.axes.find((a) => a.id === e.axis).trainerMax !== 1) fail(`отметка ${e.id}`, 'тест только для осей, которые тренажёр не меряет выше единицы');
  }
  for (const e of evidence) {
    if (e.source !== undefined && !['quiz', 'labDone'].includes(e.source)) fail(`отметка ${e.id}`, `source ${e.source}`);
    if (e.source === 'labDone' && !(e.labKeys?.length > 0 && e.labKeys.every((k) => /^(pipeline|build|practice):[a-z0-9-]+$/.test(k)))) fail(`отметка ${e.id}`, 'labDone без labKeys по формату lab-done');
    if (e.labKeys && e.source !== 'labDone') fail(`отметка ${e.id}`, 'labKeys без source labDone');
  }
  const labMark = evidence.find((e) => e.id === 'eng-lab-pipeline');
  assertEq('отметка сборки Lab: инженерия, уровень 1, один ключ (блоки на готовом не считаются сборкой)', labMark && [labMark.axis, labMark.level, labMark.source, labMark.labKeys], ['engineering', 1, 'labDone', ['build:kaiyo-sales']]);
  // Сборка платит за то, что собрано: каждая отметка платит своей осью (обзор Fable 2026-11-11, п. 2).
  for (const [id, axisId, level, key] of [
    ['model-lab-build', 'modeling', 1, 'build:kaiyo-sales'],
    ['bi-lab-build', 'bi', 1, 'build:kaiyo-sales'],
    ['sql-lab-more', 'sql', 2, 'build:kaiyo-sales-more'],
    ['eng-lab-refresh', 'engineering', 2, 'build:kaiyo-sales-refresh'],
  ]) {
    const m = evidence.find((e) => e.id === id);
    assertEq(`отметка сборки Lab ${id}: ось, уровень, ключ возврата`, m && [m.axis, m.level, m.source, m.labKeys], [axisId, level, 'labDone', [key]]);
  }
  assertTrue('самоотметка eng-pipeline заменена отметкой Lab', !evidence.some((e) => e.id === 'eng-pipeline'));
  assertEq('SQL-отметка More весит как практика SQL', evidence.find((e) => e.id === 'sql-lab-more').level, evidence.find((e) => e.id === 'sql-lab-practice').level);
  for (const [id, axisId, key] of [['sql-lab-practice', 'sql', 'practice:sql'], ['py-lab-practice', 'python', 'practice:python']]) {
    const m = evidence.find((e) => e.id === id);
    assertEq(`отметка практики Lab ${id}: ось, уровень 2, ключ возврата`, m && [m.axis, m.level, m.source, m.labKeys], [axisId, 2, 'labDone', [key]]);
  }
  assertEq('отметки-тройки добавлены: biz-requirements и gov-catalog', ['biz-requirements', 'gov-catalog'].map((id) => evidence.find((e) => e.id === id)?.level), [3, 3]);

  assertTrue('банк: id уникальны', new Set(bank.map((q) => q.id)).size === bank.length);
  const loc = ['ru', 'en'];
  const filled = (t) => loc.every((l) => typeof t?.[l] === 'string' && t[l].trim());
  for (const q of bank) {
    const where = `вопрос ${q.id}`;
    if (!quizAxes.includes(q.axis)) fail(where, `ось ${q.axis} без отметки-теста`);
    if (!q.ref?.trim()) fail(where, 'нет ref: откуда вопрос');
    if (!filled(q.q)) fail(where, 'условие не на обеих локалях');
    if (!Array.isArray(q.options) || q.options.length !== 4) {
      fail(where, `вариантов ${q.options?.length}, нужно 4`);
      continue;
    }
    const correct = q.options.filter((o) => o.correct === true).length;
    if (correct !== 1) fail(where, `верных вариантов ${correct}`);
    if (q.options.some((o) => typeof o.correct !== 'boolean')) fail(where, 'correct не true/false');
    q.options.forEach((o, i) => {
      if (!filled(o.text)) fail(where, `вариант ${i}: текст не на обеих локалях`);
      if (!filled(o.why)) fail(where, `вариант ${i}: разбор не на обеих локалях`);
    });
    for (const l of loc) {
      const texts = q.options.map((o) => o.text[l].trim().toLowerCase());
      if (new Set(texts).size !== texts.length) fail(where, `${l}: варианты повторяются`);
      if (texts.some((t) => /все перечисленн|ничего из перечисленн|all of the above|none of the above/.test(t))) {
        fail(where, `${l}: «все/ничего из перечисленного» отвечается без знания предмета`);
      }
    }
  }
  ok('банк: четыре варианта, один верный, разборы на обеих локалях');

  const bankStrings = JSON.stringify(bank);
  assertTrue('банк: тире нет', !/[—–]/.test(bankStrings), (bankStrings.match(/.{20}[—–].{20}/g) || []).join(' | '));
  assertTrue('банк: имени школы нет', !/\bnova\b|\bims\b|universidade/i.test(bankStrings));
  const enCyr = bank.flatMap((q) => [q.q, ...q.options.flatMap((o) => [o.text, o.why])]).filter((t) => /[А-Яа-яЁё]/.test(t.en));
  assertEq('банк: в английских строках нет кириллицы', enCyr.map((t) => t.en.slice(0, 40)), []);

  for (const axisId of quizAxes) {
    const qs = bank.filter((q) => q.axis === axisId);
    if (qs.length < MIN_BANK) fail(`банк ${axisId}`, `${qs.length} вопросов, нужно не меньше ${MIN_BANK}`);
    for (const l of loc) {
      let longest = 0;
      for (const q of qs) {
        const len = q.options.map((o) => o.text[l].length);
        const c = q.options.findIndex((o) => o.correct);
        const others = len.filter((_, i) => i !== c);
        if (len[c] === Math.max(...len)) longest++;
        const ratio = len[c] / (others.reduce((x, y) => x + y, 0) / others.length);
        if (ratio > LENGTH_RATIO) fail(`вопрос ${q.id}`, `${l}: верный вариант в ${ratio.toFixed(2)} раза длиннее среднего дистрактора`);
      }
      if (longest > Math.floor(qs.length * LONGEST_SHARE)) {
        fail(`банк ${axisId}`, `${l}: верный вариант самый длинный в ${longest} из ${qs.length}`);
      }
    }
  }
  ok('банк: длина варианта ответ не выдаёт');

  // ── Самопроверка: правило зачёта ────────────────────────────────────────
  const day = (d, h = 12) => new Date(2026, 9, d, h); // локальное время: «день» человека
  const ids = (n, p = 'q') => Array.from({ length: n }, (_, i) => `${p}${i}`);
  const att = (axis, d, wrongN, asked = ids(10), h = 12) => ({ axis, at: day(d, h).toISOString(), asked, wrong: asked.slice(0, wrongN) });

  assertTrue('подход: 8 из 10 сдан', Q.isPassingAttempt(att('stats', 1, 2)));
  assertTrue('подход: 7 из 10 не сдан', !Q.isPassingAttempt(att('stats', 1, 3)));
  assertTrue('подход: 5 из 5 не зачётный (неполный)', !Q.isPassingAttempt(att('stats', 1, 0, ids(5))));

  const s1 = Q.quizStatus([att('stats', 1, 1)], 'stats', day(1, 20));
  assertEq('зачёт: один сданный → 1 из 2', [s1.passes, s1.passed], [1, false]);
  assertEq('зачёт: второй засчитается через три дня', s1.secondFrom?.toISOString(), new Date(day(1).getTime() + Q.QUIZ_GAP_DAYS * 864e5).toISOString());
  assertEq('зачёт: два сданных с паузой в два дня → ещё 1', Q.quizStatus([att('stats', 1, 0), att('stats', 3, 0)], 'stats', day(3, 20)).passes, 1);
  assertEq('зачёт: два сданных с паузой в три дня → засчитан', Q.quizStatus([att('stats', 1, 0), att('stats', 4, 0)], 'stats', day(4, 20)).passed, true);
  assertEq(
    'зачёт: несданный между ними не мешает',
    Q.quizStatus([att('stats', 1, 0), att('stats', 3, 5), att('stats', 5, 1)], 'stats', day(5, 20)).passed,
    true
  );
  assertEq('зачёт: подходы другой оси не считаются', Q.quizStatus([att('process', 1, 0), att('process', 5, 0)], 'stats', day(5, 20)).passes, 0);
  assertEq('зачёт: два несданных → 0', Q.quizStatus([att('stats', 1, 3), att('stats', 5, 4)], 'stats', day(5, 20)).passes, 0);

  const today = Q.quizStatus([att('stats', 2, 5, ids(10), 9)], 'stats', day(2, 23));
  assertEq('пересдача: сегодня уже был подход → нельзя', today.canStart, false);
  assertEq('пересдача: можно с полуночи', today.nextAt?.toISOString(), new Date(2026, 9, 3).toISOString());
  assertEq('пересдача: вчерашний подход не мешает', Q.quizStatus([att('stats', 2, 5, ids(10), 23)], 'stats', day(3, 0)).canStart, true);
  assertEq('пересдача: подход другой оси не мешает', Q.quizStatus([att('process', 2, 5)], 'stats', day(2, 20)).canStart, true);

  assertEq(
    'отметки-тесты: засчитана только сданная ось',
    Q.passedQuizEvidence(evidence, [att('stats', 1, 0), att('stats', 4, 2), att('process', 1, 0)], day(6)),
    ['stats-quiz']
  );
  const statsAxis = career.axes.find((a) => a.id === 'stats');
  const passedSet = new Set(Q.passedQuizEvidence(evidence, [att('stats', 1, 0), att('stats', 4, 2)], day(6)));
  assertEq('отметки-тесты: сданный тест поднимает пустую ось до 1', axisReading(statsAxis, {}, evidence, passedSet).level, 1);

  // ── Самопроверка: отбор вопросов ────────────────────────────────────────
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const bank15 = ids(15, 'b');
  const firstDraw = Q.drawQuiz(bank15, [], 'stats', rand);
  assertTrue('отбор: 10 разных вопросов', firstDraw.length === Q.QUIZ_SIZE && new Set(firstDraw).size === Q.QUIZ_SIZE);
  const prev = { axis: 'stats', at: day(1).toISOString(), asked: firstDraw, wrong: [firstDraw[3], firstDraw[7]] };
  const second = Q.drawQuiz(bank15, [prev], 'stats', rand);
  assertEq('отбор: ошибки прошлого подхода идут первыми', [...second.slice(0, 2)].sort(), [firstDraw[3], firstDraw[7]].sort());
  assertEq('отбор: дальше все ни разу не заданные', second.slice(2, 7).every((id) => !firstDraw.includes(id)), true);
  assertEq('отбор: банк меньше подхода → весь банк', Q.drawQuiz(ids(5), [], 'stats', rand).length, 5);
  seed = 11;
  const noHistory = Q.drawQuiz(bank15, [], 'stats', rand);
  seed = 11;
  const otherAxis = Q.drawQuiz(bank15, [{ ...prev, axis: 'process' }], 'stats', rand);
  assertEq('отбор: история другой оси на отбор не влияет', otherAxis, noHistory);

  // ── Самопроверка: каноническая форма ────────────────────────────────────
  const many = Array.from({ length: 25 }, (_, i) => att('stats', 1 + i, 0, ids(10)));
  assertEq('хранение: на ось не больше QUIZ_KEEP', Q.normalizeQuiz(many).length, Q.QUIZ_KEEP);
  assertEq('хранение: остаются самые новые', Q.normalizeQuiz(many)[0].at, many[5].at);
  const a1 = att('stats', 1, 1);
  assertEq('хранение: повтор подхода схлопывается', Q.normalizeQuiz([a1, a1, att('process', 1, 1)]).length, 2);
  const A1 = [att('stats', 1, 1), att('process', 2, 0)];
  const B1 = [att('stats', 3, 0), att('process', 2, 0)];
  assertEq('хранение: слияние не зависит от порядка', Q.normalizeQuiz([...A1, ...B1]), Q.normalizeQuiz([...B1, ...A1]));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.log(`\n${failed} проверок упало`);
  process.exit(1);
}
console.log('\ntest:career — всё зелёное');
