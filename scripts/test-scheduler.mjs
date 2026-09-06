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
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera--'));

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

  // --- review: оценка 2 двигает интервал вперёд, а не топчется на месте.
  //
  // Раньше вторая ветка возвращала 2 при входе <= 2, а третья умножала на
  // ease * 0.7 и при низкой лёгкости давала тот же день. Навык, который
  // человек стабильно решает верно со второй попытки, оставался просроченным
  // каждое занятие и вытеснял новый материал: на симуляции человек застревал
  // на пяти навыках из девятнадцати. Проверка на монотонность, а не на числа:
  // числа — вопрос настройки, движение вперёд — инвариант.
  {
    let state = initialSkillState();
    const now = new Date('2026-01-01T00:00:00.000Z');
    let stuck = 0;
    for (let i = 0; i < 12; i++) {
      const before = state.intervalDays;
      state = review(state, 2, now);
      if (i > 0 && state.intervalDays <= before) stuck++;
    }
    assertEq('review(2): интервал растёт на каждом повторении', stuck, 0);
    assertTrue('review(2): за 12 повторений интервал вышел за неделю', state.intervalDays > 7, `получено ${state.intervalDays}`);
  }

  // --- selectSession: у занятия состав, а не приоритет.
  //
  // Синтетика: десять навыков просрочены, пять ещё не тронуты. До правки
  // просроченные забирали все пять слотов, и новый материал не показывался
  // больше никогда — человек упирался в круг из повторений и уходил.
  {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const skills = [];
    const tasks = [];
    for (let i = 0; i < 10; i++) {
      skills.push(skill(`old-${i}`, 1));
      tasks.push(task(`t-old-${i}-a`, `old-${i}`), task(`t-old-${i}-b`, `old-${i}`, 2));
    }
    for (let i = 0; i < 5; i++) {
      skills.push(skill(`new-${i}`, 2));
      tasks.push(task(`t-new-${i}`, `new-${i}`));
    }
    const states = {};
    const solved = new Set();
    for (let i = 0; i < 10; i++) {
      states[`old-${i}`] = {
        ...initialSkillState(),
        reps: 2,
        lastGrade: 2,
        intervalDays: 3,
        lastReviewedAt: new Date(now.getTime() - DAY(4 + i)).toISOString(),
        dueAt: new Date(now.getTime() - DAY(1)).toISOString(),
      };
      solved.add(`t-old-${i}-a`);
    }
    const session = selectSession({ skills, tasks, states, solvedTaskIds: solved, size: 5, now });
    const dueSteps = session.filter((t) => states[t.skill] && new Date(states[t.skill].dueAt) <= now);
    assertTrue('selectSession: повторения не занимают занятие целиком', dueSteps.length <= 3, `повторений ${dueSteps.length} из ${session.length}`);
    assertTrue(
      'selectSession: новый навык показан, хотя просроченного хватило бы на всё занятие',
      session.some((t) => t.skill.startsWith('new-')),
      `состав: ${session.map((t) => t.skill).join(', ')}`
    );
  }

  // --- selectSession: последний шаг — передышка, если ей есть чем быть.
  //
  // Определение выбрано замером: уже решённое задание на навыке, чей срок
  // не наступит и в ближайшие сутки. Не «навык освоен на такую-то оценку»:
  // у отвечающего верно со второй попытки оценка 2 — потолок, и такой фильтр
  // отсекал бы ровно того, ради кого шаг заводится.
  {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const skills = [skill('due-1', 1), skill('due-2', 1), skill('calm', 1), skill('fresh', 2)];
    const tasks = [
      task('t-due-1', 'due-1'),
      task('t-due-2', 'due-2'),
      task('t-calm-a', 'calm'),
      task('t-calm-b', 'calm', 2),
      task('t-fresh', 'fresh'),
    ];
    const states = {
      'due-1': { ...initialSkillState(), reps: 1, lastGrade: 2, intervalDays: 2, dueAt: new Date(now.getTime() - DAY(1)).toISOString(), lastReviewedAt: new Date(now.getTime() - DAY(3)).toISOString() },
      'due-2': { ...initialSkillState(), reps: 1, lastGrade: 2, intervalDays: 2, dueAt: new Date(now.getTime() - DAY(1)).toISOString(), lastReviewedAt: new Date(now.getTime() - DAY(3)).toISOString() },
      calm: { ...initialSkillState(), reps: 2, lastGrade: 2, intervalDays: 9, dueAt: new Date(now.getTime() + DAY(7)).toISOString(), lastReviewedAt: new Date(now.getTime() - DAY(2)).toISOString() },
    };
    const solved = new Set(['t-calm-a']);
    const session = selectSession({ skills, tasks, states, solvedTaskIds: solved, size: 4, now });
    const last = session[session.length - 1];
    assertEq('selectSession: занятие кончается знакомым навыком', last?.skill, 'calm');
    assertTrue('selectSession: передышка — уже решённое задание', solved.has(last?.id), `получено ${last?.id}`);
  }

  // --- selectSession: срок, истекающий сегодня, передышкой не считается.
  //
  // На интервале в один день срок наступает прямо посреди занятия, и такой
  // шаг оказывается повторением впритык, а не отдыхом. Замер поймал это
  // последним шагом, помеченным как повторение.
  {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const skills = [skill('edge', 1), skill('other', 2)];
    const tasks = [task('t-edge-a', 'edge'), task('t-edge-b', 'edge', 2), task('t-other', 'other')];
    const states = {
      edge: { ...initialSkillState(), reps: 1, lastGrade: 2, intervalDays: 1, dueAt: new Date(now.getTime() + 3600000).toISOString(), lastReviewedAt: new Date(now.getTime() - DAY(1)).toISOString() },
    };
    const session = selectSession({ skills, tasks, states, solvedTaskIds: new Set(['t-edge-a']), size: 2, now });
    assertTrue(
      'selectSession: навык со сроком сегодня не ставится передышкой',
      session[session.length - 1]?.id !== 't-edge-a',
      `последний шаг ${session[session.length - 1]?.id}`
    );
  }

  // --- selectSession: передышка идёт по кругу, а не липнет к одному навыку.
  //
  // Две прежние сортировки — по самому дальнему сроку и по освоенности —
  // самоусиливались: побывавший передышкой получал повторение и по обоим
  // ключам уходил вперёд. В замере это дало один и тот же навык восемь
  // занятий подряд. Ключ «кого дольше не было» разворачивает эффект.
  {
    const now = new Date('2026-02-01T00:00:00.000Z');
    const skills = [skill('calm-a', 1), skill('calm-b', 1), skill('fresh', 2)];
    const tasks = [task('t-a', 'calm-a'), task('t-b', 'calm-b'), task('t-fresh', 'fresh')];
    const base = { ...initialSkillState(), reps: 2, lastGrade: 2, intervalDays: 9 };
    const states = {
      'calm-a': { ...base, dueAt: new Date(now.getTime() + DAY(7)).toISOString(), lastReviewedAt: new Date(now.getTime() - DAY(2)).toISOString() },
      'calm-b': { ...base, dueAt: new Date(now.getTime() + DAY(7)).toISOString(), lastReviewedAt: new Date(now.getTime() - DAY(5)).toISOString() },
    };
    const solved = new Set(['t-a', 't-b']);
    const first = selectSession({ skills, tasks, states, solvedTaskIds: solved, size: 2, now });
    assertEq('selectSession: передышкой идёт тот, кого дольше не было', first[first.length - 1]?.skill, 'calm-b');
    const after = { ...states, 'calm-b': { ...states['calm-b'], lastReviewedAt: now.toISOString() } };
    const second = selectSession({ skills, tasks, states: after, solvedTaskIds: solved, size: 2, now });
    assertEq('selectSession: на следующем занятии передышка сменилась', second[second.length - 1]?.skill, 'calm-a');
  }

  // --- selectSession: первому занятию передышку взять неоткуда, и это верно.
  {
    const skills = [skill('a', 1), skill('b', 1), skill('c', 1)];
    const tasks = [task('t-a', 'a'), task('t-b', 'b'), task('t-c', 'c')];
    const session = selectSession({ skills, tasks, states: {}, solvedTaskIds: new Set(), size: 5, maxNewSkills: 3 });
    assertEq('selectSession: первое занятие целиком из нового', session.length, 3);
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
