// Отчёт, не гейт (п. 14 ROADMAP, шестнадцатый заход): закреплённость SQL-конструкций в кампании.
// Запуск: node scripts/report-hand-load.mjs. Основа будущего гейта плотности в test-story-ladder.
// Шаг: рукой (без мелочи), впервые (печатал 0 раз), шатко (1 раз).
// Конструкция: день первого показа, день первой печати, сколько раз напечатана.
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { TRACK_CONSTRUCTS } = await import(pathToFileURL(path.join(root, 'scripts/lib/track-constructs.mjs')).href);

const VOCAB_SQL = [
  ['SELECT', /\bSELECT\b/], ['FROM', /\bFROM\b/], ['AS', /\bAS\b/], ['WHERE', /\bWHERE\b/],
  ['литерал', /'[^']*'/], ['=', /=/], ['сравн', />=|<=|<>|>|</], ['AND', /\bAND\b/], ['OR', /\bOR\b/],
  ['IN', /\bIN\b/], ['BETWEEN', /\bBETWEEN\b/], ['ORDER BY', /\bORDER\s+BY\b/], ['DESC', /\bDESC\b/],
  ['LIMIT', /\bLIMIT\b/], ['COUNT', /\bCOUNT\s*\(/], ['DISTINCT', /\bDISTINCT\b/], ['SUM', /\bSUM\s*\(/],
  ['AVG', /\bAVG\s*\(/], ['MIN/MAX', /\b(MIN|MAX)\s*\(/], ['ROUND', /\bROUND\s*\(/], ['SUBSTR', /\bsubstr\s*\(/i],
  ['GROUP BY', /\bGROUP\s+BY\b/], ['HAVING', /\bHAVING\b/], ['JOIN', /\bJOIN\b/], ['ON', /\bON\b/],
  ['алиас', /\b[a-z]\.[a-z_]{2,}/], ['LEFT JOIN', /\bLEFT\s+JOIN\b/], ['IS NULL', /\bIS\s+NULL\b/],
  ['IS NOT NULL', /\bIS\s+NOT\s+NULL\b/], ['COALESCE', /\bCOALESCE\s*\(/i], ['подзапрос', /\(\s*SELECT\b/],
  ['CASE', /\bCASE\s+WHEN\b/], ['ELSE', /\bELSE\b/], ['WITH', /\bWITH\b/],
];
const VOCAB_PY = [
  ['литерал', /'[^']*'/], ['[[...]]', /\[\[/], ['маска', /\[\s*['"][^'"]+['"]\s*\]\s*(?:==|!=|>=|<=|>|<)/],
  ['&|', /\)\s*[&|]\s*\(|\]\s*[&|]\s*\(/], ['as_index', /as_index\s*=\s*False/],
  ['агрегат', /\.(sum|mean|count|min|max)\s*\(/], ['именов.агр', /\w+\s*=\s*\(\s*['"]/], ['.round(', /\.round\s*\(/],
];
const ATOMS = new Set(['SELECT', 'AS', 'литерал', '=', 'сравн', 'алиас']);
const norm = (n) => n.trim().toUpperCase().replace(/[\s(]+$/, '');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const derive = (track, t) => {
  t = t.trim();
  if (track === 'python') return new RegExp(esc(t).replace(/\\\(/g, '\\s*\\('));
  const p = t.endsWith('(');
  const b = esc(p ? t.slice(0, -1).trim() : t).replace(/\s+/g, '\\s+');
  return p ? new RegExp('\\b(?:' + b + '|' + b.toUpperCase() + ')\\s*\\(') : new RegExp('\\b' + b.toUpperCase() + '\\b');
};
const build = (track, v) => {
  const seen = new Set(v.map(([n]) => norm(n)));
  const out = [...v];
  for (const t of TRACK_CONSTRUCTS[track] ?? []) {
    const k = norm(t);
    if (seen.has(k) || v.some(([, re]) => new RegExp(re.source, 'i').test(t.trim()))) continue;
    seen.add(k);
    out.push([t.trim(), derive(track, t)]);
  }
  return out;
};
const VOC = { sql: build('sql', VOCAB_SQL), python: build('python', VOCAB_PY), model: build('model', []) };
const cons = (text, tr) => { const s = new Set(); if (!text) return s; for (const [n, re] of VOC[tr] ?? []) if (re.test(text)) s.add(n); return s; };
const minus = (a, b) => new Set([...a].filter((x) => !b.has(x)));
const typed = (t, tr) => {
  if (t.mode === 'write') return minus(cons(t.solution, tr), cons(t.starter, tr));
  if (t.mode === 'fill') {
    const st = String(t.template ?? '').replace(/_{2,}/g, '');
    return new Set([...cons((t.blanks ?? []).join('\n'), tr), ...minus(cons(t.solution, tr), cons(st, tr))]);
  }
  return new Set();
};
const shown = (t, step, tr) => cons([t.starter, t.template, t.predictSql, step.intro ? [step.intro.title, ...step.intro.paras].join('\n') : ''].filter(Boolean).join('\n'), tr);

const out = mkdtempSync(path.join(tmpdir(), 'hl-'));
execSync(`npx tsc "${path.join(root, 'src/content/storymode.ts')}" --target ES2020 --module ES2020 --moduleResolution bundler --jsx react-jsx --rootDir "${path.join(root, 'src')}" --outDir "${out}" --skipLibCheck`, { cwd: root, stdio: 'inherit' });
const { storyCampaign } = await import(pathToFileURL(path.join(out, 'content', 'storymode.js')).href);
const packs = {};
const task = (id, tr) => {
  packs[tr] ??= JSON.parse(readFileSync(path.join(root, 'src/content/packs', `${tr}-core.json`), 'utf8'));
  return packs[tr].tasks.find((x) => x.id === id);
};

const count = new Map();
const life = new Map(); // конструкция → {shown, typed, n, days:[]}
const c = storyCampaign('ru');
const perDay = [];
console.log('день  шаг       режим    рукой впервые шатко  | впервые / шатко');
c.missions.forEach((m, d) => {
  if (m.track !== 'sql') return;
  let dayLoad = 0, dayUncons = 0;
  m.steps.forEach((s) => {
    const t = task(s.taskId, m.track);
    if (!t) return;
    for (const x of shown(t, s, m.track)) {
      if (ATOMS.has(x)) continue;
      const l = life.get(x) ?? { shown: d + 1, typed: null, n: 0, days: [] };
      life.set(x, l);
    }
    const req = [...typed(t, m.track)].filter((x) => !ATOMS.has(x));
    const first = req.filter((x) => !count.get(x));
    const shaky = req.filter((x) => count.get(x) === 1);
    const blank = t.mode === 'write' && !/\bFROM\b/.test(t.starter ?? '');
    dayLoad += req.length; dayUncons += first.length + shaky.length;
    console.log(
      `д${String(d + 1).padStart(2)} ${m.short} ${t.id.padEnd(8)} ${(t.mode + (blank ? '*' : '')).padEnd(8)} ` +
      `${String(req.length).padStart(4)} ${String(first.length).padStart(6)} ${String(shaky.length).padStart(5)}  | ${first.join(', ')} / ${shaky.join(', ')}`
    );
    for (const x of req) {
      count.set(x, (count.get(x) ?? 0) + 1);
      const l = life.get(x) ?? { shown: d + 1, typed: null, n: 0, days: [] };
      l.typed ??= d + 1; l.n++; l.days.push(d + 1);
      life.set(x, l);
    }
  });
  perDay.push(`д${d + 1} ${m.week} ${m.short}: рукой ${dayLoad}, незакреплённых ${dayUncons}`);
});
console.log('\n' + perDay.join('\n'));
console.log('\nконструкция      показ  печать  раз  дни печати');
for (const [k, l] of [...life].sort((a, b) => a[1].shown - b[1].shown)) {
  console.log(`${k.padEnd(16)} д${String(l.shown).padEnd(5)} ${l.typed ? 'д' + String(l.typed).padEnd(5) : '—     '} ${String(l.n).padStart(3)}  ${l.days.join(',')}`);
}
