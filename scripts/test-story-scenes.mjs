/**
 * Гейт сцен сюжета: манифест src/storyScenes.ts, схемы src/ui/StoryFigures.tsx
 * и файлы public/story/, public/roles/.
 *
 * Ловит: запись манифеста без файла или с крошечным файлом, пустой alt ru/en,
 * ключ шага, которого нет в сюжете (день или номер шага не тот), шаг, на
 * котором сразу сцена Gemini и схема (на шаге одна сцена), роль в
 * ROLE_SCENES без файла.
 *
 * Запуск: npm run test:story-scenes (входит в npm run verify).
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
let failed = 0;
const check = (name, cond, msg) => {
  if (cond) console.log(` ok    ${name}`);
  else {
    console.log(` FAIL  ${name}: ${msg}`);
    failed++;
  }
};

const scenes = read('src/storyScenes.ts');
const story = read('src/content/storymode.ts');
const figures = read('src/ui/StoryFigures.tsx');

const entryRe = /'([\w-]+\/(?:intro|interlude)\/\d+)': \{\s*file: '([\w-]+)',\s*alt: \{\s*ru: '([^']*)',\s*en: '([^']*)'/g;
const keys = [];
for (const m of scenes.matchAll(entryRe)) {
  const [, key, file, ru, en] = m;
  keys.push(key);
  const f = path.join(root, 'public/story', `${file}.webp`);
  check(`файл ${file}`, existsSync(f) && statSync(f).size > 5000, 'нет файла или он меньше 5 КБ');
  check(`alt ${key}`, ru.length > 20 && en.length > 20, 'alt ru/en пустой или короткий');
}
check('в манифесте сцен есть записи', keys.length >= 5, `найдено ${keys.length}`);
check('число записей в коде совпадает с разбором', (scenes.match(/file: '/g) ?? []).length === keys.length, 'regex не разобрал запись');

/* Ключ шага: день существует, у дня достаточно шагов нужного вида. */
const figKeys = [...figures.matchAll(/'([\w-]+\/intro\/\d+)': \{ after/g)].map((m) => m[1]);
check('в схемах есть записи', figKeys.length === 4, `найдено ${figKeys.length}`);
for (const key of [...keys, ...figKeys]) {
  const [id, kind, stepRaw] = key.split('/');
  const step = Number(stepRaw);
  const i = story.indexOf(`id: '${id}'`);
  check(`день ${id}`, i >= 0, 'дня нет в storymode.ts');
  if (i < 0) continue;
  const j = story.indexOf('steps: [', i);
  const next = story.indexOf("\n      id: '", i + 10);
  const seg = story.slice(j, next < 0 ? undefined : next);
  const stepStarts = [...seg.matchAll(/\n {8}\{\n/g)].map((m) => m.index);
  const body = seg.slice(stepStarts[step] ?? 0, stepStarts[step + 1] ?? undefined);
  check(`шаг ${key}`, stepStarts[step] !== undefined && body.includes(`${kind}: {`), `у шага ${step} дня ${id} нет ${kind}`);
}
check('на шаге не одна сцена', !keys.some((k) => figKeys.includes(k)), 'сцена Gemini и схема на одном шаге');

const roles = read('src/roleScenes.ts');
for (const m of roles.matchAll(/\n {2}(\w+): \{\n {4}x: \d+/g)) {
  const f = path.join(root, 'public/roles', `${m[1]}.webp`);
  check(`роль ${m[1]}`, existsSync(f), 'файла нет');
}

/* Широкие кадры: флаг true обязан иметь файл (иначе 404 в консоли у каждого посетителя ПК). */
const wideBlock = /STORY_PHOTO_WIDE[^=]*=\s*\{([^}]*)\}/.exec(scenes);
check('флаги широких кадров найдены', Boolean(wideBlock), 'нет STORY_PHOTO_WIDE в storyScenes.ts');
for (const m of (wideBlock?.[1] ?? '').matchAll(/(morning|evening):\s*(true|false)/g)) {
  if (m[2] !== 'true') continue;
  const f = path.join(root, 'public/story', `desk-${m[1]}-wide.webp`);
  check(`широкий кадр ${m[1]}`, existsSync(f) && statSync(f).size > 5000, 'флаг true, а файла desk-' + m[1] + '-wide.webp нет');
}

if (failed) {
  console.log(`\nпровалено: ${failed}`);
  process.exit(1);
}
console.log('\nсцены сюжета: ok');
