/**
 * Гейт на числа README против паков — README дважды отставал молча (305
 * заданий вместо 323, «25 дней» вместо тридцати), каждый раз находилось
 * только внешним разбором. Числа заданий и навыков живут в контент-паках,
 * README их только пересказывает, и ничто не мешало пересказу протухнуть
 * после того, как пак вырос.
 *
 * Проверяет ровно то, что реально дрейфовало: таблицу «трек — заданий —
 * навыков» и сводную строку «N tasks and M skills» в README.md
 * и README.ru.md против того, что реально лежит в src/content/packs.
 * Число дней кампании сюда не входит — оно не из паков, а из
 * storymode.ts (см. test:story-ladder).
 *
 * Запуск: npm run test:readme-numbers (входит в npm run verify).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name, msg) => console.log(` ok    ${name}${msg ? `: ${msg}` : ''}`);

/* --- 1. Настоящие числа из паков --- */

const TRACKS = ['sql', 'domain', 'model', 'python'];

const countsFromPacks = () => {
  const perTrack = {};
  let totalTasks = 0;
  let totalSkills = 0;
  for (const track of TRACKS) {
    const file = path.join(root, `src/content/packs/${track}-core.json`);
    const pack = JSON.parse(readFileSync(file, 'utf8'));
    perTrack[track] = { tasks: pack.tasks.length, skills: pack.skills.length };
    totalTasks += pack.tasks.length;
    totalSkills += pack.skills.length;
  }
  return { perTrack, totalTasks, totalSkills };
};

const real = countsFromPacks();

/* --- 2. Разбор README: таблица трека и сводная строка --- */

/*
 * Метка трека в таблице — не id пака: README называет треки по-человечески
 * и на двух языках. Разбор ищет строку таблицы, начинающуюся с этой метки,
 * а не полагается на порядок строк.
 */
const TRACK_LABELS = {
  en: {
    sql: 'SQL for analysts',
    domain: 'Analytics as a profession',
    model: 'Data model and BI',
    python: 'pandas for analysts',
  },
  ru: {
    sql: 'SQL для аналитика',
    domain: 'Аналитика как профессия',
    model: 'Модель данных и BI',
    python: 'pandas для аналитика',
  },
};

const parseTable = (text, labels) => {
  const perTrack = {};
  for (const [track, label] of Object.entries(labels)) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`^\\|\\s*${escaped}\\s*\\|\\s*(\\d+)\\s*\\|\\s*(\\d+)\\s*\\|`, 'm');
    const m = re.exec(text);
    if (m) perTrack[track] = { tasks: Number(m[1]), skills: Number(m[2]) };
  }
  return perTrack;
};

const parseSummary = (text, re) => {
  const m = re.exec(text);
  if (!m) return null;
  return { tasks: Number(m[1]), skills: Number(m[2]) };
};

const README = {
  en: {
    path: 'README.md',
    text: readFileSync(path.join(root, 'README.md'), 'utf8'),
    labels: TRACK_LABELS.en,
    summaryRe: /Four tracks\s*—\s*(\d+)\s*tasks and (\d+)\s*skills/,
  },
  ru: {
    path: 'README.ru.md',
    text: readFileSync(path.join(root, 'README.ru.md'), 'utf8'),
    labels: TRACK_LABELS.ru,
    summaryRe: /Четыре трека\s*—\s*(\d+)\s*задани[яйе] и (\d+)\s*навы[кч][а-я]?/,
  },
};

/* --- 3. Негативный прогон: разбор обязан уметь провалиться --- */

const negativeTable = parseTable(
  '| SQL for analysts | 999 | 1 | The query runs against SQLite (sql.js) |',
  { sql: TRACK_LABELS.en.sql }
);
if (negativeTable.sql?.tasks === 999) {
  ok('разбор таблицы находит числа', 'синтетическая строка распознана');
} else {
  fail('разбор таблицы находит числа', 'синтетическая строка с заведомым числом не распозналась — разбор сломан');
}

const negativeSummary = parseSummary('Four tracks — 999 tasks and 1 skills.', README.en.summaryRe);
if (negativeSummary?.tasks === 999) {
  ok('разбор сводной строки находит числа', 'синтетическая строка распознана');
} else {
  fail('разбор сводной строки находит числа', 'синтетическая строка с заведомым числом не распозналась — разбор сломан');
}

/* --- 4. Сверка обоих README --- */

for (const [locale, cfg] of Object.entries(README)) {
  const parsedTable = parseTable(cfg.text, cfg.labels);
  const foundRows = Object.keys(parsedTable).length;
  if (foundRows !== TRACKS.length) {
    fail(
      `${cfg.path}: таблица треков найдена целиком`,
      `распознано строк ${foundRows} из ${TRACKS.length} — формат таблицы изменился, разбор надо поправить`
    );
  } else {
    ok(`${cfg.path}: таблица треков найдена целиком`);
  }

  for (const track of TRACKS) {
    const parsed = parsedTable[track];
    if (!parsed) continue;
    const expected = real.perTrack[track];
    if (parsed.tasks !== expected.tasks || parsed.skills !== expected.skills) {
      fail(
        `${cfg.path}: ${cfg.labels[track]}`,
        `в README ${parsed.tasks} заданий / ${parsed.skills} навыков, в паке ${expected.tasks} / ${expected.skills}`
      );
    } else {
      ok(`${cfg.path}: ${cfg.labels[track]}`, `${parsed.tasks} заданий, ${parsed.skills} навыков`);
    }
  }

  const summary = parseSummary(cfg.text, cfg.summaryRe);
  if (!summary) {
    fail(`${cfg.path}: сводная строка найдена`, 'строка «N tasks and M skills» не распозналась — формат изменился');
  } else if (summary.tasks !== real.totalTasks || summary.skills !== real.totalSkills) {
    fail(
      `${cfg.path}: сводная строка`,
      `в README ${summary.tasks} заданий / ${summary.skills} навыков, в паках ${real.totalTasks} / ${real.totalSkills}`
    );
  } else {
    ok(`${cfg.path}: сводная строка`, `${summary.tasks} заданий, ${summary.skills} навыков`);
  }
}

console.log('');
console.log(
  `Из паков: ${real.totalTasks} заданий, ${real.totalSkills} навыков (` +
    TRACKS.map((t) => `${t} ${real.perTrack[t].tasks}/${real.perTrack[t].skills}`).join(', ') +
    ').'
);

if (failed) {
  console.log('');
  console.log(`Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log('Числа README сходятся с паками.');
