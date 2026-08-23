/**
 * Гейт лестницы режима истории.
 *
 * Кампания обещает лестницу: к пятнице человек не встречает ни одной
 * конструкции впервые, потому что каждая была показана раньше. Обещание
 * записано в шапке storymode.ts, а проверялось до сих пор только глазами —
 * и глаза его не удержали. Прогон недели показал четыре места, где подводка
 * говорит про идею, а эталон требует напечатать слово, которого человек
 * нигде не видел: IN и AND в понедельник, DESC там же, ROUND и COUNT(*)
 * во вторник, COUNT(DISTINCT) — за экран до того, как ему учат.
 *
 * **Правило, которое проверяется.** Новая конструкция появляется дважды:
 * сначала в готовом виде — в подводке, в шаблоне с пропусками или в запросе
 * predict-задания, — и только потом человек печатает её рукой. Первое
 * появление сразу под рукой (write без предварительного показа) — падение.
 *
 * **Почему не «поискать слово в тексте задания».** Задание видно человеку
 * целиком, включая подсказки и разбор, но подсказки открываются по кнопке
 * и с задержкой, а разбор — уже после решения. Лестница обязана держаться
 * без них: подсказка спасает того, кто застрял, и не заменяет ступень.
 * Поэтому в источники показа не входят ни hints, ни explain.
 *
 * **Что считается «напечатать рукой».** У write — то, чего нет в заготовке:
 * starter человек получает даром. У fill — содержимое пропусков и то, чем
 * пропуск оборачивается в эталоне (см. typedByHand). У predict — ничего:
 * там читают, а не пишут.
 *
 * **Словарь свой у каждого трека.** До 2026-08-23 он был один и состоял
 * из чистого SQL, поэтому день на pandas проходил проверку вхолостую:
 * ни `.groupby(`, ни `.rolling(` в нём не значились, и «новая конструкция
 * появляется дважды» на таком дне не проверялось вовсе. Сливать словари
 * в один список было нельзя: `mean` строчными — обычное английское слово,
 * и английская проза SQL-дней засчитывала бы показ приёма, которого там
 * не было. Основа словаря — общий список приёмов трека
 * (scripts/lib/track-constructs.mjs), тот же, по которому verify-content
 * спрашивает «объяснён ли приём в теории»: два вопроса об одном наборе,
 * и разъехаться им больше нечем.
 *
 * Отдельно печатается слабое покрытие: конструкция, которую человек до сих
 * пор видел только внутри шаблона или predict-запроса, но которую ни одна
 * подводка не назвала словами. Это не падение — по букве правила ступень
 * есть, — но это место, где ступень держится на том, что человек прочитал
 * код целиком, а не на объяснении.
 *
 * Запуск: npm run test:story-ladder (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { TRACK_CONSTRUCTS } from './lib/track-constructs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera--'));

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const check = (name, cond, msg) => (cond ? ok(name) : fail(name, msg));

/**
 * Словарь конструкций: имя и то, как конструкция выглядит в тексте.
 *
 * Один и тот же образец ищется и в SQL, и в прозе, и это не экономия —
 * это и есть определение показа. Подводка показала IN тогда и только тогда,
 * когда в ней написано IN; пересказ своими словами («перечислить значения»)
 * ступенью не считается, потому что напечатать по нему нельзя.
 *
 * Ключевые слова ищутся в верхнем регистре: русская проза и английская
 * не дают ложных совпадений, пока образец не опускается до строчных букв.
 */
