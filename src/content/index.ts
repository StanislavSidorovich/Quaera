import rawSqlCore from './packs/sql-core.json';
import rawSqlLessons from './packs/sql-lessons.json';
import rawModelCore from './packs/model-core.json';
import rawModelLessons from './packs/model-lessons.json';
import rawPythonCore from './packs/python-core.json';
import rawDomainCore from './packs/domain-core.json';
import rawDomainLessons from './packs/domain-lessons.json';
import rawPythonLessons from './packs/python-lessons.json';
import rawSqlCoreEn from './packs/sql-core.en.json';
import rawSqlLessonsEn from './packs/sql-lessons.en.json';
import rawDomainCoreEn from './packs/domain-core.en.json';
import rawDomainLessonsEn from './packs/domain-lessons.en.json';
import rawPythonCoreEn from './packs/python-core.en.json';
import rawPythonLessonsEn from './packs/python-lessons.en.json';
import rawModelCoreEn from './packs/model-core.en.json';
import rawModelLessonsEn from './packs/model-lessons.en.json';
import type { Lesson, LessonTranslation, Pack, PackTranslation, Task, Track } from './types';
import type { Locale } from '../i18n/context';
import type { SchemaDoc } from '../engine/types';

/**
 * Загрузка и валидация паков.
 *
 * Пак — внешние данные, даже когда он лежит в репозитории: его правят руками
 * и позже будут присылать пул-реквестами. Битое задание должно падать здесь,
 * на старте, с внятным сообщением, а не превращаться в пустой экран.
 *
 * Валидация одинаковая для готового пака и для черновика: у черновика просто
 * пустой tasks, и цикл по заданиям не выполняется ни разу.
 */
function validate(pack: Pack): Pack {
  const skillIds = new Set(pack.skills.map((s) => s.id));
  for (const s of pack.skills) {
    for (const p of s.prereqs) {
      if (!skillIds.has(p)) throw new Error(`Пак ${pack.id}: скилл ${s.id} ссылается на несуществующую предпосылку ${p}`);
    }
  }
  for (const t of pack.tasks) {
    if (!skillIds.has(t.skill)) throw new Error(`Пак ${pack.id}: задание ${t.id} ссылается на несуществующий скилл ${t.skill}`);
    if (t.mode === 'predict') {
      if ((t.options ?? []).filter((o) => o.correct).length !== 1) {
        throw new Error(`Пак ${pack.id}: у задания ${t.id} должен быть ровно один верный вариант`);
      }
    } else if (!t.solution) {
      throw new Error(`Пак ${pack.id}: у задания ${t.id} нет эталонного решения`);
    }
  }
  return pack;
}

/**
 * Перевод пака на английский — накладывается на русский пак по id по полю,
 * а не заменяет его целиком (см. PackTranslation в types.ts). Id, которых
 * нет в файле перевода, остаются на русском — то же «частично наполненный
 * пак», что и у самого контента, только по языку, а не по скиллу.
 *
 * Валидация at import time: перевод, ссылающийся на несуществующий id, —
 * такая же поломка сборки, как скилл-задание на несуществующий prereq
 * в validate() выше, и должна падать здесь, а не молчать до продакшена.
 */
function validateTranslation(pack: Pack, tr: PackTranslation): PackTranslation {
  const skillIds = new Set(pack.skills.map((s) => s.id));
  const taskById = new Map(pack.tasks.map((t) => [t.id, t]));
  for (const s of tr.skills ?? []) {
    if (!skillIds.has(s.id)) throw new Error(`Перевод ${tr.id}: скилл ${s.id} не существует в паке ${pack.id}`);
  }
  for (const t of tr.tasks ?? []) {
    const orig = taskById.get(t.id);
    if (!orig) throw new Error(`Перевод ${tr.id}: задание ${t.id} не существует в паке ${pack.id}`);
    if (t.options && (orig.options ?? []).length !== t.options.length) {
      throw new Error(
        `Перевод ${tr.id}: у задания ${t.id} ${t.options.length} переведённых вариантов вместо ${(orig.options ?? []).length}`
      );
    }
  }
  return tr;
}

