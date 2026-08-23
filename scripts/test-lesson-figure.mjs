/**
 * Пятнадцатый гейт: жанр блока в карточке приёма.
 *
 * `form`/`example`/`wrong` у треков без исполнителя (domain, model) бывают
 * двух несовместимых жанров — диаграмма, выровненная пробелами, и обычная
 * проза, — и вёрстка у них противоположная: моноширинный блок без переноса
 * против пропорционального с переносом. Ошибка в любую сторону молчаливая:
 * приложение открывается, гейты зелены, а на экране либо разъехавшиеся
 * колонки, либо цитата, уехавшая в горизонтальную прокрутку. Именно так
 * прожил незамеченным целый трек — двадцать диаграмм domain рисовались
 * прозой, пока пользователь не прислал скриншот телефона (2026-08-23).
 *
 * Разбор жанра гейт НЕ повторяет своими словами: он импортирует ровно тот
 * `isFigureBlock`, который зовёт LessonCard (src/content/figureBlock.ts).
 * Гейт, переписавший правило заново, со временем начинает проверять не то,
 * что происходит на экране, — а расхождение двух формулировок как раз
 * и выглядит как «всё зелено».
 *
 * Что проверяется:
 *
 *  1. Отрицательный прогон — разбор умеет отвечать и «да», и «нет»
 *     на синтетике. Без него зелёный гейт одинаково зелен и когда контент
 *     верен, и когда разбор перестал что-либо находить.
 *  2. Согласие локалей: русская и английская редакции одного поля обязаны
 *     попасть в один жанр. Расхождение значит, что перевод расплющил
 *     диаграмму в список (или наоборот) — и на одной из локалей блок
 *     отрисуется не тем классом.
 *  3. Разбор жив на настоящем контенте: обе стороны непусты. Если разбор
 *     сломается и сложит всё в один жанр, проверка 2 останется зелёной —
 *     согласие локалей соблюдено и при поголовной прозе.
 *  4. Длинная строка внутри диаграммы. У диаграммы нет переноса, поэтому
 *     каждый лишний знак — это горизонтальная прокрутка на телефоне, где
 *     в блок помещается 37 знаков. Настоящие диаграммы укладываются в 71;
 *     потолок 90 ловит не узость, а другой дефект — абзац прозы, приклеенный
 *     к диаграмме, из-за которого весь блок теряет перенос.
 *
 * Запуск: npm run test:lesson-figure (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera-lesson-figure-'));

let failed = 0;
const ok = (name) => console.log(` ok    ${name}`);
const fail = (name, detail) => {
  console.log(` FAIL  ${name}: ${detail}`);
  failed++;
};

/** Поля карточки, у которых жанр вообще может разойтись; остальные — всегда проза. */
const FIELDS = ['form', 'example', 'wrong'];

/** Треки без исполнителя: только у них блок рисуется не как код. */
const PACKS = ['domain-lessons', 'model-lessons'];

/** Потолок строки внутри диаграммы — см. проверку 4 в шапке. */
const FIGURE_LINE_MAX = 90;

const lessonsOf = (file) => {
  const json = JSON.parse(readFileSync(path.join(root, 'src/content/packs', file), 'utf8'));
  return json.lessons ?? Object.values(json).find((v) => Array.isArray(v));
};

try {
  // Разбор лежит в TS без единого импорта — компилируется одним файлом.
  execSync(
    `npx tsc "${path.join(root, 'src/content/figureBlock.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution node ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );
  writeFileSync(path.join(outDir, 'package.json'), '{"type":"module"}');

  const { isFigureBlock } = await import(
    pathToFileURL(path.join(outDir, 'content/figureBlock.js')).href
  );

  /* --- 1. Отрицательный прогон --- */
  const cases = [
    ['рамочный символ — диаграмма', 'A → B\n│   │\nx   y', true],
    ['две строки с колонками — диаграмма', '  отгрузили   fact_sellin\n  на складе    fact_stock', true],
    ['одна строка с колонкой — ещё не диаграмма', 'обычное предложение\n  подпись   и число', false],
    ['абзац прозы — не диаграмма', 'Источник отвечает на вопрос, что происходит с заказом.\n\nМодель отвечает на другой.', false],
    ['стрелка без колонок — не диаграмма', '«Сколько купили в Сайтаме?»\n  → SUM(units) из fact_sellout', false],
    ['пустое поле — не диаграмма', '', false],
  ];
  for (const [name, text, expected] of cases) {
    const actual = isFigureBlock(text);
    if (actual === expected) ok(name);
    else fail(name, `ожидалось ${expected}, получено ${actual}`);
  }

  /* --- 2 и 3. Настоящий контент --- */
  let figures = 0;
  let prose = 0;
  const disagreements = [];
  const tooWide = [];

  for (const pack of PACKS) {
    const ru = lessonsOf(`${pack}.json`);
    const en = new Map(lessonsOf(`${pack}.en.json`).map((l) => [l.skill, l]));
    for (const lesson of ru) {
      const translated = en.get(lesson.skill);
      for (const field of FIELDS) {
        const ruIsFigure = isFigureBlock(lesson[field]);
        if (ruIsFigure) figures++;
        else prose++;

        // Английская редакция поля может отсутствовать: у sql example/wrong —
        // это код, и он не переводится (см. types.ts). Тогда сверять нечего.
        if (translated?.[field] !== undefined) {
          const enIsFigure = isFigureBlock(translated[field]);
          if (ruIsFigure !== enIsFigure) {
            disagreements.push(
              `${pack} ${lesson.skill}.${field}: ru ${ruIsFigure ? 'диаграмма' : 'проза'}, ` +
                `en ${enIsFigure ? 'диаграмма' : 'проза'}`
            );
          }
        }

        for (const [locale, text] of [['ru', lesson[field]], ['en', translated?.[field]]]) {
          if (!text || !isFigureBlock(text)) continue;
          const widest = Math.max(...text.split('\n').map((line) => line.length));
          if (widest > FIGURE_LINE_MAX) {
            tooWide.push(`${pack}.${locale} ${lesson.skill}.${field}: строка ${widest} знаков`);
          }
        }
      }
    }
  }

  if (disagreements.length) {
    fail(
      'жанр блока совпадает в ru и en',
      'одна из локалей отрисуется не тем классом — выровнять форму, ' +
        'а не только слова:\n' +
        disagreements.map((d) => `        ${d}`).join('\n')
    );
  } else ok('жанр блока совпадает в ru и en');

  if (figures >= 20 && prose >= 20) {
    ok(`разбор жив: диаграмм ${figures}, прозы ${prose}`);
  } else {
    fail(
      'разбор жив',
      `диаграмм ${figures}, прозы ${prose} — при живом разборе обе стороны ` +
        'непусты, а перекос в одну означает, что жанр перестал различаться'
    );
  }

  /* --- 4. Длинная строка внутри диаграммы --- */
  if (tooWide.length) {
    fail(
      `строка диаграммы не длиннее ${FIGURE_LINE_MAX} знаков`,
      'у диаграммы нет переноса, и длинная строка уезжает в прокрутку целым ' +
        'блоком — обычно это признак абзаца прозы, приклеенного к схеме:\n' +
        tooWide.map((d) => `        ${d}`).join('\n')
    );
  } else ok(`строка диаграммы не длиннее ${FIGURE_LINE_MAX} знаков`);

  console.log('');
  console.log(`Блоков разобрано: ${figures + prose} (диаграмм ${figures}, прозы ${prose}).`);
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

if (failed) {
  console.log('');
  console.log(`Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log('Проверки жанра блоков пройдены.');
