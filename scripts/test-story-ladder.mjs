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
 * starter человек получает даром. У fill — только содержимое пропусков,
 * остальной шаблон стоит перед глазами. У predict — ничего: там читают,
 * а не пишут.
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
const VOCAB = [
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
const FORMS = new Map([
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

/** Какие конструкции есть в куске текста. */
function constructs(text) {
  if (!text) return new Set();
  const found = new Set();
  for (const [name, re] of VOCAB) if (re.test(text)) found.add(name);
  return found;
}

/** Какие конструкции показаны в рабочей форме — то есть так, что по ним можно напечатать. */
function inWorkingForm(text) {
  if (!text) return new Set();
  const found = new Set();
  for (const [name, re] of VOCAB) if ((FORMS.get(name) ?? re).test(text)) found.add(name);
  return found;
}

const minus = (a, b) => new Set([...a].filter((x) => !b.has(x)));
const join = (list) => list.filter(Boolean).join('\n');

/** Текст подводки шага: заголовок и абзацы вместе — разобранный пример живёт в абзаце. */
const introText = (step) => (step.intro ? join([step.intro.title, ...step.intro.paras]) : '');

/**
 * Что человек обязан напечатать сам. Пустое множество у predict — это
 * не пробел в проверке, а свойство режима: там выбирают из вариантов.
 */
function typedByHand(task) {
  if (task.mode === 'write') return minus(constructs(task.solution), constructs(task.starter));
  if (task.mode === 'fill') return constructs(join(task.blanks ?? []));
  return new Set();
}

/** Что задание показывает после того, как пройдено: шаблон, запрос, эталон, заготовка. */
const shownByTask = (task) =>
  constructs(join([task.starter, task.template, task.predictSql, task.solution]));

/**
 * Что задание кладёт человеку перед глазами, пока он его решает: шаблон
 * с пропусками, заготовка, запрос predict. Эталон сюда не входит намеренно —
 * его видят после решения или по кнопке «показать разбор», а ступень обязана
 * держаться без них (тот же довод, по которому исключены hints и explain).
 */
const givenByTask = (task) => constructs(join([task.starter, task.template, task.predictSql]));

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

        const intro = constructs(introText(step));
        const introForms = inWorkingForm(introText(step));
        const available = new Set([...seen, ...intro]);
        const required = typedByHand(task);

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
        for (const c of minus(givenByTask(task), formShown)) {
          if (!introForms.has(c)) {
            unformed.push(`${mission.short} · ${task.id} (${task.mode}) — ${c}`);
          }
        }

        for (const c of intro) {
          seen.add(c);
          namedInProse.add(c);
        }
        for (const c of introForms) formShown.add(c);
        for (const c of shownByTask(task)) {
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
     */
    for (const week of campaign.weeks) {
      const days = campaign.missions.filter((m) => m.week === week.id);
      const last = days[days.length - 1];
      if (!last) continue;
      const lastAt = campaign.missions.findIndex((m) => m.id === last.id);
      const before = new Set();
      campaign.missions.slice(0, lastAt).forEach((m) =>
        m.steps.forEach((s) => {
          for (const c of constructs(introText(s))) before.add(c);
          const task = taskOf(s.taskId, m.track);
          if (task) for (const c of shownByTask(task)) before.add(c);
        })
      );
      const fresh = new Set();
      last.steps.forEach((s) => {
        const task = taskOf(s.taskId, last.track);
        if (task) for (const c of minus(shownByTask(task), before)) fresh.add(c);
      });
      check(
        `${label}${week.id}: в финале нет ни одной новой конструкции`,
        fresh.size === 0,
        `в последнем дне впервые: ${[...fresh].join(', ')}`
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