function applyTranslation(pack: Pack, tr: PackTranslation | undefined): Pack {
  if (!tr) return pack;
  const skillTrById = new Map((tr.skills ?? []).map((s) => [s.id, s]));
  const taskTrById = new Map((tr.tasks ?? []).map((t) => [t.id, t]));
  return {
    ...pack,
    title: tr.title ?? pack.title,
    description: tr.description ?? pack.description,
    tierNames: tr.tierNames ?? pack.tierNames,
    intro: tr.intro ?? pack.intro,
    skills: pack.skills.map((s) => {
      const t = skillTrById.get(s.id);
      return t ? { ...s, title: t.title, summary: t.summary } : s;
    }),
    tasks: pack.tasks.map((t) => {
      const tt = taskTrById.get(t.id);
      if (!tt) return t;
      return {
        ...t,
        title: tt.title,
        brief: tt.brief ?? t.brief,
        goal: tt.goal ?? t.goal,
        scenario: tt.scenario ?? t.scenario,
        predictQuestion: tt.predictQuestion ?? t.predictQuestion,
        hints: tt.hints ?? t.hints,
        explain: tt.explain ?? t.explain,
        options: tt.options && t.options ? t.options.map((o, i) => ({ ...o, ...tt.options![i] })) : t.options,
      };
    }),
  };
}

/**
 * Перемешивание вариантов ответа.
 *
 * Автор пишет варианты в естественном порядке: сначала верный, потом
 * заблуждения вокруг него. Так задание читается и правится, но так же оно
 * и решается — 158 заданий из 159 держали верный вариант первым, и любой
 * человек, заметивший это к третьему заданию, дальше проходит весь predict
 * не думая. Признак «где верный» оказывался сильнее самого вопроса.
 *
 * Порядок меняем на выдаче, а не в файлах: соответствие перевода вариантам
 * позиционное (см. PackTranslation в types.ts), и физическая перестановка
 * в русском паке потребовала бы синхронной перестановки в английском —
 * ровно тот класс правок, где рассинхрон не заметен глазом и не ловится
 * гейтом, потому что оба файла остаются валидными.
 *
 * Перестановка детерминированная, с зерном от id задания: одно и то же
 * задание всегда показывает варианты в одном и том же порядке. Это не
 * придирка к чистоте — случайный порядок при каждом рендере переставлял бы
 * варианты под пальцем при любой перерисовке, а после перезагрузки человек
 * с уже выбранным вариантом видел бы на его месте другой текст. Заодно
 * порядок совпадает в обеих локалях, и переключение языка посреди задания
 * не сбивает выбор.
 */
function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32 — короткий PRNG с равномерным распределением; криптостойкость здесь не нужна. */
function rngFrom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleOptions(pack: Pack): Pack {
  return {
    ...pack,
    tasks: pack.tasks.map((task) => {
      if (!task.options || task.options.length < 2) return task;
      const rnd = rngFrom(seedFrom(task.id));
      const options = [...task.options];
      for (let i = options.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [options[i], options[j]] = [options[j], options[i]];
      }
      return { ...task, options };
    }),
  };
}

/**
 * Реестр паков — вход в контент по треку, а не единственный синглтон.
 *
 * Черновые паки (model-core, python-core, domain-core) содержат только граф
 * навыков: их держат в реестре наравне с готовыми, чтобы карта треков на
 * главной строилась по настоящим данным, а не по заглушкам. `status: 'draft'`
 * и пустой `tasks` — это то, чем плеер отличает «пока показать карту навыков»
 * от «можно начать занятие».
 *
 * Это паки в исходном виде: без перевода и без перемешивания вариантов.
 * Показывать задание отсюда нельзя — для показа есть packForTrack. Здесь
 * считают структуру (сколько всего заданий, какие навыки), и такой счёт
 * от языка и порядка вариантов не зависит.
 */
export const packs: Pack[] = [
  rawSqlCore as Pack,
  rawModelCore as Pack,
  rawPythonCore as Pack,
  rawDomainCore as Pack,
].map(validate);

export const packById = new Map(packs.map((p) => [p.id, p]));

