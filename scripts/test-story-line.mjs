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
const MODE_RANK = { predict: 0, fill: 1, write: 2 };

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
  }
} finally {
  rmSync(outDir, { recursive: true, force: true });
}

console.log(failed ? `\nПровалено проверок: ${failed}.` : '\nПроверки сюжетной линии пройдены.');
process.exit(failed ? 1 : 0);
