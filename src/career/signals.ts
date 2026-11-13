import { packs } from '../content';
import type { Progress } from '../srs/store';
import type { SkillState } from '../srs/scheduler';
import { wroteSkills } from './wrote';

/**
 * Сигналы навыков для «Пути к роли»: SRS-состояние плюс отметка «решал заданием
 * с кодом» (`career/wrote.ts`). Навыки без записи в `progress.skills` сюда не попадают:
 * `skillLevel(undefined)` уже 0.
 */
export function careerSignals(p: Progress): Record<string, SkillState & { wrote: boolean }> {
  const tasks = packs.flatMap((pk) => pk.tasks);
  const wrote = wroteSkills(tasks, (id) => !!p.taskRecords[id]?.solved);
  const out: Record<string, SkillState & { wrote: boolean }> = {};
  for (const [id, s] of Object.entries(p.skills)) out[id] = { ...s, wrote: wrote.has(id) };
  return out;
}
