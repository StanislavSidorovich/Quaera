import type { AxisId, Level } from '../career/readiness';

export interface RadarAxis {
  id: AxisId;
  label: string;
  have: Level;
  /** 0 — роли ось не нужна: контур цели сходится в центр. */
  target: Level;
  /** Сколько навыков оси ждут повторения; больше нуля — на оси пунктир. */
  due: number;
}

const W = 400;
const H = 330;
const CX = W / 2;
const CY = 162;
const R = 100;
const LABEL_R = R + 16;

const point = (i: number, n: number, level: number, r = R) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: CX + Math.cos(a) * r * (level / 3), y: CY + Math.sin(a) * r * (level / 3), cos: Math.cos(a), sin: Math.sin(a) };
};

const poly = (axes: RadarAxis[], pick: (a: RadarAxis) => number) =>
  axes.map((a, i) => point(i, axes.length, pick(a))).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

/**
 * Паутинка «цель роли против вас». Две серии, поэтому цвет не несёт смысла
 * один: цель обведена линией цвета текста, вы закрашены акцентом, а ось
 * с просроченными повторениями получает пунктир другой формы. Строки уровней
 * ниже по экрану остаются основным способом чтения, а текст для скринридера
 * повторяет их (`ariaLabel`).
 */
export function CareerRadar({
  axes,
  ariaLabel,
  legend,
}: {
  axes: RadarAxis[];
  ariaLabel: string;
  legend: { you: string; goal: string; due: string };
}) {
  const n = axes.length;
  const anyDue = axes.some((a) => a.due > 0);
  return (
    <figure className="career-radar">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="career-radar-svg">
        {[1, 2, 3].map((l) => (
          <polygon key={l} points={poly(axes, () => l)} className="career-radar-ring" />
        ))}
        {axes.map((a, i) => {
          const end = point(i, n, 3);
          return <line key={a.id} x1={CX} y1={CY} x2={end.x} y2={end.y} className="career-radar-spoke" />;
        })}
        {[1, 2, 3].map((l) => (
          <text key={l} x={CX + 4} y={CY - (R * l) / 3 + 11} className="career-radar-tick" aria-hidden>
            {l}
          </text>
        ))}
        <polygon points={poly(axes, (a) => a.have)} className="career-radar-you" />
        <polygon points={poly(axes, (a) => a.target)} className="career-radar-goal" />
        {axes.map((a, i) => {
          if (!a.due) return null;
          const p = point(i, n, a.have);
          return <line key={a.id} x1={CX} y1={CY} x2={p.x} y2={p.y} className="career-radar-due" />;
        })}
        {axes.map((a, i) => {
          const p = point(i, n, a.have);
          return <circle key={a.id} cx={p.x} cy={p.y} r={4} className="career-radar-dot" />;
        })}
        {axes.map((a, i) => {
          const p = point(i, n, 3, LABEL_R);
          const anchor = Math.abs(p.cos) < 0.2 ? 'middle' : p.cos > 0 ? 'start' : 'end';
          return (
            <text key={a.id} x={p.x} y={p.y + (p.sin > 0.5 ? 12 : p.sin < -0.5 ? -3 : 4)} textAnchor={anchor} className="career-radar-label">
              {a.label}
            </text>
          );
        })}
      </svg>
      <figcaption className="career-radar-legend">
        <span>
          <i className="sw-you" />
          {legend.you}
        </span>
        <span>
          <i className="sw-goal" />
          {legend.goal}
        </span>
        {anyDue && (
          <span>
            <i className="sw-due" />
            {legend.due}
          </span>
        )}
      </figcaption>
    </figure>
  );
}
