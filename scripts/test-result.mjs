/**
 * Гейт таблицы результата (`result`) у DAX-заданий без движка. Дизайн: docs/dax-result-rows-design.md.
 *
 * Сохранённые в задании `head`, `rows`, `rowCount`, `total` обязаны совпадать с тем, что даёт `sql` / `totalSql`
 * на Kaiyo (их пишет `npm run result:write`, руками не набирать). Равносильность «мера = запрос» гейт не видит:
 * это проверяет автор. На каждое задание с `result`:
 *  - трек model (python ждёт отдельного захода), `visual` из трёх, у model есть `sql`, запрос исполняется;
 *  - `head` = колонки результата, `rows` = первые min(12, n) строк, `rowCount` = n;
 *  - `total` есть тогда и только тогда, когда есть `totalSql`; тот даёт одну строку той же ширины, равную `total`;
 *  - `card` строго 1×1 без итога; `matrix` и `column` не меньше 2 строк, кроме `empty: true` (тогда ровно 0);
 *  - ключи `fmt` из `head`; `money` и `int` целые, `num` до 2 знаков, `pct` до 4 знаков (хвосты float валят);
 *  - `focus`: ключи из `head`, совпадает ровно с одной строкой из `rows`;
 *  - подписи `labels` и `resultLabels` (en): ключи = `head`, не пустые; en без кириллицы и тире; подписи-контекст не пусты;
 *  - в конце покрытие «result: N из M кандидатов» (model с `predictSql` или `mode: fill`).
 * Проверки вынесены в `checkResult`, чтобы самопроверка могла подать подмену (пустой визуал, card, хвост float)
 * без правки пака.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MAX_ROWS, PACK_FILE, PACK_FILE_EN, cell, runSql } from './lib/result-sql.mjs';

const CYR = /[а-яё]/i;
const DASH = /[—–]/;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const decimals = (v) => (Number.isInteger(v) ? 0 : (String(v).split('.')[1] ?? '').length);

/** Возвращает список провалов `[имя, сообщение]` для одного задания; `en` это его английский перевод (или undefined). */
export async function checkResult(t, en) {
  const out = [];
  const bad = (name, msg) => out.push([`${t.id}: ${name}`, msg]);
  const r = t.result;
  if (t.track !== 'model') bad('трек', `result пока только у model, а здесь ${t.track} (pandas отдельным заходом)`);
  if (!['matrix', 'card', 'column'].includes(r.visual)) bad('visual', `visual «${r.visual}»`);
  if (!r.sql) {
    bad('sql', 'у model нет sql');
    return out;
  }
  let main;
  try {
    main = await runSql(r.sql);
  } catch (e) {
    bad('sql исполняется', String(e.message ?? e));
    return out;
  }
  const n = main.values.length;
  if (!same(r.head, main.columns)) bad('head', `в задании ${JSON.stringify(r.head)}, запрос даёт ${JSON.stringify(main.columns)}`);
  const want = main.values.slice(0, MAX_ROWS).map((row) => row.map(cell));
  if (!same(r.rows, want)) bad('rows', `сохранённые строки расходятся с запросом: npm run result:write ${t.id}`);
  if (r.rowCount !== n) bad('rowCount', `в задании ${r.rowCount}, запрос даёт ${n}`);
  if (r.rows.length > MAX_ROWS) bad('rows ≤ 12', `хранится ${r.rows.length}`);

  if (Boolean(r.total) !== Boolean(r.totalSql)) bad('total ⇔ totalSql', 'итог и его запрос должны быть оба или ни одного');
  if (r.totalSql) {
    try {
      const tot = await runSql(r.totalSql);
      if (tot.values.length !== 1) bad('totalSql', `вернул ${tot.values.length} строк вместо одной`);
      else if (tot.columns.length !== main.columns.length) bad('totalSql ширина', `${tot.columns.length} колонок вместо ${main.columns.length}`);
      else if (!same(r.total, tot.values[0].map(cell))) bad('total', `в задании ${JSON.stringify(r.total)}, запрос даёт ${JSON.stringify(tot.values[0])}`);
    } catch (e) {
      bad('totalSql исполняется', String(e.message ?? e));
    }
  }
  if (r.visual === 'card') {
    if (!(n === 1 && main.columns.length === 1)) bad('card 1×1', `${n} строк, ${main.columns.length} колонок`);
    if (r.total) bad('card без итога', 'у card итога быть не может');
  } else if (r.empty) {
    if (n !== 0) bad('empty ⇔ 0 строк', `empty: true, а строк ${n}`);
  } else if (n < 2) bad(`${r.visual} ≥ 2 строк`, `строк ${n} (пустой визуал помечается empty: true)`);
  if (!r.empty && n === 0) bad('empty ⇔ 0 строк', '0 строк без empty: true');

  for (const [col, f] of Object.entries(r.fmt ?? {})) {
    const ci = r.head.indexOf(col);
    if (ci < 0) {
      bad(`fmt ${col}`, 'колонки нет в head');
      continue;
    }
    if (!['money', 'int', 'num', 'pct'].includes(f)) bad(`fmt ${col}`, `формат «${f}»`);
    const limit = f === 'num' ? 2 : f === 'pct' ? 4 : 0;
    for (const v of [...r.rows.map((x) => x[ci]), r.total?.[ci]]) {
      if (v === null || v === undefined) continue;
      if (typeof v !== 'number') bad(`fmt ${col}`, `значение «${v}» не число`);
      else if (decimals(v) > limit) bad(`fmt ${col} хвост`, `${v}: больше ${limit} знаков, округляйте в SQL`);
    }
  }
  if (r.focus) {
    const keys = Object.keys(r.focus);
    if (!keys.every((k) => r.head.includes(k))) bad('focus', 'ключ не из head');
    else {
      const hits = r.rows.filter((row) => keys.every((k) => row[r.head.indexOf(k)] === r.focus[k])).length;
      if (hits !== 1) bad('focus', `совпадает со строками из rows: ${hits} вместо одной`);
    }
  }
  const lk = Object.keys(r.labels ?? {}).sort();
  const hk = [...r.head].sort();
  if (!same(lk, hk)) bad('labels', `ключи ${JSON.stringify(lk)}, а head ${JSON.stringify(hk)}`);
  if (Object.values(r.labels ?? {}).some((v) => !String(v).trim())) bad('labels', 'пустая подпись');
  if (!String(r.caption ?? '').trim()) bad('caption', 'пустой caption');
  if (!en) bad('en', 'нет английского перевода задания');
  else {
    const el = Object.keys(en.resultLabels ?? {}).sort();
    if (!same(el, hk)) bad('resultLabels', `ключи ${JSON.stringify(el)}, а head ${JSON.stringify(hk)}`);
    const vals = [...Object.values(en.resultLabels ?? {}), en.resultCaption ?? ''];
    if (Object.values(en.resultLabels ?? {}).some((v) => !String(v).trim())) bad('resultLabels', 'пустая подпись');
    if (!String(en.resultCaption ?? '').trim()) bad('resultCaption', 'пустой resultCaption');
    if (vals.some((v) => CYR.test(v))) bad('en кириллица', 'кириллица в resultLabels или resultCaption');
    if (vals.some((v) => DASH.test(v))) bad('en тире', 'тире в resultLabels или resultCaption');
  }
  return out;
}

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const expect = (cond, name, msg) => (cond ? ok(name) : fail(name, msg));

