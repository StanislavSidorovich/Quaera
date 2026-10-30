/**
 * Гейт «Карты данных компании» (src/content/architecture.json).
 *
 * Карта сшивает четыре источника правды: роли и этапы живут в career.json,
 * навыки в паках, приложения в family/family.json, числа маршрута в датасете.
 * Любая из этих связей рвётся молча: переименованный навык даст кнопку
 * в никуда, роль без карточки на экране сделает мёртвой ссылку шага.
 * Поэтому проверка в обе стороны: id слоёв, ролей, этапов, навыков,
 * приложений и видов затрат существуют; у каждого текста есть ru и en,
 * английский без кириллицы и без тире; каждый слой хоть раз встречается
 * в маршруте, а слой «вы здесь» ровно один.
 *
 * Запрос шага (`sql`) выполняется на public/data/quaera.dataset (gzip поверх
 * SQLite): ошибка запроса или пустой результат валят гейт, так что число
 * в тексте шага не разъедется с базой молча. Сами числа текста руками не
 * сверяются: их сняли запросом при написании, а пересъёмка при смене
 * генератора ложится на verify:data, которое держит сюжет Nettora.
 *
 * Запуск: npm run test:architecture (входит в npm run verify).
 */
import initSqlJs from 'sql.js';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(path.join(root, p), 'utf8'));

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name, msg) => console.log(` ok    ${name}${msg ? `: ${msg}` : ''}`);
const check = (name, cond, msg) => (cond ? ok(name) : fail(name, msg));

const arch = readJson('src/content/architecture.json');
const career = readJson('src/content/career.json');
const family = readJson('family/family.json');

const roleIds = new Set(career.roles.map((r) => r.id));
const stageIds = new Set(career.stages.map((s) => s.id));
const skillIds = new Set();
for (const track of ['sql', 'model', 'python', 'domain']) {
  for (const s of readJson(`src/content/packs/${track}-core.json`).skills) skillIds.add(s.id);
}
const appIds = new Set(family.apps.map((a) => a.id));
const moneyIds = new Set(arch.money.map((m) => m.id));
const layerIds = arch.layers.map((l) => l.id);
const LENSES = ['roles', 'quaera', 'money'];
const MODES = ['hands', 'described'];

// ── Тексты: ru и en в каждой записи ─────────────────────────────────────────
const CYRILLIC = /[А-Яа-яЁё]/;
let texts = 0;
const checkText = (where, v) => {
  texts++;
  if (!v || typeof v.ru !== 'string' || typeof v.en !== 'string') return fail(where, 'нет ru или en');
  if (!v.ru.trim() || !v.en.trim()) return fail(where, 'пустой ru или en');
  if (CYRILLIC.test(v.en)) fail(where, 'в английском тексте кириллица');
  if (/—/.test(v.en)) fail(where, 'в английском тексте тире');
  if (/—/.test(v.ru)) fail(where, 'в русском тексте длинное тире');
};

checkText('lake.title', arch.lake?.title);
checkText('lake.note', arch.lake?.note);
for (const l of arch.lenses) checkText(`линза ${l.id}`, l.title);
for (const m of arch.money) checkText(`затраты ${m.id}`, m.title);
checkText('trace.title', arch.trace.title);

{
  // Подсказка без инструмента на карте никому не видна: значит, опечатка в имени.
  const onMap = new Set([...arch.layers.flatMap((l) => l.tools), ...arch.project.stations.flatMap((s) => s.tools)]);
  for (const [name, v] of Object.entries(arch.tools ?? {})) {
    checkText(`инструмент ${name}`, v);
    if (!onMap.has(name)) fail(`инструмент ${name}`, 'подсказка есть, а на карте инструмента нет');
  }
}

