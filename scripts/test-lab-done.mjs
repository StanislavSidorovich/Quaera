/**
 * Гейт приёма отметки из Lab (src/labDone.ts): `#lab-done=pipeline:<id>`, `build:<id>`, `practice:<id>`.
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
const { labDoneKind, parseLabDone, readLabDoneMap, acceptLabDone, isLabDoneKey } = await import(pathToFileURL(path.join(outDir, 'labDone.js')).href);

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
eq('build link', parseLabDone('#lab-done=build:kaiyo-sales'), { key: 'build:kaiyo-sales', rest: '' });
eq('practice sql', parseLabDone('#lab-done=practice:sql'), { key: 'practice:sql', rest: '' });
eq('practice python', parseLabDone('#lab-done=practice:python'), { key: 'practice:python', rest: '' });
eq('mixed fragment keeps the rest', parseLabDone('#lab-done=build:kaiyo-sales&x=1'), { key: 'build:kaiyo-sales', rest: '#x=1' });
eq('encoded colon, build', parseLabDone('#lab-done=build%3Akaiyo-sales'), { key: 'build:kaiyo-sales', rest: '' });
eq('other kind', parseLabDone('#lab-done=quiz:sql'), null);
eq('other kind, plural', parseLabDone('#lab-done=builds:kaiyo-sales'), null);
eq('bad id, build', parseLabDone('#lab-done=build:kaiyo_sales'), null);
eq('empty id, practice', parseLabDone('#lab-done=practice:'), null);
eq('kind of key', [labDoneKind('pipeline:a'), labDoneKind('build:a'), labDoneKind('practice:a'), labDoneKind('x:a')], ['pipeline', 'build', 'practice', null]);
eq('bad id', parseLabDone('#lab-done=pipeline:kaiyo_sellout'), null);
eq('empty id', parseLabDone('#lab-done=pipeline:'), null);
eq('broken escape', parseLabDone('#lab-done=%E0%A4%A'), null);

// хранилище: свои записи остаются, мусор не мешает
eq('read map', readLabDoneMap('{"pipeline:a":"2026-01-01","x":"y","pipeline:b":5}'), { 'pipeline:a': '2026-01-01' });
eq('read map, new kinds', readLabDoneMap('{"build:kaiyo-sales":"d","practice:sql":"e","quiz:sql":"f"}'), { 'build:kaiyo-sales': 'd', 'practice:sql': 'e' });
eq('read garbage', readLabDoneMap('{oops'), {});
eq('read array', readLabDoneMap('[1]'), {});
eq('read null', readLabDoneMap(null), {});
// новые ключи сборки: дефис в id проходит (Lab шлёт `-more` и `-refresh`)
eq('more key', parseLabDone('#lab-done=build:kaiyo-sales-more'), { key: 'build:kaiyo-sales-more', rest: '' });
eq('refresh key', parseLabDone('#lab-done=build%3Akaiyo-sales-refresh&x=1'), { key: 'build:kaiyo-sales-refresh', rest: '#x=1' });
eq('isLabDoneKey', [isLabDoneKey('build:kaiyo-sales-more'), isLabDoneKey('build:kaiyo-sales-refresh'), isLabDoneKey('build:Kaiyo'), isLabDoneKey('x')], [true, true, false, false]);

// приём: отдан хранилищу прогресса, адрес очищен, путь и запрос на месте
const stored = [];
const store = (k, iso) => stored.push([k, iso]);
let replaced = null;
const key = acceptLabDone({ pathname: '/', search: '?roles=map', hash: '#x=1&lab-done=pipeline:kaiyo-sellout' }, (u) => (replaced = u), store, new Date('2026-11-05T10:00:00Z'));
eq('accepted key', key, 'pipeline:kaiyo-sellout');
eq('url cleaned', replaced, '/?roles=map#x=1');
eq('stored', stored, [['pipeline:kaiyo-sellout', '2026-11-05T10:00:00.000Z']]);
replaced = null;
eq('accepted build', acceptLabDone({ pathname: '/', search: '', hash: '#lab-done=build:kaiyo-sales&x=1' }, (u) => (replaced = u), store, new Date('2026-11-09T10:00:00Z')), 'build:kaiyo-sales');
eq('build: url keeps the rest', replaced, '/#x=1');
eq('build: stored', stored[1], ['build:kaiyo-sales', '2026-11-09T10:00:00.000Z']);
replaced = null;
eq('foreign kind is not accepted', acceptLabDone({ pathname: '/', search: '', hash: '#lab-done=quiz:sql' }, (u) => (replaced = u), store), null);
eq('foreign kind: address untouched', replaced, null);
eq('foreign kind: nothing stored', stored.length, 2);
replaced = null;
eq('nothing to accept', acceptLabDone({ pathname: '/', search: '', hash: '#x=1' }, (u) => (replaced = u), store), null);
eq('address untouched', replaced, null);
// хранилище, которое бросает: ключ всё равно принят, адрес очищен
let cleaned = null;
eq('broken store', acceptLabDone({ pathname: '/', search: '', hash: '#lab-done=pipeline:kaiyo-sellout' }, (u) => (cleaned = u), () => { throw new Error('no'); }), 'pipeline:kaiyo-sellout');
eq('broken store, url cleaned', cleaned, '/');

if (failed) {
  console.error(`\n${failed} проверок не прошли`);
  process.exit(1);
}
console.log('test:lab-done OK');
