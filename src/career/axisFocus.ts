// Только тип: модуль без значений из readiness.ts, чтобы гейт test:career собирал его отдельно.
import type { AxisId } from './readiness';

/** Сколько осей показывать под паутиной сразу; остальные лежат в раскрывашке. */
export const FOCUS_AXES = 3;

export interface AxisFocus {
  /** Оси, которые видны сразу: самый большой разрыв «цель роли минус сейчас», по порядку осей при равенстве. */
  top: AxisId[];
  /** Остальные оси: прячутся в раскрывашку «Все 8 осей». */
  rest: AxisId[];
  /** Цель выбрана, и ни на одной оси нет разрыва: вместо трёх осей строка «Цели роли закрыты». */
  allClosed: boolean;
}

/**
 * Роль не выбрана: все оси сразу, раскрывашки нет. Разрыв больше нуля у меньшего числа осей,
 * чем три: показываем только их. Разрыв нигде не больше нуля: наверху никого, всё в раскрывашке.
 * `have` и `target` берутся по тем же значениям, что рисует паутина (уровень 0..3).
 */
export function focusAxes(AXES: readonly AxisId[], chosen: boolean, have: Record<AxisId, number>, target: Record<AxisId, number>): AxisFocus {
  if (!chosen) return { top: [...AXES], rest: [], allClosed: false };
  const withGap = AXES.map((id, order) => ({ id, order, gap: target[id] - have[id] })).filter((a) => a.gap > 0);
  withGap.sort((a, b) => b.gap - a.gap || a.order - b.order);
  const top = withGap.slice(0, FOCUS_AXES).map((a) => a.id);
  const rest = AXES.filter((id) => !top.includes(id));
  return { top, rest, allClosed: top.length === 0 };
}