// ── Линзы и виды затрат ────────────────────────────────────────────────────
check('линзы: ровно roles, quaera, money', JSON.stringify(arch.lenses.map((l) => l.id)) === JSON.stringify(LENSES), 'порядок или состав линз');
check('слои: id уникальны', new Set(layerIds).size === layerIds.length, 'повтор id слоя');
check('слои: «вы здесь» ровно у одного', arch.layers.filter((l) => l.here).length === 1, 'нужен один слой here');
{
  // Рамка lakehouse рисуется вокруг подряд идущих слоёв: разрыв дал бы две рамки с одним названием.
  const flags = arch.layers.map((l) => (l.lake ? 'L' : '-')).join('');
  check('слои: lake идут одним подряд блоком', /^-*L+-*$/.test(flags), `порядок lake: ${flags}`);
}

// ── Слои ───────────────────────────────────────────────────────────────────
for (const l of arch.layers) {
  const w = `слой ${l.id}`;
  checkText(`${w}.title`, l.title);
  checkText(`${w}.what`, l.what);
  checkText(`${w}.kaiyo`, l.kaiyo);
  checkText(`${w}.money.text`, l.money?.text);
  checkText(`${w}.practice.text`, l.practice?.text);
  if (!l.roles.length) fail(w, 'нет ролей');
  for (const r of l.roles) if (!roleIds.has(r)) fail(w, `роль ${r} не существует в career.json`);
  for (const s of l.stages) if (!stageIds.has(s)) fail(w, `этап ${s} не существует в career.json`);
  for (const s of l.practice.skills) if (!skillIds.has(s)) fail(w, `навык ${s} не существует в паках`);
  for (const a of l.practice.apps) if (!appIds.has(a) || a === 'quaera') fail(w, `приложение ${a} не существует в family.json`);
  if (!moneyIds.has(l.money.kind)) fail(w, `вид затрат ${l.money.kind} не описан в money`);
  if (!MODES.includes(l.practice.mode)) fail(w, `режим практики ${l.practice.mode}`);
  if (!l.tools.length) fail(w, 'нет инструментов');
  for (const t of l.tools) if (!arch.tools?.[t]) fail(w, `у инструмента ${t} нет подсказки в tools`);
  if (new Set(l.practice.skills).size !== l.practice.skills.length) fail(w, 'навык повторён');
}
ok('слои: id, роли, этапы, навыки, приложения, затраты', `${arch.layers.length} слоёв`);

// ── Маршрут ────────────────────────────────────────────────────────────────
const used = new Set();
arch.trace.steps.forEach((s, i) => {
  const w = `шаг ${i + 1}`;
  checkText(`${w}.who`, s.who);
  checkText(`${w}.text`, s.text);
  if (!layerIds.includes(s.layer)) fail(w, `слой ${s.layer} не существует`);
  used.add(s.layer);
  if (s.role !== null && !roleIds.has(s.role)) fail(w, `роль ${s.role} не существует в career.json`);
});
check('маршрут: каждый слой встречается хотя бы раз', layerIds.every((id) => used.has(id)), `нет в маршруте: ${layerIds.filter((id) => !used.has(id)).join(', ')}`);
check('маршрут: больше одного шага', arch.trace.steps.length > 1, 'маршрут из одного шага не маршрут');
ok('тексты', `${texts} записей с ru и en`);

