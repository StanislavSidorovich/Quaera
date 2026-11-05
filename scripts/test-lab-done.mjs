/**
 * Гейт приёма отметки из Lab (src/labDone.ts): `#lab-done=pipeline:<id>`.
 *
 * Отправляющая сторона (lab.quaera.app, src/ui/PipelinePage.tsx в StrataLab) отсюда
 * не видна, а разошедшийся формат молчит до клика живого человека: Lab отправит
 * человека назад, тренажёр не отметит ничего и останется зелёным. Поэтому здесь
 * ровно та ссылка, которую шлёт Lab, и то, что с ней нельзя делать: потерять остальной
 * фрагмент и запрос, затереть чужие отметки, принять чужой вид, упасть на мусоре.
 *
 * Запуск: npm run test:lab-done (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-lab-done-'));

execSync(`npx tsc "${path.join(root, 'src/labDone.ts')}" --target ES2022 --module CommonJS --lib ES2022,DOM --outDir "${outDir}" --skipLibCheck`, { cwd: root, stdio: 'inherit' });
writeFileSync(path.join(outDir, 'package.json'), '{"type":"commonjs"}');
const { parseLabDone, readLabDoneMap, mergeLabDone, acceptLabDone, LAB_DONE_KEY } = await import(pathToFileURL(path.join(outDir, 'labDone.js')).href);

let failed = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failed++;
    console.error(`FAIL ${name}\n  got:  ${JSON.stringify(got)}\n  want: ${JSON.stringify(want)}`);
  }
};

// Ссылка, которую шлёт Lab (lab src/ui/PipelinePage.tsx): https://quaera.app/#lab-done=pipeline:kaiyo-sellout
eq('lab link', parseLabDone('#lab-done=pipeline:kaiyo-sellout'), { key: 'pipeline:kaiyo-sellout', rest: '' });
eq('encoded colon', parseLabDone('#lab-done=pipeline%3Akaiyo-sellout'), { key: 'pipeline:kaiyo-sellout', rest: '' });
eq('rest of the fragment stays', parseLabDone('#a=1&lab-done=pipeline:kaiyo-sellout&b=2'), { key: 'pipeline:kaiyo-sellout', rest: '#a=1&b=2' });
eq('upper case', parseLabDone('#LAB-DONE=Pipeline:Kaiyo-Sellout')?.key, 'pipeline:kaiyo-sellout');
eq('no mark', parseLabDone('#story=1'), null);
eq('empty hash', parseLabDone(''), null);
eq('other kind', parseLabDone('#lab-done=practice:sql'), null);
eq('bad id', parseLabDone('#lab-done=pipeline:kaiyo_sellout'), null);
eq('empty id', parseLabDone('#lab-done=pipeline:'), null);
eq('broken escape', parseLabDone('#lab-done=%E0%A4%A'), null);

// хранилище: свои записи остаются, мусор не мешает
eq('read map', readLabDoneMap('{"pipeline:a":"2026-01-01","x":"y","pipeline:b":5}'), { 'pipeline:a': '2026-01-01' });
eq('read garbage', readLabDoneMap('{oops'), {});
eq('read array', readLabDoneMap('[1]'), {});
eq('read null', readLabDoneMap(null), {});
eq('merge keeps others', JSON.parse(mergeLabDone('{"pipeline:a":"2026-01-01"}', 'pipeline:kaiyo-sellout', '2026-11-05T00:00:00.000Z')), { 'pipeline:a': '2026-01-01', 'pipeline:kaiyo-sellout': '2026-11-05T00:00:00.000Z' });
eq('merge updates the date', JSON.parse(mergeLabDone('{"pipeline:kaiyo-sellout":"old"}', 'pipeline:kaiyo-sellout', 'new')), { 'pipeline:kaiyo-sellout': 'new' });

// приём: записано, адрес очищен, путь и запрос на месте
const store = new Map([[LAB_DONE_KEY, '{"pipeline:a":"2026-01-01"}']]);
const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) };
let replaced = null;
const key = acceptLabDone(storage, { pathname: '/', search: '?roles=map', hash: '#x=1&lab-done=pipeline:kaiyo-sellout' }, (u) => (replaced = u), new Date('2026-11-05T10:00:00Z'));
eq('accepted key', key, 'pipeline:kaiyo-sellout');
eq('url cleaned', replaced, '/?roles=map#x=1');
eq('stored', JSON.parse(store.get(LAB_DONE_KEY)), { 'pipeline:a': '2026-01-01', 'pipeline:kaiyo-sellout': '2026-11-05T10:00:00.000Z' });
replaced = null;
eq('nothing to accept', acceptLabDone(storage, { pathname: '/', search: '', hash: '#x=1' }, (u) => (replaced = u)), null);
eq('address untouched', replaced, null);
// хранилище, которое бросает: ключ всё равно принят, адрес очищен
let cleaned = null;
eq('broken storage', acceptLabDone({ getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); } }, { pathname: '/', search: '', hash: '#lab-done=pipeline:kaiyo-sellout' }, (u) => (cleaned = u)), 'pipeline:kaiyo-sellout');
eq('broken storage, url cleaned', cleaned, '/');

if (failed) {
  console.error(`\n${failed} проверок не прошли`);
  process.exit(1);
}
console.log('test:lab-done OK');
