import { useState } from 'react';
import { careerAxes, careerRole, careerRoles } from '../content/career';
import { AXES } from '../career/readiness';
import type { AxisId } from '../career/readiness';
import { useI18n } from '../i18n/context';

/**
 * Сравнение двух ролей и вашего уровня по восьми осям: точки на шкале уровней,
 * без процентов и радара. Уровень «вы» приходит готовым из экрана (та же
 * `roleReadiness`, что рисует «Где вы сейчас»), цели берутся из career.json.
 *
 * Метки различаются формой и текстом, не цветом: ● вы, ▲ выбранная роль,
 * ■ вторая роль. Вторая роль живёт только в состоянии этого блока: на
 * устройстве и в синхронизации её нет.
 */
const MARKS = { you: '●', target: '▲', other: '■' } as const;
type Who = keyof typeof MARKS;

export function RoleCompare({ roleId, levels }: { roleId: string; levels: Record<AxisId, number> }) {
  const { t, locale } = useI18n();
  const m = t.career.compare;
  const [otherId, setOtherId] = useState('');

  const target = careerRole(roleId);
  const other = otherId && otherId !== roleId ? careerRole(otherId) : undefined;
  if (!target) return null;

  const whos: Who[] = other ? ['you', 'target', 'other'] : ['you', 'target'];
  const name = (who: Who) => (who === 'you' ? m.you : who === 'target' ? target.title[locale] : other!.title[locale]);
  const levelOf = (who: Who, axis: AxisId) => (who === 'you' ? levels[axis] : who === 'target' ? target.targets[axis] : other!.targets[axis]);
  /* Цель 0 значит «роли ось не нужна»: метки нет, а не метка на нуле. */
  const marksAt = (axis: AxisId, level: number): Who[] => whos.filter((w) => levelOf(w, axis) === level && (w === 'you' || level > 0));
  const rowText = (axis: AxisId) =>
    whos
      .map((w) => {
        const lvl = levelOf(w, axis);
        return `${name(w)}: ${lvl === 0 && w !== 'you' ? m.notNeeded : t.career.levels[lvl]}`;
      })
      .join('; ');

  return (
    <details className="career-compare">
      <summary>{m.summary}</summary>
      <p className="muted career-compare-lead">{m.lead}</p>
      <label className="career-compare-pick">
        <span>{m.pickLabel}</span>
        <select value={other ? otherId : ''} onChange={(e) => setOtherId(e.target.value)}>
          <option value="">{m.pickNone}</option>
          {careerRoles
            .filter((r) => r.id !== roleId)
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.title[locale]}
              </option>
            ))}
        </select>
      </label>

      <ul className="career-compare-legend" aria-label={m.legendAria}>
        {whos.map((w) => (
          <li key={w}>
            <span className={`career-mark career-mark-${w}`} aria-hidden="true">
              {MARKS[w]}
            </span>{' '}
            {name(w)}
          </li>
        ))}
      </ul>

      <div className="career-compare-grid" role="table" aria-label={m.tableAria}>
        <div className="career-compare-row career-compare-head" role="row">
          <span role="columnheader">{m.axis}</span>
          {[0, 1, 2, 3].map((n) => (
            <span key={n} role="columnheader" className="career-compare-level" title={t.career.levels[n]}>
              {n}
            </span>
          ))}
        </div>
        {AXES.map((axis) => (
          <div key={axis} className="career-compare-row" role="row">
            <span role="rowheader" className="career-compare-axis">
              {careerAxes.find((a) => a.id === axis)!.title[locale]}
              <span className="career-compare-sr">. {rowText(axis)}</span>
            </span>
            {[0, 1, 2, 3].map((n) => (
              <span key={n} role="cell" className="career-compare-cell" aria-hidden="true">
                {marksAt(axis, n).map((w) => (
                  <span key={w} className={`career-mark career-mark-${w}`}>
                    {MARKS[w]}
                  </span>
                ))}
              </span>
            ))}
          </div>
        ))}
      </div>
      <p className="muted career-compare-foot">{m.scale(t.career.levels)}</p>
    </details>
  );
}
