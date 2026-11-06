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
 *  7. раскладка: у каждой раскрытой колонки есть строка внутри своего узла, узлы не пересекаются;
 *  8. задание с подложенным дефектом (`defect`): стартовая модель отличается от эталона и попадает в разбор,
 *     строки отчёта (`report.rows`) совпадают с результатом запроса `report.sql` к Kaiyo;
 *  9. задание с переключателем направления (`directions`): ответ «оба» не принимается и попадает в свою
 *     ловушку, числа симптомов у ловушек различаются; второй шаг-выбор опирается на эталон
 *     (дистрибьюторы в sell-in действительно лежат в dim_customer с регионом).
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
function writeN(file, taskId, trapId, n, key = 'n') {
  const raw = readFileSync(file, 'utf8');
  const t = raw.indexOf(`"id": "${taskId}"`);
  const i = t < 0 ? -1 : raw.indexOf(`"id": "${trapId}"`, t);
  if (i < 0) throw new Error(`не найдена ловушка ${taskId}/${trapId}`);
  const next = raw.indexOf('"symptom"', i);
  const head = raw.slice(i, next).replace(new RegExp(`\\n\\s*"${key}": [^\\n]*,(?=\\n)`), '');
  const fmt = /(\n\s*"fmt": "[a-z]+",)/.exec(head);
  if (!fmt) throw new Error(`у ${trapId} нет fmt`);
  const indent = /\n(\s*)"fmt"/.exec(head)[1];
  const patched = head.replace(fmt[1], `${fmt[1]}\n${indent}"${key}": ${n},`);
  writeFileSync(file, raw.slice(0, i) + patched + raw.slice(next));
}

