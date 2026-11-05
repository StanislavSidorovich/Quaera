/**
 * Гейт вида «Проведите связи» (`mode: 'relate'`): движок src/engine/relate.ts на всех
 * заданиях пака model-core.
 *
 * Эталона в задании нет, он выводится из внешних ключей schema.json. Такое правило
 * ломается молча тремя способами: верная сборка не принимается (задание нерешаемо),
 * неверная принимается, ловушка не срабатывает ни на чьём ответе (мёртвый разбор).
 * Поэтому на каждом задании гейт проверяет:
 *  1. таблицы и раскрытые колонки существуют, колонок 2..4 на таблицу;
 *  2. из внешних ключей между показанными таблицами выводится непустой эталон, обе колонки
 *     каждой эталонной связи раскрыты, сторона «1» (первичный ключ) в данных действительно уникальна;
 *  3. эталон принимается и не попадает ни в одну ловушку;
 *  4. для каждой ловушки строится ответ с этой ошибкой: он не принимается и попадает именно в неё;
 *  5. у разбора есть все четыре части; число симптома не набрано руками: в тексте только {n},
 *     а само число считает запрос \`sql\` к Kaiyo и сверяется с \`n\` в задании;
 *  6. английский перевод: столько же разборов, {n} там же, где в русском, без тире;
 *  7. раскладка: у каждой раскрытой колонки есть строка внутри своего узла, узлы не пересекаются.
 *
 * \`node scripts/test-relate.mjs --write\` записывает посчитанные числа в \`n\` (текстом, формат файла
 * не трогается); без флага расхождение это провал. Входит в npm run verify.
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import initSqlJs from 'sql.js';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-relate--'));
const WRITE = process.argv.includes('--write');

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const check = (name, cond, msg) => (cond ? ok(name) : fail(name, msg));

/** Записывает `n` в ловушку, не трогая остальной текст файла. */
function writeN(file, taskId, trapId, n) {
  const raw = readFileSync(file, 'utf8');
  const t = raw.indexOf(`"id": "${taskId}"`);
  const i = t < 0 ? -1 : raw.indexOf(`"id": "${trapId}"`, t);
  if (i < 0) throw new Error(`не найдена ловушка ${taskId}/${trapId}`);
  const next = raw.indexOf('"symptom"', i);
  const head = raw.slice(i, next).replace(/\n\s*"n": [^\n]*,(?=\n)/, '');
  const fmt = /(\n\s*"fmt": "[a-z]+",)/.exec(head);
  if (!fmt) throw new Error(`у ${trapId} нет fmt`);
  const indent = /\n(\s*)"fmt"/.exec(head)[1];
  const patched = head.replace(fmt[1], `${fmt[1]}\n${indent}"n": ${n},`);
  writeFileSync(file, raw.slice(0, i) + patched + raw.slice(next));
}