/** Гейт сам обязан ловить пустой визуал, card не 1×1, устаревшие строки и хвост float: проверяем на копиях, не на паке. */
async function selfTest(base, en) {
  const copy = (patch) => ({ ...base, result: { ...base.result, ...patch } });
  const names = async (t, e) => (await checkResult(t, e)).map(([n]) => n);

  const empty = await names(copy({ sql: `${base.result.sql.replace(/\s+ORDER BY[\s\S]*$/, '')} HAVING 1 = 0` }), en);
  expect(empty.some((n) => n.includes('≥ 2 строк') || n.includes('empty')), 'самопроверка: пустой визуал без empty валится', 'пустой визуал прошёл');
  const card = await names(copy({ visual: 'card' }), en);
  expect(card.some((n) => n.includes('card 1×1')), 'самопроверка: card больше 1×1 валится', 'card прошёл');
  const stale = await names(copy({ rows: [base.result.rows[0]] }), en);
  expect(stale.some((n) => n.endsWith('rows')), 'самопроверка: устаревшие строки валятся', 'устаревшие строки прошли');
  const fmtCol = base.result.head[base.result.head.length - 1];
  const tailRow = base.result.rows.map((r, i) => (i === 0 ? r.map((v, ci) => (ci === base.result.head.indexOf(fmtCol) ? 1.123456 : v)) : r));
  const tail = await names(copy({ fmt: { [fmtCol]: 'num' }, rows: tailRow }), en);
  expect(tail.some((n) => n.includes('хвост')), 'самопроверка: хвост float валится', 'хвост прошёл');
  const nullCard = await checkResult(
    { id: 'self', track: 'model', result: { visual: 'card', sql: 'SELECT NULL AS v', head: ['v'], rows: [[null]], rowCount: 1, labels: { v: 'V' }, caption: 'c' } },
    { resultLabels: { v: 'V' }, resultCaption: 'c' }
  );
  expect(nullCard.length === 0, 'самопроверка: card с null допустим', JSON.stringify(nullCard));
  const emptyOk = await checkResult(
    { id: 'self', track: 'model', result: { visual: 'matrix', sql: 'SELECT 1 AS v WHERE 0', head: ['v'], rows: [], rowCount: 0, empty: true, labels: { v: 'V' }, caption: 'c' } },
    { resultLabels: { v: 'V' }, resultCaption: 'c' }
  );
  expect(emptyOk.length === 0, 'самопроверка: empty: true при 0 строк допустим', JSON.stringify(emptyOk));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const pack = JSON.parse(readFileSync(PACK_FILE, 'utf8'));
  const enPack = JSON.parse(readFileSync(PACK_FILE_EN, 'utf8'));
  const withResult = pack.tasks.filter((t) => t.result);
  for (const t of withResult) {
    const en = enPack.tasks.find((x) => x.id === t.id);
    const problems = await checkResult(t, en);
    if (problems.length) for (const [n, m] of problems) fail(n, m);
    else ok(`${t.id}: result сходится с Kaiyo (${t.result.rowCount} строк, ${t.result.visual})`);
  }
  // Самопроверка на синтетическом задании по dim_region: гейт работает и тогда, когда в паке ещё нет ни одного result.
  const sql = 'SELECT region_name AS name, COUNT(*) AS n FROM dim_region GROUP BY region_name ORDER BY region_name';
  const res = await runSql(sql);
  const base = {
    id: 'self',
    track: 'model',
    result: {
      visual: 'matrix',
      sql,
      head: res.columns,
      rows: res.values.slice(0, MAX_ROWS).map((r) => r.map(cell)),
      rowCount: res.values.length,
      labels: { name: 'Region', n: 'N' },
      caption: 'c',
    },
  };
  const baseEn = { resultLabels: { name: 'Region', n: 'N' }, resultCaption: 'c' };
  expect((await checkResult(base, baseEn)).length === 0, 'самопроверка: исправное задание проходит', 'исправное синтетическое задание не прошло');
  await selfTest(base, baseEn);
  const candidates = pack.tasks.filter((t) => t.track === 'model' && (t.predictSql || t.mode === 'fill')).length;
  console.log('');
  console.log(`result: ${withResult.length} из ${candidates} кандидатов`);
  if (failed) {
    console.log(`Провалено проверок: ${failed}`);
    process.exit(1);
  }
  console.log('Все проверки таблиц результата пройдены.');
}
