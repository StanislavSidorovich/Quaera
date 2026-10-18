/**
 * Гейт набора общего вида семейства (quaera/family/).
 *
 * Набор копируется в четыре репозитория, и молчаливое расхождение копии с
 * эталоном — тот же класс дефектов, что «приложения выглядят по-разному».
 * Поэтому здесь не только сверка sha256 с MANIFEST.json, но и то, из чего
 * набор состоит: блок данных переключателя против family.json и marks/,
 * акценты family.json против tokens.css, контраст акцентов (≥4.5:1) и
 * @font-face против тех, что сейчас живут в src/styles.css тренажёра.
 *
 * Запуск: npm run test:family (входит в npm run verify). Отстал MANIFEST —
 * `node scripts/family-sync.mjs --build`.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDataBlock, currentDataBlock, hashFile, listSetFiles } from './lib/family-set.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'family');
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const errors = [];
const fail = (m) => errors.push(m);

// 1. MANIFEST против файлов
const manifest = JSON.parse(read(path.join(dir, 'MANIFEST.json')));
const onDisk = listSetFiles(dir);
for (const f of onDisk) {
  if (!(f in manifest.files)) fail(`${f}: нет в MANIFEST.json`);
  else if (manifest.files[f] !== hashFile(path.join(dir, f))) fail(`${f}: хеш не совпал с MANIFEST.json`);
}
for (const f of Object.keys(manifest.files)) if (!onDisk.includes(f)) fail(`${f}: есть в MANIFEST.json, файла нет`);

const fam = JSON.parse(read(path.join(dir, 'family.json')));
if (manifest.version !== fam.version) fail('версия MANIFEST.json не равна версии family.json');
if (fam.apps.length !== 5) fail(`в family.json ${fam.apps.length} приложений, ждали 5`);

// 2. Блок данных переключателя
if (currentDataBlock(read(path.join(dir, 'switcher.js'))) !== buildDataBlock(dir)) {
  fail('switcher.js: блок данных не совпадает с family.json и marks/');
}

// 3. Знаки: 32x32, скруглённая плитка rx 7
for (const a of fam.apps) {
  const f = path.join(dir, 'marks', `${a.id}.svg`);
  if (!existsSync(f)) { fail(`marks/${a.id}.svg отсутствует`); continue; }
  const svg = read(f);
  if (!svg.includes('viewBox="0 0 32 32"')) fail(`marks/${a.id}.svg: viewBox не 0 0 32 32`);
  if (!/<rect width="32" height="32" rx="7"/.test(svg)) fail(`marks/${a.id}.svg: нет плитки rx 7`);
}

// 4. Акценты family.json против tokens.css
const css = read(path.join(dir, 'tokens.css'));
const block = (re) => (css.match(re) || [, ''])[1];
const light = block(/^:root \{([\s\S]*?)^\}/m);
const dark = block(/^:root\.dark,[\s\S]*?\{([\s\S]*?)^\}/m);
const sysDark = block(/data-theme='system'[^{]*\{([\s\S]*?)^ {2}\}/m);
const decl = (b, name) => (b.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, 'i')) || [])[1];
for (const a of fam.apps) {
  const checks = [
    [light, `q-accent-${a.id}`, a.accent.light],
    [dark, `q-accent-${a.id}`, a.accent.dark],
    [sysDark, `q-accent-${a.id}`, a.accent.dark],
    [light, `q-accent-${a.id}-ink`, a.accent.ink.light],
    [dark, `q-accent-${a.id}-ink`, a.accent.ink.dark],
    [sysDark, `q-accent-${a.id}-ink`, a.accent.ink.dark],
  ];
  for (const [b, name, want] of checks) {
    if (decl(b, name) !== want) fail(`tokens.css: --${name} = ${decl(b, name)}, в family.json ${want}`);
  }
  const mark = read(path.join(dir, 'marks', `${a.id}.svg`));
  if (a.id !== 'quaera' && !mark.includes(`fill="${a.accent.light}"`)) fail(`marks/${a.id}.svg: плитка не цвета акцента ${a.accent.light}`);
}
// Тёмные блоки должны совпадать, иначе media-запрос покрасит иначе, чем класс
if (dark.replace(/\s+/g, '') !== sysDark.replace(/\s+/g, '')) fail('tokens.css: значения тёмной темы в классах и в media-запросе разошлись');

// 5. Контраст (WCAG): акцент на фоне и поверхности своей темы, текст на акценте
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
for (const [theme, b, key] of [['light', light, 'light'], ['dark', dark, 'dark']]) {
  const bg = decl(b, 'q-bg');
  const surface = decl(b, 'q-surface');
  for (const a of fam.apps) {
    const acc = a.accent[key];
    const ink = a.accent.ink[key];
    for (const [what, base] of [['фон', bg], ['поверхность', surface]]) {
      const r = ratio(acc, base);
      if (r < 4.5) fail(`${a.id}/${theme}: акцент ${acc} на ${what} ${base} даёт ${r.toFixed(2)}:1, нужно ≥4.5`);
    }
    const r = ratio(ink, acc);
    if (r < 4.5) fail(`${a.id}/${theme}: текст ${ink} на акценте ${acc} даёт ${r.toFixed(2)}:1, нужно ≥4.5`);
  }
  const muted = ratio(decl(b, 'q-muted'), surface);
  if (muted < 4.5) fail(`${theme}: --q-muted на поверхности ${muted.toFixed(2)}:1`);
}

// 6. @font-face набора против тренажёра (пока тренажёр не переведён на набор)
const faces = (s) => (s.match(/@font-face\s*\{[\s\S]*?\}/g) || []).map((x) => x.replace(/\s+/g, ' ').trim());
const own = faces(read(path.join(dir, 'fonts.css')));
const app = faces(read(path.join(root, 'src/styles.css')));
if (own.length !== 6) fail(`fonts.css: ${own.length} @font-face, ждали 6`);
if (app.length && JSON.stringify(own) !== JSON.stringify(app)) fail('fonts.css: @font-face разошлись с src/styles.css тренажёра');
for (const f of own.join(' ').match(/fonts\/[\w.-]+\.woff2/g) || []) {
  if (!existsSync(path.join(dir, f))) fail(`fonts.css ссылается на ${f}, файла нет`);
  else if (existsSync(path.join(root, 'src', f)) && hashFile(path.join(dir, f)) !== hashFile(path.join(root, 'src', f))) {
    fail(`${f}: отличается от копии в src/fonts`);
  }
}

// 7. Строки назначения: оба языка, без длинных тире
for (const a of fam.apps) {
  for (const l of ['en', 'ru']) {
    const s = a.purpose?.[l];
    if (!s) fail(`${a.id}: нет purpose.${l}`);
    else if (/[—–]/.test(s)) fail(`${a.id}: длинное тире в purpose.${l}`);
  }
}

if (errors.length) {
  console.error(`family: ${errors.length} замечаний`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`family: набор цел (${onDisk.length} файлов, хеши и контраст сходятся)`);
