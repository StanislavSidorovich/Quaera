/**
 * Гейт на английскую прозу — плотность тире и словарь машинных оборотов.
 *
 * Зачем: в русском тире обязательно там, где выпала связка («Не курс —
 * тренажёр»), это грамматика, а не стиль. Английский текст переводился
 * с русского, и тире переехали в него механически — а в английском
 * их плотность как раз первый признак, по которому текст опознают
 * как машинный. Замер до правки: 15.96 тире на 1000 слов при типичной
 * норме около 2. Глазами это не ловится: каждое отдельное тире выглядит
 * уместным, виден только суммарный эффект — тот же класс дефекта, что
 * закрывает test-chart-spec (ошибку в одном столбце видно, ошибку
 * в сравнимости столбцов — нет).
 *
 * Устроен как бюджет, а не как ноль: файлы паков чистятся постепенно,
 * и жёсткий порог на всё разом остановил бы работу. Бюджет разрешено
 * только уменьшать — scripts/prose-en-budget.json. Если файл стал чище
 * бюджета, гейт скажет, на какое число его опустить.
 *
 * Словарь машинных оборотов (delve, leverage, robust, «in today's…»)
 * проверяется по нулю: на момент заведения гейта их не было ни одного,
 * и пускать их обратно незачем.
 *
 * Источник списка: references/ai-writing-detection.md скилла copywriting.
 *
 * Запуск: npm run test:prose-en (входит в npm run verify).
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const budgetPath = path.join(root, 'scripts/prose-en-budget.json');

/** Тире на 1000 слов, к которому идём. Прозе на английском больше не нужно. */
const TARGET_PER_1K = 2;

/**
 * Обороты, по которым текст опознают как машинный. Проверяются по нулю.
 * Регистр не важен, границы слов обязательны — иначе «use» ловится внутри
 * «because», а «vital» внутри «revitalise».
 */
const BANNED = [
  'delve',
  'leverage',
  'utilise',
  'utilize',
  'facilitate',
  'bolster',
  'underscore',
  'streamline',
  'robust',
  'seamless',
  'cutting-edge',
  'groundbreaking',
  'transformative',
  'holistic',
  'multifaceted',
  'pivotal',
  'furthermore',
  'moreover',
  'that being said',
  'at its core',
  'it is worth noting',
  "it's worth noting",
  'in the realm of',
  'in the landscape of',
  'shed light on',
  'pave the way for',
  'a myriad of',
  'a plethora of',
  'in conclusion',
  'delving into',
];

const CYRILLIC = /[а-яё]/i;

/** Строки с кириллицей — это русские комментарии в en.ts и русские поля в паках. */
const englishOnly = (text) =>
  text
    .split('\n')
    .filter((line) => !CYRILLIC.test(line))
    .join('\n');

const countWords = (text) => (text.match(/[A-Za-z']+/g) || []).length;

const targets = () => {
  const packs = readdirSync(path.join(root, 'src/content/packs'))
    .filter((f) => f.endsWith('.en.json'))
    .map((f) => `src/content/packs/${f}`);
  return [
    'src/i18n/en.ts',
    ...packs.sort(),
    'src/content/sandbox.json',
    'src/content/story.en.json',
    'src/content/tools-compare.json',
  ];
};

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name, msg) => console.log(` ok    ${name}${msg ? `: ${msg}` : ''}`);

const budget = JSON.parse(readFileSync(budgetPath, 'utf8'));
const measured = {};
const tighten = [];

for (const rel of targets()) {
  const raw = readFileSync(path.join(root, rel), 'utf8');
  const text = englishOnly(raw);
  const words = countWords(text);
  const dashes = (text.match(/—/g) || []).length;
  const per1k = words ? (dashes / words) * 1000 : 0;
  measured[rel] = dashes;

  const allowed = budget.dashes[rel];
  if (allowed === undefined) {
    fail(rel, `нет строки в prose-en-budget.json (сейчас ${dashes} тире) — добавить и уменьшать`);
    continue;
  }
  if (dashes > allowed) {
    fail(rel, `${dashes} тире при бюджете ${allowed} (${per1k.toFixed(2)}/1k, цель ≤${TARGET_PER_1K})`);
    continue;
  }
  if (dashes < allowed) tighten.push(`${rel}: ${allowed} → ${dashes}`);
  ok(rel, `${dashes} тире, ${per1k.toFixed(2)}/1k`);
}

/* --- Словарь машинных оборотов: по нулю во всех файлах --- */
for (const rel of targets()) {
  const text = englishOnly(readFileSync(path.join(root, rel), 'utf8'));
  const hits = [];
  for (const phrase of BANNED) {
    const re = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const found = text.match(re);
    if (found) hits.push(`${phrase} ×${found.length}`);
  }
  if (hits.length) fail(`${rel} — обороты`, hits.join('; '));
}
if (!failed) ok('машинных оборотов не найдено ни в одном файле');

if (process.argv.includes('--update-budget')) {
  writeFileSync(
    budgetPath,
    `${JSON.stringify({ ...budget, dashes: { ...budget.dashes, ...measured } }, null, 2)}\n`,
    'utf8'
  );
  console.log('\nБюджет перезаписан по факту (--update-budget).');
} else if (tighten.length) {
  console.log('');
  console.log('Файлы стали чище бюджета — опустить в prose-en-budget.json:');
  for (const line of tighten) console.log(`  ${line}`);
  console.log('  (или прогнать: node scripts/test-prose-en.mjs --update-budget)');
}

const totalWords = targets().reduce(
  (sum, rel) => sum + countWords(englishOnly(readFileSync(path.join(root, rel), 'utf8'))),
  0
);
const totalDashes = Object.values(measured).reduce((a, b) => a + b, 0);
console.log('');
console.log(
  `Английский текст: ${totalWords} слов, ${totalDashes} тире ` +
    `(${((totalDashes / totalWords) * 1000).toFixed(2)} на 1000 слов, цель ≤${TARGET_PER_1K}).`
);

if (failed) {
  console.log('');
  console.log(`Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log('Проверки английской прозы пройдены.');