const packsByTrack = new Map<Track, Pack[]>();
for (const p of packs) {
  const list = packsByTrack.get(p.track) ?? [];
  list.push(p);
  packsByTrack.set(p.track, list);
}

/**
 * Переводы паков — реестр по id пака, а не по треку: у трека когда-нибудь
 * может быть больше одного пака, а перевод привязан к конкретному файлу.
 * Пак, для которого перевода нет, просто отсутствует здесь — applyTranslation
 * тогда возвращает пак как есть. На 2026-08-10 таких нет: переведены все
 * четыре, целиком (полноту считает isTrackTranslated ниже — не верить этому
 * комментарию, а смотреть на его результат).
 */
const packTranslations: Partial<Record<string, PackTranslation>> = {
  'sql-core': validateTranslation(packById.get('sql-core')!, rawSqlCoreEn as PackTranslation),
  'domain-core': validateTranslation(packById.get('domain-core')!, rawDomainCoreEn as PackTranslation),
  'python-core': validateTranslation(packById.get('python-core')!, rawPythonCoreEn as PackTranslation),
  'model-core': validateTranslation(packById.get('model-core')!, rawModelCoreEn as PackTranslation),
};

/**
 * Готовый к показу пак: перевод наложен, варианты перемешаны.
 *
 * Кешируем по паре «пак + локаль», а не пересобираем на каждый вызов:
 * packForTrack зовут из рендера, и новый объект пака каждый раз обнулял бы
 * useMemo в App, у которых пак стоит в зависимостях. Кеш безопасен ровно
 * потому, что обе операции чистые и детерминированные.
 *
 * Порядок шагов обязателен именно такой: перевод накладывается позиционно,
 * поэтому перемешивать можно только после него, уже на готовом паке.
 */
const localizedCache = new Map<string, Pack>();

/**
 * Пак трека. Берём первый — когда в треке появится больше одного пака, здесь
 * появится выбор. `locale` по умолчанию 'ru': явно передавать locale должны
 * только места, которые реально показывают текст задания человеку, — остальным
 * нужна структура, и там локаль ничего не меняет.
 */
export const packForTrack = (track: Track, locale: Locale = 'ru'): Pack | undefined => {
  const pack = packsByTrack.get(track)?.[0];
  if (!pack) return undefined;
  const key = `${pack.id}:${locale}`;
  const hit = localizedCache.get(key);
  if (hit) return hit;
  const built = shuffleOptions(locale === 'en' ? applyTranslation(pack, packTranslations[pack.id]) : pack);
  localizedCache.set(key, built);
  return built;
};

/**
 * Есть ли у трека перевод контента. Нужно ровно для одного: предупредить
 * англоязычного человека, что тексты этого трека он увидит по-русски.
 *
 * Проверяется полное покрытие (все скиллы и все задания), а не факт наличия
 * файла перевода. Так было нужно, пока model-core переводился тирами: он
 * регистрировался в packTranslations уже на 1-3, чтобы готовое применялось
 * сразу, — и «наличие объекта» соврало бы про непереведённый tier 4. Сейчас
 * переведено всё, и функция всюду возвращает true; она остаётся сторожевой,
 * а не мёртвой: первое же дописанное без перевода задание вернёт её в дело
 * само (см. locale.partialNote в ru.ts — там та же роль у самой строки).
 */
export const isTrackTranslated = (track: Track): boolean => {
  const pack = packsByTrack.get(track)?.[0];
  if (!pack) return false;
  const tr = packTranslations[pack.id];
  if (!tr) return false;
  return (tr.skills?.length ?? 0) === pack.skills.length && (tr.tasks?.length ?? 0) === pack.tasks.length;
};

/**
 * Карточки теории привязаны к скиллам, а не к паку: id скиллов уникальны
 * глобально (префикс sql-/model-/py-/dom-), поэтому список карточек — плоский
 * массив, собранный из файлов по одному на трек. Файл покрывает не весь граф
 * своего трека, а только те навыки, у которых уже есть задания: карточка без
 * задания человеку не показывается, а гейт требует обратного — задания без
 * карточки быть не должно.
 */
