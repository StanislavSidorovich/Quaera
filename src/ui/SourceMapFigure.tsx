import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import { Badge, Label, LH, Notes, rich } from './figureParts';

const sm = architecture.artifacts.sourceMap;

const W = 216;
const BOX_X = 4;
const BOX_W = W - 8;
const PILL_H = 20;
const ARROW = 16;
const GAP = 14;

/** Ширина и левый край таблицы в ряду: два столбца под системой, а у дистрибьюторов сырая выгрузка шире. */
const COL = { left: { x: 8, w: 100 }, right: { x: 112, w: 100 }, rawLeft: { x: 8, w: 124 }, rawRight: { x: 140, w: 72 } };

interface Pill {
  name: string;
  x: number;
  w: number;
  row: number;
  /** Откуда идёт стрелка: к системе (`box`) или от соседней таблицы выше (`up`). */
  from: 'box' | 'up';
}

/** Раскладка таблиц системы: два столбца; у дистрибьюторов `fact_sellout` стоит под сырой выгрузкой и получает стрелку от неё. */
function pillsOf(id: string, tables: string[]): Pill[] {
  if (id === 'dist') {
    return [
      { name: tables[0], ...COL.rawLeft, row: 0, from: 'box' },
      { name: tables[2], ...COL.rawRight, row: 0, from: 'box' },
      { name: tables[1], ...COL.rawLeft, row: 1, from: 'up' },
    ];
  }
  if (tables.length === 1) return [{ name: tables[0], x: 8, w: 124, row: 0, from: 'box' }];
  return tables.map((name, i) => ({ name, ...(i === 0 ? COL.left : COL.right), row: 0, from: 'box' as const }));
}

/** Высота рамки системы: имя и до трёх строк описания. */
const boxH = (desc: string) => 43 + (desc.split('\n').length - 1) * LH;

/**
 * Схема «Системы-источники и что в них лежит»: сверху вниз, у каждой системы рамка с одной строкой
 * «что это» и под ней таблицы датасета Kaiyo, к которым такая система обычно ведёт. Узкий viewBox
 * (216), чтобы в карточке на телефоне подписи оставались около 11px без прокрутки вбок.
 * Раскладка таблиц по системам типичная, а не записанная в данных: об этом пометка 2.
 */
export function SourceMapFigure() {
  const { locale } = useI18n();
  let top = 28;
  const blocks = sm.systems.map((s) => {
    const desc = s.desc[locale];
    const h = boxH(desc);
    const pills = pillsOf(s.id, s.tables);
    const rowsN = Math.max(...pills.map((p) => p.row)) + 1;
    const pillsTop = top + h + ARROW;
    const b = { s, desc, top, h, pills, pillsTop };
    top = pillsTop + rowsN * PILL_H + (rowsN - 1) * ARROW + GAP;
    return b;
  });
  const height = top - GAP + 6;

  return (
    <figure className="pf">
      <figcaption className="pf-title">{sm.title[locale]}</figcaption>
      <p className="muted pf-hint-n">{sm.scrollHint[locale]}</p>
      <div className="pf-scroll" tabIndex={0}>
        <svg className="pf-svg pf-svg-n" viewBox={`0 0 ${W} ${height}`} role="img" aria-label={sm.aria[locale]} focusable="false">
          <defs>
            <marker id="sm-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
              <path className="pf-arr" d="M0 1 L10 5 L0 9 z" />
            </marker>
          </defs>

          <text className="pf-t pf-lane-t" x={BOX_X + 4} y={14}>
            {sm.head[locale]}
          </text>
          <Badge x={W - 14} y={10} n={2} />

          {blocks.map(({ s, desc, top: y, h, pills, pillsTop }) => (
            <g key={s.id}>
              <rect className="pf-shape" x={BOX_X} y={y} width={BOX_W} height={h} rx={8} />
              <text className="pf-t pf-sys-t" x={BOX_X + 10} y={y + 17}>
                {s.name[locale]}
              </text>
              <Label x={BOX_X + 10} y={y + 33} text={desc} anchor="start" />
              {pills.map((p) => {
                const py = pillsTop + p.row * (PILL_H + ARROW);
                const cx = p.x + p.w / 2;
                const fromY = p.from === 'box' ? y + h : py - ARROW;
                return (
                  <g key={p.name}>
                    <path className="pf-seq" d={`M${cx} ${fromY} V${py - 2}`} markerEnd="url(#sm-arr)" />
                    <rect className="pf-shape" x={p.x} y={py} width={p.w} height={PILL_H} rx={6} />
                    <text className="pf-t pf-mono" x={cx} y={py + 14} textAnchor="middle">
                      {p.name}
                    </text>
                  </g>
                );
              })}
            </g>
          ))}
          <Badge x={BOX_X + BOX_W - 16} y={blocks[0].top + 16} n={1} />
        </svg>
      </div>
      <Notes notes={sm.notes} locale={locale} />
      <p className="muted pf-caption">{rich(sm.caption[locale])}</p>
    </figure>
  );
}
