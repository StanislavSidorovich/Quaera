/**
 * Тест правил «Продолжить» на главной (src/home/nextStep.ts).
 *
 * Правила по порядку: незаконченное занятие, новичок (день 1), следующий слой карты.
 * Правило 2 (начатая сборка Lab) не реализовано: признака «начата» у тренажёра нет,
 * тест это фиксирует, чтобы его появление не прошло незамеченным.
 * Отдельно: каждый навык слоёв карты существует в паках, а слой всегда даёт именованный шаг.
 *
 * Запуск: npm run test:next-step (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-next-'));
let failed = 0;
const check = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    console.log(` FAIL  ${name}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
    failed++;
  } else console.log(` ok    ${name}`);
};

try {
  execSync(
    `npx tsc "${path.join(root, 'src/home/nextStep.ts')}" --target ES2020 --module ES2020 ` +
      `--moduleResolution bundler --rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  const { nextStep, layerStatuses, estimateMinutes, weekDots } = await import(pathToFileURL(path.join(outDir, 'home', 'nextStep.js')).href);

  const layers = [
    { id: 'a', skills: ['s1', 's2'] },
    { id: 'b', skills: ['s2', 's3'] },
    { id: 'c', skills: [] },
    { id: 'd', skills: ['s4'] },
  ];
  const started = (...ids) => (id) => ids.includes(id);
  const dayOne = { title: 'бриф заказчика', tasks: 4 };
  const base = { resume: null, isNewUser: false, dayOne, layers, isStarted: started() };

  // Правило 1: незаконченное занятие бьёт всё, в том числе новичка.
  check('1: занятие идёт первым', nextStep({ ...base, resume: 'Задача 2 из 5', isNewUser: true }), { rule: 1, kind: 'resume', stepName: 'Задача 2 из 5' });
  // Правило 3: новичок получает день 1.
  check('3: новичок, день 1', nextStep({ ...base, isNewUser: true }), { rule: 3, kind: 'day-one', stepName: 'бриф заказчика', tasks: 4 });
  check('3: без кампании новичок идёт на карту', nextStep({ ...base, isNewUser: true, dayOne: null }).rule, 4);
  // Правило 4: первый непройденный слой и его первое неначатое действие.
  check('4: слой с нуля', nextStep(base), { rule: 4, kind: 'layer', stepName: 'a', layerId: 'a', skillId: 's1' });
  check('4: слой, начатый наполовину', nextStep({ ...base, isStarted: started('s1') }), { rule: 4, kind: 'layer', stepName: 'a', layerId: 'a', skillId: 's2' });
  check('4: пройденный слой пропускается', nextStep({ ...base, isStarted: started('s1', 's2') }), { rule: 4, kind: 'layer', stepName: 'b', layerId: 'b', skillId: 's3' });
  check('4: общий навык засчитан в оба слоя', layerStatuses(layers, started('s1', 's2')).map((l) => l.state), ['done', 'next', 'ahead', 'ahead']);
  check('4: слой без навыков не бывает следующим', layerStatuses(layers, started('s1', 's2', 's3')).map((l) => l.state), ['done', 'done', 'ahead', 'next']);
  const all = nextStep({ ...base, isStarted: started('s1', 's2', 's3', 's4') });
  check('4: всё начато, шаг называет последний слой', all.layerId, 'd');
  check('4: всё начато, действия нет', all.skillId, null);

  // Правило 2 не реализовано: ни одного входа, который ведёт к «сборке Lab».
  check('2: канала «сборка начата» нет', Object.keys(nextStep(base)).some((k) => /lab/i.test(k)), false);

  check('минуты: 5 заданий', estimateMinutes(5), 9);
  check('минуты: ноль заданий', estimateMinutes(0), null);
  check('точки недели', weekDots(5, 2), { total: 5, done: 2 });
  check('точки недели: нет отметки', weekDots(5, null), { total: 5, done: 0 });

  // Реальная карта: навыки слоёв существуют, шаг у каждого состояния называет слой.
  const arch = JSON.parse(readFileSync(path.join(root, 'src/content/architecture.json'), 'utf8'));
  const ids = new Set();
  for (const f of readdirSync(path.join(root, 'src/content/packs'))) {
    if (!/-core\.json$/.test(f)) continue;
    for (const s of JSON.parse(readFileSync(path.join(root, 'src/content/packs', f), 'utf8')).skills) ids.add(s.id);
  }
  const real = arch.layers.map((l) => ({ id: l.id, skills: l.practice.skills }));
  const missing = real.flatMap((l) => l.skills.filter((s) => !ids.has(s)));
  check('навыки слоёв есть в паках', missing, []);
  const seen = new Set();
  for (let n = 0; n <= ids.size; n++) {
    const step = nextStep({ ...base, layers: real, isStarted: (id) => [...ids].indexOf(id) < n });
    if (!step.stepName) failed++;
    seen.add(step.layerId);
  }
  check('шаг всегда назван', [...seen].every((id) => real.some((l) => l.id === id)), true);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
if (failed) {
  console.log(`\n${failed} провалено`);
  process.exit(1);
}
console.log('\nвсё зелёное');
