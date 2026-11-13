/**
 * Гейт «диета по тексту»: потолок слов до первого действия.
 *
 * Считается как в замере 2026-11-13 (research/linkeding-ux/NOTES.md, часть 2): слова через пробел в
 * `brief` (только на первом экране), `goal`, `scenario`, вопросе и подписях пунктов/вариантов.
 * Не считаются `hints`, `why`, `explain` и `figure` (таблица читается глазами, а не прозой).
 * Потолок: 60 слов у `order`, 90 у `predict` (решение хозяина 2026-11-13).
 * Предел `why` пункта: 25 слов, `explain` у `order`/`predict` Профессии: 120 слов.
 *
 * Английский пак длиннее русского на четверть-треть (артикли, предлоги): его потолки умножаются на EN_FACTOR (1.35).
 *
 * Охват: все `order` всех треков и все `predict` трека «Профессия» (domain). Predict в sql/python/model
 * — код, не проза, в этот гейт не входят. Русский и английский пак считаются оба.
 *
 * Не переписанные задания держит список scripts/text-budget-exceptions.json: id, дата, причина.
 * Задание из списка, которое уже укладывается, тоже падает: исключение надо снять.
 *
 * Запуск: npm run test:text-budget; --report печатает таблицу до/после (медиана, максимум).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'src/content/packs');
const LIMIT = { order: 60, predict: 90 };
const WHY_MAX = 25;
const EXPLAIN_MAX = 120;
const EN_FACTOR = 1.35;
const lim = (v, loc) => Math.floor(loc === 'en' ? v * EN_FACTOR : v);

const w = (s) => (typeof s === 'string' ? s.split(/\s+/).filter(Boolean).length : 0);
const optWords = (items) => (items ?? []).reduce((n, o) => n + w(o.label) + w(o.text), 0);

/** Единицы замера: {id, kind, words, whyMax, explainWords}. Для шагов id = `${task}#${i}`. */
export function measure(pack, { overlay } = {}) {
  const out = [];
  const merge = (t) => (overlay?.get(t.id) ? { ...t, ...overlay.get(t.id) } : t);
  for (const base of pack.tasks) {
    const t = merge(base);
    const units = t.steps
      ? t.steps.map((s, i) => ({ s, first: i === 0, id: `${t.id}#${i + 1}`, kind: s.kind === 'interpret' ? 'predict' : s.kind }))
      : [{ s: t, first: true, id: t.id, kind: t.mode }];
    for (const { s, first, id, kind } of units) {
      if (kind !== 'order' && kind !== 'predict') continue;
      const q = s.orderQuestion ?? s.predictQuestion ?? s.question;
      const items = s.items ?? s.options;
      const words =
        (first ? w(t.brief) : 0) + w(s.goal ?? (t.steps ? '' : t.goal)) + w(s.scenario) + w(q) + optWords(items);
      out.push({
        id, task: t.id, kind, track: pack.track, words,
        whyMax: Math.max(0, ...(items ?? []).map((o) => w(o.why))),
        explainWords: w(t.explain),
        title: t.title,
      });
    }
  }
  return out;
}

function loadAll() {
  const rows = [];
  for (const f of readdirSync(dir).filter((x) => /-core(\.en)?\.json$/.test(x)).sort()) {
    const en = f.endsWith('.en.json');
    const pack = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    let target = pack;
    if (en) {
      const ru = JSON.parse(readFileSync(path.join(dir, f.replace('.en', '')), 'utf8'));
      const ov = new Map(pack.tasks.map((t) => [t.id, t]));
      target = { ...ru, tasks: ru.tasks };
      for (const r of measure(target, { overlay: ov })) rows.push({ ...r, loc: 'en' });
      continue;
    }
    for (const r of measure(target)) rows.push({ ...r, loc: 'ru' });
  }
  return rows;
}

const inScope = (r) => r.kind === 'order' || (r.kind === 'predict' && r.track === 'domain');
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

const rows = loadAll().filter(inScope);

if (process.argv.includes('--report')) {
  for (const loc of ['ru', 'en']) {
    for (const [name, f] of [['order domain', (r) => r.kind === 'order' && r.track === 'domain'], ['order other', (r) => r.kind === 'order' && r.track !== 'domain'], ['predict domain', (r) => r.kind === 'predict']]) {
      const a = rows.filter((r) => r.loc === loc && f(r));
      console.log(loc, name, 'n=' + a.length, 'median', median(a.map((r) => r.words)), 'max', Math.max(0, ...a.map((r) => r.words)), 'over', a.filter((r) => r.words > lim(LIMIT[r.kind], loc)).length);
    }
  }
  if (process.argv.includes('--top')) for (const r of rows.filter((r) => r.loc === (process.argv.includes('--en') ? 'en' : 'ru')).sort((a, b) => b.words - a.words).slice(0, 80)) console.log(r.id, r.kind, r.words, 'why', r.whyMax, 'expl', r.explainWords);
  process.exit(0);
}

const exc = JSON.parse(readFileSync(path.join(root, 'scripts/text-budget-exceptions.json'), 'utf8'));
const excIds = new Map(exc.exceptions.map((e) => [e.id, e]));
const fails = [];
for (const e of exc.exceptions) if (!e.date || !e.reason) fails.push(`исключение ${e.id}: нужны date и reason`);
const seen = new Set();
for (const r of rows) {
  const over = r.words > lim(LIMIT[r.kind], r.loc);
  const ex = excIds.get(r.task);
  seen.add(r.task);
  if (over && !ex) fails.push(`${r.loc} ${r.id}: ${r.words} слов до действия при потолке ${lim(LIMIT[r.kind], r.loc)} (${r.title})`);
  if (!over && ex && r.loc === 'ru' && r.whyMax <= WHY_MAX && r.explainWords <= EXPLAIN_MAX) fails.push(`${r.id}: уже укладывается (${r.words}), снимите из text-budget-exceptions.json`);
  if (!ex) {
    if (r.whyMax > lim(WHY_MAX, r.loc)) fails.push(`${r.loc} ${r.id}: why длиннее ${lim(WHY_MAX, r.loc)} слов (${r.whyMax})`);
    if (r.explainWords > lim(EXPLAIN_MAX, r.loc)) fails.push(`${r.loc} ${r.id}: explain ${r.explainWords} слов при потолке ${lim(EXPLAIN_MAX, r.loc)}`);
  }
}
for (const e of exc.exceptions) if (!seen.has(e.id)) fails.push(`исключение ${e.id}: задания нет в охвате`);

if (process.argv.includes('--list')) {
  const ids = [...new Set(fails.map((f) => (f.match(/(?:dom|py|mdl|sql)-\d+/) ?? [])[0]).filter(Boolean))];
  console.log(JSON.stringify(ids));
  process.exit(0);
}
if (fails.length) {
  console.error(`text-budget: ${fails.length} нарушений`);
  for (const f of fails.slice(0, process.argv.includes("--all") ? 999 : 60)) console.error('  ' + f);
  process.exit(1);
}
console.log(`text-budget: ok (${rows.filter((r) => r.loc === 'ru').length} заданий в охвате, исключений ${exc.exceptions.length})`);
