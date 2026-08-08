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
 * Реестр паков — вход в контент по треку, а не единственный синглтон.
 *
 * Черновые паки (model-core, python-core, domain-core) содержат только граф
 * навыков: их держат в реестре наравне с готовыми, чтобы карта треков на
 * главной строилась по настоящим данным, а не по заглушкам. `status: 'draft'`
 * и пустой `tasks` — это то, чем плеер отличает «пока показать карту навыков»
 * от «можно начать занятие».
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
 * Пак, для которого перевода ещё нет (domain-core, python-core, model-core),
 * просто отсутствует здесь — applyTranslation тогда возвращает пак как есть.
 */
const packTranslations: Partial<Record<string, PackTranslation>> = {
  'sql-core': validateTranslation(packById.get('sql-core')!, rawSqlCoreEn as PackTranslation),
  'domain-core': validateTranslation(packById.get('domain-core')!, rawDomainCoreEn as PackTranslation),
  'python-core': validateTranslation(packById.get('python-core')!, rawPythonCoreEn as PackTranslation),
  // Частичный перевод (tier 1-3 из 4) — applyTranslation подставляет то, что
  // есть, и оставляет tier 4 русским; isTrackTranslated следит за полнотой
  // отдельно (см. комментарий там), так что баннер не солжёт до полного покрытия.
  'model-core': validateTranslation(packById.get('model-core')!, rawModelCoreEn as PackTranslation),
};

/**
 * Пак трека. Берём первый — когда в треке появится больше одного пака, здесь
 * появится выбор. `locale` по умолчанию 'ru': явно передавать locale должны
 * только места, которые реально показывают текст задания человеку, — остальным
 * нужна структура, и там локаль ничего не меняет.
 */
export const packForTrack = (track: Track, locale: Locale = 'ru'): Pack | undefined => {
  const pack = packsByTrack.get(track)?.[0];
  if (!pack) return undefined;
  return locale === 'en' ? applyTranslation(pack, packTranslations[pack.id]) : pack;
};

/**
 * Есть ли у трека перевод контента. Нужно ровно для одного: предупредить
 * англоязычного человека, что тексты этого трека он увидит по-русски.
 *
 * Проверяется полное покрытие (все скиллы и все задания), а не факт наличия
 * файла перевода: model-core регистрируется в packTranslations уже на тире
 * 1-3, чтобы переведённые задания сразу применялись через applyTranslation,
 * но пока не переведён tier 4, часть заданий трека остаётся русской —
 * баннер обязан это показывать. На «наличие объекта» эта функция отвечала
 * бы неверно ровно в таком частичном состоянии.
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
