/**
 * «Написал сам»: какие навыки человек хоть раз закрыл заданием, где код пишется
 * с нуля. Решение Г1 (2026-11-13), правило «сделанное дороже узнанного»:
 * уровень 2 по навыку даёт только код, а выбор из вариантов, расстановка
 * по порядку, поиск ошибки и сборка из пропусков выше уровня 1 не поднимают.
 *
 * Считается из `taskRecords` (они уже сливаются между устройствами) и паков,
 * в `SkillState` ничего не добавляется: так старый прогресс получает ответ сразу,
 * без переноса и без изменения слияния.
 *
 * Вид `fill` НЕ считается: пропуск решается тапом по панели слов, то есть выбором,
 * а не набором. Многошаговое задание считается, если в нём есть расчётный шаг
 * с режимом `write`. Модуль без импортов: гейт `test:career` собирает его отдельно.
 */
export interface TaskLike {
  id: string;
  skill: string;
  alsoTrains?: string[];
  mode: string;
  steps?: { kind: string; mode?: string }[];
}

/** Задание, в котором код набирают с нуля. */
export function isCodeTask(t: TaskLike): boolean {
  if (t.mode === 'write') return true;
  return !!t.steps?.some((s) => s.kind === 'compute' && s.mode === 'write');
}

/** Навыки, по которым решено хотя бы одно кодовое задание. `solved` — запись о решении из прогресса. */
export function wroteSkills(tasks: TaskLike[], solved: (taskId: string) => boolean): Set<string> {
  const out = new Set<string>();
  for (const t of tasks) {
    if (!isCodeTask(t) || !solved(t.id)) continue;
    out.add(t.skill);
    for (const s of t.alsoTrains ?? []) out.add(s);
  }
  return out;
}
