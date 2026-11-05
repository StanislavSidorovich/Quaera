/**
 * Гейт движка «волн загрузки» (src/engine/waves.ts) на всех заданиях `mode: 'waves'`.
 *
 * Проверка в задании не сравнивает раскладку с образцом, а проверяет свойство
 * (шаг строго позже зависимостей, лишнее на столе, у стрелок «после успеха»).
 * Такое правило ломается молча двумя способами: верная сборка не принимается
 * (задание нерешаемо) или неверная принимается (задание решается бездействием).
 * Поэтому на каждом задании гейт строит верную раскладку и мутации и сверяет вердикт:
 *  1. верная раскладка существует в заданном числе волн и принимается;
 *  2. каждая зависимость, поставленная в одну волну с зависимым шагом, ломает сборку
 *     и даёт у зависимого шага нетривиальный исход (Failed или тихое Succeeded с ошибкой);
 *  3. любая стрелка «после завершения» ломает сборку;
 *  4. лишняя карточка в волне ломает сборку;
 *  5. раскладка «всё в первую волну» не принимается; без выбранных стрелок и
 *     без положенных карточек «Запустить» недоступна;
 *  6. при «после завершения» и верных зависимостях проверка на сбой (stress) есть, если
 *     у зависимого шага задан orphanText.
 *
 * Запуск: npm run test:waves (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-waves--'));

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const check = (name, cond, msg) => (cond ? ok(name) : fail(name, msg));

try {
  execSync(
    `npx tsc "${path.join(root, 'src/engine/waves.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  const addJsExtension = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) addJsExtension(full);
      else if (entry.name.endsWith('.js')) {
        const src = readFileSync(full, 'utf8').replace(/(from\s+['"])(\.[^'"]*?)(['"])/g, (m, a, spec, b) => (path.extname(spec) ? m : `${a}${spec}.js${b}`));
        writeFileSync(full, src);
      }
    }
  };
  addJsExtension(outDir);
  const { canRun, earliestLayout, runWaves } = await import(pathToFileURL(path.join(outDir, 'engine', 'waves.js')).href);

  const clone = (l) => ({ placement: { ...l.placement }, gates: [...l.gates] });
  let tasks = 0;

  for (const packId of ['model-core']) {
    const pack = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', `${packId}.json`), 'utf8'));
    for (const t of pack.tasks.filter((x) => x.mode === 'waves')) {
      tasks++;
      const items = t.waveItems;
      const good = earliestLayout(items, t.waves);
      if (!good) {
        fail(t.id, `верной раскладки в ${t.waves} волнах не существует (цикл, неизвестная зависимость или слишком мало волн)`);
        continue;
      }
      check(`${t.id}: верная раскладка принимается`, runWaves(items, good).correct && canRun(items, good), 'принята как неверная');

      // 2. Каждая зависимость в одну волну с зависимым: сборка ломается, исход нетривиален.
      for (const it of items.filter((i) => i.dependsOn?.length)) {
        for (const d of it.dependsOn) {
          const bad = clone(good);
          bad.placement[it.id] = good.placement[d];
          const r = runWaves(items, bad);
          const row = r.rows.find((x) => x.id === it.id);
          check(
            `${t.id}: «${it.id}» вместе с «${d}» ломает сборку`,
            !r.correct && r.problems.early.includes(it.id) && row && (row.status === 'failed' || row.tone === 'err'),
            'сборка принята или исход шага безобидный'
          );
        }
      }
      // 3. Любая стрелка «после завершения».
      for (let g = 0; g < good.gates.length; g++) {
        const bad = clone(good);
        bad.gates[g] = 'complete';
        check(`${t.id}: стрелка ${g + 1} «после завершения» не принимается`, !runWaves(items, bad).correct, 'принята');
      }
      // 4. Лишняя карточка в волне.
      for (const it of items.filter((i) => i.extra)) {
        const bad = clone(good);
        bad.placement[it.id] = 0;
        check(`${t.id}: лишняя «${it.id}» в волне не принимается`, !runWaves(items, bad).correct, 'принята');
      }
      // 5. Всё в первую волну; не готовое к запуску.
      const flat = clone(good);
      for (const it of items.filter((i) => !i.extra)) flat.placement[it.id] = 0;
      check(`${t.id}: всё в первую волну не принимается`, !runWaves(items, flat).correct, 'принята');
      const empty = { placement: Object.fromEntries(items.map((i) => [i.id, null])), gates: good.gates.map(() => null) };
      check(`${t.id}: пустой стол и невыбранные стрелки: «Запустить» недоступна`, !canRun(items, empty), 'доступна');
      const unset = clone(good);
      unset.gates[0] = null;
      check(`${t.id}: одна невыбранная стрелка: «Запустить» недоступна`, !canRun(items, unset), 'доступна');
      // 6. Проверка на сбой при «после завершения» и верных зависимостях.
      if (items.some((i) => i.orphanText)) {
        const soft = clone(good);
        soft.gates = soft.gates.map(() => 'complete');
        const r = runWaves(items, soft);
        check(`${t.id}: при «после завершения» есть проверка на сбой`, !r.correct && !!r.stress && r.stress.rows[0].status === 'failed' && r.stress.rows[1].tone === 'err', 'проверки на сбой нет');
      }
    }
  }
  console.log('');
  console.log(`Волны: ${tasks} заданий проверено на верную раскладку и мутации.`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.log('');
  console.log(`Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log('Все проверки волн пройдены.');
