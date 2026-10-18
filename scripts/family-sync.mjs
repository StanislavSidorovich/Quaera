/**
 * Набор общего вида семейства: quaera/family/ — эталон, остальные
 * репозитории получают копию. Пакета нет (см. договор об общем виде).
 *
 *   node scripts/family-sync.mjs           пересобрать блок данных и MANIFEST,
 *                                          скопировать набор в остальные репозитории
 *   node scripts/family-sync.mjs --build   только пересобрать эталон (блок данных, MANIFEST), никуда не копировать
 *   node scripts/family-sync.mjs --check   только сравнить, ничего не менять;
 *                                          печатает, кто отстал; код 1, если кто-то отстал
 *
 * Целевые папки считаются от корня «22. Quaera» (на уровень выше quaera/).
 * Если папки репозитория рядом нет, он пропускается с пометкой.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataBlock, buildManifest, currentDataBlock, hashFile, listSetFiles } from './lib/family-set.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.resolve(here, '../family');
const root = path.resolve(here, '../..');
const check = process.argv.includes('--check');
const buildOnly = process.argv.includes('--build');

const TARGETS = ['lab/src/family', 'model/src/family', 'flow/src/family', 'pandas/docs/family'];

const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

function sourceProblems() {
  const problems = [];
  if (currentDataBlock(read(path.join(src, 'switcher.js'))) !== buildDataBlock(src)) {
    problems.push('switcher.js: блок данных не совпадает с family.json и marks/');
  }
  const mf = path.join(src, 'MANIFEST.json');
  if (!existsSync(mf) || read(mf) !== JSON.stringify(buildManifest(src), null, 2) + '\n') {
    problems.push('MANIFEST.json устарел');
  }
  return problems;
}

if (!check) {
  const swPath = path.join(src, 'switcher.js');
  const sw = read(swPath);
  writeFileSync(swPath, sw.replace(currentDataBlock(sw), () => buildDataBlock(src)), 'utf8');
  writeFileSync(path.join(src, 'MANIFEST.json'), JSON.stringify(buildManifest(src), null, 2) + '\n', 'utf8');
  console.log('эталон: блок данных и MANIFEST.json пересобраны');
}

const problems = sourceProblems();
for (const p of problems) console.log(`эталон: ${p}`);

if (buildOnly) process.exit(0);

const files = [...listSetFiles(src), 'MANIFEST.json'];
let behind = 0;
for (const t of TARGETS) {
  const dest = path.join(root, t);
  const repo = t.split('/')[0];
  if (!existsSync(path.join(root, repo))) {
    console.log(`${t}: репозитория нет рядом, пропуск`);
    continue;
  }
  const stale = files.filter(
    (f) => !existsSync(path.join(dest, f)) || hashFile(path.join(dest, f)) !== hashFile(path.join(src, f)),
  );
  if (check) {
    if (stale.length) {
      behind++;
      const head = stale.slice(0, 3).join(', ') + (stale.length > 3 ? ', ...' : '');
      console.log(`${t}: отстал, ${stale.length} из ${files.length} файлов (${head})`);
    } else console.log(`${t}: актуален`);
  } else {
    for (const f of stale) {
      mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
      copyFileSync(path.join(src, f), path.join(dest, f));
    }
    console.log(`${t}: скопировано ${stale.length} из ${files.length}`);
  }
}
if (check && (behind || problems.length)) process.exitCode = 1;
