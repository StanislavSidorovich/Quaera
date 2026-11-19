/**
 * Гейт контраста текста (src/contrast.css, три уровня «Обычный / Темнее / Максимум»).
 * Берёт --text-dim каждого уровня из contrast.css (обычный из family/tokens.css) и считает
 * контраст по WCAG на фонах страницы, карточки и поля. Требования: «Темнее» не меньше 7:1
 * на светлой теме, на каждой теме контраст растёт обычный < темнее < максимум, и
 * переопределены оба токена в обеих темах (иначе уровень «Темнее» молча не сработает).
 * Запуск: npm run test:contrast (входит в npm run verify).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'src/contrast.css'), 'utf8');
const tokens = readFileSync(path.join(root, 'family/tokens.css'), 'utf8');
const lum = (h) => {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
const BG = { light: ['#f6f7f9', '#ffffff', '#f1f3f6'], dark: ['#14171d', '#1b1f27', '#20252f', '#101319'] };

let failed = 0;
const check = (name, cond, detail = '') => {
  console.log(` ${cond ? 'ok  ' : 'FAIL'}  ${name}${cond ? '' : `: ${detail}`}`);
  if (!cond) failed++;
};
const block = (level, theme) => {
  const head = `:root[data-contrast='${level}'].theme-${theme}`;
  const at = css.indexOf(head);
  if (at < 0) return '';
  return css.slice(css.indexOf('{', at), css.indexOf('}', at));
};
const tok = (body, name) => body.match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
const std = { light: tokens.match(/--q-muted:\s*(#[0-9a-f]{6})/)[1], dark: tokens.match(/--q-muted:\s*(#[0-9a-f]{6})/g)[1].match(/#[0-9a-f]{6}/)[0] };

for (const theme of ['light', 'dark']) {
  const dim = { standard: std[theme] };
  for (const level of ['darker', 'max']) {
    const body = block(level, theme);
    const d = tok(body, '--text-dim');
    check(`${theme}/${level}: заданы --text и --text-dim`, Boolean(tok(body, '--text') && d), 'нет токена в contrast.css');
    dim[level] = d;
  }
  const worst = (c) => (c ? Math.min(...BG[theme].map((b) => ratio(c, b))) : 0);
  const w = { standard: worst(dim.standard), darker: worst(dim.darker), max: worst(dim.max) };
  console.log(`   ${theme}: обычный ${w.standard.toFixed(2)}, темнее ${w.darker.toFixed(2)}, максимум ${w.max.toFixed(2)}`);
  check(`${theme}: контраст растёт`, w.standard < w.darker && w.darker < w.max, JSON.stringify(w));
  if (theme === 'light') check('light: «Темнее» не меньше 7:1', w.darker >= 7, w.darker.toFixed(2));
}
if (failed) process.exit(1);
console.log('\ntest:contrast: всё зелёное');