const VOCAB_SQL = [
  ['SELECT', /\bSELECT\b/],
  ['FROM', /\bFROM\b/],
  ['AS', /\bAS\b/],
  ['WHERE', /\bWHERE\b/],
  ['строковый литерал', /'[^']*'/],
  ['равенство', /=/],
  ['сравнение', />=|<=|<>|>|</],
  ['AND', /\bAND\b/],
  ['OR', /\bOR\b/],
  ['IN', /\bIN\b/],
  ['BETWEEN', /\bBETWEEN\b/],
  ['ORDER BY', /\bORDER\s+BY\b/],
  ['DESC', /\bDESC\b/],
  ['LIMIT', /\bLIMIT\b/],
  ['COUNT', /\bCOUNT\s*\(/],
  ['COUNT(*)', /\bCOUNT\s*\(\s*\*\s*\)/],
  ['DISTINCT', /\bDISTINCT\b/],
  ['SUM', /\bSUM\s*\(/],
  ['AVG', /\bAVG\s*\(/],
  ['MIN/MAX', /\b(MIN|MAX)\s*\(/],
  ['ROUND', /\bROUND\s*\(/],
  ['substr', /\bsubstr\s*\(/i],
  ['GROUP BY', /\bGROUP\s+BY\b/],
  ['GROUP BY по номеру', /\bGROUP\s+BY\s+\d/],
  ['HAVING', /\bHAVING\b/],
  ['JOIN', /\bJOIN\b/],
  ['ON', /\bON\b/],
  ['псевдоним таблицы', /\b[a-z]\.[a-z_]{2,}/],
  ['LEFT JOIN', /\bLEFT\s+JOIN\b/],
  ['IS NULL', /\bIS\s+NULL\b/],
  ['IS NOT NULL', /\bIS\s+NOT\s+NULL\b/],
  ['COALESCE', /\bCOALESCE\s*\(/],
  ['подзапрос', /\(\s*SELECT\b/],
  ['CASE', /\bCASE\s+WHEN\b/],
  ['ELSE', /\bELSE\b/],
  ['WITH', /\bWITH\b/],
];

/**
 * Лексикон pandas. Тот же жанр, что и у SQL, но два отличия по существу.
 *
 * **Образец здесь сразу и есть рабочая форма.** У SQL пришлось заводить
 * отдельную карту FORMS: слово HAVING в прозе — не то же самое, что
 * HAVING SUM(...) > 5000000. В pandas приём почти всегда пишется вызовом,
 * поэтому образец `\.groupby\s*\(` не срабатывает на слове «группировка»
 * и не срабатывает даже на слове «groupby» без скобки. Имя без формы
 * в этот словарь не проходит само собой.
 *
 * **Своих образцов здесь мало.** Всё, что перечислено в общем списке
 * приёмов трека (scripts/lib/track-constructs.mjs), добирается ниже
 * автоматически — руками записано только то, чего в том списке нет
 * и не должно быть: маска, две скобки выбора колонок, агрегат в цепочке.
 * Это не самоочевидные операции вроде .head(), а именно те формы, которые
 * человек печатает рукой в первый же день и которые в SQL выглядят иначе.
 */
const VOCAB_PYTHON = [
  ['строковый литерал', /'[^']*'/],
  ['выбор колонок [[...]]', /\[\[/],
  ['маска по колонке', /\[\s*['"][^'"]+['"]\s*\]\s*(?:==|!=|>=|<=|>|<)/],
  ['& и | в маске', /\)\s*[&|]\s*\(|\]\s*[&|]\s*\(/],
  ['~ отрицание маски', /~\s*[\w(]/],
  ['as_index=False', /as_index\s*=\s*False/],
  ['агрегат в цепочке', /\.(sum|mean|count|min|max)\s*\(/],
  ['именованная агрегация', /\w+\s*=\s*\(\s*['"]/],
  ['.round(', /\.round\s*\(/],
];

/**
 * Приёмы трека, которых в лексиконе ещё нет, добираются из общего списка.
 *
 * Это и есть ответ на то, из-за чего гейт молчал про pandas: лексикон
 * был отдельным списком и отставал от пака на целый трек. Теперь новый
 * приём, добавленный в scripts/lib/track-constructs.mjs ради проверки
 * «объяснён ли он в теории», сразу становится ступенью и здесь.
 *
 * Регистр разбирается по-разному, и это не придирка. Ключевое слово SQL
 * ищется только в верхнем регистре: `like` строчными — обычное английское
 * слово, и в английской прозе оно встречается в каждом третьем абзаце.
 * Имя функции со скобкой безопасно в любом регистре — прозе неоткуда
 * взять «lag(» случайно, — а pandas-приёмы пишутся строчными всегда.
 */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const derive = (track, token) => {
  const t = token.trim();
  if (track === 'python') return new RegExp(escapeRe(t).replace(/\\\(/g, '\\s*\\('));
  const withParen = t.endsWith('(');
  const body = escapeRe(withParen ? t.slice(0, -1).trim() : t).replace(/\s+/g, '\\s+');
  return withParen
    ? new RegExp('\\b(?:' + body + '|' + body.toUpperCase() + ')\\s*\\(')
    : new RegExp('\\b' + body.toUpperCase() + '\\b');
};

/** Покрыт ли приём уже написанным образцом — проверяется по самому приёму как по тексту. */
const covered = (vocab, token) =>
  vocab.some(([, re]) => new RegExp(re.source, re.flags.includes('i') ? re.flags : re.flags + 'i').test(token.trim()));

const withDerived = (track, vocab) => [
  ...vocab,
  ...(TRACK_CONSTRUCTS[track] ?? [])
    .filter((tok) => !covered(vocab, tok))
    .map((tok) => [tok.trim(), derive(track, tok)]),
];

const VOCAB_BY_TRACK = {
  sql: withDerived('sql', VOCAB_SQL),
  python: withDerived('python', VOCAB_PYTHON),
  model: withDerived('model', []),
};

/**
 * Рабочая форма конструкции — то, по чему её можно напечатать.
 *
 * Правка по живому проходу четверга: подводка честно писала «для этого есть
 * HAVING: тот же фильтр, но после GROUP BY», и словарь выше засчитывал показ
 * по одному имени. Человек читал про идею, а через экран встречал в шаблоне
 * HAVING SUM(f.revenue) > 5000000 AND COUNT(DISTINCT ...) >= 80 и говорил,
 * что конструкцию «как будто не проходили». Это то же самое, обо что гейт уже
 * спотыкался на AVG: **функцию мало назвать, её надо показать вызовом**, —
 * только теперь про клаузы, у которых форма не в скобках, а в операнде.
 *
 * Здесь у конструкции нет записи — годится образец из VOCAB: у строкового
 * литерала или у сравнения имя и форма совпадают.
 *
 * Латиница в образцах не случайна: \w в JS не включает кириллицу, поэтому
 * русская проза, называющая клаузу по имени, в рабочую форму не проходит
 * сама собой. Английская проза отсекается требованием операнда.
 */
const FORMS_SQL = new Map([
  ['WHERE', /\bWHERE\s+[\w.]+\s*(?:[=<>]|\b(?:BETWEEN|IN|IS|LIKE|NOT)\b)/],
  ['GROUP BY', /\bGROUP\s+BY\s+[\w.]+/],
  ['ORDER BY', /\bORDER\s+BY\s+[\w.]+/],
  ['HAVING', /\bHAVING\s+[\w.]+\s*(?:\(|[<>=])/],
  ['JOIN', /\bJOIN\b[^\n]*\bON\b/],
  ['ON', /\bON\s+[\w.]+\s*=/],
  ['LIMIT', /\bLIMIT\s+\d/],
  ['IN', /\bIN\s*\(/],
  ['BETWEEN', /\bBETWEEN\s+\S+\s+AND\b/],
  ['DESC', /[\w.]+\s+DESC\b/],
  ['LEFT JOIN', /\bLEFT\s+JOIN\b[^\n]*\bON\b/],
  ['WITH', /\bWITH\s+\w+\s+AS\s*\(/],
  ['IS NULL', /[\w.]+\s+IS\s+NULL\b/],
  ['IS NOT NULL', /[\w.]+\s+IS\s+NOT\s+NULL\b/],
  ['ELSE', /\bELSE\s+\S/],
]);

/**
 * Карты рабочих форм у pandas нет, и это не пропуск. Приём здесь пишется
 * вызовом, а образец в лексиконе требует скобку, — то есть имя без формы
 * в словарь не попадает и без отдельной карты. Появится приём, у которого
 * форма отличается от имени (как у SQL-клауз), — карта заведётся тогда.
 */
const FORMS_BY_TRACK = { sql: FORMS_SQL, python: new Map(), model: new Map() };

/**
 * Какие конструкции есть в куске текста — глазами своего трека.
 *
 * Словарь выбирается по треку дня, а накопитель показанного остаётся
 * сквозным, и это не противоречие. Имена приёмов у треков не пересекаются
 * (`SELECT` и `.groupby(` не спутать), поэтому понедельник недели на pandas
 * честно начинается с нуля по своему инструменту, унаследовав от SQL ровно
 * то, что и правда общее: строковый литерал.
 */
function constructs(text, track) {
  if (!text) return new Set();
  const found = new Set();
  for (const [name, re] of VOCAB_BY_TRACK[track] ?? []) if (re.test(text)) found.add(name);
  return found;
}

/** Какие конструкции показаны в рабочей форме — то есть так, что по ним можно напечатать. */
function inWorkingForm(text, track) {
  if (!text) return new Set();
  const forms = FORMS_BY_TRACK[track] ?? new Map();
  const found = new Set();
  for (const [name, re] of VOCAB_BY_TRACK[track] ?? []) if ((forms.get(name) ?? re).test(text)) found.add(name);
  return found;
}

const minus = (a, b) => new Set([...a].filter((x) => !b.has(x)));
const join = (list) => list.filter(Boolean).join('\n');

/** Текст подводки шага: заголовок и абзацы вместе — разобранный пример живёт в абзаце. */
const introText = (step) => (step.intro ? join([step.intro.title, ...step.intro.paras]) : '');

/**
 * Что человек обязан напечатать сам. Пустое множество у predict — это
 * не пробел в проверке, а свойство режима: там выбирают из вариантов.
 *
 * У `fill` считается двумя способами сразу, и второй добавлен вместе
 * с лексиконом pandas. Содержимое пропуска — фрагмент, а не выражение:
 * в py-037 человек печатает `rolling`, тогда как образец приёма требует
 * `.rolling(`, потому что иначе он ловил бы слово «rolling» в прозе.
 * Поэтому рядом стоит разность «эталон минус шаблон с вычеркнутыми
 * пропусками»: она видит приём по тому, во что пропуск превращается,
 * а не по тому, как он выглядит в отрыве от строки. Объединение, а не
 * замена — первый способ ловит то, что второй пропустит, когда та же
 * форма уже стоит в шаблоне рядом.
 */
function typedByHand(task, track) {
  if (task.mode === 'write') return minus(constructs(task.solution, track), constructs(task.starter, track));
  if (task.mode === 'fill') {
    const stripped = String(task.template ?? '').replace(/_{2,}/g, '');
    return new Set([
      ...constructs(join(task.blanks ?? []), track),
      ...minus(constructs(task.solution, track), constructs(stripped, track)),
    ]);
  }
  return new Set();
}

/** Что задание показывает после того, как пройдено: шаблон, запрос, эталон, заготовка. */
const shownByTask = (task, track) =>
  constructs(join([task.starter, task.template, task.predictSql, task.solution]), track);

/**
 * Что задание кладёт человеку перед глазами, пока он его решает: шаблон
 * с пропусками, заготовка, запрос predict. Эталон сюда не входит намеренно —
 * его видят после решения или по кнопке «показать разбор», а ступень обязана
 * держаться без них (тот же довод, по которому исключены hints и explain).
 */
const givenByTask = (task, track) => constructs(join([task.starter, task.template, task.predictSql]), track);

try {
  execSync(
    `npx tsc "${path.join(root, 'src/content/storymode.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--jsx react-jsx --rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );

  const { storyCampaign } = await import(pathToFileURL(path.join(outDir, 'content', 'storymode.js')).href);

  for (const locale of ['ru', 'en']) {
    const campaign = storyCampaign(locale);
    const label = `${locale}: `;
    const packs = new Map();
    /**
     * Задание локали. Английский пак — накладка из одной прозы: запросов,
     * шаблонов и эталонов в нём нет, они общие. Читать его как самостоятельный
     * пак значило бы проверять английскую неделю на пустом множестве и всегда
     * получать «ok» — ровно та проверка, которой лучше бы не было вовсе.
     */
    const taskOf = (id, track) => {
      if (!packs.has(track)) {
        const read = (file) => JSON.parse(readFileSync(path.join(root, 'src/content/packs', file), 'utf8'));
        const base = read(`${track}-core.json`);
        if (locale === 'en') {
          const over = new Map(read(`${track}-core.en.json`).tasks.map((x) => [x.id, x]));
          base.tasks = base.tasks.map((x) => ({ ...x, ...(over.get(x.id) ?? {}) }));
        }
        packs.set(track, base);
      }
      return packs.get(track).tasks.find((x) => x.id === id);
    };

    check(`${label}кампания не пуста`, campaign.missions.length > 0, 'в кампании нет ни одного дня');

    /*
     * Показанное копится по ходу недели и делится надвое: словами — то,
     * что названо в подводке, и вообще — то, что человек хотя бы видел
     * в коде задания. Первое множество нужно только для предупреждений,
     * падение считается по второму.
     */
    const seen = new Set();
    const namedInProse = new Set();
    const formShown = new Set();
    const gaps = [];
    const weak = [];
    const unformed = [];
    let missing = 0;

    campaign.missions.forEach((mission, day) => {
      mission.steps.forEach((step, i) => {
        const task = taskOf(step.taskId, mission.track);
        if (!task) {
          fail(`${label}задание ${step.taskId}`, `день ${day + 1}, шаг ${i + 1}: такого id нет в паке`);
          return;
        }

        const intro = constructs(introText(step), mission.track);
        const introForms = inWorkingForm(introText(step), mission.track);
        const available = new Set([...seen, ...intro]);
        const required = typedByHand(task, mission.track);

        for (const c of minus(required, available)) {
          gaps.push(`${mission.short} · ${task.id} (${task.mode}) — ${c}`);
          missing++;
        }
        for (const c of required) {
          if (!intro.has(c) && !namedInProse.has(c)) weak.push(`${mission.short} · ${task.id} — ${c}`);
        }

        /*
         * Вторая половина лестницы: конструкция, которую человек не печатает,
         * а получает готовой в шаблоне или в запросе predict, обязана быть
         * показана в рабочей форме прежде, чем он на неё наткнётся. Подводка
         * того же шага годится — она стоит экраном раньше.
         *
         * Без этого правила ступень засчитывалась по одному имени: подводка
         * писала «для этого есть HAVING», а через экран человек встречал
         * HAVING SUM(f.revenue) > 5000000 и говорил, что конструкцию
         * не проходили. Имя не форма.
         */
        for (const c of minus(givenByTask(task, mission.track), formShown)) {
          if (!introForms.has(c)) {
            unformed.push(`${mission.short} · ${task.id} (${task.mode}) — ${c}`);
          }
        }

        for (const c of intro) {
          seen.add(c);
          namedInProse.add(c);
        }
        for (const c of introForms) formShown.add(c);
        for (const c of shownByTask(task, mission.track)) {
          seen.add(c);
          formShown.add(c);
        }
      });
    });

    check(
      `${label}конструкция показана прежде, чем её печатают рукой`,
      missing === 0,
      `${missing} шт. впервые под рукой:\n        ${gaps.join('\n        ')}`
    );

    check(
      `${label}конструкция показана в рабочей форме прежде, чем встретится в задании`,
      unformed.length === 0,
      `${unformed.length} шт. названы именем без формы:\n        ${unformed.join('\n        ')}`
    );

    if (weak.length) {
      console.log(`       слабое покрытие (видел только в коде, словами не названо):`);
      for (const w of weak) console.log(`         · ${w}`);
    }

    /*
     * Обещание финала: в последнем дне недели не вводится ни одной новой
     * конструкции — он собран из неё целиком. Это то свойство, ради которого
     * неделю вообще разложили на пять дней, и стоит оно ровно до первой
     * правки контента, которая тихо добавит в пятницу оконную функцию.
     *
     * Считается по каждой неделе отдельно, а показанное копится сквозь всю
     * кампанию: вторая неделя строится на первой и обязана этим пользоваться,
     * иначе понедельник второй недели пришлось бы начинать с SELECT.
     *
     * **Неделя, которая кончается днём-суждением, из этой проверки выпадает,
     * и об этом печатается строка.** У domain-заданий нет ни шаблона, ни
     * эталона, поэтому множество показанного у них пустое всегда: пятница
     * третьей недели проходила проверку не потому, что лестница цела,
     * а потому, что мерить в том дне нечего. Соблазн взять вместо неё
     * последний день с кодом был проверен и отвергнут — он назвал дефектом
     * четверг той же недели, который вводит LIKE совершенно законно, будучи
     * учебным днём. Обещание относится к закрытию недели, а закрывает её
     * там суждение, а не код; значит проверять нечего — но молчать об этом
     * гейт не должен, иначе «ok» на экране означает две разные вещи.
     */
    for (const week of campaign.weeks) {
      const days = campaign.missions.filter((m) => m.week === week.id);
      const last = days[days.length - 1];
      if (!last) continue;
      const hasCode = last.steps.some((s) => {
        const task = taskOf(s.taskId, last.track);
        return task && [task.starter, task.template, task.predictSql, task.solution].some(Boolean);
      });
      if (!hasCode) {
        console.log(`       ${label}${week.id}: финал — день-суждение (${last.id}), конструкций в нём нет, проверять нечего`);
        continue;
      }
      const lastAt = campaign.missions.findIndex((m) => m.id === last.id);
      const before = new Set();
      campaign.missions.slice(0, lastAt).forEach((m) =>
        m.steps.forEach((s) => {
          for (const c of constructs(introText(s), m.track)) before.add(c);
          const task = taskOf(s.taskId, m.track);
          if (task) for (const c of shownByTask(task, m.track)) before.add(c);
        })
      );
      const fresh = new Set();
      last.steps.forEach((s) => {
        const task = taskOf(s.taskId, last.track);
        if (task) for (const c of minus(shownByTask(task, last.track), before)) fresh.add(c);
      });
      check(
        `${label}${week.id}: в финале нет ни одной новой конструкции`,
        fresh.size === 0,
        `в дне ${last.id} впервые: ${[...fresh].join(', ')}`
      );
    }

    /*
     * Один день — несколько заданий, и это тоже договор: день из одного
     * задания был первой версией кампании и развалился на скачке сложности.
     */
    const thin = campaign.missions.filter((m) => m.steps.length === 0);
    check(`${label}в каждом дне есть задания`, thin.length === 0, `пустые дни: ${thin.map((m) => m.id).join(', ')}`);
  }

  /*
   * Два языка описывают одну и ту же неделю: набор дней и заданий обязан
   * совпасть. Разъехаться им легко — правка русского контента не трогает
   * английский файл, и перевод молча остаётся от прошлой недели.
   *
   * В отпечаток входят не только id заданий, но и метки реплик и разговоров:
   * они необязательны, и именно поэтому теряются молча. Пропущенная реплика
   * не ломает ни типы, ни экран — англоязычный просто читает неделю, где
   * заказчик восемь раз подряд не отреагировал на сданное.
   */
  const shape = (locale) =>
    storyCampaign(locale).missions.map(
      (m) =>
        `${m.week}/${m.id}:${m.steps
          .map((s) => `${s.taskId}${s.after ? '+реплика' : ''}${s.interlude ? '+разговор' : ''}`)
          .join(',')}`
    );
  const ruShape = shape('ru');
  const enShape = shape('en');
  check(
    'состав недели совпадает в ru и en',
    JSON.stringify(ruShape) === JSON.stringify(enShape),
    `ru: ${ruShape.join(' | ')}\n        en: ${enShape.join(' | ')}`
  );
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log(failed === 0 ? '\nOK: лестница режима истории цела' : `\nПРОВАЛЕНО: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
