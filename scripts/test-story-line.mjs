/**
 * Гейт сюжетной линии.
 *
 * Порядок и задания линии выводятся из графа навыков (`src/story/line.ts`),
 * но где кончается миссия — у трека с прозой решает автор: `skills` в
 * `story.json` теперь не отпечаток для сверки, а нарезка, по которой
 * `buildLine` строит миссии. Опасность сместилась, а не исчезла: нарезку
 * можно оставить неполной (новый навык пролетел мимо всех миссий) или
 * сослаться в ней на навык, которого нет в паке, — ни тип-чек, ни браузер
 * этого не покажут, врать будет либо пропавшее задание, либо белый экран.
 *
 * Отсюда состав проверок. Первая половина — свойства самой линии, которые
 * обязаны держаться на любом паке независимо от того, откуда взялась
 * нарезка (порядок предпосылок, размер миссии, охват, затухание подсказок);
 * прогоняется и на линии трека (нарезка или жадный путь), и отдельно
 * на жадном пути каждого трека — чтобы запасной путь не протух молча,
 * пока в ходу только авторская нарезка. Вторая половина — свойства самой
 * нарезки: полнота (каждый навык с заданиями в паке назван) и валидность
 * (каждый названный навык в паке действительно есть). Тождественной сверки
 * «состав совпадает с прозой» больше нет — теперь нарезка и есть вход,
 * ей нечему противоречить.
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

  /**
   * Свойства, которые обязаны держаться на любой линии независимо от того,
   * откуда взялась нарезка на миссии — авторской (`buildLine(pack, grouping)`)
   * или жадной (`buildLine(pack)`). Возвращает false, если линия пуста
   * (дальше по ней проверять нечего), иначе true.
   */
  function checkStructure(label, line, pack) {
    check(`${label}линия не пуста`, line.length > 0, 'buildLine вернул пустой массив на готовом паке');
    if (!line.length) return false;

    /*
     * Порядок предпосылок. Нарушь его, и миссия попросит применить приём,
     * теорию к которому покажут через две миссии — раньше это гарантировал
     * топологический обход, теперь для нарезки с прозой гарантирует только
     * автор, и гейт обязан это проверить, а не поверить.
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
     * подход — в том числе авторская, нарезка не освобождает от бюджета
     * минут, только от способа найти границу. Пол — только для непоследних.
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
     * нечем будет заниматься. Нижней границы больше нет: охват падает
     * от роста практики (два задания на навык — всё та же доля пака, где
     * заданий на навык становится больше), и это не дефект нарезки.
     * Верхняя держит смысл «база», а не «прохождение целиком».
     */
    const share = taskIds.length / pack.tasks.length;
    check(
      `${label}охват линии не больше 75%`,
      share <= 0.75,
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
    return true;
  }

  for (const track of TRACKS) {
    const pack = JSON.parse(readFileSync(path.join(root, `src/content/packs/${track}-core.json`), 'utf8'));
    const prose = storyRu.tracks?.[track];
    const grouping = prose ? prose.missions.map((m) => m.skills ?? []) : undefined;
    const line = buildLine(pack, grouping);
    const label = `${track}: `;

    if (!checkStructure(label, line, pack)) continue;

    if (!prose) {
      ok(`${label}прозы нет — линия показывается выведенными названиями`);
      continue;
    }

    // Нарезка не только структурно здорова — она обязана быть полной и валидной
    // относительно пака: это то, что раньше проверялось равенством выведенной
    // линии, а теперь, когда нарезка сама — вход, проверяется напрямую.
    const flatIds = grouping.flat();
    const packSkillIds = new Set(pack.skills.map((s) => s.id));
    const skillsWithTasks = pack.skills.filter((s) => pack.tasks.some((t) => t.skill === s.id)).map((s) => s.id);
    const missingFromGrouping = skillsWithTasks.filter((id) => !flatIds.includes(id));
    check(
      `${label}каждый навык с заданиями назван в нарезке`,
      missingFromGrouping.length === 0,
      `пропущены: ${missingFromGrouping.join(', ')} — дописать в skills нужной миссии в story.json`
    );
    const unknownInGrouping = flatIds.filter((id) => !packSkillIds.has(id));
    check(
      `${label}нарезка не называет навыка вне пака`,
      unknownInGrouping.length === 0,
      `нет в паке: ${unknownInGrouping.join(', ')}`
    );

    // Запасной, жадный путь не должен протухнуть молча, пока в ходу только
    // авторская нарезка: он остаётся тем, что строит линию трекам без прозы.
    checkStructure(`${label}жадный путь: `, buildLine(pack), pack);

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