// ── Запросы на датасете ────────────────────────────────────────────────────
const SQL = await initSqlJs({ locateFile: (f) => path.join(path.dirname(require.resolve('sql.js')), f) });
const db = new SQL.Database(new Uint8Array(gunzipSync(readFileSync(path.join(root, 'public/data/quaera.dataset')))));
let queries = 0;
arch.trace.steps.forEach((s, i) => {
  if (!s.sql) return;
  queries++;
  try {
    const res = db.exec(s.sql);
    if (!res.length || !res[0].values.length) fail(`шаг ${i + 1}.sql`, 'запрос выполнился, но вернул пустой результат');
    else ok(`шаг ${i + 1}.sql`, `${res[0].values.length} строк: ${JSON.stringify(res[0].values[0])}`);
  } catch (e) {
    fail(`шаг ${i + 1}.sql`, e.message);
  }
});
// График: значения в architecture.json должны совпасть с запросом шага «split» построчно.
{
  const fig = arch.trace.figure;
  const split = arch.trace.steps.find((s) => s.figure === 'split');
  check('график: у маршрута есть шаги line и split', !!split && arch.trace.steps.some((s) => s.figure === 'line'), 'нет шага с figure line или split');
  for (const k of ['units', 'outlets', 'perOutlet']) checkText(`figure.names.${k}`, fig.names?.[k]);
  if (split?.sql) {
    const rows = db.exec(split.sql)[0]?.values ?? [];
    const want = JSON.stringify(rows.map((r) => [r[0], r[1], r[2]]));
    const have = JSON.stringify(fig.months.map((m, i) => [m, fig.outlets[i], fig.units[i]]));
    check('график: месяцы, точки и штуки совпадают с запросом шага', want === have, `запрос: ${want}
  файл:   ${have}`);
  }
}
check('запросы: у маршрута есть хотя бы один', queries > 0, 'ни одного sql в маршруте');

