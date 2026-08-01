import raw from './packs/sql-core.json';
import type { Pack, Skill, Task } from './types';

/**
 * Загрузка и валидация пака.
 *
 * Пак — внешние данные, даже когда он лежит в репозитории: его правят руками
 * и позже будут присылать пул-реквестами. Битое задание должно падать здесь,
 * на старте, с внятным сообщением, а не превращаться в пустой экран.
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

export const pack = validate(raw as Pack);

export const skills: Skill[] = pack.skills;
export const tasks: Task[] = pack.tasks;

export const skillById = new Map(skills.map((s) => [s.id, s]));
export const taskById = new Map(tasks.map((t) => [t.id, t]));

export const tasksBySkill = tasks.reduce<Map<string, Task[]>>((acc, t) => {
  const list = acc.get(t.skill) ?? [];
  list.push(t);
  acc.set(t.skill, list);
  return acc;
}, new Map());

/** Все скиллы, которые тренирует задание: основной плюс сопутствующие. */
export const trainedSkills = (t: Task): string[] => [t.skill, ...(t.alsoTrains ?? [])];
