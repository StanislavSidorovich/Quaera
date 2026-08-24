/**
 * Гейт сюжетной линии.
 *
 * Линия не пишется, а выводится из графа навыков (`src/story/line.ts`),
 * и это её главное достоинство: контент пополняют, линия перестраивается
 * сама. Оно же — её единственная опасность. Проза миссий (`story.json`)
 * привязана к миссиям позицией, потому что своего id у выведенной миссии
 * нет; добавьте один навык — и связка про соединения окажется над заданиями
 * про оконные функции, ничего при этом не сломав. Ни тип-чек, ни браузер
 * такого не покажут: экран останется исправным, врать будет текст.
 *
 * Отсюда состав проверок. Первая половина — свойства самой линии, которые
 * обязаны держаться на любом паке (порядок предпосылок, размер миссии,
 * охват, затухание подсказок). Вторая — сверка отпечатка: у каждой миссии
 * в story.json записан состав навыков, и он должен совпадать с выведенным.
 *
 * Запуск: npm run test:story-line (входит в npm run verify).
 */
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(path.join(tmpdir(), 'quaera--'));

const TRACKS = ['sql', 'python', 'model', 'domain'];

/** Те же границы, что заданы константами в line.ts. Дублируются намеренно:
 *  гейт обязан проверять договор, а не пересказывать реализацию её же числами. */
const MAX_SKILLS = 3;
const MAX_MINUTES = 18;
const MIN_MINUTES = 6;
/*
 * Порядок режимов по убыванию помощи. `order` обязан быть здесь наравне
 * с остальными: без него ранг такого задания — undefined, сравнение с ним
 * всегда ложно, а `Math.max(prev, undefined)` даёт NaN и отравляет проверку
 * до конца навыка. Проверка затухания при этом не падает, а молча перестаёт
 * смотреть — ровно то, что случилось после пачки `order` в domain.
 */
const MODE_RANK = { predict: 0, order: 1, fill: 2, write: 3 };

/**
 * Числительные, которыми проза называет длину линии.
 *
 * Гейт сверяет состав миссий и их количество, но фраза «Восемь миссий»
 * внутри абзаца для него — просто текст, и когда линия выросла до девяти,
 * вступление осталось со старым числом. Тот же класс, что «2.32 в прозе»
 * и «двенадцать таблиц» в экскурсе: число, набранное руками рядом с числом,
 * которое считается, расходится молча.
 */
const NUMERALS = {
  ru: { два: 2, две: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10, одиннадцать: 11, двенадцать: 12 },
  en: { two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 },
};

/** Число миссий, названное в тексте, или null, если проза его не называет. */
function claimedMissionCount(text, locale) {
  // `\b` в конце русского варианта стоять не может: границу слова JS считает
  // по ASCII-`\w`, и после «й» она не срабатывает вовсе — первая редакция
  // проверки молча пропускала ровно тот случай, ради которого написана.
  const re = locale === 'en' ? /([A-Za-z0-9]+)\s+missions\b/gi : /([А-Яа-яЁё0-9]+)\s+миссий(?![А-Яа-яЁё])/gi;
  for (const m of text.matchAll(re)) {
    const token = m[1].toLowerCase();
    const value = /^\d+$/.test(token) ? Number(token) : NUMERALS[locale][token];
    if (value !== undefined) return value;
  }
  return null;
}

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name) => console.log(` ok    ${name}`);
const check = (name, cond, msg) => (cond ? ok(name) : fail(name, msg));