// ── Проект от и до ─────────────────────────────────────────────────────────
// Сценарий пишется заранее, экран его только показывает, поэтому гейт держит то,
// что сломается молча: разрыв цепочки передач, метку вне трёх, внешнюю ссылку без
// даты проверки и число в тексте, разошедшееся с запросом (`expect`).
{
  const p = arch.project;
  const STATIONS = ['question', 'connect', 'raw', 'clean', 'model', 'queries', 'report', 'forecast', 'answer'];
  const LABELS = ['here', 'watch', 'outside'];
  check('проект: девять станций по порядку', JSON.stringify(p.stations.map((s) => s.id)) === JSON.stringify(STATIONS), `порядок: ${p.stations.map((s) => s.id).join(', ')}`);
  check('проект: метки ровно три', JSON.stringify(p.labels.map((l) => l.id)) === JSON.stringify(LABELS), 'состав меток');
  check('проект: около 15 минут', p.minutes === 15, `minutes = ${p.minutes}`);
  check('проект: необязательна только станция прогноза', JSON.stringify(p.stations.filter((s) => s.optional).map((s) => s.id)) === '["forecast"]', 'optional не у forecast');
  check('проект: продолжение ведёт в существующий маршрут', p.finish.next.trace === arch.trace.id, `нет маршрута ${p.finish.next.trace}`);
  checkText('проект.title', p.title);
  checkText('проект.intro', p.intro);
  checkText('проект.case.question', p.case.question);
  checkText('проект.case.who', p.case.who);
  checkText('проект.finish.title', p.finish.title);
  checkText('проект.finish.text', p.finish.text);
  checkText('проект.finish.next.text', p.finish.next.text);
  for (const l of p.labels) {
    checkText(`метка ${l.id}.title`, l.title);
    checkText(`метка ${l.id}.note`, l.note);
  }

  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const extIds = new Set();
  for (const e of p.external) {
    const w = `внешняя ${e.id}`;
    if (extIds.has(e.id)) fail(w, 'id повторён');
    extIds.add(e.id);
    if (!['try', 'doc'].includes(e.kind)) fail(w, `вид ${e.kind}`);
    if (!e.name) fail(w, 'нет названия');
    for (const u of [e.url, ...(e.also ?? [])]) if (!/^https:\/\//.test(u ?? '')) fail(w, `адрес не https: ${u}`);
    if (!DATE.test(e.checked ?? '')) fail(w, 'нет даты проверки');
    checkText(`${w}.terms`, e.terms);
    if (e.unconfirmed) checkText(`${w}.unconfirmed`, e.unconfirmed);
  }
  const usedExt = new Set();
  const useExt = (w, id) => {
    usedExt.add(id);
    if (!extIds.has(id)) fail(w, `внешней страницы ${id} нет в external`);
  };

  p.stations.forEach((s, i) => {
    const w = `станция ${s.id}`;
    for (const k of ['title', 'does']) checkText(`${w}.${k}`, s[k]);
    checkText(`${w}.receives.text`, s.receives?.text);
    checkText(`${w}.hands.text`, s.hands?.text);
    checkText(`${w}.action.text`, s.action?.text);
    if (!layerIds.includes(s.layer)) fail(w, `слой ${s.layer} не существует`);
    if (!roleIds.has(s.role)) fail(w, `роль ${s.role} не существует в career.json`);
    for (const r of s.also ?? []) if (!roleIds.has(r)) fail(w, `роль ${r} не существует в career.json`);
    if (s.receives.from !== null && !roleIds.has(s.receives.from)) fail(w, `роль ${s.receives.from} не существует`);
    if (s.hands.to !== null && !roleIds.has(s.hands.to)) fail(w, `роль ${s.hands.to} не существует`);
    if (!LABELS.includes(s.label)) fail(w, `метка ${s.label}`);
    if (!s.tools?.length) fail(w, 'нет инструментов');
    for (const t of s.tools ?? []) if (!arch.tools?.[t]) fail(w, `у инструмента ${t} нет подсказки в tools`);
    for (const sk of s.action.skills) if (!skillIds.has(sk)) fail(w, `навык ${sk} не существует в паках`);
    if (new Set(s.action.skills).size !== s.action.skills.length) fail(w, 'навык повторён');
    if (s.action.app && (!appIds.has(s.action.app) || s.action.app === 'quaera')) fail(w, `приложение ${s.action.app} не существует в family.json`);
    for (const id of s.action.externals ?? []) useExt(w, id);
    if (s.label === 'outside' && !s.action.externals?.some((id) => p.external.find((e) => e.id === id)?.kind === 'try')) fail(w, 'метка «снаружи», но нет страницы, где попробовать');
    if (s.label === 'here' && !s.action.skills.length && !s.action.app) fail(w, 'метка «здесь», но нет ни навыка, ни приложения');
    if (s.action.href?.startsWith('/') && !existsSync(path.join(root, 'public', s.action.href))) fail(w, `файла ${s.action.href} нет в public`);
    for (const [j, l] of (s.lessons ?? []).entries()) {
      checkText(`${w}.lessons[${j}]`, l.text);
      if (l.source) useExt(w, l.source);
    }
    // Цепочка: следующая обязательная станция принимает от того, кто работал на этой, и у него же адресат.
    const next = p.stations.slice(i + 1).find((n) => !n.optional);
    if (!s.optional && next) {
      if (next.receives.from !== s.role) fail(w, `следующая станция ${next.id} принимает от ${next.receives.from}, а работал ${s.role}`);
      if (s.hands.to !== next.role) fail(w, `передаёт ${s.hands.to}, а следующая станция ${next.id} у роли ${next.role}`);
    }
    for (const qr of s.queries ?? []) {
      checkText(`${w}.${qr.id}.title`, qr.title);
      try {
        const got = db.exec(qr.sql)[0]?.values ?? [];
        check(`${w}.${qr.id}: результат совпал с expect`, JSON.stringify(got) === JSON.stringify(qr.expect), `запрос: ${JSON.stringify(got)}\n  файл:   ${JSON.stringify(qr.expect)}`);
      } catch (e) {
        fail(`${w}.${qr.id}`, e.message);
      }
    }
  });
  check('проект: цепочка начинается и кончается бизнесом', p.stations[0].receives.from === null && p.stations.at(-1).hands.to === null, 'первая принимает не от бизнеса или последняя передаёт не бизнесу');
  check('проект: каждый слой встречается', layerIds.every((id) => p.stations.some((s) => s.layer === id)), 'есть слой без станции');
  for (const e of p.external) if (e.kind === 'try' && !usedExt.has(e.id)) fail(`внешняя ${e.id}`, 'страница «попробовать» не привязана к станции');

  const raw = p.stations.find((s) => s.id === 'raw');
  check('проект: большой файл показан в сырье', raw.bigFile?.methods?.length >= 4, 'нет bigFile у станции raw');
  for (const m of raw.bigFile?.methods ?? []) {
    checkText(`способ ${m.id}.when`, m.when);
    if (m.source) useExt(`способ ${m.id}`, m.source);
  }
  checkText('способы.title', raw.bigFile?.title);
  checkText('предел Lab', raw.bigFile?.labLimit?.text);
  check('предел Lab: дата и числа замера', DATE.test(raw.bigFile?.labLimit?.checked ?? '') && (raw.bigFile.labLimit.fail_mb === null || raw.bigFile.labLimit.ok_mb < raw.bigFile.labLimit.fail_mb), 'нет даты или ok_mb не меньше fail_mb');

  // Выбор роли: все семь ролей, у каждой существующие станции, каждая станция хоть куда-то ведёт.
  check('проект: выбор охватывает все роли', JSON.stringify([...new Set(p.finish.roles.map((r) => r.role))].sort()) === JSON.stringify([...roleIds].sort()), 'не все роли career.json в finish.roles');
  for (const r of p.finish.roles) {
    checkText(`выбор ${r.role}.why`, r.why);
    for (const st of r.stations) if (!STATIONS.includes(st)) fail(`выбор ${r.role}`, `станции ${st} нет`);
  }
  for (const st of STATIONS) if (!p.finish.roles.some((r) => r.stations.includes(st))) fail('проект: выбор роли', `станция ${st} не ведёт ни к одной роли`);

  // График станции «Отчёт» совпадает с её запросом построчно.
  const rep = p.stations.find((s) => s.figure === 'planVsFact');
  const fig = p.figure;
  for (const k of ['fact', 'plan']) checkText(`project.figure.names.${k}`, fig?.names?.[k]);
  const months = rep?.queries?.find((qr) => qr.id === 'months');
  check('проект: график совпадает с запросом', !!months && JSON.stringify(months.expect.map((r) => [r[0], r[1], r[2]])) === JSON.stringify(fig.months.map((m, i) => [m, fig.fact[i], fig.plan[i]])), 'месяцы, факт или план расходятся');
  ok('проект', `${p.stations.length} станций, ${p.external.length} внешних страниц`);
}

// ── Артефакты слоёв ────────────────────────────────────────────────────────
// Всё, что карточка слоя показывает как «лежит в слое», снято запросом: строки
// источников и bronze, все восемь комбинаций переключателей silver, зерно gold.
// Гейт выполняет те же запросы и сверяет построчно; мера DAX проверяется по
// именам таблиц и колонок схемы (движка DAX в браузере нет), а число, которое
// она считает, уже держит гейт проекта выше (график и запрос `months`).
{
  const a = arch.artifacts;
  const schema = readJson('public/data/schema.json');
  const rowsOf = (sql) => db.exec(sql)[0]?.values ?? [];
  const same = (w, sql, expect) => {
    try {
      const got = JSON.stringify(rowsOf(sql));
      check(w, got === JSON.stringify(expect), `запрос: ${got}\n  файл:   ${JSON.stringify(expect)}`);
    } catch (e) {
      fail(w, e.message);
    }
  };
  for (const k of Object.keys(a.ui)) checkText(`artifacts.ui.${k}`, a.ui[k]);

  // Источники: строка в карточке совпадает с настоящей строкой, а текст события говорит о ней же.
  checkText('artifacts.sources.title', a.sources.title);
  for (const k of ['sellin', 'sellout']) {
    const s = a.sources[k];
    checkText(`источник ${k}.event`, s.event);
    same(`источник ${k}: строка совпала с запросом`, s.sql, s.expect);
    check(`источник ${k}: колонок столько же, сколько значений`, s.columns.length === s.expect[0].length, 'число колонок и значений разное');
    check(`источник ${k}: таблица есть в схеме и в запросе`, schema.tables.some((t) => t.table === s.table) && new RegExp(`FROM ${s.table}\\b`).test(s.sql), `нет ${s.table} в схеме или в запросе`);
    const units = s.expect[0][s.columns.indexOf('units')];
    const name = s.expect[0][s.columns.indexOf('product_name')];
    for (const loc of ['ru', 'en']) check(`источник ${k}.event.${loc}: штуки и товар из строки`, s.event[loc].includes(String(units)) && s.event[loc].includes(name), `в тексте нет ${units} или ${name}`);
  }

  // Bronze: пять настоящих строк с разными видами даты, регистром кода и пробелами.
  checkText('artifacts.bronze.title', a.bronze.title);
  checkText('artifacts.bronze.caption', a.bronze.caption);
  same('bronze: строки совпали с запросом', a.bronze.sql, a.bronze.expect);
  check('bronze: 4–5 строк', a.bronze.expect.length >= 4 && a.bronze.expect.length <= 5, `строк ${a.bronze.expect.length}`);
  {
    const shape = (d) => (/^\d{4}-\d{2}-\d{2}$/.test(d) ? 'iso' : /^\d{4}-\d{1,2}-\d{1,2}$/.test(d) ? 'short' : d.includes('.') ? 'dot' : 'slash');
    const col = (name) => a.bronze.expect.map((r) => r[a.bronze.columns.indexOf(name)]);
    check('bronze: все четыре вида даты', new Set(col('sale_date').map(shape)).size === 4, 'видов даты меньше четырёх');
    check('bronze: код и строчными, и прописными', col('sku_code').some((c) => c !== c.toUpperCase()) && col('sku_code').some((c) => c === c.toUpperCase()), 'регистр кода не разный');
    check('bronze: название с пробелами и без', col('customer_name').some((c) => c !== c.trim()) && col('customer_name').some((c) => c === c.trim()), 'пробелов в названиях нет или они везде');
    check('bronze: у каждой строки source_file', col('source_file').every((f) => /^export_\d{4}-\d{2}\.csv$/.test(f)), 'нет source_file');
  }

  // Silver: все комбинации, опорные числа и честность переключателей.
  checkText('artifacts.silver.title', a.silver.title);
  checkText('artifacts.silver.caption', a.silver.caption);
  checkText('artifacts.silver.note', a.silver.note);
  for (const k of Object.keys(a.silver.toggles)) checkText(`silver.toggles.${k}`, a.silver.toggles[k]);
  for (const k of Object.keys(a.silver.metrics)) checkText(`silver.metrics.${k}`, a.silver.metrics[k]);
  const keys = ['000', '001', '010', '011', '100', '101', '110', '111'];
  check('silver: восемь комбинаций', JSON.stringify(Object.keys(a.silver.combos).sort()) === JSON.stringify(keys), 'состав ключей');
  for (const key of keys) {
    const c = a.silver.combos[key];
    same(`silver ${key}: числа совпали с запросом`, c?.sql ?? '', [[c?.names, c?.codes, c?.rows, c?.dates]]);
  }
  const V = (key) => a.silver.combos[key];
  check('silver: опорные числа 104 → 52, 58 → 29, 3110 → 3000', V('000').names === 104 && V('100').names === 52 && V('000').codes === 58 && V('100').codes === 29 && V('000').rows === 3110 && V('001').rows === 3000, 'опорные значения разошлись');
  {
    // Каждый переключатель в любой комбинации остальных меняет хоть одно показанное число.
    const metricsOf = (c) => JSON.stringify([c.names, c.codes, c.rows, c.dates]);
    for (const [i, name] of ['trim', 'types', 'dedup'].entries()) {
      for (const key of keys.filter((k) => k[i] === '0')) {
        const on = key.slice(0, i) + '1' + key.slice(i + 1);
        check(`silver: «${name}» меняет число при ${key}`, metricsOf(V(key)) !== metricsOf(V(on)), `${key} и ${on} дали одно и то же`);
      }
    }
    // Текст запроса содержит ровно включённые шаги.
    for (const key of keys) {
      const sql = V(key).sql;
      const has = [/TRIM\(/.test(sql) && /UPPER\(/.test(sql), /WHEN sale_date LIKE '__\.__\.____'/.test(sql), /SELECT DISTINCT/.test(sql)];
      check(`silver ${key}: запрос содержит ровно включённые шаги`, has.every((h, i) => h === (key[i] === '1')), `шаги в запросе: ${has}`);
    }
  }

  // Gold: зерно из схемы и уникальность по нему.
  checkText('artifacts.gold.title', a.gold.title);
  checkText('artifacts.gold.grain', a.gold.grain);
  checkText('artifacts.gold.rowsLabel', a.gold.rowsLabel);
  same('gold: строк и различных зёрен поровну', a.gold.sql, a.gold.expect);
  const fact = schema.tables.find((t) => t.table === a.gold.table);
  check('gold: у факта в схеме есть зерно на обе локали', !!fact?.grain?.ru && !!fact?.grain?.en, 'нет grain в schema.json');
  check('gold: зерно запроса совпадает со связями факта', /week_start/.test(a.gold.sql) && /customer_id/.test(a.gold.sql) && /product_id/.test(a.gold.sql) && ['dim_date', 'dim_customer', 'dim_product'].every((t) => fact.columns.some((c) => c.references?.table === t)), 'колонки зерна и связи факта расходятся');

  // Serve: мера DAX ссылается на настоящие таблицы и колонки, скобки сходятся, фильтр тот же, что у запроса графика.
  checkText('artifacts.serve.title', a.serve.title);
  checkText('artifacts.serve.caption', a.serve.caption);
  checkText('artifacts.serve.chart', a.serve.chart);
  {
    const dax = a.serve.dax;
    const refs = [...dax.matchAll(/([a-z_]+)\[([a-z_]+)\]/g)].map((m) => [m[1], m[2]]);
    check('serve: меры DAX ссылаются на колонки схемы', refs.length >= 2 && refs.every(([t, c]) => schema.tables.find((x) => x.table === t)?.columns.some((x) => x.name === c)), `ссылки: ${JSON.stringify(refs)}`);
    check('serve: refs совпадают со ссылками в мере', JSON.stringify(refs) === JSON.stringify(a.serve.refs), 'refs и текст меры разошлись');
    const depth = [...dax].reduce((n, ch) => (n < 0 ? n : n + (ch === '(' ? 1 : ch === ')' ? -1 : 0)), 0);
    check('serve: скобки меры сходятся', depth === 0, `баланс скобок ${depth}`);
    check('serve: мера в форме «Имя = CALCULATE ( SUM (…»', new RegExp(`^${a.serve.measure} =\\s*CALCULATE \\(\\s*SUM \\(`).test(dax), 'мера не в форме Имя = CALCULATE ( SUM (…');
    const rep = arch.project.stations.find((s) => s.figure === 'planVsFact').queries.find((q) => q.id === 'months');
    check('serve: фильтр меры совпал с запросом графика', /\[division\] = "FMCG"/.test(dax) && /division = 'FMCG'/.test(rep.sql) && /SUM\(s\.units\)/.test(rep.sql), 'мера считает не то, что график');
  }

  // Встреча: фраза слайда уже записана в слое.
  checkText('artifacts.meeting.title', a.meeting.title);
  checkText('artifacts.meeting.kicker', a.meeting.kicker);
  checkText('artifacts.meeting.phrase', a.meeting.phrase);
  const meetingSteps = arch.trace.steps.filter((s) => s.layer === 'meeting');
  for (const loc of ['ru', 'en']) check(`встреча.phrase.${loc}: фраза записана в слое`, meetingSteps.some((s) => s.text[loc].includes(a.meeting.phrase[loc])) && arch.layers.find((l) => l.id === 'meeting').kaiyo[loc].includes(a.meeting.phrase[loc]), 'фразы нет в шаге маршрута или в слое');
  ok('артефакты', '6 слоёв, 8 комбинаций silver');
}

console.log(failed ? `\n${failed} проверок не прошло.` : '\nКарта данных согласована.');
process.exit(failed ? 1 : 0);