try {
  execSync(
    `npx tsc "${path.join(root, 'src/engine/relate.ts')}" "${path.join(root, 'src/ui/schemaLayout.ts')}" ` +
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
  const E = await import(pathToFileURL(path.join(outDir, 'engine', 'relate.js')).href);
  const L = await import(pathToFileURL(path.join(outDir, 'ui', 'schemaLayout.js')).href);

  const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
  const db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'quaera.sqlite'))));
  const schema = JSON.parse(readFileSync(path.join(root, 'public', 'data', 'schema.json'), 'utf8'));
  const colsOf = (table) => schema.tables.find((t) => t.table === table)?.columns.map((c) => c.name);

  const packFile = path.join(root, 'src', 'content', 'packs', 'model-core.json');
  const pack = JSON.parse(readFileSync(packFile, 'utf8'));
  const en = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', 'model-core.en.json'), 'utf8'));
  let tasks = 0;
  const pending = [];

  for (const t of pack.tasks.filter((x) => x.mode === 'relate')) {
    tasks++;
    const spec = t.relate;
    const shown = spec.tables.map((x) => x.table);

    // 1. Состав.
    for (const x of spec.tables) {
      const have = colsOf(x.table);
      check(`${t.id}: таблица ${x.table} есть в схеме`, !!have, 'таблицы нет в schema.json');
      if (!have) continue;
      check(`${t.id}: ${x.table}: колонок 2...4`, x.columns.length >= 2 && x.columns.length <= 4, `колонок ${x.columns.length}`);
      for (const c of x.columns) check(`${t.id}: ${x.table}.${c} существует`, have.includes(c), 'колонки нет в таблице');
    }
    const exposed = new Set(E.exposedColumns(spec));

    // 2. Эталон из внешних ключей.
    const ref = E.referenceRelations(schema, shown);
    check(`${t.id}: эталон не пуст (${ref.length} связей из внешних ключей)`, ref.length > 0, 'между показанными таблицами нет внешних ключей');
    for (const r of ref) {
      check(`${t.id}: колонки связи ${r.fk} → ${r.pk} раскрыты`, exposed.has(r.fk) && exposed.has(r.pk), 'нужная колонка не раскрыта: задание нерешаемо');
      const [pt, pc] = [E.tableOf(r.pk), r.pk.slice(r.pk.indexOf('.') + 1)];
      const u = db.exec(`SELECT COUNT(*), COUNT(DISTINCT ${pc}) FROM ${pt}`)[0].values[0];
      check(`${t.id}: сторона «1» ${r.pk} уникальна (${u[0]} строк)`, u[0] === u[1], 'ключ повторяется: «1» там неверно');
    }

    // 3. Эталон принимается и не попадает в ловушки.
    const good = E.referenceAsRels(ref);
    const vGood = E.gradeRelate(good, ref, spec.traps);
    check(`${t.id}: эталон принимается`, vGood.correct, 'эталон не принят');
    check(`${t.id}: эталон не попадает в ловушки`, vGood.traps.length === 0, `попал в ${vGood.traps.join(', ')}`);

    // 4. Ответ с ошибкой попадает именно в свою ловушку.
    const otherTableCol = (table) => [...exposed].find((k) => E.tableOf(k) !== table);
    for (const tr of spec.traps) {
      let bad = null;
      if (tr.kind === 'drew') {
        check(`${t.id}/${tr.id}: колонки раскрыты`, exposed.has(tr.a) && exposed.has(tr.b), 'колонка ловушки не раскрыта');
        check(`${t.id}/${tr.id}: связи нет в эталоне`, !ref.some((r) => E.pairKey(r.fk, r.pk) === E.pairKey(tr.a, tr.b)), 'ловушка совпадает с эталонной связью');
        bad = [...good, { a: tr.a, b: tr.b, ca: 'many', cb: 'many' }];
      } else if (tr.kind === 'touch') {
        check(`${t.id}/${tr.id}: таблица показана`, shown.includes(tr.table), 'таблицы ловушки нет в задании');
        const mine = [...exposed].find((k) => E.tableOf(k) === tr.table);
        const other = otherTableCol(tr.table);
        bad = [...good, { a: mine, b: other, ca: 'many', cb: 'many' }];
      } else if (tr.kind === 'missing') {
        const has = ref.some((r) => E.pairKey(r.fk, r.pk) === E.pairKey(tr.a, tr.b));
        check(`${t.id}/${tr.id}: связь есть в эталоне`, has, 'ловушка «не провёл» про связь, которой в эталоне нет');
        bad = good.filter((r) => E.pairKey(r.a, r.b) !== E.pairKey(tr.a, tr.b));
      } else if (tr.kind === 'keyMany') {
        bad = good.map((r, i) => (i === 0 ? { ...r, cb: 'many' } : r));
      }
      const v = E.gradeRelate(bad, ref, spec.traps);
      check(`${t.id}/${tr.id}: ответ с ошибкой не принимается и попадает в ловушку`, !v.correct && v.traps.includes(tr.id), `верно=${v.correct}, ловушки=${v.traps.join(',')}`);

      // 5. Разбор и число симптома.
      for (const f of ['symptom', 'cause', 'fix', 'business']) {
        check(`${t.id}/${tr.id}: ${f} заполнен`, typeof tr[f] === 'string' && tr[f].length >= 20, 'пусто или слишком коротко');
        check(`${t.id}/${tr.id}: в ${f} нет набранных руками чисел`, !/\d{2,}/.test(tr[f]), 'число в тексте: оно должно считаться запросом и стоять как {n}');
      }
      if (tr.sql) {
        check(`${t.id}/${tr.id}: в симптоме есть {n}`, tr.symptom.includes('{n}'), 'запрос задан, а {n} в симптоме нет');
        const val = db.exec(tr.sql)[0]?.values?.[0]?.[0];
        check(`${t.id}/${tr.id}: запрос даёт число`, typeof val === 'number' && Number.isFinite(val) && val > 0, `результат ${val}`);
        if (tr.n === val) ok(`${t.id}/${tr.id}: n = ${val} сходится с Kaiyo`);
        else if (WRITE) {
          pending.push([packFile, t.id, tr.id, val]);
          console.log(` write ${t.id}/${tr.id}: n ${tr.n} → ${val}`);
        } else fail(`${t.id}/${tr.id}`, `n = ${tr.n}, а Kaiyo даёт ${val} (npm run test:relate -- --write запишет число)`);
      } else {
        check(`${t.id}/${tr.id}: нет запроса, значит нет и {n}`, !tr.symptom.includes('{n}'), '{n} без запроса');
      }
    }

    // 6. Перевод.
    const tr = en.tasks.find((x) => x.id === t.id);
    check(`${t.id}: английский перевод есть`, !!tr, 'нет перевода');
    if (tr) {
      check(`${t.id}: разборов столько же`, (tr.relateTraps ?? []).length === spec.traps.length, `${(tr.relateTraps ?? []).length} вместо ${spec.traps.length}`);
      spec.traps.forEach((x, i) => {
        const e = tr.relateTraps?.[i];
        if (!e) return;
        check(`${t.id}/${x.id}: {n} в EN там же, где в RU`, e.symptom.includes('{n}') === x.symptom.includes('{n}'), 'расходятся');
        for (const f of ['symptom', 'cause', 'fix', 'business']) check(`${t.id}/${x.id}: EN ${f} без тире`, !/[—–]/.test(e[f] ?? ''), 'тире в английском тексте');
      });
      for (const f of ['title', 'brief', 'goal', 'orderQuestion', 'explain']) check(`${t.id}: EN ${f} без тире`, !/[—–]/.test(tr[f] ?? ''), 'тире в английском тексте');
    }

    // 7. Раскладка.
    const columns = Object.fromEntries(spec.tables.map((x) => [x.table, x.columns]));
    const lay = L.buildSchemaLayout(E.subsetDoc(schema, shown), { columns });
    for (const x of spec.tables) {
      const n = lay.nodes.find((q) => q.table === x.table);
      check(`${t.id}: ${x.table} на схеме с ${x.columns.length} строками колонок`, !!n && n.rows?.length === x.columns.length && n.rows.every((r) => r.y > n.y && r.y < n.y + n.h), 'строк нет или они вне узла');
    }
    let overlap = false;
    for (const a of lay.nodes) for (const b of lay.nodes) if (a !== b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlap = true;
    check(`${t.id}: узлы схемы не пересекаются`, !overlap, 'узлы наезжают друг на друга');
  }

  for (const p of pending) writeN(...p);
  console.log('');
  console.log(`Связи: ${tasks} заданий проверено на эталон, ловушки и числа симптомов.`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.log('');
  console.log(`Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log('Все проверки связей пройдены.');
