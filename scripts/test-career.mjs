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
    `npx tsc "${path.join(root, 'src/career/readiness.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  const { AXES, skillLevel, axisReading, roleReadiness, RETAINED_INTERVAL_DAYS } = await import(
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
  const sig = (reps, lapses, lastGrade, intervalDays) => ({ reps, lapses, lastGrade, intervalDays });
  assertEq('навык: нет состояния → 0', skillLevel(undefined), 0);
  assertEq('навык: одна попытка, провал → 0', skillLevel(sig(1, 1, 1, 0)), 0);
  assertEq('навык: решён с подсказкой → 1', skillLevel(sig(1, 0, 3, 2)), 1);
  assertEq('навык: без подсказки, но в тот же присест (интервал 2) → 1', skillLevel(sig(3, 0, 4, 2)), 1);
  assertEq('навык: без подсказки и после паузы → 2', skillLevel(sig(2, 0, 4, RETAINED_INTERVAL_DAYS)), 2);
  assertEq('навык: интервал есть, но последняя с подсказкой → 1', skillLevel(sig(3, 0, 3, 13)), 1);
  assertEq('навык: провал после успехов держит единицу', skillLevel(sig(4, 1, 1, 0)), 1);

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

  // Настоящие данные на пустом прогрессе: ни одна роль не готова.
  const real = career.roles.map((r) => roleReadiness(r, career.axes, {}, evidence, none).band);
  assertEq('настоящие роли на пустом прогрессе → start', [...new Set(real)], ['start']);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.log(`\n${failed} проверок упало`);
  process.exit(1);
}
console.log('\ntest:career — всё зелёное');