try {
  execSync(
    `npx tsc "${path.join(root, 'src/story/line.ts')}" ` +
      `--target ES2020 --module ES2020 --moduleResolution bundler ` +
      `--rootDir "${path.join(root, 'src')}" --outDir "${outDir}" --skipLibCheck`,
    { cwd: root, stdio: 'inherit' }
  );

  const { buildLine } = await import(pathToFileURL(path.join(outDir, 'story', 'line.js')).href);
  const storyRu = JSON.parse(readFileSync(path.join(root, 'src/content/story.json'), 'utf8'));
  const storyEn = JSON.parse(readFileSync(path.join(root, 'src/content/story.en.json'), 'utf8'));

  for (const track of TRACKS) {
    const pack = JSON.parse(readFileSync(path.join(root, `src/content/packs/${track}-core.json`), 'utf8'));
    const line = buildLine(pack);
    const label = `${track}: `;

    check(`${label}линия не пуста`, line.length > 0, 'buildLine вернул пустой массив на готовом паке');
    if (!line.length) continue;

    /*
     * Порядок предпосылок — единственное свойство, ради которого линия
     * вообще строится топологически. Нарушь его, и миссия попросит применить
     * приём, теорию к которому покажут через две миссии.
     */
    const missionOfSkill = new Map();
    line.forEach((m, i) => m.skills.forEach((s) => missionOfSkill.set(s.id, i)));
    const violations = [];
    for (const skill of pack.skills) {
      const at = missionOfSkill.get(skill.id);
      if (at === undefined) continue; // навык без заданий в линию не берётся
      for (const p of skill.prereqs) {
        const pre = missionOfSkill.get(p);
        if (pre !== undefined && pre > at) violations.push(`${skill.id} (миссия ${at + 1}) < ${p} (миссия ${pre + 1})`);
      }
    }
    check(`${label}предпосылки не позже самого навыка`, violations.length === 0, violations.join('; '));

    // Навык в двух миссиях означал бы, что «пройдено» у одной зависит от другой.
    const skillIds = line.flatMap((m) => m.skills.map((s) => s.id));
    check(
      `${label}каждый навык ровно в одной миссии`,
      new Set(skillIds).size === skillIds.length,
      `повторы: ${skillIds.filter((id, i) => skillIds.indexOf(id) !== i).join(', ')}`
    );

    // Задание в двух миссиях сделало бы сумму «решено N из M» по линии неверной.
    const taskIds = line.flatMap((m) => m.tasks.map((t) => t.id));
    check(
      `${label}каждое задание ровно в одной миссии`,
      new Set(taskIds).size === taskIds.length,
      `повторы: ${taskIds.filter((id, i) => taskIds.indexOf(id) !== i).join(', ')}`
    );

    /*
     * Размер миссии. Потолок жёсткий: миссия обязана помещаться в один
     * подход. Пол — только для непоследних: короткий хвост допустим,
     * когда его некуда влить, не переполнив предыдущую.
     */
    const tooBig = line.filter((m) => m.minutes > MAX_MINUTES || m.skills.length > MAX_SKILLS);
    check(
      `${label}миссия помещается в один подход`,
      tooBig.length === 0,
      tooBig.map((m) => `${m.id}: ${m.skills.length} тем, ${m.minutes} мин`).join('; ')
    );
    const tooSmall = line.slice(0, -1).filter((m) => m.minutes < MIN_MINUTES);
    check(
      `${label}короткая миссия только последняя`,
      tooSmall.length === 0,
      tooSmall.map((m) => `${m.id}: ${m.minutes} мин`).join('; ')
    );

    /*
     * Охват. Линия — база, а не полное прохождение: заберёт всё — и занятиям
     * нечем будет заниматься, заберёт слишком мало — «базу закрыл» станет
     * неправдой. Границы широкие, потому что доля зависит от того, сколько
     * заданий на навык в паке, а это разное у четырёх треков.
     */
    const share = taskIds.length / pack.tasks.length;
    check(
      `${label}охват линии между 40% и 75%`,
      share >= 0.4 && share <= 0.75,
      `${Math.round(share * 100)}% (${taskIds.length} из ${pack.tasks.length})`
    );

    /*
     * Затухание подсказок: внутри навыка помощь снимается, а не добавляется.
     * Это и есть «где-то ведут за руку, где-то сам» — свойство порядка,
     * а не отдельного задания, и проверить его можно только здесь.
     */
    const backwards = [];
    for (const m of line) {
      const seen = new Map();
      for (const t of m.tasks) {
        const prev = seen.get(t.skill);
        if (prev !== undefined && MODE_RANK[t.mode] < prev) backwards.push(`${m.id}/${t.id}`);
        seen.set(t.skill, Math.max(prev ?? -1, MODE_RANK[t.mode]));
      }
    }
    check(`${label}помощь внутри навыка только убывает`, backwards.length === 0, backwards.join(', '));

    /*
     * Сверка отпечатка. Ради неё гейт и написан: проза сопоставлена миссиям
     * позицией, и молча съехать она может только здесь.
     */
    const prose = storyRu.tracks?.[track];
    if (!prose) {
      ok(`${label}прозы нет — линия показывается выведенными названиями`);
      continue;
    }
    check(
      `${label}число связок совпадает с числом миссий`,
      prose.missions.length === line.length,
      `в story.json ${prose.missions.length}, линия даёт ${line.length}`
    );
    const drift = [];
    prose.missions.forEach((m, i) => {
      const derived = line[i]?.skills.map((s) => s.id) ?? [];
      const written = m.skills ?? [];
      if (written.join('|') !== derived.join('|')) {
        drift.push(`миссия ${i + 1}: записано [${written.join(', ')}], выведено [${derived.join(', ')}]`);
      }
    });
    check(
      `${label}состав миссий совпадает с записанным в прозе`,
      drift.length === 0,
      `${drift.join('; ')} — проза съехала: перечитать связки и обновить skills в story.json`
    );

    const emptyFields = [];
    for (const [i, m] of prose.missions.entries()) {
      for (const field of ['title', 'hook', 'outcome']) {
        if (!m[field]?.trim()) emptyFields.push(`миссия ${i + 1}.${field}`);
      }
    }
    for (const field of ['opening', 'ending']) {
      if (!prose[field]?.trim()) emptyFields.push(field);
    }
    check(`${label}все поля прозы заполнены`, emptyFields.length === 0, emptyFields.join(', '));

    const claimedRu = claimedMissionCount(prose.opening, 'ru');
    check(
      `${label}число миссий во вступлении совпадает с линией`,
      claimedRu === null || claimedRu === line.length,
      `вступление обещает ${claimedRu} миссий, линия даёт ${line.length}`
    );

    /*
     * Перевод — целиком или никак. Наполовину переведённая линия читается
     * хуже непереведённой: половина связок на чужом языке выглядит поломкой,
     * а не незаконченной работой.
     */
    const en = storyEn.tracks?.[track];
    if (!en) {
      ok(`${label}перевода линии нет — англоязычный видит выведенные названия`);
      continue;
    }
    check(
      `${label}в переводе столько же миссий`,
      en.missions.length === prose.missions.length,
      `${en.missions.length} против ${prose.missions.length}`
    );
    const enEmpty = [];
    for (const [i, m] of en.missions.entries()) {
      for (const field of ['title', 'hook', 'outcome']) {
        if (!m[field]?.trim()) enEmpty.push(`миссия ${i + 1}.${field}`);
      }
    }
    for (const field of ['opening', 'ending']) {
      if (!en[field]?.trim()) enEmpty.push(field);
    }
    check(`${label}перевод покрывает линию целиком`, enEmpty.length === 0, enEmpty.join(', '));

    const claimedEn = claimedMissionCount(en.opening, 'en');
    check(
      `${label}число миссий во вступлении совпадает с линией (en)`,
      claimedEn === null || claimedEn === line.length,
      `вступление обещает ${claimedEn} миссий, линия даёт ${line.length}`
    );
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log(failed ? `\nПровалено проверок: ${failed}.` : '\nПроверки сюжетной линии пройдены.');
process.exit(failed ? 1 : 0);
