import rawSqlCore from './packs/sql-core.json';
import rawSqlLessons from './packs/sql-lessons.json';
import rawModelCore from './packs/model-core.json';
import rawPythonCore from './packs/python-core.json';
import rawDomainCore from './packs/domain-core.json';
import rawDomainLessons from './packs/domain-lessons.json';
import type { Lesson, Pack, Task, Track } from './types';

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

/** Пак трека. Берём первый — когда в треке появится больше одного пака, здесь появится выбор. */
export const packForTrack = (track: Track): Pack | undefined => packsByTrack.get(track)?.[0];

/**
 * Карточки теории привязаны к скиллам, а не к паку: id скиллов уникальны
 * глобально (префикс sql-/model-/py-/dom-), поэтому список карточек — плоский
 * массив, собранный из файлов по одному на трек. У model-core и python-core
 * лекций по определению ещё нет — они черновики без единого задания.
 */
export const lessons: Lesson[] = [
  ...(rawSqlLessons as { lessons: Lesson[] }).lessons,
  ...(rawDomainLessons as { lessons: Lesson[] }).lessons,
];
export const lessonBySkill = new Map(lessons.map((l) => [l.skill, l]));

const allSkillIds = new Set(packs.flatMap((p) => p.skills.map((s) => s.id)));
for (const l of lessons) {
  if (!allSkillIds.has(l.skill)) {
    throw new Error(`Карточка «${l.title}» ссылается на несуществующий скилл ${l.skill}`);
  }
}

/** Все скиллы, которые тренирует задание: основной плюс сопутствующие. */
export const trainedSkills = (t: Task): string[] => [t.skill, ...(t.alsoTrains ?? [])];
