/**
 * Гейт вида «Найдите, что не так» (`mode: 'spot'`): движок src/engine/spot.ts на всех заданиях пака domain-core.
 *
 * Верную таблицу считает запрос к Kaiyo, дефекты вносятся в неё явной правкой (`mutate`), дефектные клетки
 * движок выводит сам. Такое правило ломается молча четырьмя способами: сохранённые строки разъезжаются с
 * запросом, порча ничего не меняет (дефекта нет, а ответ «всё в порядке» не принимается), дефектные клетки
 * движка не те, что реально изменились, приманка совпадает с дефектом (верный ответ наказывается).
 * Поэтому на каждом задании гейт проверяет:
 *  1. состав: запрос выполняется, `head` и `rows` совпадают с результатом, колонки итога и порч существуют;
 *  2. сборка без ошибок: у каждой порчи `where` подходит ровно одной строке, подвал есть там, где порча его трогает;
 *  3. каждая порча по отдельности меняет таблицу, а дефектные клетки движка равны клеткам, которые гейт находит
 *     независимо, сравнением испорченной таблицы с верной;
 *  4. дефекты не пересекаются, приманка не лежит ни в одном дефекте и показывает верное значение;
 *  5. проверка «всё или ничего»: все дефекты принимаются (хоть по одной клетке), лишняя отметка, пропуск
 *     дефекта и «Всё в порядке» там, где дефект есть, не принимаются; на таблице без порч принимается только
 *     «Всё в порядке», а в ней есть приманка;
 *  6. неоднозначности нет: задвоение не идёт с «Строк: N», порча колонки не идёт с итогом по ней же;
 *  7. числа разборов не набраны руками: в тексте только плейсхолдеры, `{n}` и `{m}` считают запросы `sql` и
 *     `sql2` к Kaiyo и сверяются с `n` и `m` в задании;
 *  8. английский перевод: столько же разборов, те же плейсхолдеры, без тире.
 *
 * Запуск: npm run test:spot (входит в npm run verify).
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
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-spot--'));

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const check = (name, cond, msg) => (cond ? ok(name) : fail(name, msg));

const KNOWN = ['n', 'm', 'delta', 'factor', 'value', 'sum', 'total', 'rows', 'expected'];
const placeholdersOf = (text) => [...String(text).matchAll(/\{([a-z]+)\}/g)].map((m) => m[1]);
const stripPlaceholders = (text) => String(text).replace(/\{[a-z]+\}/g, '');
const DASH = /[—–]/;

try {
  execSync(
    `npx tsc "${path.join(root, 'src/engine/spot.ts')}" ` +
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
  const E = await import(pathToFileURL(path.join(outDir, 'engine', 'spot.js')).href);

  const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
  const db = new SQL.Database(new Uint8Array(readFileSync(path.join(root, '.cache', 'quaera.sqlite'))));

  const pack = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', 'domain-core.json'), 'utf8'));
  const en = JSON.parse(readFileSync(path.join(root, 'src', 'content', 'packs', 'domain-core.en.json'), 'utf8'));
  const tasks = pack.tasks.filter((x) => x.mode === 'spot');
  check('в паке есть задания spot', tasks.length > 0, 'нет ни одного');

  const cellsOfRow = (head, r) => head.map((_, ci) => E.cellKey(r, ci));
  const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

  for (const t of tasks) {
    const sp = t.spot;
    const at = t.id;

    // Поля задания.
    check(`${at}: есть вопрос, подсказки и разбор`, !!t.orderQuestion && (t.hints ?? []).length >= 2 && (t.explain ?? '').length >= 80, 'нет вопроса, двух подсказок или разбора');
    check(`${at}: нет вариантов ответа и решения`, !t.options?.length && !t.solution, 'ответ выводится из mutate');
    check(`${at}: постановка короткая`, `${t.brief} ${t.goal}`.length <= 160, `${(t.brief + t.goal).length} знаков`);
    check(`${at}: в разборе нет набранных руками чисел`, !/\d{2,}/.test(t.explain), 'число в разборе задания: его не набирают руками');
    for (const h of t.hints) check(`${at}: в подсказке нет чисел`, !/\d{2,}/.test(h), 'число в подсказке');

    // 1. Запрос и сохранённые строки.
    const res = db.exec(sp.sql)[0];
    check(`${at}: запрос выполняется`, !!res && res.values.length >= 4, 'пустой или короткий результат');
    if (!res) continue;
    check(`${at}: заголовки сходятся с запросом`, JSON.stringify(sp.head) === JSON.stringify(res.columns), `${JSON.stringify(sp.head)} вместо ${JSON.stringify(res.columns)}`);
    check(`${at}: строки сходятся с Kaiyo`, JSON.stringify(sp.rows) === JSON.stringify(res.values), `в задании ${JSON.stringify(sp.rows)}, а запрос даёт ${JSON.stringify(res.values)}`);
    // 1а. Подписи колонок: ключи те же, что колонки результата; EN-пак с тем же набором ключей.
    const labelKeys = Object.keys(sp.labels ?? {}).sort();
    check(`${at}: labels есть, ключи совпадают с колонками результата`, JSON.stringify(labelKeys) === JSON.stringify([...res.columns].sort()), `ключи ${JSON.stringify(labelKeys)}, колонки ${JSON.stringify(res.columns)}`);
    check(`${at}: подписи не пустые и не повторяют имя колонки`, labelKeys.every((k) => sp.labels[k].trim() && sp.labels[k] !== k), 'пустая подпись или имя колонки SQL');
    const enLabels = en.tasks.find((x) => x.id === t.id)?.labels ?? {};
    check(`${at}: EN labels с теми же ключами`, JSON.stringify(Object.keys(enLabels).sort()) === JSON.stringify(labelKeys), `EN ${JSON.stringify(Object.keys(enLabels).sort())}`);
    check(`${at}: EN labels без тире и кириллицы`, Object.values(enLabels).every((v) => !DASH.test(v) && !/[а-яё]/i.test(v)), 'тире или кириллица в EN подписи');
    check(`${at}: строк не больше четырнадцати (таблица читается целиком)`, sp.rows.length <= 14, `${sp.rows.length}`);
    if (sp.footer?.total) {
      const ci = sp.head.indexOf(sp.footer.total);
      check(`${at}: колонка итога числовая`, ci >= 0 && sp.rows.every((r) => typeof r[ci] === 'number'), 'footer.total не числовая колонка');
    }
    check(`${at}: подвал задан`, !!(sp.footer?.rows || sp.footer?.total) || sp.mutate.every((m) => m.kind === 'scale'), 'порча drop или total без подвала');

    // 2. Сборка.
    const built = E.buildSpot(sp);
    check(`${at}: сборка без ошибок`, built.errors.length === 0, built.errors.join('; '));
    const clean = E.buildSpot({ ...sp, mutate: [], decoys: [] });
    check(`${at}: верная таблица совпадает с сохранённой`, JSON.stringify(clean.rows) === JSON.stringify(sp.rows), 'без порч таблица изменилась');
    check(`${at}: в верной таблице итог равен сумме строк`, clean.sum === null || clean.footerTotal === clean.sum, 'итог верной таблицы не сходится');

    // 3. Каждая порча меняет таблицу; клетки движка равны найденным независимо.
    const ids = sp.mutate.map((m) => m.id);
    check(`${at}: id порч уникальны`, new Set(ids).size === ids.length, 'повтор id');
    for (const m of sp.mutate) {
      const one = E.buildSpot({ ...sp, mutate: [m], decoys: [] });
      check(`${at}/${m.id}: сборка порчи без ошибок`, one.errors.length === 0, one.errors.join('; '));
      const changed =
        JSON.stringify(one.rows) !== JSON.stringify(clean.rows) ||
        one.footerRows !== clean.footerRows ||
        one.footerTotal !== clean.footerTotal;
      check(`${at}/${m.id}: порча меняет таблицу`, changed, 'таблица осталась верной: дефекта нет');
      const engineCells = one.defects[0]?.cells ?? [];

      // Независимый поиск изменённых клеток.
      let found = [];
      if (m.kind === 'scale') {
        for (let r = 0; r < one.rows.length; r++)
          for (let c = 0; c < sp.head.length; c++) if (one.rows[r][c] !== clean.rows[r]?.[c]) found.push(E.cellKey(r, c));
      } else if (m.kind === 'drop') {
        if (one.rows.length === clean.rows.length - 1) found = [E.FOOTER_ROWS];
      } else if (m.kind === 'total') {
        if (one.footerTotal !== one.sum) found = [E.FOOTER_TOTAL];
      } else if (m.kind === 'dup') {
        for (let r = 0; r + 1 < one.rows.length; r++) {
          if (JSON.stringify(one.rows[r]) === JSON.stringify(one.rows[r + 1]) && JSON.stringify(clean.rows[r]) !== JSON.stringify(clean.rows[r + 1])) {
            found = [...cellsOfRow(sp.head, r), ...cellsOfRow(sp.head, r + 1)];
          }
        }
      }
      check(`${at}/${m.id}: дефектные клетки движка равны изменённым (${engineCells.length})`, found.length > 0 && sameSet(engineCells, found), `движок ${engineCells.join(',')}, таблица ${found.join(',')}`);
      if (m.kind === 'scale') check(`${at}/${m.id}: factor не равен 1 и 0`, m.factor !== 1 && m.factor !== 0 && Number.isFinite(m.factor), `factor ${m.factor}`);
      if (m.kind === 'total') check(`${at}/${m.id}: delta не нуль`, !!m.delta, 'delta не задан');
      // 6. Неоднозначность.
      if (m.kind === 'dup') check(`${at}/${m.id}: у задвоения нет «Строк: N» (там была бы вторая дефектная клетка)`, !sp.footer?.rows, 'footer.rows при dup');
      if (m.kind === 'scale') check(`${at}/${m.id}: колонка порчи не входит в итог подвала`, sp.footer?.total !== m.column, 'итог по этой же колонке стал бы второй дефектной клеткой');
      if (m.kind === 'drop') check(`${at}/${m.id}: у drop есть «Строк: N»`, !!sp.footer?.rows, 'footer.rows нужен');
      if (m.kind === 'total') check(`${at}/${m.id}: у total есть «Итог»`, !!sp.footer?.total, 'footer.total нужен');
    }

    // 4. Дефекты и приманки.
    const all = built.defects.flatMap((d) => d.cells);
    check(`${at}: дефекты не пересекаются`, new Set(all).size === all.length, 'клетка в двух дефектах');
    check(`${at}: дефектов ${built.defects.length} из ${sp.mutate.length} порч`, built.defects.length === sp.mutate.length, 'порча не дала дефекта');
    sp.decoys.forEach((d, i) => {
      const key = built.decoyCells[i];
      check(`${at}/приманка ${i + 1}: клетка найдена`, !!key, 'строка или колонка приманки не найдена');
      check(`${at}/приманка ${i + 1}: не совпадает с дефектом`, !all.includes(key), 'приманка лежит в дефекте');
      const [r, c] = key.split(':').map(Number);
      const cleanRow = sp.rows.find((row) => Object.entries(d.where).every(([col, v]) => String(row[sp.head.indexOf(col)]) === String(v)));
      check(`${at}/приманка ${i + 1}: значение верное`, built.rows[r]?.[c] === cleanRow?.[c], 'приманка показывает испорченное значение');
    });

    // 5. Проверка «всё или ничего».
    const marksAll = all;
    const marksOne = built.defects.map((d) => d.cells[0]);
    const decoyKey = built.decoyCells[0];
    const nonDefect = [...Array(built.rows.length * sp.head.length).keys()].map((i) => E.cellKey(Math.floor(i / sp.head.length), i % sp.head.length)).find((k) => !all.includes(k) && !built.decoyCells.includes(k));
    const g = (marks, allOk = false) => E.gradeSpot(built, marks, allOk);
    if (built.defects.length > 0) {
      check(`${at}: все клетки дефектов принимаются`, g(marksAll).correct, 'не принято');
      check(`${at}: по одной клетке на дефект принимается`, g(marksOne).correct, 'не принято');
      check(`${at}: «Всё в порядке» не принимается`, !g([], true).correct && g([], true).missed.length === built.defects.length, 'принято или неполно');
      check(`${at}: без отметок не принимается`, !g([]).correct, 'принято');
      if (built.defects.length > 1) check(`${at}: пропуск одного дефекта не принимается`, !g(marksOne.slice(1)).correct && g(marksOne.slice(1)).missed.length === 1, 'принято');
      check(`${at}: лишняя отметка не принимается`, !g([...marksOne, nonDefect]).correct && g([...marksOne, nonDefect]).extra.length === 1, 'принято');
      if (decoyKey) check(`${at}: приманка к верным отметкам не принимается и узнаётся`, !g([...marksOne, decoyKey]).correct && g([...marksOne, decoyKey]).decoyHits.includes(0), 'принято или не узнана');
    } else {
      check(`${at}: «Всё в порядке» принимается на таблице без порч`, g([], true).correct, 'не принято');
      check(`${at}: любая отметка не принимается`, !g([nonDefect]).correct, 'принято');
      check(`${at}: в таблице без дефектов есть приманка`, sp.decoys.length > 0, 'нет приманки: вид не учит не отмечать верное');
    }

    // 7. Числа разборов.
    const texts = [
      ...sp.mutate.map((m, i) => ({ who: `порча ${m.id}`, src: m, text: m.why, kind: m.kind, i })),
      ...sp.decoys.map((d, i) => ({ who: `приманка ${i + 1}`, src: d, text: d.why, kind: 'decoy', i })),
    ];
    for (const x of texts) {
      const ph = placeholdersOf(x.text);
      check(`${at}/${x.who}: плейсхолдеры известны`, ph.every((p) => KNOWN.includes(p)), `неизвестный: ${ph.filter((p) => !KNOWN.includes(p)).join(',')}`);
      check(`${at}/${x.who}: в разборе нет набранных руками чисел`, !/\d{2,}/.test(stripPlaceholders(x.text)), 'число в тексте: оно считается, а не набирается');
      check(`${at}/${x.who}: разбор содержательный`, x.text.length >= 60, 'слишком короткий');
      if (ph.includes('n')) {
        const val = x.src.sql ? db.exec(x.src.sql)[0]?.values?.[0]?.[0] : undefined;
        check(`${at}/${x.who}: {n} считает запрос и сходится с n (${val})`, typeof val === 'number' && Number.isFinite(val) && val > 0 && val === x.src.n, `n = ${x.src.n}, а Kaiyo даёт ${val}`);
      } else check(`${at}/${x.who}: без {n} нет и запроса`, !x.src.sql, 'sql задан, а {n} в тексте нет');
      if (ph.includes('m')) {
        const val = x.src.sql2 ? db.exec(x.src.sql2)[0]?.values?.[0]?.[0] : undefined;
        check(`${at}/${x.who}: {m} считает sql2 и сходится с m (${val})`, typeof val === 'number' && Number.isFinite(val) && val === x.src.m, `m = ${x.src.m}, а Kaiyo даёт ${val}`);
      } else check(`${at}/${x.who}: без {m} нет и sql2`, !x.src.sql2, 'sql2 задан, а {m} в тексте нет');
      if (ph.includes('value')) check(`${at}/${x.who}: {value} только у scale`, x.kind === 'scale', '{value} вне порчи scale');
      if (ph.includes('delta')) check(`${at}/${x.who}: {delta} только у total`, x.kind === 'total', '{delta} вне порчи total');
      if (ph.includes('factor')) check(`${at}/${x.who}: {factor} только у scale`, x.kind === 'scale', '{factor} вне порчи scale');
      if (ph.includes('sum') || ph.includes('total')) check(`${at}/${x.who}: {sum} и {total} нужен подвал с итогом`, !!sp.footer?.total, 'нет footer.total');
    }

    // 8. Перевод.
    const tr = en.tasks.find((x) => x.id === t.id);
    check(`${at}: английский перевод есть`, !!tr, 'нет перевода');
    if (!tr) continue;
    check(`${at}: EN порч столько же`, (tr.spotMutate ?? []).length === sp.mutate.length, `${(tr.spotMutate ?? []).length} вместо ${sp.mutate.length}`);
    check(`${at}: EN приманок столько же`, (tr.spotDecoys ?? []).length === sp.decoys.length, `${(tr.spotDecoys ?? []).length} вместо ${sp.decoys.length}`);
    texts.forEach((x) => {
      const e = (x.kind === 'decoy' ? tr.spotDecoys : tr.spotMutate)?.[x.i];
      if (!e) return;
      check(`${at}/${x.who}: EN плейсхолдеры те же`, JSON.stringify(placeholdersOf(e.why).sort()) === JSON.stringify(placeholdersOf(x.text).sort()), 'расходятся с русским');
      check(`${at}/${x.who}: EN без чисел и тире`, !/\d{2,}/.test(stripPlaceholders(e.why)) && !DASH.test(e.why), 'число или тире в английском разборе');
    });
    for (const f of ['title', 'brief', 'goal', 'orderQuestion', 'explain']) {
      check(`${at}: EN ${f} без тире`, !DASH.test(tr[f] ?? ''), 'тире в английском тексте');
    }
    check(`${at}: EN подсказки того же числа и без тире`, (tr.hints ?? []).length === t.hints.length && (tr.hints ?? []).every((h) => !DASH.test(h)), 'подсказки не сошлись');
    check(`${at}: в EN разборе нет набранных руками чисел`, !/\d{2,}/.test(tr.explain ?? ''), 'число в разборе');
  }

  // Состав набора: есть задание без порч и задание с двумя дефектами.
  check('набор: есть отчёт без дефектов', tasks.some((x) => x.spot.mutate.length === 0), 'нет задания «Всё в порядке»');
  check('набор: есть отчёт с двумя дефектами', tasks.some((x) => x.spot.mutate.length >= 2), 'нет задания с двумя дефектами');

  console.log('');
  console.log(`Найдите, что не так: ${tasks.length} заданий проверено на таблицу, дефекты, приманки и числа разборов.`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.log('');
  console.log(`Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log('Все проверки «Найдите, что не так» пройдены.');