/** Состав задания `relate`: у одношагового это поле задания, у многошагового первый шаг вида relate. */
const relateOf = (t) => {
  if (t.mode !== 'relate') return null;
  const si = (t.steps ?? []).findIndex((s) => s.kind === 'relate');
  return { spec: si >= 0 ? t.steps[si].relate : t.relate, stepIndex: si };
};

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
    const { spec, stepIndex } = relateOf(t);
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
    check(`${t.id}: эталон без «оба» (направление «одно» везде)`, !vGood.dirs, 'в эталоне есть «оба»');
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
      } else if (tr.kind === 'both') {
        check(`${t.id}/${tr.id}: переключатель направления включён (directions)`, spec.directions === true, 'ловушка «оба» без directions: переключателя на экране нет');
        bad = good.map((r) => ({ ...r, dir: 'both' }));
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
        if (tr.sql2 || tr.symptom.includes('{m}')) {
          check(`${t.id}/${tr.id}: {m} и sql2 заданы вместе`, !!tr.sql2 && tr.symptom.includes('{m}'), 'второе число задано не целиком');
          const val2 = db.exec(tr.sql2)[0]?.values?.[0]?.[0];
          check(`${t.id}/${tr.id}: sql2 даёт число`, typeof val2 === 'number' && Number.isFinite(val2) && val2 > 0, `результат ${val2}`);
          if (tr.m === val2) ok(`${t.id}/${tr.id}: m = ${val2} сходится с Kaiyo`);
          else if (WRITE) {
            pending.push([packFile, t.id, tr.id, val2, 'm']);
            console.log(` write ${t.id}/${tr.id}: m ${tr.m} → ${val2}`);
          } else fail(`${t.id}/${tr.id}`, `m = ${tr.m}, а Kaiyo даёт ${val2} (npm run test:relate -- --write запишет число)`);
        }
      } else {
        check(`${t.id}/${tr.id}: нет запроса, значит нет и {n}`, !tr.symptom.includes('{n}'), '{n} без запроса');
      }
    }

    // 5б. В заданиях с переключателем направления числа ловушек различаются: каждая ошибка даёт своё.
    if (spec.directions) {
      const ns = spec.traps.map((x) => x.n);
      check(`${t.id}: числа симптомов ловушек различаются`, new Set(ns).size === ns.length, `повтор среди ${ns.join(', ')}`);
    }

    // 6. Перевод.
    const tr = en.tasks.find((x) => x.id === t.id);
    check(`${t.id}: английский перевод есть`, !!tr, 'нет перевода');
    if (tr) {
      const enTraps = stepIndex >= 0 ? tr.steps?.[stepIndex]?.relateTraps : tr.relateTraps;
      check(`${t.id}: разборов столько же`, (enTraps ?? []).length === spec.traps.length, `${(enTraps ?? []).length} вместо ${spec.traps.length}`);
      for (const st of tr.steps ?? []) {
        for (const f of ['question']) check(`${t.id}: EN шаг ${f} без тире`, !/[—–]/.test(st[f] ?? ''), 'тире в английском тексте');
        for (const o of st.options ?? []) check(`${t.id}: EN вариант без тире`, !/[—–]/.test(`${o.label ?? ''}${o.why ?? ''}`), 'тире в английском тексте');
        for (const h of st.hints ?? []) check(`${t.id}: EN подсказка без тире`, !/[—–]/.test(h), 'тире в английском тексте');
      }
      spec.traps.forEach((x, i) => {
        const e = enTraps?.[i];
        if (!e) return;
        check(`${t.id}/${x.id}: {n} в EN там же, где в RU`, e.symptom.includes('{n}') === x.symptom.includes('{n}'), 'расходятся');
        check(`${t.id}/${x.id}: {m} в EN там же, где в RU`, e.symptom.includes('{m}') === x.symptom.includes('{m}'), 'расходятся');
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

    // 8. Подложенный дефект.
    if (spec.defect) {
      const d = spec.defect;
      check(`${t.id}: колонки дефекта раскрыты`, exposed.has(d.a) && exposed.has(d.b), 'колонка дефекта не раскрыта');
      const inRef = (x, y) => ref.some((r) => E.pairKey(r.fk, r.pk) === E.pairKey(x, y));
      if (d.kind === 'missing') check(`${t.id}: недостающая связь есть в эталоне`, inRef(d.a, d.b), 'дефект «не хватает» про связь, которой в эталоне нет');
      else {
        check(`${t.id}: лишней связи нет в эталоне`, !inRef(d.a, d.b), 'дефект «лишняя» совпадает с эталонной связью');
        if (d.replaces) check(`${t.id}: заменяемая связь есть в эталоне`, inRef(d.replaces.a, d.replaces.b), 'replaces не из эталона');
      }
      const start = E.startModel(ref, d);
      const vs = E.gradeRelate(start, ref, spec.traps);
      check(`${t.id}: стартовая модель не принимается`, !vs.correct, 'в стартовой модели нет дефекта: задание решено до касания');
      check(`${t.id}: стартовая модель попадает в разбор`, vs.traps.length > 0, 'нажатие «Проверить» без правки не получит разбора');
      // Одна правка чинит дефект: модель отличается от эталона ровно одной связью (или заменой).
      const keys = new Set(start.map((r) => E.pairKey(r.a, r.b)));
      const diff = ref.filter((r) => !keys.has(E.pairKey(r.fk, r.pk))).length + start.filter((r) => !inRef(r.a, r.b)).length;
      check(`${t.id}: стартовая модель отличается от эталона одной связью или заменой`, diff >= 1 && diff <= 2, `различий ${diff}`);

      const res = db.exec(d.report.sql)[0];
      check(`${t.id}: запрос отчёта выполняется`, !!res && res.values.length >= 2, 'пустой отчёт');
      if (res) {
        check(`${t.id}: заголовки отчёта сходятся с запросом`, JSON.stringify(d.report.head) === JSON.stringify(res.columns), `${JSON.stringify(d.report.head)} вместо ${JSON.stringify(res.columns)}`);
        check(`${t.id}: строки отчёта сходятся с Kaiyo`, JSON.stringify(d.report.rows) === JSON.stringify(res.values), `в задании ${JSON.stringify(d.report.rows)}, а запрос даёт ${JSON.stringify(res.values)}`);
        const lk = Object.keys(d.report.labels ?? {}).sort();
        check(`${t.id}: labels отчёта есть, ключи совпадают с колонками`, JSON.stringify(lk) === JSON.stringify([...res.columns].sort()), `ключи ${JSON.stringify(lk)}, колонки ${JSON.stringify(res.columns)}`);
        check(`${t.id}: подписи не пустые и не повторяют имя колонки`, lk.every((k) => d.report.labels[k].trim() && d.report.labels[k] !== k), 'пустая подпись или имя колонки SQL');
        const enLab = en.tasks.find((x) => x.id === t.id)?.labels ?? {};
        check(`${t.id}: EN labels с теми же ключами`, JSON.stringify(Object.keys(enLab).sort()) === JSON.stringify(lk), `EN ${JSON.stringify(Object.keys(enLab).sort())}`);
        check(`${t.id}: EN labels без тире и кириллицы`, Object.values(enLab).every((v) => !/[—–]/.test(v) && !/[а-яё]/i.test(v)), 'тире или кириллица в EN подписи');
      }
    }

    // 9. Второй шаг-выбор опирается на эталон.
    if (t.steps?.some((s) => s.kind === 'interpret')) {
      const viaDist = ref.some((r) => r.fk === 'fact_sellin.distributor_id' && r.pk === 'dim_customer.customer_id');
      check(`${t.id}: в эталоне есть связь sell-in с дистрибьюторами`, viaDist, 'второй шаг говорит о регионе дистрибьютора, а связи в эталоне нет');
      const loose = db.exec(
        `SELECT COUNT(*) FROM fact_sellin s LEFT JOIN dim_customer c ON c.customer_id = s.distributor_id WHERE c.customer_id IS NULL OR c.customer_type <> 'distributor' OR c.region_id IS NULL`
      )[0].values[0][0];
      check(`${t.id}: каждый получатель sell-in это дистрибьютор с регионом`, loose === 0, `${loose} строк sell-in не сходятся`);
      const sellinHasRegion = schema.tables.find((q) => q.table === 'fact_sellin').columns.some((c) => /region/.test(c.name));
      check(`${t.id}: в fact_sellin своей колонки региона нет`, !sellinHasRegion, 'вариант «колонки региона нет» неверен');
      const tr2 = (en.tasks.find((x) => x.id === t.id)?.steps ?? []).find((s) => s.options);
      const ru2 = t.steps.find((s) => s.kind === 'interpret');
      check(`${t.id}: EN вариантов столько же`, !!tr2 && tr2.options.length === ru2.options.length, 'варианты шага-выбора не переведены');
    }
  }

  for (const p of pending) writeN(...p);
  // 10. Переключатель направления не просачивается в задания, где он не задан.
  for (const t of pack.tasks.filter((x) => x.mode === 'relate')) {
    const { spec } = relateOf(t);
    if (!spec.directions) check(`${t.id}: без directions нет ловушки «оба»`, !spec.traps.some((x) => x.kind === 'both'), 'ловушка «оба» без переключателя');
  }
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
