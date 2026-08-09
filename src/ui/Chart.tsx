import { useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { ChartSpec, ChartView } from './chartSpec';

/**
 * Рисование готового решения из chartSpec.ts. Этот файл не решает, что можно
 * нарисовать честно, — только как. Разделение оттуда: ошибка в рисовании
 * видна глазом за секунду (кривая линия, наехавшие подписи), ошибка
 * в решении не видна никогда.
 *
 * Цвета серий — не произвольные: пара прошла проверку CVD-безопасности
 * (`validate_palette.js` из dataviz-скилла, ΔE 27–38 на обоих режимах темы,
 * контраст ≥3:1 в тёмной теме / WARN 2.51 в светлой — обязывает к тому, что
 * здесь и так есть по конструкции: подписи значений видны прямо на графике,
 * а таблица рядом всегда доступна одним переключателем). Первый цвет — тот
 * же `--accent`, что уже несёт роль «данные» во всём приложении (кнопки,
 * полосы в ячейках таблицы); второй — `--track-model`, единственный из
 * акцентов треков, не занятый под смысл «этот трек» на этом экране.
 * Порядок фиксирован и не крутится: серия 1 всегда первого цвета, серия 2 —
 * второго, независимо от того, сколько серий отфильтровано.
 */
const SERIES_COLORS = ['var(--accent)', 'var(--track-model)', 'var(--track-python)'];

function formatNum(v: number, locale: string): string {
  return v.toLocaleString(locale, { maximumFractionDigits: 4 });
}

/** Позиция нуля на шкале [min,max] в долях 0..1 — для базовой линии столбца. */
function zeroFrac(view: ChartView): number {
  const span = view.max - view.min || 1;
  return (0 - view.min) / span;
}
function valueFrac(v: number, view: ChartView): number {
  const span = view.max - view.min || 1;
  return (v - view.min) / span;
}

function BarChart({
  labels,
  view,
  numberLocale,
}: {
  labels: string[];
  view: ChartView;
  numberLocale: string;
}) {
  const zf = zeroFrac(view) * 100;
  const showZeroLine = view.min < 0 && view.max > 0;
  return (
    <div className="chart-bars">
      {labels.map((label, ri) => (
        <div className="chart-bar-row" key={ri}>
          <div className="chart-bar-label" title={label}>
            {label}
          </div>
          <div className="chart-bar-tracks">
            {showZeroLine && <div className="chart-bar-zero" style={{ left: `${zf}%` }} />}
            {view.series.map((s, si) => {
              const v = s.values[ri];
              if (v === null) {
                return <div className="chart-bar-track chart-bar-track-empty" key={si} />;
              }
              const vf = valueFrac(v, view) * 100;
              const left = Math.min(zf, vf);
              const width = Math.abs(vf - zf);
              return (
                <div className="chart-bar-track" key={si}>
                  <div
                    className="chart-bar-fill"
                    style={{ left: `${left}%`, width: `${width}%`, background: SERIES_COLORS[si % SERIES_COLORS.length] }}
                  />
                  <span className="chart-bar-value">{formatNum(v, numberLocale)}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Логические координаты SVG — не пиксели экрана, viewBox масштабируется под ширину карточки. */
const W = 640;
const H = 220;
const PAD_LEFT = 56;
const PAD_RIGHT = 14;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;
const PLOT_W = W - PAD_LEFT - PAD_RIGHT;
const PLOT_H = H - PAD_TOP - PAD_BOTTOM;

function LineChart({
  labels,
  positions,
  view,
  numberLocale,
}: {
  labels: string[];
  positions: number[];
  view: ChartView;
  numberLocale: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const x = (i: number) => PAD_LEFT + positions[i] * PLOT_W;
  const y = (v: number) => PAD_TOP + (1 - valueFrac(v, view)) * PLOT_H;

  const move = (e: ReactPointerEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const d = Math.abs(positions[i] - fx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    setHover(best);
  };

  const zero = view.min < 0 && view.max > 0 ? y(0) : null;

  /** Точки серии, разбитые на непрерывные отрезки по дыркам null — дыра рвёт линию, а не сглаживается. */
  const segmentsOf = (values: (number | null)[]): { x: number; y: number }[][] => {
    const segs: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    values.forEach((v, i) => {
      if (v === null) {
        if (cur.length) segs.push(cur);
        cur = [];
      } else {
        cur.push({ x: x(i), y: y(v) });
      }
    });
    if (cur.length) segs.push(cur);
    return segs;
  };

  const lastIndexOf = (values: (number | null)[]): number => {
    for (let i = values.length - 1; i >= 0; i--) if (values[i] !== null) return i;
    return -1;
  };

  return (
    <svg
      className="chart-line"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={view.series.map((s) => s.column).join(' / ')}
    >
      {/* Ось. Хайрлайн, один шаг от фона — а не рамка вокруг данных. */}
      <line className="chart-axis" x1={PAD_LEFT} y1={y(view.min)} x2={W - PAD_RIGHT} y2={y(view.min)} />
      {zero !== null && <line className="chart-axis chart-axis-zero" x1={PAD_LEFT} y1={zero} x2={W - PAD_RIGHT} y2={zero} />}

      {/* Подписи концов оси величины — обе, без этого «линия ползёт вверх» ничего не значит. */}
      <text className="chart-axis-label" x={PAD_LEFT - 6} y={y(view.max)} textAnchor="end" dominantBaseline="hanging">
        {formatNum(view.max, numberLocale)}
      </text>
      <text className="chart-axis-label" x={PAD_LEFT - 6} y={y(view.min)} textAnchor="end" dominantBaseline="auto">
        {formatNum(view.min, numberLocale)}
      </text>
      {zero !== null && (
        <text className="chart-axis-label" x={PAD_LEFT - 6} y={zero} textAnchor="end" dominantBaseline="middle">
          0
        </text>
      )}

      {/* Подписи первой и последней точки по времени. */}
      <text className="chart-axis-label" x={x(0)} y={H - 8} textAnchor="start">
        {labels[0]}
      </text>
      <text className="chart-axis-label" x={x(labels.length - 1)} y={H - 8} textAnchor="end">
        {labels[labels.length - 1]}
      </text>

      {view.series.map((s, si) => {
        const color = SERIES_COLORS[si % SERIES_COLORS.length];
        const segs = segmentsOf(s.values);
        const last = lastIndexOf(s.values);
        return (
          <g key={si}>
            {segs.map((seg, gi) => (
              <path
                key={gi}
                className="chart-line-path"
                stroke={color}
                d={seg.map((p, pi) => `${pi === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
              />
            ))}
            {last >= 0 && (
              <>
                <circle className="chart-line-end-ring" cx={x(last)} cy={y(s.values[last] as number)} r={5} />
                <circle className="chart-line-end-dot" cx={x(last)} cy={y(s.values[last] as number)} r={4} fill={color} />
                <text
                  className="chart-end-label"
                  x={Math.min(x(last) + 8, W - PAD_RIGHT - 4)}
                  y={y(s.values[last] as number)}
                  textAnchor={x(last) + 8 > W - PAD_RIGHT - 40 ? 'end' : 'start'}
                  dominantBaseline="middle"
                >
                  {formatNum(s.values[last] as number, numberLocale)}
                </text>
              </>
            )}
          </g>
        );
      })}

      {hover !== null && (
        <g>
          <line className="chart-hover-line" x1={x(hover)} y1={PAD_TOP} x2={x(hover)} y2={H - PAD_BOTTOM} />
          {view.series.map((s, si) => {
            const v = s.values[hover];
            if (v === null) return null;
            return (
              <circle
                key={si}
                className="chart-hover-dot"
                cx={x(hover)}
                cy={y(v)}
                r={4}
                fill={SERIES_COLORS[si % SERIES_COLORS.length]}
              />
            );
          })}
          {(() => {
            const boxW = 116;
            const boxH = 20 + view.series.length * 16;
            const bx = Math.min(Math.max(x(hover) - boxW / 2, PAD_LEFT), W - PAD_RIGHT - boxW);
            const by = PAD_TOP;
            return (
              <g>
                <rect className="chart-hover-box" x={bx} y={by} width={boxW} height={boxH} rx={6} />
                <text className="chart-hover-title" x={bx + 8} y={by + 14}>
                  {labels[hover]}
                </text>
                {view.series.map((s, si) => (
                  <text className="chart-hover-value" key={si} x={bx + 8} y={by + 30 + si * 16}>
                    <tspan className="chart-hover-swatch" fill={SERIES_COLORS[si % SERIES_COLORS.length]}>
                      ●{' '}
                    </tspan>
                    {s.values[hover] === null ? 'NULL' : formatNum(s.values[hover] as number, numberLocale)}
                  </text>
                ))}
              </g>
            );
          })()}
        </g>
      )}

      {/* Слой захвата курсора/касания — прозрачный, но не 'none': fill указан, значит хиттест есть. */}
      <rect
        x={PAD_LEFT}
        y={PAD_TOP}
        width={PLOT_W}
        height={PLOT_H}
        fill="transparent"
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
      />
    </svg>
  );
}

export function Chart({ spec, numberLocale }: { spec: ChartSpec; numberLocale: string }) {
  const [viewIndex, setViewIndex] = useState(0);
  const idx = Math.min(viewIndex, spec.views.length - 1);
  const view = spec.views[idx];

  return (
    <div className="chart">
      {spec.views.length > 1 && (
        <div className="tabs chart-views" role="tablist">
          {spec.views.map((v, i) => (
            <button key={i} type="button" role="tab" aria-pressed={i === idx} onClick={() => setViewIndex(i)}>
              {v.series.map((s) => s.column).join(' / ')}
            </button>
          ))}
        </div>
      )}
      {view.series.length > 1 ? (
        <div className="chart-legend">
          {view.series.map((s, si) => (
            <span className="chart-legend-item" key={si}>
              <span className="chart-legend-dot" style={{ background: SERIES_COLORS[si % SERIES_COLORS.length] }} />
              {s.column}
            </span>
          ))}
        </div>
      ) : (
        <div className="chart-caption">{view.series[0].column}</div>
      )}
      {spec.kind === 'bar' ? (
        <BarChart labels={spec.labels} view={view} numberLocale={numberLocale} />
      ) : (
        <LineChart labels={spec.labels} positions={spec.positions!} view={view} numberLocale={numberLocale} />
      )}
    </div>
  );
}
