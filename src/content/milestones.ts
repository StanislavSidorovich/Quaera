import type { Pack, TierMilestone } from './types';

/**
 * Вехи уровней трека (`Pack.tierMilestones`): что человек умеет для работы.
 * Чистые функции, без UI: экран трека, экран «занятие закончено» и гейт читают одно и то же.
 *
 * Этап = уровень графа (Skill.tier) плюс необязательный этап 5 «сверх программы»:
 * задания level 5 лежат внутри навыков tier 4, поэтому в свой уровень графа не попадают,
 * а считаются отдельным этапом. Задания level 5 в этап tier 4 не входят.
 */

/** Доля заданий этапа, после которой веха считается взятой. Все 100% не требуем: в уровне 30–40 заданий. */
export const MILESTONE_SHARE = 0.8;

export interface StageState {
  stage: number;
  milestone: TierMilestone;
  name: string;
  total: number;
  solved: number;
  /** Сколько решить, чтобы взять веху. */
  need: number;
  /** Сколько заданий осталось до вехи; 0 — веха взята. */
  remaining: number;
  reached: boolean;
}

export const EXTRA_STAGE = 5;

export function stageTaskIds(pack: Pack, stage: number): string[] {
  const tierOf = new Map(pack.skills.map((s) => [s.id, s.tier]));
  return pack.tasks
    .filter((t) =>
      stage === EXTRA_STAGE ? t.level === EXTRA_STAGE : tierOf.get(t.skill) === stage && t.level !== EXTRA_STAGE,
    )
    .map((t) => t.id);
}

/** Этапы трека по порядку; этап без заданий или без вехи пропускается. */
export function stageStates(pack: Pack, solvedIds: (id: string) => boolean): StageState[] {
  const out: StageState[] = [];
  const ms = pack.tierMilestones;
  if (!ms) return out;
  const stages = [...new Set([...pack.skills.map((s) => s.tier), ...(pack.tasks.some((t) => t.level === EXTRA_STAGE) ? [EXTRA_STAGE] : [])])].sort((a, b) => a - b);
  for (const stage of stages) {
    const milestone = ms[stage];
    const ids = stageTaskIds(pack, stage);
    if (!milestone || !ids.length) continue;
    const solved = ids.filter(solvedIds).length;
    const need = Math.ceil(ids.length * MILESTONE_SHARE);
    const remaining = Math.max(0, need - solved);
    out.push({
      stage,
      milestone,
      name: pack.tierNames?.[stage] ?? String(stage),
      total: ids.length,
      solved,
      need,
      remaining,
      reached: remaining === 0,
    });
  }
  return out;
}

/** Первая невзятая веха: показываем только её, будущие не раскрываем. */
export function nextStage(states: StageState[]): StageState | undefined {
  return states.find((s) => !s.reached);
}