export const lessons: Lesson[] = [
  ...(rawSqlLessons as { lessons: Lesson[] }).lessons,
  ...(rawDomainLessons as { lessons: Lesson[] }).lessons,
  ...(rawPythonLessons as { lessons: Lesson[] }).lessons,
  ...(rawModelLessons as { lessons: Lesson[] }).lessons,
];
export const lessonBySkill = new Map(lessons.map((l) => [l.skill, l]));

/**
 * Переводы карточек — плоская карта по skill, тем же приёмом, что и сами
 * карточки: id скиллов уникальны глобально, файл перевода не обязан
 * повторять структуру по трекам.
 */
const lessonTranslationSources: { lessons: LessonTranslation[] }[] = [
  rawSqlLessonsEn as { lessons: LessonTranslation[] },
  rawDomainLessonsEn as { lessons: LessonTranslation[] },
  rawPythonLessonsEn as { lessons: LessonTranslation[] },
  rawModelLessonsEn as { lessons: LessonTranslation[] },
];
const lessonTranslationBySkill = new Map(
  lessonTranslationSources.flatMap((src) => src.lessons).map((l) => {
    if (!lessonBySkill.has(l.skill)) throw new Error(`Перевод карточки ссылается на несуществующий скилл ${l.skill}`);
    return [l.skill, l];
  })
);

/** lessonBySkill для конкретной локали — карточка без перевода остаётся на русском. */
export const lessonBySkillFor = (locale: Locale): Map<string, Lesson> => {
  if (locale === 'ru') return lessonBySkill;
  const merged = new Map<string, Lesson>();
  for (const [skill, lesson] of lessonBySkill) {
    const tr = lessonTranslationBySkill.get(skill);
    merged.set(skill, tr ? {
      ...lesson,
      title: tr.title,
      why: tr.why,
      form: tr.form,
      example: tr.example ?? lesson.example,
      reads: tr.reads,
      wrong: tr.wrong ?? lesson.wrong,
      wrongWhy: tr.wrongWhy,
      selfCheck: tr.selfCheck,
    } : lesson);
  }
  return merged;
};

const allSkillIds = new Set(packs.flatMap((p) => p.skills.map((s) => s.id)));
for (const l of lessons) {
  if (!allSkillIds.has(l.skill)) {
    throw new Error(`Карточка «${l.title}» ссылается на несуществующий скилл ${l.skill}`);
  }
}

/**
 * Трек скилла по его id — нужен там, где карточку открывают не из своего
 * трека (справочник, ставший сквозным по трекам): исполняемость примера
 * («Выполнить», «Посмотреть, что вернёт») зависит от трека самого скилла,
 * а не от того, какой трек сейчас выбран в навигации.
 */
export const trackBySkill = new Map(packs.flatMap((p) => p.skills.map((s) => [s.id, p.track] as const)));

/** Все скиллы, которые тренирует задание: основной плюс сопутствующие. */
export const trainedSkills = (t: Task): string[] => [t.skill, ...(t.alsoTrains ?? [])];

/**
 * Таблицы, которые задание реально трогает — выведены из его же кода,
 * а не переписаны руками отдельным полем: второй источник правды разошёлся
 * бы с солюшеном при первой же правке запроса, и никто бы не заметил,
 * потому что гейт проверял бы только собственную выдумку (см. ту же логику
 * для связей между таблицами в схеме — parseReference в build-dataset.mjs).
 *
 * Совпадение по границе слова (`\b`), не по вхождению подстроки: у имён
 * таблиц есть родственные варианты (`fact_sellout`/`fact_sellin`), и просто
 * `.includes()` придумал бы связь там, где в коде другое имя.
 *
 * Domain — не про код: у его заданий нет ни одного из этих полей,
 * и для них функция всегда возвращает пустой список, что и используется
 * как признак «схема таблиц этому заданию не нужна» (см. TaskView).
 */
export function taskTables(task: Task, schema: SchemaDoc | null): string[] {
  if (!schema) return [];
  const code = [task.starter, task.template, task.solution, task.predictSql].filter(Boolean).join('\n');
  if (!code) return [];
  return schema.tables.map((t) => t.table).filter((name) => new RegExp(`\\b${name}\\b`).test(code));
}
