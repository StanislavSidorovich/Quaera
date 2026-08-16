/**
 * Гейт расписания push-напоминаний — свойства, а не примеры.
 *
 * `src/push/schedule.ts` решает, **когда будить человека и с каким числом**.
 * Это единственная часть Web Push, отказ которой не виден: нет разрешения —
 * нет подписки, нет сети — падает запрос, неверный VAPID — push-сервис
 * отвечает 403. А будильник, заведённый не на тот момент, выглядит
 * совершенно нормально до самого момента, когда уведомление приходит
 * не тогда или не приходит вовсе, — и заметить это можно, только прожив
 * с приложением неделю.
 *
 * Примерами это не ловится: состояний прогресса больше, чем можно выписать
 * руками, а интересны как раз редкие сочетания (провал вперемешку с длинными
 * интервалами, навык из хранилища, которого нет в паках). Поэтому основная
 * часть файла проверяет **свойства** на случайных прогрессах, собранных тем же
 * `applyAttempt` + `review`, что работают в приложении.
 *
 * Генератор сеяный: при падении печатается seed, и прогон повторяется ровно
 * тем же набором данных.
 *
 * **Отрицательный прогон обязателен и он здесь есть.** Все свойства ниже
 * имеют вид «если будильник заведён, то он такой-то» — и прошли бы
 * с блеском на генераторе, который не заводит ни одного. Поэтому счётчик
 * заведённых будильников проверяется отдельно, как и то, что корпус вообще
 * содержит оба исхода.
 *
 * Запуск: npm run test:push-schedule (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera--'));

try {
  /*
   * CommonJS по той же причине, что в test-merge.mjs: `push/schedule.ts`
   * импортирует соседние модули в рантайме, а tsc с `moduleResolution
   * bundler` пишет путь без расширения — node в режиме ESM такой путь
   * не резолвит, и падение выглядит как отсутствие файла.
   */
  execSync(
    `npx tsc "${path.join(root, 'src/push/schedule.ts')}" "${path.join(root, 'src/srs/store.ts')}" ` +
      `--target ES2020 --module CommonJS --moduleResolution node ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');

  const { armWake, dueCountAt, MIN_HORIZON_MS } = await import(
    pathToFileURL(path.join(outDir, 'push', 'schedule.js')).href
  );
  const { applyAttempt, emptyProgress } = await import(pathToFileURL(path.join(outDir, 'srs', 'store.js')).href);
  const { review, gradeFromAttempt, DAY_MS } = await import(
    pathToFileURL(path.join(outDir, 'srs', 'scheduler.js')).href
  );

  let failed = 0;
  const fail = (name, msg) => {
    console.log(` FAIL  ${name}: ${msg}`);
    failed++;
  };
  const assertTrue = (name, cond, extra = '') => {
    if (cond) console.log(` ok    ${name}`);
    else fail(name, `ожидалось истинное${extra ? ` — ${extra}` : ''}`);
  };
  const assertEq = (name, got, want) => {
    if (JSON.stringify(got) === JSON.stringify(want)) console.log(` ok    ${name}`);
    else fail(name, `получено ${JSON.stringify(got)}, ожидалось ${JSON.stringify(want)}`);
  };

  const T0 = Date.parse('2026-03-02T19:00:00.000Z');
  const at = (ms) => new Date(T0 + ms);
  const HOUR = 3600000;

  /** Прогресс с явно проставленными сроками — для точечных проверок. */
  const withSkills = (entries) => {
    const p = emptyProgress();
    for (const [id, state] of Object.entries(entries)) {
      p.skills[id] = {
        ease: 2.5,
        intervalDays: 3,
        dueAt: new Date(state.dueMs).toISOString(),
        reps: state.reps ?? 2,
        lapses: 0,
        lastGrade: 3,
        lastReviewedAt: new Date(T0 - DAY_MS).toISOString(),
        ...(state.extra ?? {}),
      };
    }
    return p;
  };

  // --- Точечные проверки: каждая закрывает конкретную ловушку -----------------

  assertEq('пустой прогресс — будить не за чем', armWake(emptyProgress(), ['a', 'b'], at(0)), null);

  {
    // Провал (оценка 1) ставит срок через десять минут — это возврат внутри
    // сессии, адресованный планировщику занятия, а не напоминанию.
    const p = withSkills({ a: { dueMs: T0 + 10 * 60 * 1000 } });
    assertEq('срок внутри сессии (10 минут) будильник не заводит', armWake(p, ['a'], at(0)), null);
  }

  {
    const p = withSkills({ a: { dueMs: T0 - 5 * DAY_MS } });
    assertEq('уже просроченное не будит — это работа бейджа', armWake(p, ['a'], at(0)), null);
  }

  {
    // Ровно на горизонте — уже годится: граница включающая, иначе настоящий
    // суточный интервал мог бы выпасть из-за микросекунды расхождения.
    const p = withSkills({ a: { dueMs: T0 + MIN_HORIZON_MS } });
    assertEq('срок ровно на горизонте будильник заводит', armWake(p, ['a'], at(0))?.dueCount, 1);
  }

  {
    // Главный сюжет: ближний срок игнорируется, а не подтягивается к горизонту.
    const p = withSkills({
      failed: { dueMs: T0 + 10 * 60 * 1000 },
      later: { dueMs: T0 + 3 * DAY_MS },
    });
    const arm = armWake(p, ['failed', 'later'], at(0));
    assertEq('ближний срок не подтягивается — будим на дальний', arm?.wakeAt, new Date(T0 + 3 * DAY_MS).toISOString());
    assertEq('в счёт на момент пробуждения входит и ближний', arm?.dueCount, 2);
  }

  {
    // Незнакомый навык: isDue для него истинно (dueAt = начало эпохи),
    // и без проверки reps «подошло к повторению» означало бы «есть
    // непройденные темы» — то есть было бы верно всегда и для всех.
    const p = withSkills({ fresh: { dueMs: 0, reps: 0 }, real: { dueMs: T0 + 2 * DAY_MS } });
    const arm = armWake(p, ['fresh', 'real'], at(0));
    assertEq('непройденный навык не считается подошедшим', arm?.dueCount, 1);
    assertEq('и не считается в dueCountAt', dueCountAt(p, ['fresh', 'real'], at(10 * DAY_MS)), 1);
  }

  {
    // Навык остался в хранилище, но из паков исчез (переименование, удаление).
    // Счёт по ключам прогресса разбудил бы ради темы, которой в приложении нет.
    const p = withSkills({ ghost: { dueMs: T0 + 2 * DAY_MS }, real: { dueMs: T0 + 4 * DAY_MS } });
    const arm = armWake(p, ['real'], at(0));
    assertEq('навыка нет в паках — он не будит', arm?.wakeAt, new Date(T0 + 4 * DAY_MS).toISOString());
    assertEq('и не попадает в счёт', arm?.dueCount, 1);
  }

  {
    const p = withSkills({ a: { dueMs: T0 + 2 * DAY_MS }, b: { dueMs: T0 + 2 * DAY_MS + HOUR } });
    const arm = armWake(p, ['a', 'b'], at(0));
    assertEq('будим по самому раннему из подходящих', arm?.wakeAt, new Date(T0 + 2 * DAY_MS).toISOString());
    assertEq('позже подходящий сосед в счёт не идёт', arm?.dueCount, 1);
  }

  {
    // Час пробуждения наследуется от часа занятий — пояс не хранится вовсе.
    const evening = Date.parse('2026-03-02T20:30:00.000Z');
    const p = withSkills({ a: { dueMs: evening + 3 * DAY_MS } });
    const arm = armWake(p, ['a'], new Date(evening));
    assertEq('час пробуждения — час занятия', new Date(arm.wakeAt).toISOString().slice(11, 19), '20:30:00');
  }

  {
    const p = withSkills({ a: { dueMs: T0 + 2 * DAY_MS }, b: { dueMs: T0 + 9 * DAY_MS } });
    assertEq('детерминизм: тот же вход — тот же ответ', armWake(p, ['a', 'b'], at(0)), armWake(p, ['a', 'b'], at(0)));
  }

  {
    // Битая дата в хранилище не должна ронять расчёт и не должна будить.
    const p = withSkills({ broken: { dueMs: T0 + 2 * DAY_MS, extra: { dueAt: 'не дата' } }, ok: { dueMs: T0 + 5 * DAY_MS } });
    const arm = armWake(p, ['broken', 'ok'], at(0));
    assertEq('нечитаемый срок пропускается, а не роняет расчёт', arm?.wakeAt, new Date(T0 + 5 * DAY_MS).toISOString());
  }

  // --- Свойства на случайных прогрессах --------------------------------------

  const seed = Number(process.env.SEED ?? 20260816);
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const SKILLS = Array.from({ length: 12 }, (_, i) => `s-${i}`);
  /** Часть навыков живёт только в хранилище — как переименованные в реальном паке. */
  const IN_PACKS = SKILLS.slice(0, 9);

  /** Случайная история занятий: те же applyAttempt и review, что в приложении. */
  const randomProgress = () => {
    let p = emptyProgress();
    const sessions = 1 + Math.floor(rnd() * 14);
    let clock = T0 - Math.floor(rnd() * 60) * DAY_MS;
    for (let i = 0; i < sessions; i++) {
      clock += Math.floor(rnd() * 3) * DAY_MS + Math.floor(rnd() * 8) * HOUR;
      const skill = pick(SKILLS);
      const correct = rnd() > 0.25;
      p = applyAttempt(
        p,
        {
          taskId: `t-${Math.floor(rnd() * 40)}`,
          skills: [skill],
          correct,
          wrongAttempts: correct ? Math.floor(rnd() * 2) : 1,
          hintsUsed: Math.floor(rnd() * 2),
          grade: gradeFromAttempt({
            correct,
            wrongAttempts: correct ? Math.floor(rnd() * 2) : 1,
            hintsUsed: Math.floor(rnd() * 2),
          }),
        },
        review,
        new Date(clock)
      );
    }
    return { progress: p, now: new Date(clock + Math.floor(rnd() * 6) * HOUR) };
  };

  const RUNS = 4000;
  let armed = 0;
  let quiet = 0;
  const bad = { early: 0, notADueDate: 0, countWrong: 0, countZero: 0, ghost: 0, missedEarlier: 0 };

  for (let i = 0; i < RUNS; i++) {
    const { progress, now } = randomProgress();
    const arm = armWake(progress, IN_PACKS, now);

    if (!arm) {
      quiet++;
      /*
       * Отказ обязан быть честным: если будильник не заведён, значит
       * подходящего срока и правда нет. Иначе «тихо» маскировало бы
       * потерянные напоминания — самый дорогой из возможных отказов здесь.
       */
      const horizon = now.getTime() + MIN_HORIZON_MS;
      const missed = IN_PACKS.map((id) => progress.skills[id])
        .filter((st) => st && st.reps > 0)
        .map((st) => Date.parse(st.dueAt))
        .filter((t) => Number.isFinite(t) && t >= horizon);
      if (missed.length) bad.missedEarlier++;
      continue;
    }

    armed++;
    const wake = Date.parse(arm.wakeAt);

    if (wake < now.getTime() + MIN_HORIZON_MS) bad.early++;

    // Момент пробуждения обязан быть сроком реального отслеживаемого навыка,
    // а не вычисленной серединой: иначе уведомление приходило бы «около»,
    // а не «когда».
    const trackedDue = IN_PACKS.map((id) => progress.skills[id])
      .filter((st) => st && st.reps > 0)
      .map((st) => Date.parse(st.dueAt));
    if (!trackedDue.includes(wake)) bad.notADueDate++;

    // Число обязано совпадать с независимым пересчётом на тот же момент.
    const recount = trackedDue.filter((t) => t <= wake).length;
    if (recount !== arm.dueCount) bad.countWrong++;
    if (arm.dueCount < 1) bad.countZero++;

    // Навык вне паков не должен влиять ни на момент, ни на число.
    const ghostOnly = SKILLS.filter((id) => !IN_PACKS.includes(id));
    const ghostDue = ghostOnly
      .map((id) => progress.skills[id])
      .filter((st) => st && st.reps > 0)
      .map((st) => Date.parse(st.dueAt));
    if (ghostDue.includes(wake) && !trackedDue.includes(wake)) bad.ghost++;
  }

  assertEq(`свойство: не будит раньше горизонта (${RUNS} прогонов)`, bad.early, 0);
  assertEq('свойство: момент пробуждения — реальный срок навыка', bad.notADueDate, 0);
  assertEq('свойство: число совпадает с независимым пересчётом', bad.countWrong, 0);
  assertEq('свойство: заведённый будильник всегда несёт хотя бы одну тему', bad.countZero, 0);
  assertEq('свойство: навык вне паков не назначает пробуждение', bad.ghost, 0);
  assertEq('свойство: тишина только когда подходящего срока правда нет', bad.missedEarlier, 0);

  /*
   * Отрицательный прогон. Все свойства выше условны («если заведён, то…»),
   * и генератор, не заводящий ни одного будильника, прошёл бы их полностью.
   * Проверяем, что корпус содержит оба исхода в осмысленных долях.
   */
  assertTrue(
    `отрицательный прогон: корпус даёт оба исхода (заведено ${armed}, тихо ${quiet})`,
    armed > RUNS * 0.1 && quiet > RUNS * 0.02,
    `seed ${seed}`
  );

  // --- Сверка с настоящим корпусом навыков ------------------------------------

  /*
   * Список id берётся из паков на диске, а не выписывается сюда: гейт обязан
   * знать те же имена, что приложение, иначе проверка «навыка нет в паках»
   * защищала бы от выдуманной ситуации. Читаем JSON напрямую — тот же приём,
   * что у гейта раскладки схемы, который перечитывает schema.json заново.
   */
  const packDir = path.join(root, 'src/content/packs');
  const realIds = new Set();
  for (const file of readdirSync(packDir)) {
    if (!file.endsWith('.json') || file.includes('.en.') || file.includes('-lessons')) continue;
    for (const skill of JSON.parse(readFileSync(path.join(packDir, file), 'utf8')).skills ?? []) {
      realIds.add(skill.id);
    }
  }
  assertTrue(`корпус паков прочитан — навыков ${realIds.size}`, realIds.size > 50);

  {
    const ids = [...realIds];
    const live = ids[0];
    const removed = 'sql-window-ranking-OLD';
    const p = withSkills({ [live]: { dueMs: T0 + 5 * DAY_MS }, [removed]: { dueMs: T0 + 2 * DAY_MS } });
    assertTrue('удалённый из паков навык не будит и на настоящих id', !realIds.has(removed));
    assertEq(
      'на настоящих id будит только живой навык',
      armWake(p, ids, at(0))?.wakeAt,
      new Date(T0 + 5 * DAY_MS).toISOString()
    );
  }

  console.log(
    `\nРасписание push: ${RUNS} случайных прогрессов, будильник заведён в ${armed}, тихо в ${quiet}; ` +
      `горизонт ${MIN_HORIZON_MS / 3600000} ч, навыков в паках ${realIds.size}.`
  );
  console.log(failed ? `FAILED: ${failed}` : 'Все проверки расписания push пройдены.');
  if (failed) process.exitCode = 1;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
