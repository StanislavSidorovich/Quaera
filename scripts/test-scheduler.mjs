/**
 * Тесты SRS-планировщика.
 *
 * `src/srs/scheduler.ts` — ядро продукта: от него зависит порядок выдачи
 * заданий и интервалы повторения. Логика чистая, без побочных эффектов,
 * поэтому тестируется напрямую, без моков и без браузера.
 *
 * Запуск: npm run test:scheduler (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'querium-scheduler-'));

try {
  execSync(
    `npx tsc "${path.join(root, 'src/srs/scheduler.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );

  const {
    initialSkillState,
    review,
    gradeFromAttempt,
    mastery,
    isDue,
    isUnlocked,
    selectSession,
  } = await import(pathToFileURL(path.join(outDir, 'srs', 'scheduler.js')).href);

  let failed = 0;
  const fail = (name, msg) => {
    console.log(` FAIL  ${name}: ${msg}`);
    failed++;
  };
  const ok = (name) => console.log(` ok    ${name}`);
  const assertEq = (name, actual, expected) => {
    if (actual !== expected) fail(name, `ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
    else ok(name);
  };
  const assertTrue = (name, cond, detail = '') => {
    if (!cond) fail(name, detail || 'условие ложно');
    else ok(name);
  };

  const skill = (id, tier, prereqs = []) => ({ id, track: 'sql', title: id, tier, summary: 'x'.repeat(40), prereqs });
  const task = (id, skillId, level = 1) => ({
    id,
    track: 'sql',
    skill: skillId,
    level,
    mode: 'write',
    title: id,
    brief: 'b',
    goal: 'g',
    hints: ['h'],
    explain: 'e'.repeat(80),
  });

  // --- gradeFromAttempt: оценка выводится из хода решения, не спрашивается.
  assertEq('gradeFromAttempt: неверно → 1', gradeFromAttempt({ correct: false, wrongAttempts: 3, hintsUsed: 0 }), 1);
  assertEq('gradeFromAttempt: верно после ошибок → 2', gradeFromAttempt({ correct: true, wrongAttempts: 1, hintsUsed: 0 }), 2);
  assertEq('gradeFromAttempt: верно с подсказкой → 3', gradeFromAttempt({ correct: true, wrongAttempts: 0, hintsUsed: 2 }), 3);
  assertEq('gradeFromAttempt: верно с первого раза без подсказок → 4', gradeFromAttempt({ correct: true, wrongAttempts: 0, hintsUsed: 0 }), 4);

  // --- review: провал сбрасывает интервал и возвращает в эту же сессию.
  {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const state = review({ ...initialSkillState(), ease: 2.5, intervalDays: 10 }, 1, now);
    assertEq('review(1): интервал сброшен', state.intervalDays, 0);
    assertTrue('review(1): due менее чем через час (вернуть в этой же сессии)', new Date(state.dueAt).getTime() - now.getTime() <= 3600_000);
    assertEq('review(1): лёгкость снижена, не обнулена', state.ease, 2.3);
    assertEq('review(1): lapses увеличен', state.lapses, 1);
  }

  // --- review: первое успешное повторение назначает короткий интервал.
  {
    const s2 = review(initialSkillState(), 2);
    assertEq('review(2) с нуля: интервал 1 день', s2.intervalDays, 1);
    const s4 = review(initialSkillState(), 4);
    assertEq('review(4) с нуля: интервал 2 дня', s4.intervalDays, 2);
  }

  // --- review: интервал растёт с лёгкостью и не превышает 180 дней.
  {
    let state = initialSkillState();
    const now = new Date('2026-01-01T00:00:00.000Z');
    for (let i = 0; i < 20; i++) state = review(state, 4, now);
    assertTrue('review: интервал ограничен 180 днями', state.intervalDays <= 180, `получено ${state.intervalDays}`);
    assertTrue('review: ease ограничен сверху 2.8', state.ease <= 2.8, `получено ${state.ease}`);
  }

  // --- mastery: 0 для нетронутого навыка, растёт с интервалом и оценкой.
  assertEq('mastery: нетронутый навык → 0', mastery(undefined), 0);
  {
    const weak = review(initialSkillState(), 2);
    const strong = review(review(review(initialSkillState(), 4), 4), 4);
    assertTrue('mastery: сильнее после нескольких хороших повторений', mastery(strong) > mastery(weak));
  }

  // --- isDue
  {
    const now = new Date('2026-01-10T00:00:00.000Z');
    assertTrue('isDue: нетронутый навык всегда due', isDue(undefined, now));
    const future = { ...initialSkillState(), dueAt: new Date(now.getTime() + DAY(1)).toISOString() };
    const past = { ...initialSkillState(), dueAt: new Date(now.getTime() - DAY(1)).toISOString() };
    assertTrue('isDue: будущая дата не due', !isDue(future, now));
    assertTrue('isDue: прошедшая дата due', isDue(past, now));
  }
  function DAY(n) {
    return n * 86400000;
  }

  // --- isUnlocked: разблокируется только когда все предпосылки пройдены (grade >= 2).
  {
    const s = skill('b', 1, ['a']);
    assertTrue('isUnlocked: без состояния предпосылки — заблокирован', !isUnlocked(s, {}));
    assertTrue(
      'isUnlocked: предпосылка пройдена с плохой оценкой (1) — всё ещё заблокирован',
      !isUnlocked(s, { a: { ...initialSkillState(), reps: 1, lastGrade: 1 } })
    );
    assertTrue(
      'isUnlocked: предпосылка пройдена с оценкой ≥2 — разблокирован',
      isUnlocked(s, { a: { ...initialSkillState(), reps: 1, lastGrade: 2 } })
    );
  }

  // --- selectSession: просроченные повторения идут раньше нового материала.
  {
    const skills = [skill('a', 1), skill('b', 1)];
    const tasks = [task('t-a1', 'a'), task('t-b1', 'b')];
    const now = new Date('2026-01-10T00:00:00.000Z');
    const states = {
      a: { ...initialSkillState(), reps: 1, lastGrade: 3, dueAt: new Date(now.getTime() - DAY(1)).toISOString() },
    };
    const session = selectSession({ skills, tasks, states, solvedTaskIds: new Set(), size: 1, now });
    assertEq('selectSession: просроченный навык выбран первым', session[0]?.skill, 'a');
  }

  // --- selectSession: новые навыки не превышают maxNewSkills и уважают prereqs.
  {
    const skills = [skill('a', 1), skill('b', 2, ['a']), skill('c', 1)];
    const tasks = [task('t-a1', 'a'), task('t-b1', 'b'), task('t-c1', 'c')];
    const session = selectSession({ skills, tasks, states: {}, solvedTaskIds: new Set(), size: 5, maxNewSkills: 1 });
    assertTrue('selectSession: без прогресса вводится не больше maxNewSkills навыков', session.length <= 1);
    assertTrue(
      'selectSession: первый навык без предпосылок (b не мог быть введён раньше a)',
      session.every((t) => t.skill !== 'b')
    );
  }

  // --- selectSession: пустая программа не падает.
  {
    const session = selectSession({ skills: [], tasks: [], states: {}, solvedTaskIds: new Set() });
    assertEq('selectSession: пустой граф даёт пустую сессию', session.length, 0);
  }

  console.log(`\n${failed ? `FAILED: ${failed}` : 'OK: все проверки планировщика прошли'}`);
  if (failed) process.exitCode = 1;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
