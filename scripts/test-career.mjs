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
    `npx tsc "${path.join(root, 'src/career/readiness.ts')}" "${path.join(root, 'src/career/quiz.ts')}" ` +
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

  // ── Самопроверка: банк ──────────────────────────────────────────────────
  const Q = await import(pathToFileURL(path.join(outDir, 'career', 'quiz.js')).href);
  const bank = readJson('src/content/career-quiz.json').questions;
  /** Сколько вопросов на ось как минимум. Фаза 4b поднимет до 15: подход берёт 10, второй должен быть из новых. */
  const MIN_BANK = 5;
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
  for (const e of evidence) if (e.source !== undefined && e.source !== 'quiz') fail(`отметка ${e.id}`, `source ${e.source}`);

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
