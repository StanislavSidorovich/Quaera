/**
 * Гейт слияния прогресса — свойства, а не примеры.
 *
 * `src/sync/merge.ts` — единственная часть синхронизации, поломка которой
 * не даёт видимого отказа: интервалы SRS сдвигаются молча, и заметить это
 * можно будет через недели. Примерами такое не ловится — сценариев
 * расхождения двух устройств больше, чем можно выписать руками. Поэтому
 * основная часть файла проверяет **свойства** на случайных парах прогресса,
 * собранных тем же `applyAttempt`, что работает в приложении: слияние
 * идемпотентно, коммутативно, ассоциативно, ничего не теряет и не выдумывает
 * расписаний, которых не производил ни один ответ.
 *
 * Генератор сеяный: при падении в отчёт печатается seed, и прогон
 * повторяется ровно тем же набором данных.
 *
 * Запуск: npm run test:merge (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera--'));

try {
  /*
   * В CommonJS, а не в ES2020, как в test-scheduler.mjs. Разница не
   * стилистическая: `srs/store.ts` — первый файл под гейтом, который
   * импортирует соседний модуль в рантайме (`initialSkillState`), а tsc
   * с `moduleResolution bundler` пишет путь без расширения (`./scheduler`),
   * как это принято у Vite. Node в режиме ESM такой путь не резолвит вовсе,
   * и падение выглядит как отсутствие файла, хотя файл на месте.
   * CommonJS расширение достраивает сам; маркер в package.json нужен,
   * чтобы node не включил автоопределение модульного синтаксиса.
   */
  execSync(
    `npx tsc "${path.join(root, 'src/sync/merge.ts')}" "${path.join(root, 'src/srs/store.ts')}" ` +
      `--target ES2020 --module CommonJS --moduleResolution node ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');

  const { mergeProgress, planSync } = await import(pathToFileURL(path.join(outDir, 'sync', 'merge.js')).href);
  const { applyAttempt, emptyProgress, clearedProgress, withParsedCareer } = await import(
    pathToFileURL(path.join(outDir, 'srs', 'store.js')).href
  );
  const { parseCareer, emptyCareerState, withRole, withToggledEvidence, withQuizAttempt, checkedIds, weeklyChanges } = await import(
    pathToFileURL(path.join(outDir, 'career', 'store.js')).href
  );
  const { quizStatus } = await import(pathToFileURL(path.join(outDir, 'career', 'quiz.js')).href);
  const { review, gradeFromAttempt } = await import(pathToFileURL(path.join(outDir, 'srs', 'scheduler.js')).href);

  let failed = 0;
  const fail = (name, msg) => {
    console.log(` FAIL  ${name}: ${msg}`);
    failed++;
  };
  const assertTrue = (name, cond, extra = '') => {
    if (cond) console.log(` ok    ${name}`);
    else fail(name, `ожидалось истинное${extra ? ` — ${extra}` : ''}`);
  };
  const assertEq = (name, actual, expected) => {
    if (Object.is(actual, expected)) console.log(` ok    ${name}`);
    else fail(name, `ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  };

  /**
   * Сравнение по значению с нормализацией порядка ключей: `merge` собирает
   * словари обходом объединения множеств, и порядок вставки зависит от того,
   * какой аргумент был первым. Для равенства прогрессов порядок ключей
   * ничего не значит, а `JSON.stringify` по умолчанию его учитывает —
   * без сортировки коммутативность падала бы на ровном месте.
   */
  const stable = (v) => {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = stable(v[k]);
      return out;
    }
    return v;
  };
  const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

  // --- Сеяный генератор: mulberry32, тот же на каждом прогоне при том же seed.
  const seed = Number(process.env.MERGE_SEED ?? 20260815);
  function rng(s) {
    let t = s >>> 0;
    return () => {
      t = (t + 0x6d2b79f5) >>> 0;
      let x = Math.imul(t ^ (t >>> 15), 1 | t);
      x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }

  const SKILLS = ['sql-select', 'sql-join', 'sql-window-rank', 'model-star', 'py-groupby', 'domain-share'];
  const TASKS = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8'];
  const DAY_MS = 86400000;

  /**
   * Одно устройство: от общего предка `base` проходит `steps` попыток,
   * каждая на день-другой позже предыдущей. Прогресс строится не руками,
   * а тем же `applyAttempt`, которым его строит приложение, — иначе гейт
   * проверял бы слияние на данных, которых в жизни не бывает.
   */
  function device(base, steps, startMs, rand) {
    let p = base.p ?? base;
    let t = Math.max(startMs, base.endMs ?? 0);
    for (let i = 0; i < steps; i++) {
      t += Math.floor(rand() * 3 * DAY_MS) + 3600000;
      const correct = rand() > 0.3;
      const wrongAttempts = correct && rand() > 0.6 ? 1 : 0;
      const hintsUsed = rand() > 0.7 ? 1 : 0;
      const skill = SKILLS[Math.floor(rand() * SKILLS.length)];
      p = applyAttempt(
        p,
        {
          taskId: TASKS[Math.floor(rand() * TASKS.length)],
          skills: [skill],
          correct,
          wrongAttempts,
          hintsUsed,
          grade: gradeFromAttempt({ correct, wrongAttempts, hintsUsed }),
        },
        review,
        new Date(t)
      );
    }
    /*
     * Возвращается вместе с временем последней попытки: ветки обязаны
     * расходиться ПОСЛЕ общего предка. Иначе генератор выдаёт прогресс
     * с днями активности не по возрастанию — `applyAttempt` дописывает
     * день в конец, доверяя часам, — и падает идемпотентность, хотя
     * ломается не слияние, а генератор.
     */
    return { p, endMs: t };
  }

  const rand = rng(seed);
  const base0 = new Date('2026-03-01T09:00:00.000Z').getTime();

  /**
   * Состояние «Пути к роли» на устройстве: роль, отметки и снимки со своими
   * метками времени из общего небольшого пула. Пул маленький нарочно:
   * совпадения отметок и даже меток времени на двух копиях должны
   * встречаться, иначе правила разрешения ничьих не проверяются вовсе.
   * Собирается через `parseCareer`, то есть сразу в канонической форме, —
   * как и состояние, прочитанное приложением из хранилища.
   */
  const ROLES = ['bi', 'da', 'ae', 'de'];
  const EVIDENCE = ['sql-medium', 'bi-report', 'py-notebook', 'stats-ab', 'process-bpmn'];
  const QUIZ_AXES = ['stats', 'engineering', 'process'];
  const LEVELS0 = { sql: 0, modeling: 0, bi: 0, python: 0, stats: 0, engineering: 0, business: 0, process: 0 };
  function career(r) {
    if (r() < 0.25) return undefined;
    const at = () => new Date(base0 + Math.floor(r() * 40) * DAY_MS).toISOString();
    const checks = {};
    for (const id of EVIDENCE) if (r() < 0.6) checks[id] = { on: r() < 0.5, at: at() };
    const weekly = [];
    for (let i = 0; i < Math.floor(r() * 9); i++) {
      weekly.push({ date: at(), levels: { ...LEVELS0, sql: Math.floor(r() * 4), bi: Math.floor(r() * 3) } });
    }
    // Подходы из того же маленького пула меток: совпадения по (ось, время)
    // с разным содержимым проверяют правило ничьей в normalizeQuiz.
    const quiz = [];
    for (let i = 0; i < Math.floor(r() * 30); i++) {
      const asked = ['q1', 'q2', 'q3'];
      quiz.push({ axis: QUIZ_AXES[Math.floor(r() * 3)], at: at(), asked, wrong: asked.filter(() => r() < 0.3) });
    }
    return parseCareer({
      role: ROLES[Math.floor(r() * ROLES.length)],
      roleAt: r() < 0.3 ? null : at(),
      checks,
      weekly,
      quiz,
    });
  }
  const withCareer = (p, c) => (c ? { ...p, career: c } : p);
  /** Пары «общий предок → две разошедшиеся копии», плюс третья ветка для ассоциативности. */
  const cases = [];
  for (let i = 0; i < 200; i++) {
    const ancestor = device(emptyProgress(), Math.floor(rand() * 6), base0, rand);
    const forkMs = ancestor.endMs + Math.floor(rand() * 20 * DAY_MS);
    cases.push({
      a: withCareer(device(ancestor, 1 + Math.floor(rand() * 8), forkMs, rand).p, career(rand)),
      b: withCareer(device(ancestor, 1 + Math.floor(rand() * 8), forkMs, rand).p, career(rand)),
      c: withCareer(device(ancestor, Math.floor(rand() * 5), forkMs + 5 * DAY_MS, rand).p, career(rand)),
    });
  }

  const check = (name, pred) => {
    const bad = cases.findIndex((c) => !pred(c));
    if (bad === -1) console.log(` ok    ${name} (${cases.length} случайных пар, seed ${seed})`);
    else fail(name, `случай #${bad}, seed ${seed} — повторить: MERGE_SEED=${seed} npm run test:merge`);
  };

  // --- Три свойства полурешётки. На них держится вся безопасность синхронизации:
  //     порядок прихода копий и число повторных отправок перестают влиять на итог.
  check('идемпотентность: merge(a, a) = a', ({ a }) => same(mergeProgress(a, a), a));
  check('коммутативность: merge(a, b) = merge(b, a)', ({ a, b }) =>
    same(mergeProgress(a, b), mergeProgress(b, a))
  );
  check('ассоциативность: merge(merge(a, b), c) = merge(a, merge(b, c))', ({ a, b, c }) =>
    same(mergeProgress(mergeProgress(a, b), c), mergeProgress(a, mergeProgress(b, c)))
  );
  check('нейтральный элемент: merge(a, пустой) = a', ({ a }) => same(mergeProgress(a, emptyProgress()), a));

  // --- Ничего не теряется: идентификаторы обеих сторон доходят до результата.
  check('слияние не теряет навыков', ({ a, b }) => {
    const m = mergeProgress(a, b);
    return [...Object.keys(a.skills), ...Object.keys(b.skills)].every((id) => id in m.skills);
  });
  check('слияние не теряет записей о заданиях', ({ a, b }) => {
    const m = mergeProgress(a, b);
    return [...Object.keys(a.taskRecords), ...Object.keys(b.taskRecords)].every((id) => id in m.taskRecords);
  });
  check('слияние не теряет дней активности', ({ a, b }) => {
    const m = mergeProgress(a, b);
    return [...a.activeDays, ...b.activeDays].every((d) => m.activeDays.includes(d));
  });

  // --- Главное свойство расписания: у навыка в результате пара ease/intervalDays
  //     и дата повторения взяты целиком у одной из сторон. Смешанное состояние
  //     дало бы интервал, которого не производил ни один реальный ответ.
  const plan = (s) => JSON.stringify([s.ease, s.intervalDays, s.dueAt, s.lastGrade, s.lastReviewedAt]);
  check('расписание навыка не смешивается: совпадает с одной из сторон', ({ a, b }) => {
    const m = mergeProgress(a, b);
    return Object.entries(m.skills).every(([id, s]) => {
      const options = [a.skills[id], b.skills[id]].filter(Boolean).map(plan);
      return options.includes(plan(s));
    });
  });

  // --- Счётчики только вверх: слияние не может отменить сделанную работу.
  check('reps/lapses не убывают', ({ a, b }) => {
    const m = mergeProgress(a, b);
    return Object.entries(m.skills).every(
      ([id, s]) =>
        s.reps >= Math.max(a.skills[id]?.reps ?? 0, b.skills[id]?.reps ?? 0) &&
        s.lapses >= Math.max(a.skills[id]?.lapses ?? 0, b.skills[id]?.lapses ?? 0)
    );
  });
  check('попытки и подсказки по заданию не убывают', ({ a, b }) => {
    const m = mergeProgress(a, b);
    return Object.entries(m.taskRecords).every(
      ([id, r]) =>
        r.attempts >= Math.max(a.taskRecords[id]?.attempts ?? 0, b.taskRecords[id]?.attempts ?? 0) &&
        r.hintsUsed >= Math.max(a.taskRecords[id]?.hintsUsed ?? 0, b.taskRecords[id]?.hintsUsed ?? 0)
    );
  });
  check('решённое остаётся решённым: множество solved — объединение', ({ a, b }) => {
    const m = mergeProgress(a, b);
    const solved = (p) => Object.entries(p.taskRecords).filter(([, r]) => r.solved).map(([id]) => id);
    const union = new Set([...solved(a), ...solved(b)]);
    const got = new Set(solved(m));
    return union.size === got.size && [...union].every((id) => got.has(id));
  });

  // --- totalSolved производное, а не сливаемое: сумма дала бы двойной счёт
  //     по заданиям, решённым на обоих устройствах.
  check('totalSolved равен числу решённых записей', ({ a, b }) => {
    const m = mergeProgress(a, b);
    return m.totalSolved === Object.values(m.taskRecords).filter((r) => r.solved).length;
  });
  check('totalSolved не меньше, чем у каждой стороны', ({ a, b }) => {
    const m = mergeProgress(a, b);
    return m.totalSolved >= a.totalSolved && m.totalSolved >= b.totalSolved;
  });
  check('дни активности отсортированы и без повторов', ({ a, b }) => {
    const d = mergeProgress(a, b).activeDays;
    return d.every((v, i) => i === 0 || d[i - 1] < v);
  });

  // --- Именной сценарий, ради которого всё затевалось: свежее повторение
  //     не должно быть перекрыто копией недельной давности.
  {
    const shared = device(emptyProgress(), 4, base0, rng(7));
    const stale = shared.p;
    const fresh = device(shared, 3, shared.endMs + 10 * DAY_MS, rng(8)).p;
    const m = mergeProgress(stale, fresh);
    const moved = Object.keys(fresh.skills).filter((id) => fresh.skills[id].dueAt !== stale.skills[id]?.dueAt);
    assertTrue(
      'занятие на втором устройстве не перекрывается устаревшей копией',
      moved.length > 0 && moved.every((id) => m.skills[id].dueAt === fresh.skills[id].dueAt),
      `сдвинулось навыков: ${moved.length}`
    );
    assertTrue('порядок аргументов на этом сценарии ничего не меняет', same(m, mergeProgress(fresh, stale)));
  }

  // --- Сброс как эпоха: у полурешётки нет удаления, поэтому без отдельного
  //     решения стёртое вернулось бы с другого устройства при первой же
  //     синхронизации. Разные эпохи не сливаются — побеждает поздняя целиком.
  {
    const older = device(emptyProgress(), 6, base0, rng(11)).p;
    const wiped = clearedProgress(new Date(base0 + 30 * DAY_MS));
    const m = mergeProgress(wiped, older);
    assertEq('сброс не даёт старому прогрессу вернуться: навыков', Object.keys(m.skills).length, 0);
    assertEq('сброс не даёт старому прогрессу вернуться: решённых', m.totalSolved, 0);
    assertEq('эпоха сброса переносится в результат', m.resetAt, wiped.resetAt);
    assertTrue('сброс коммутативен', same(m, mergeProgress(older, wiped)));

    // Занятия ПОСЛЕ сброса — уже в новой эпохе, и они обязаны выжить:
    // иначе метка превратилась бы в вечный чёрный список.
    const afterReset = device(wiped, 3, base0 + 40 * DAY_MS, rng(12)).p;
    const m2 = mergeProgress(mergeProgress(wiped, older), afterReset);
    assertEq(
      'занятия после сброса переживают слияние со стёртой копией',
      Object.keys(m2.skills).length,
      Object.keys(afterReset.skills).length
    );
    assertTrue(
      'сброс не ломает ассоциативность',
      same(
        mergeProgress(mergeProgress(wiped, older), afterReset),
        mergeProgress(wiped, mergeProgress(older, afterReset))
      )
    );

    /*
     * Названная цена решения: устройство, занимавшееся в старой эпохе уже
     * ПОСЛЕ того, как на другом нажали «Сбросить», эти занятия теряет.
     * Проверка стоит здесь не как гарантия, а как фиксация выбора: если
     * когда-нибудь захочется поведение изменить, падение этой строки
     * объяснит, что именно менялось и почему от этого поплыла
     * ассоциативность.
     */
    const staleKeptStudying = device({ p: older, endMs: base0 + 60 * DAY_MS }, 4, base0 + 60 * DAY_MS, rng(14)).p;
    assertEq(
      'занятия в стёртой эпохе не возвращаются, даже если они позже сброса',
      Object.keys(mergeProgress(wiped, staleKeptStudying).skills).length,
      0
    );

    // Два сброса на двух устройствах: побеждает поздний, и порядок не решает.
    const wiped2 = clearedProgress(new Date(base0 + 50 * DAY_MS));
    const inSecond = device(wiped2, 2, base0 + 51 * DAY_MS, rng(15)).p;
    const inFirst = device(wiped, 2, base0 + 31 * DAY_MS, rng(16)).p;
    assertTrue(
      'при двух сбросах побеждает поздняя эпоха',
      same(mergeProgress(inFirst, inSecond), mergeProgress(inSecond, inFirst)) &&
        mergeProgress(inFirst, inSecond).resetAt === wiped2.resetAt
    );
  }

  // --- Старая запись без resetAt (прогресс, созданный до появления поля)
  //     читается как «не сбрасывали», а не как «сброшен в начале времён».
  {
    const legacy = device(emptyProgress(), 5, base0, rng(13)).p;
    delete legacy.resetAt;
    const m = mergeProgress(legacy, emptyProgress());
    assertEq('прогресс без resetAt не теряет навыков', Object.keys(m.skills).length, Object.keys(legacy.skills).length);
    assertEq('прогресс без resetAt получает resetAt = null', m.resetAt, null);
  }

  // --- Обрезка 400 днями — та же, что в applyAttempt; проверяем, что она
  //     не ломает ассоциативность (выпавший день заведомо старше сохранённых).
  {
    const days = (from, n) =>
      Array.from({ length: n }, (_, i) => new Date(base0 + (from + i) * DAY_MS).toISOString().slice(0, 10));
    const a = { ...emptyProgress(), activeDays: days(0, 300) };
    const b = { ...emptyProgress(), activeDays: days(250, 300) };
    const c = { ...emptyProgress(), activeDays: days(500, 100) };
    assertEq('обрезка дней держит потолок 400', mergeProgress(mergeProgress(a, b), c).activeDays.length, 400);
    assertTrue(
      'обрезка дней ассоциативна',
      same(mergeProgress(mergeProgress(a, b), c), mergeProgress(a, mergeProgress(b, c)))
    );
  }

  // --- «Путь к роли» (progress.career): роль, отметки, снимки.
  //     Полурешётку на случайных копиях проверяют общие свойства выше —
  //     у трёх четвертей случайных копий поле есть. Здесь именные сценарии,
  //     каждый в обе стороны: слияние коммутативно, но гейт обязан это
  //     видеть на тех случаях, ради которых правило заводилось.
  {
    const t = (d) => new Date(base0 + d * DAY_MS);
    const on = (s, id) => checkedIds(s).includes(id);
    const both = (a, b) => [mergeProgress(a, b), mergeProgress(b, a)];

    // Ловушка, ради которой у отметки метка времени: снятая галочка
    // не должна возвращаться с устройства, где она стояла раньше.
    const setOnB = withToggledEvidence(emptyCareerState(), 'sql-medium', t(1));
    const clearedOnA = withToggledEvidence(setOnB, 'sql-medium', t(3));
    const [x1, x2] = both(withCareer(emptyProgress(), clearedOnA), withCareer(emptyProgress(), setOnB));
    assertTrue('отметка снята на A позже, чем поставлена на B: снята (A, B)', !on(x1.career, 'sql-medium'));
    assertTrue('отметка снята на A позже, чем поставлена на B: снята (B, A)', !on(x2.career, 'sql-medium'));

    const clearedEarly = withToggledEvidence(withToggledEvidence(emptyCareerState(), 'bi-report', t(1)), 'bi-report', t(2));
    const setLate = withToggledEvidence(emptyCareerState(), 'bi-report', t(5));
    const [y1, y2] = both(withCareer(emptyProgress(), clearedEarly), withCareer(emptyProgress(), setLate));
    assertTrue('отметка поставлена на B позже, чем снята на A: стоит (A, B)', on(y1.career, 'bi-report'));
    assertTrue('отметка поставлена на B позже, чем снята на A: стоит (B, A)', on(y2.career, 'bi-report'));

    const onlyA = withToggledEvidence(emptyCareerState(), 'stats-ab', t(1));
    const onlyB = withToggledEvidence(emptyCareerState(), 'py-notebook', t(1));
    const [z1, z2] = both(withCareer(emptyProgress(), onlyA), withCareer(emptyProgress(), onlyB));
    assertTrue(
      'отметки на разных устройствах складываются',
      [z1, z2].every((m) => on(m.career, 'stats-ab') && on(m.career, 'py-notebook'))
    );

    // Роль: последняя выбранная, по своей метке. Невыбранная (роль
    // по умолчанию, roleAt = null) не перебивает выбранную руками.
    const roleDa = withRole(emptyCareerState(), 'da', t(2));
    const roleDe = withRole(emptyCareerState(), 'de', t(4));
    const [r1, r2] = both(withCareer(emptyProgress(), roleDa), withCareer(emptyProgress(), roleDe));
    assertTrue('роль: побеждает выбранная позже, в обе стороны', r1.career.role === 'de' && r2.career.role === 'de');
    const [d1, d2] = both(withCareer(emptyProgress(), emptyCareerState()), withCareer(emptyProgress(), roleDa));
    assertTrue(
      'роль: роль по умолчанию не перебивает выбранную, в обе стороны',
      d1.career.role === 'da' && d2.career.role === 'da'
    );

    // Снимки: объединение по дате, по возрастанию, не больше двенадцати последних.
    const snaps = (from, n) =>
      Array.from({ length: n }, (_, i) => ({ date: t(from + i * 7).toISOString(), levels: { ...LEVELS0, sql: i % 4 } }));
    const wa = parseCareer({ ...emptyCareerState(), weekly: snaps(0, 8) });
    const wb = parseCareer({ ...emptyCareerState(), weekly: [...snaps(3, 8), ...snaps(0, 2)] });
    const [w1, w2] = both(withCareer(emptyProgress(), wa), withCareer(emptyProgress(), wb));
    const dates = w1.career.weekly.map((w) => w.date);
    const expected = [...new Set([...snaps(0, 8), ...snaps(3, 8)].map((w) => w.date))].sort().slice(-12);
    assertTrue(
      'снимки: объединение по дате без повторов, двенадцать последних',
      JSON.stringify(dates) === JSON.stringify(expected)
    );
    assertTrue('снимки: порядок аргументов не решает', same(w1, w2));

    // Подходы самопроверки: первый сдан на телефоне, второй через неделю
    // на ноутбуке. После слияния зачёт виден на обоих — ради этого список
    // подходов и лежит в career, а не в отдельном ключе устройства.
    const ten = Array.from({ length: 10 }, (_, i) => `q${i}`);
    const pass = (d) => ({ axis: 'stats', at: t(d).toISOString(), asked: ten, wrong: ['q0'] });
    const onPhone = withQuizAttempt(emptyCareerState(), pass(1));
    const onLaptop = withQuizAttempt(emptyCareerState(), pass(8));
    const [qz1, qz2] = both(withCareer(emptyProgress(), onPhone), withCareer(emptyProgress(), onLaptop));
    assertTrue('самопроверка: подходы двух устройств сложились', qz1.career.quiz.length === 2 && same(qz1, qz2));
    assertTrue(
      'самопроверка: зачёт из подходов двух устройств засчитан',
      quizStatus(qz1.career.quiz, 'stats', t(9)).passed && !quizStatus(onPhone.quiz, 'stats', t(9)).passed
    );
    const legacyNoQuiz = parseCareer({ role: 'da', roleAt: null, checks: {}, weekly: [] });
    assertTrue('самопроверка: запись до фазы 4 читается с пустым списком', Array.isArray(legacyNoQuiz.quiz) && legacyNoQuiz.quiz.length === 0);
    const dirtyQuiz = parseCareer({ ...emptyCareerState(), quiz: [pass(1), { axis: 'stats', at: 'x' }, 'oops'] });
    assertTrue('самопроверка: мусорные подходы отброшены', dirtyQuiz.quiz.length === 1);

    // «За неделю» после слияния сравнивает со снимком недельной давности,
    // а не со вчерашним снимком другого устройства.
    const lv = (sql) => ({ ...LEVELS0, sql });
    const interleaved = [
      { date: t(0).toISOString(), levels: lv(1) },
      { date: t(6).toISOString(), levels: lv(2) },
      { date: t(7).toISOString(), levels: lv(3) },
    ];
    const ch = weeklyChanges(interleaved, lv(3));
    assertTrue(
      'за неделю: база — снимок старше последнего на семь дней',
      ch?.length === 1 && ch[0].from === 1 && ch[0].to === 3
    );
    assertTrue('за неделю: одного снимка мало — сравнивать не с чем', weeklyChanges(interleaved.slice(0, 1), lv(1)) === null);

    // Сброс гасит и это состояние: стёртое поколение не приносит отметок
    // обратно, а отметки, поставленные после сброса, выживают.
    const olderWithCareer = withCareer(device(emptyProgress(), 3, base0, rng(31)).p, withRole(setOnB, 'da', t(1)));
    const wiped = clearedProgress(t(30));
    const [e1, e2] = both(wiped, olderWithCareer);
    assertTrue('сброс: отметки и роль стёртого поколения не возвращаются, в обе стороны', !e1.career && !e2.career);
    const afterReset = withCareer(wiped, withToggledEvidence(emptyCareerState(), 'bi-report', t(31)));
    const [f1, f2] = both(afterReset, olderWithCareer);
    assertTrue(
      'сброс: отметка после сброса выживает, старые нет, в обе стороны',
      [f1, f2].every((m) => on(m.career, 'bi-report') && !on(m.career, 'sql-medium') && m.career.role === 'bi')
    );

    // Запись без поля (до фазы 3): не теряет чужого состояния и сама
    // не обрастает полем, если его нет ни у кого.
    const plain = device(emptyProgress(), 3, base0, rng(32)).p;
    const [g1, g2] = both(plain, withCareer(emptyProgress(), roleDa));
    assertTrue(
      'запись без поля: состояние другой стороны сохраняется, в обе стороны',
      g1.career?.role === 'da' && g2.career?.role === 'da'
    );
    assertTrue('запись без поля с такой же: поля нет и в результате', !('career' in mergeProgress(plain, plain)));

    // Проверка формы на входе (localStorage, файл, jsonb с сервера).
    assertTrue(
      'мусор вместо поля читается как «состояния нет»',
      !('career' in withParsedCareer({ ...emptyProgress(), career: 'oops' }))
    );
    const dirty = withParsedCareer({
      ...emptyProgress(),
      career: { role: 'da', checks: { a: { on: true, at: 'x' }, b: { on: 'yes' } }, weekly: [{ date: 'd' }] },
    });
    assertTrue(
      'битые отметки и снимки отбрасываются, целые остаются',
      dirty.career.role === 'da' &&
        dirty.career.roleAt === null &&
        Object.keys(dirty.career.checks).join() === 'a' &&
        dirty.career.weekly.length === 0
    );
  }

  // --- planSync: что делать после чтения серверной копии.
  //
  //     Ветка с отказом чтения — единственная в синхронизации, где ошибка
  //     стоит данных, и стоила их однажды: провал чтения принимался
  //     за пустой сервер, после чего локальная копия уезжала поверх чужой.
  //     Проверяем именно это, а не форму объекта.
  {
    const local = device(emptyProgress(), 4, base0, rng(21)).p;
    const remote = device(emptyProgress(), 6, base0 + DAY_MS, rng(22)).p;

    const readOk = planSync(local, { ok: true, progress: remote });
    assertTrue('чтение удалось: сливаем и отправляем', readOk.push && readOk.reconciled);
    assertTrue('чтение удалось: результат — то же слияние', same(readOk.merged, mergeProgress(local, remote)));

    const readEmpty = planSync(local, { ok: true, progress: null });
    assertTrue('строки на сервере нет: отправляем свою и считаемся сведёнными', readEmpty.push && readEmpty.reconciled);
    assertTrue('строки на сервере нет: отправляем ровно локальную', same(readEmpty.merged, local));

    const readFailed = planSync(local, { ok: false });
    assertTrue('чтение не удалось: НЕ отправляем ничего', readFailed.push === false);
    assertTrue('чтение не удалось: слияние не состоялось', readFailed.reconciled === false);
    assertTrue('чтение не удалось: локальная копия не тронута', same(readFailed.merged, local));

    // Тот же случай, но с пустой локальной копией — свежее устройство,
    // на котором человек только что вошёл. Именно здесь прежняя версия
    // отправляла пустоту поверх полного серверного прогресса.
    const fresh = planSync(emptyProgress(), { ok: false });
    assertTrue('пустое устройство при отказе чтения не отправляет пустоту', fresh.push === false);
  }

  console.log(`\n${failed ? `FAILED: ${failed}` : 'OK: все проверки слияния прошли'}`);
  if (failed) process.exitCode = 1;
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
