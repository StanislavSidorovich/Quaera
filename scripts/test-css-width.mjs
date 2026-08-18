/**
 * Гейт на один класс дефекта: жёсткий минимум колонки, из-за которого
 * на узком экране вбок уезжает вся страница.
 *
 * `repeat(auto-fit, minmax(360px, 1fr))` читается как «колонка не уже
 * 360px», и на широком экране это верно. Но когда колонка остаётся одна,
 * тот же 360px становится минимумом всей сетки: содержимому не дают
 * сжаться, оно выходит за край, и уезжает страница целиком — а не только
 * эта сетка. За месяц дефект заводился трижды (.data-pair, .track-intro,
 * .task-work), каждый раз находился глазами на телефоне и каждый раз
 * чинился одинаково — `minmax(min(360px, 100%), 1fr)`.
 *
 * Почему гейт статический, а не браузерный: поймать это замером значит
 * поднять настоящий движок раскладки на всех ширинах и всех трёх кеглях,
 * стенда для такого в проекте нет. Зато сама ошибка целиком видна
 * в тексте правила и не зависит ни от содержимого, ни от состояния экрана.
 *
 * Правило проверки: минимум, который правило требует от строки, не должен
 * превышать ширину, при которой правило вообще включается. У @media
 * и @container эта ширина стоит разного, и вот в чём разница:
 *
 *   - @media меряет настоящий вьюпорт и про zoom не знает, а крупный шрифт
 *     включается именно zoom-ом на .app (см. --zoom в styles.css). При A++
 *     содержимому достаётся на треть меньше, чем показал медиазапрос:
 *     1024px превращаются в 787. Отсюда деление на ZOOM_MAX.
 *   - @container меряет ширину самого контейнера, то есть уже после zoom.
 *     Делить не на что — это и есть довод предпочитать его медиазапросу
 *     там, где раскладка зависит от места, а не от устройства.
 *
 * Правила без единого голого px гейт не касается вовсе: `minmax(0, 1fr)`,
 * `repeat(2, 1fr)` и `min(…, 100%)` уже соотнесены с доступной шириной.
 *
 * Запуск: npm run test:css-width (входит в npm run verify).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(root, 'src/styles.css'), 'utf8');

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const assertEq = (name, actual, expected) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(name, `ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  } else ok(name);
};

/*
 * Разбор без парсера CSS: нужен только стек открытых блоков, чтобы знать,
 * внутри какого запроса стоит правило. Комментарии вырезаются заранее,
 * с сохранением переносов ради номеров строк — иначе фигурная скобка или
 * слово `minmax` из объяснения попали бы в разбор наравне с кодом,
 * а объяснений в этом файле больше, чем правил.
 */
const declarations = (text) => {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const out = [];
  const preludes = [];
  let start = 0;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '{') {
      preludes.push(stripped.slice(start, i).trim().split(/[\n;}]/).pop().trim());
    } else if (ch === '}') {
      preludes.pop();
    } else if (ch === ';') {
      const decl = stripped.slice(start, i).trim();
      if (decl) {
        out.push({ decl, at: [...preludes], line: stripped.slice(0, start).split('\n').length });
      }
    } else continue;
    start = i + 1;
  }
  return out;
};

/* Крупный шрифт (A++) — zoom 1.3 на .app; медиазапрос об этом не знает. */
const ZOOM_MAX = 1.3;

const availableAt = (preludes) => {
  let available = 0;
  for (const prelude of preludes) {
    const isMedia = prelude.startsWith('@media');
    const isContainer = prelude.startsWith('@container');
    if (!isMedia && !isContainer) continue;
    for (const m of prelude.matchAll(/min-width:\s*(\d+)px/g)) {
      available = Math.max(available, isMedia ? Number(m[1]) / ZOOM_MAX : Number(m[1]));
    }
  }
  return available;
};

/*
 * Сколько ширины правило требует, чтобы не переполниться: у minmax() это
 * первый аргумент, у голого трека — он сам, у нескольких треков — сумма.
 * Максимум minmax() не в счёт: он потолок, а страницу выталкивает пол.
 */
