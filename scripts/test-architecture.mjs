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
import { readFileSync } from 'node:fs';
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
  const onMap = new Set(arch.layers.flatMap((l) => l.tools));
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
check('запросы: у маршрута есть хотя бы один', queries > 0, 'ни одного sql в маршруте');

console.log(failed ? `\n${failed} проверок не прошло.` : '\nКарта данных согласована.');
process.exit(failed ? 1 : 0);
