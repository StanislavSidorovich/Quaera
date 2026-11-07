import type { AxisId, Level } from '../career/readiness';
import './careerRadar.css';

export interface RadarAxis {
  id: AxisId;
  label: string;
  have: Level;
  /** Доля пути к следующему уровню, 0..1: фигура растёт плавно, а не ступенями. */
  progress: number;
  /** 0 — роли ось не нужна: цель на этой оси стоит на внутреннем кольце, подпись бледнее. */
  target: Level;
  /** Сколько навыков оси ждут повторения; больше нуля — вершина обведена пунктиром. */
  due: number;
}

const W = 400;
const H = 330;
const CX = W / 2;
const CY = 162;
const R = 100;
const LABEL_R = R + 16;
/** Уровень 0 не в центре: у фигуры всегда есть тело, а не шип из одной точки. */
const BASE = 0.22;

const radius = (value: number) => R * (BASE + ((1 - BASE) * Math.min(3, value)) / 3);

const point = (i: number, n: number, value: number, r?: number) => {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const rr = r ?? radius(value);
  return { x: CX + Math.cos(a) * rr, y: CY + Math.sin(a) * rr, cos: Math.cos(a), sin: Math.sin(a) };
};

const poly = (axes: RadarAxis[], pick: (a: RadarAxis) => number) =>
  axes.map((a, i) => point(i, axes.length, pick(a))).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

const value = (a: RadarAxis) => a.have + (a.have < 3 ? a.progress : 0);

/**
 * Паутинка «вы сейчас / цель роли» по образцу игровых характеристик:
 * многоугольник, залитый изнутри, растёт во все стороны. Оси общие для всех
 * ролей и стоят в одном порядке, чтобы фигуру человека можно было сравнить
 * между ролями; роль меняет только пунктирный контур цели. «Вы» всегда
 * залитый многоугольник с точками на вершинах, без шипов и линий: уровень 0
 * лежит на внутреннем кольце, а доля пути к следующему уровню даёт дробный
 * радиус. Ось с просроченными повторениями получает пунктирный ободок вокруг
 * точки. Текст для скринридера повторяет полосы под рисунком (`ariaLabel`).
 */
export function CareerRadar({
  axes,
  ariaLabel,
  legend,
  ringNames,
}: {
  axes: RadarAxis[];
  ariaLabel: string;
  legend: { you: string; goal: string; due: string; rings: string };
  /** Названия колец 1..3 для подписи под рисунком. */
  ringNames: [string, string, string];
}) {
  const n = axes.length;
  const anyDue = axes.some((a) => a.due > 0);
  const ring = (v: number) =>
    axes.map((_, i) => point(i, n, v)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  return (
    <figure className="career-radar">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel} className="career-radar-svg">
        <polygon points={ring(3)} className="career-radar-field" />
        {[0, 1, 2, 3].map((l) => (
          <polygon key={l} points={ring(l)} className={l === 0 ? 'career-radar-ring base' : 'career-radar-ring'} />
        ))}
        {axes.map((a, i) => {
          const from = point(i, n, 0);
          const end = point(i, n, 3);
          return <line key={a.id} x1={from.x} y1={from.y} x2={end.x} y2={end.y} className="career-radar-spoke" />;
        })}
        {[1, 2, 3].map((l) => (
          <text key={l} x={CX + 4} y={CY - radius(l) + 11} className="career-radar-tick" aria-hidden>
            {l}
          </text>
        ))}
        <polygon points={poly(axes, value)} className="career-radar-you" />
        <polygon points={poly(axes, (a) => a.target)} className="career-radar-goal" />
        {axes.map((a, i) => {
          const p = point(i, n, value(a));
          return (
            <g key={a.id}>
              {a.due > 0 && <circle cx={p.x} cy={p.y} r={8} className="career-radar-due" />}
              <circle cx={p.x} cy={p.y} r={4} className="career-radar-dot" />
            </g>
          );
        })}
        {axes.map((a, i) => {
          const p = point(i, n, 3, LABEL_R);
          const anchor = Math.abs(p.cos) < 0.2 ? 'middle' : p.cos > 0 ? 'start' : 'end';
          return (
            <text
              key={a.id}
              x={p.x}
              y={p.y + (p.sin > 0.5 ? 12 : p.sin < -0.5 ? -3 : 4)}
              textAnchor={anchor}
              className={`career-radar-label${a.target === 0 ? ' off' : ''}`}
            >
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
        <span className="career-radar-rings">
          {legend.rings}: {ringNames.map((name, i) => `${i + 1} ${name}`).join(' · ')}
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Полосы под паутинкой: по одной на каждую ось, не только на SQL. Три клетки,
 * закрашена та, что уже взята, у клетки текущей ступени закраска растёт
 * по доле пути, рамкой отмечена цель роли, справа уровень словами.
 */
export function CareerAxisBars({
  axes,
  fullLabel,
  levelName,
  cellAria,
  ariaLabel,
}: {
  axes: RadarAxis[];
  fullLabel: (id: AxisId) => string;
  levelName: (n: number) => string;
  cellAria: (axis: string, level: string, goal: string | null) => string;
  ariaLabel: string;
}) {
  return (
    <ul className="career-bars" aria-label={ariaLabel}>
      {axes.map((a) => {
        const title = fullLabel(a.id);
        return (
          <li key={a.id} className={`career-bars-row${a.target === 0 ? ' off' : ''}`}>
            <span className="career-bars-name">{a.label}</span>
            <span
              className="career-bars-cells"
              role="img"
              aria-label={cellAria(title, levelName(a.have), a.target > 0 ? levelName(a.target) : null)}
            >
              {[1, 2, 3].map((k) => {
                const fill = a.have >= k ? 100 : a.have === k - 1 ? Math.round(a.progress * 100) : 0;
                return (
                  <span key={k} className={`career-bars-cell${a.target === k ? ' target' : ''}`}>
                    <i style={{ width: `${fill}%` }} className={fill === 100 ? 'full' : ''} />
                  </span>
                );
              })}
            </span>
            <span className="career-bars-level">{levelName(a.have)}</span>
          </li>
        );
      })}
    </ul>
  );
}