const demandOf = (value) => {
  const bare = value.replace(/\b(?:min|max|clamp)\([^()]*\)/g, ' ');
  const parts = [];
  for (const m of bare.matchAll(/minmax\(\s*([^,]+),/g)) parts.push(m[1]);
  for (const m of bare.replace(/minmax\([^()]*\)/g, ' ').matchAll(/[\d.]+px/g)) parts.push(m[0]);
  return parts
    .map((p) => Number((/^\s*(\d+(?:\.\d+)?)px\s*$/.exec(p) || [])[1]))
    .filter((n) => n > 0)
    .reduce((a, b) => a + b, 0);
};

const excessIn = (text) =>
  declarations(text)
    .filter((d) => /^grid-template-columns\s*:/.test(d.decl))
    .map((d) => demandOf(d.decl.slice(d.decl.indexOf(':') + 1)) - availableAt(d.at));

/* --- 1. Отрицательный прогон: гейт обязан уметь провалиться --- */
/*
 * Синтетика, а не правка настоящего файла: проверяется, что разбор видит
 * ровно ту разницу, ради которой заведён. Без этого блока зелёный гейт
 * ничего не означает — он одинаково зелен и когда файл чист, и когда
 * разбор перестал что-либо находить.
 */
assertEq(
  'голый минимум вне запроса — дефект',
  excessIn('.a { grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); }').map((n) => n > 0),
  [true]
);
assertEq(
  'тот же минимум под min(…, 100%) — не дефект',
  excessIn('.a { grid-template-columns: repeat(auto-fit, minmax(min(360px, 100%), 1fr)); }'),
  [0]
);
assertEq(
  'голый минимум внутри @media от 1024px — не дефект',
  excessIn('@media (min-width: 1024px) { .a { grid-template-columns: minmax(360px, 1fr); } }').map((n) => n > 0),
  [false]
);
assertEq(
  'но 800px внутри @media от 1024px — дефект: при A++ там 787',
  excessIn('@media (min-width: 1024px) { .a { grid-template-columns: minmax(800px, 1fr); } }').map((n) => n > 0),
  [true]
);
assertEq(
  'фиксированный трек внутри @container — не дефект',
  excessIn('@container (min-width: 860px) { .a { grid-template-columns: minmax(0, 1fr) 450px; } }').map((n) => n > 0),
  [false]
);
assertEq(
  'запрос кончился — правило за его скобкой снова под проверкой',
  excessIn('@media (min-width: 1024px) { .a { color: red; } } .b { grid-template-columns: minmax(360px, 1fr); }').map((n) => n > 0),
  [true]
);

/* --- 2. Сам файл --- */
const columnRules = declarations(css).filter((d) => /^grid-template-columns\s*:/.test(d.decl));
const offenders = columnRules
  .map((rule) => ({
    line: rule.line,
    decl: rule.decl.replace(/\s+/g, ' '),
    needed: demandOf(rule.decl.slice(rule.decl.indexOf(':') + 1)),
    available: Math.round(availableAt(rule.at)),
  }))
  .filter((r) => r.needed > 0 && r.needed > r.available);

if (offenders.length) {
  fail(
    'минимум колонки не шире экрана, на котором она включается',
    'правило требует больше, чем гарантирует запрос, внутри которого стоит — ' +
      'обернуть минимум в min(…, 100%):\n' +
      offenders
        .map(
          (o) =>
            `        styles.css:${o.line}  ${o.decl}  (требует ${o.needed}px, гарантировано ${o.available}px)`
        )
        .join('\n')
  );
} else {
  ok('минимум колонки не шире экрана, на котором она включается');
}

/*
 * Проверка на сам разбор: если он перестанет находить правила (сменится
 * форматирование, съедет вырезание комментариев), проверка выше станет
 * зелёной ровно потому, что не проверяет ничего.
 */
const guarded = columnRules.filter((r) => availableAt(r.at) > 0 && /\d+px/.test(r.decl));
if (columnRules.length >= 20 && guarded.length >= 3) {
  ok(`разбор жив: правил с колонками ${columnRules.length}, из них под запросом с px ${guarded.length}`);
} else {
  fail(
    'разбор жив',
    `найдено правил ${columnRules.length}, под запросом с px ${guarded.length} — ` +
      'похоже, разбор перестал видеть файл, а не файл стал чистым'
  );
}

console.log('');
console.log(`Проверено правил grid-template-columns: ${columnRules.length}.`);

if (failed) {
  console.log('');
  console.log(`Провалено проверок: ${failed}`);
  process.exit(1);
}
console.log('Проверки ширины колонок пройдены.');
