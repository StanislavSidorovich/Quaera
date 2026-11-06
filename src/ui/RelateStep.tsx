import { useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { RelateTrap, TaskStep } from '../content/types';
import {
  colKey,
  dirOf,
  fillSymptom,
  flowOf,
  findRel,
  gradeRelate,
  referenceRelations,
  setCard,
  setDir,
  startModel,
  subsetDoc,
  tableOf,
  toggleRel,
  type Card,
  type Dir,
  type Rel,
  type RelateVerdict,
} from '../engine/relate';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';
import { LAYOUT, buildSchemaLayout, type LayoutNode, type SchemaLayout } from './schemaLayout';
import './relateStep.css';

/**
 * Экран шага `relate`: схема Kaiyo с раскрытыми колонками, касанием колонок
 * проводятся связи, на каждом конце переключатель «1»/«много», кнопка «Проверить».
 *
 * Раскладка не своя: положение и порядок таблиц даёт общая `buildSchemaLayout`
 * (с опцией `columns`, она лишь делает узлы выше на строки колонок). Здесь только
 * линии между строками колонок, переключатели концов и разбор ловушек.
 *
 * Состояние живёт в черновике шага (`StepDraft.relate`), как раскладка у `waves`.
 * На узком экране (меньше 600 px) схема не принимает касаний: связи выбираются
 * двумя списками «из какой колонки, в какую», а схема рисует результат.
 */

export type RelateStepDef = Extract<TaskStep, { kind: 'relate' }>;

export interface RelateState {
  rels: Rel[];
  /** Колонка, выбранная первым касанием; ждёт вторую. */
  pick: string | null;
  /** Результат последней проверки; любая правка связей его сбрасывает. */
  verdict: RelateVerdict | null;
}

/**
 * Начальное состояние шага: пусто, а у задания с подложенным дефектом это собранная
 * модель с одной сломанной связью (нужна схема, чтобы вывести эталон).
 */
export function blankRelateState(step?: RelateStepDef, schema?: SchemaDoc | null): RelateState {
  const defect = step?.relate.defect;
  if (!defect || !schema) return { rels: [], pick: null, verdict: null };
  const shown = step!.relate.tables.map((x) => x.table);
  return { rels: startModel(referenceRelations(schema, shown), defect), pick: null, verdict: null };
}

const NARROW = '(max-width: 599px)';

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => typeof matchMedia === 'function' && matchMedia(NARROW).matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const m = matchMedia(NARROW);
    const on = () => setNarrow(m.matches);
    m.addEventListener('change', on);
    on();
    return () => m.removeEventListener('change', on);
  }, []);
  return narrow;
}

/** Ширина плашки «1»/«много» на схеме по длине подписи. */
const pillW = (label: string) => Math.round(label.length * 6.8 + 14);
const PILL_H = 20;
const MID_W = 30;
const MID_H = PILL_H;
type Pt = { x: number; y: number };
/** Запас справа под дуги связей внутри одной колонки таблиц. */
const ARC_ROOM = 72;

/**
 * Узкая раскладка столбцом: факты сверху, справочники под ними, все узлы одной ширины.
 * Двух колонок рядом на 375 px нет, поэтому порядок узлов тот же (факты, справочники, сырой слой),
 * а подписи групп стоят над своими блоками. Линий на узком экране нет: связи видны подсветкой строк
 * и списком ниже.
 */
function stackLayout(layout: SchemaLayout): SchemaLayout & { dimLabelY: number | null } {
  const width = Math.max(...layout.nodes.map((n) => n.w));
  let y: number = LAYOUT.headerH;
  let dimLabelY: number | null = null;
  let seenDim = false;
  const nodes = layout.nodes.map((n) => {
    if (n.group === 'dimension' && !seenDim) {
      seenDim = true;
      if (layout.nodes.some((x) => x.group === 'fact')) y += LAYOUT.headerH;
      dimLabelY = y - 12;
    }
    const dy = y - n.y;
    y += n.h + LAYOUT.gapY;
    return { ...n, x: 0, y: n.y + dy, w: width, rows: n.rows?.map((r) => ({ ...r, y: r.y + dy })) };
  });
  return { ...layout, nodes, edges: [], width, height: y - LAYOUT.gapY, dimLabelX: 0, dimLabelY };
}

interface Props {
  step: RelateStepDef;
  schema: SchemaDoc | null;
  state: RelateState;
  solved: boolean;
  onState: (s: RelateState) => void;
  /** Нажата «Проверить»: вердикт уже посчитан. */
  onResult: (v: RelateVerdict) => void;
}

export function RelateStep({ step, schema, state, solved, onState, onResult }: Props) {
  const { t, locale } = useI18n();
  const T = t.task;
  const narrow = useNarrow();
  const spec = step.relate;
  const shown = useMemo(() => spec.tables.map((x) => x.table), [spec]);
  const reference = useMemo(() => (schema ? referenceRelations(schema, shown) : []), [schema, shown]);

  const layout = useMemo(() => {
    if (!schema) return null;
    const columns = Object.fromEntries(spec.tables.map((x) => [x.table, x.columns]));
    const wide = buildSchemaLayout(subsetDoc(schema, shown), { columns });
    return narrow ? stackLayout(wide) : { ...wide, dimLabelY: null };
  }, [schema, spec, shown, narrow]);

  const nodeByTable = useMemo(() => new Map((layout?.nodes ?? []).map((n) => [n.table, n])), [layout]);
  const rowY = (key: string): number | null => {
    const n = nodeByTable.get(tableOf(key));
    return n?.rows?.find((r) => key === colKey(n.table, r.name))?.y ?? null;
  };

  const locked = solved;
  const edit = (rels: Rel[], pick: string | null = null) => onState({ rels, pick, verdict: null });

  const tap = (key: string) => {
    if (locked || narrow) return;
    if (!state.pick) return onState({ ...state, pick: key, verdict: null });
    if (state.pick === key) return onState({ ...state, pick: null });
    if (tableOf(state.pick) === tableOf(key)) return onState({ ...state, pick: key, verdict: null });
    edit(toggleRel(state.rels, state.pick, key));
  };

  const flip = (index: number, end: 'a' | 'b') => {
    if (locked) return;
    const r = state.rels[index];
    const now: Card = end === 'a' ? r.ca : r.cb;
    edit(setCard(state.rels, index, end, now === 'many' ? 'one' : 'many'));
  };

  const cardLabel = (c: Card) => (c === 'one' ? T.relateOne : T.relateMany);
  const withDirs = !!spec.directions;
  const dirLabel = (d: Dir) => (d === 'one' ? T.relateDirOne : T.relateDirBoth);
  const flipDir = (index: number) => {
    if (locked) return;
    edit(setDir(state.rels, index, dirOf(state.rels[index]) === 'one' ? 'both' : 'one'));
  };

  // Выбор двумя списками (узкий экран).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const options = useMemo(() => spec.tables.map((x) => ({ table: x.table, cols: x.columns.map((c) => colKey(x.table, c)) })), [spec]);
  const canAdd = from !== '' && to !== '' && tableOf(from) !== tableOf(to) && findRel(state.rels, from, to) < 0;
  const select = (value: string, set: (v: string) => void, label: string) => (
    <label className="rel-select">
      <span>{label}</span>
      <select value={value} disabled={locked} onChange={(e) => set(e.target.value)}>
        <option value="">{T.relateChoose}</option>
        {options.map((o) => (
          <optgroup key={o.table} label={o.table}>
            {o.cols.map((k) => (
              <option key={k} value={k}>
                {k.slice(k.indexOf('.') + 1)}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );

  const check = () => {
    const v = gradeRelate(state.rels, reference, spec.traps);
    onState({ ...state, pick: null, verdict: v });
    onResult(v);
  };

  /* Геометрия связи: из какой точки в какую, и где стоят плашки концов. */
  const geom = useMemo(() => {
    let arcs = 0;
    return state.rels.map((r) => {
      const na = nodeByTable.get(tableOf(r.a));
      const nb = nodeByTable.get(tableOf(r.b));
      const ya = rowY(r.a);
      const yb = rowY(r.b);
      if (!na || !nb || ya === null || yb === null) return null;
      const sameCol = na.x === nb.x;
      const rnd = (n: number) => Math.round(n * 10) / 10;
      if (sameCol) {
        const x = na.x + na.w;
        const bulge = 28 + 14 * arcs++;
        return {
          d: `M ${x} ${ya} C ${rnd(x + bulge)} ${ya}, ${rnd(x + bulge)} ${yb}, ${x} ${yb}`,
          a: { x, y: ya, side: 'right' as const },
          b: { x, y: yb, side: 'right' as const },
          bez: [
            { x, y: ya },
            { x: x + bulge, y: ya },
            { x: x + bulge, y: yb },
            { x, y: yb },
          ] as Pt[],
        };
      }
      const aLeft = na.x < nb.x;
      const a = aLeft ? { x: na.x + na.w, y: ya, side: 'right' as const } : { x: na.x, y: ya, side: 'left' as const };
      const b = aLeft ? { x: nb.x, y: yb, side: 'left' as const } : { x: nb.x + nb.w, y: yb, side: 'right' as const };
      const c = Math.max(28, Math.abs(b.x - a.x) * 0.45);
      const dir = a.x < b.x ? 1 : -1;
      const bez: Pt[] = [
        { x: a.x, y: a.y },
        { x: a.x + dir * c, y: a.y },
        { x: b.x - dir * c, y: b.y },
        { x: b.x, y: b.y },
      ];
      return { d: `M ${a.x} ${a.y} C ${rnd(a.x + dir * c)} ${a.y}, ${rnd(b.x - dir * c)} ${b.y}, ${b.x} ${b.y}`, a, b, bez };
    });
  }, [state.rels, nodeByTable]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * Плашки направления стоят на середине линии (t = 0.5). Линии двух фактов к общему справочнику
   * сходятся, и середины совпадают: тогда плашка сдвигается по своей же кривой (t = 0.58, 0.42, ...)
   * до первого места, где она не наезжает на уже поставленные.
   */
  const mids = useMemo(() => {
    const placed: Pt[] = [];
    return geom.map((g) => {
      if (!g) return null;
      const at = (t: number): Pt => {
        const [p0, c1, c2, p3] = g.bez;
        const u = 1 - t;
        const f = (k: 'x' | 'y') => u * u * u * p0[k] + 3 * u * u * t * c1[k] + 3 * u * t * t * c2[k] + t * t * t * p3[k];
        return { x: Math.round(f('x') * 10) / 10, y: Math.round(f('y') * 10) / 10 };
      };
      const free = (p: Pt) => placed.every((q) => Math.abs(p.x - q.x) >= MID_W + 4 || Math.abs(p.y - q.y) >= MID_H + 4);
      const p = [0.5, 0.58, 0.42, 0.64, 0.36].map(at).find(free) ?? at(0.5);
      placed.push(p);
      return p;
    });
  }, [geom]);

  const linkedCols = useMemo(() => new Set(state.rels.flatMap((r) => [r.a, r.b])), [state.rels]);

  const pill = (rel: Rel, i: number, end: 'a' | 'b') => {
    const g = geom[i];
    if (!g) return null;
    const p = end === 'a' ? g.a : g.b;
    const card = end === 'a' ? rel.ca : rel.cb;
    const col = end === 'a' ? rel.a : rel.b;
    const label = cardLabel(card);
    const w = pillW(label);
    const x = p.side === 'right' ? p.x + 6 : p.x - 6 - w;
    const interactive = !locked && !narrow;
    const press = () => flip(i, end);
    return (
      <g
        key={`${i}-${end}`}
        className={`rel-pill${interactive ? '' : ' is-static'}`}
        {...(interactive
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': T.relateEndAria(col, label),
              onClick: press,
              onKeyDown: (e: ReactKeyboardEvent<SVGGElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  press();
                }
              },
            }
          : { 'aria-hidden': true })}
      >
        <rect x={x} y={p.y - PILL_H / 2} width={w} height={PILL_H} rx={PILL_H / 2} />
        <text x={x + w / 2} y={p.y} dominantBaseline="central" textAnchor="middle">
          {label}
        </text>
      </g>
    );
  };

  /**
   * Переключатель направления на середине связи. Показывает стрелку фильтра («одно»: от «1»
   * к «много») или двойную («оба»). Нажимается и на узком экране: это единственный
   * переключатель, который там остаётся на схеме, остальное делают списки.
   */
  const midPill = (rel: Rel, i: number) => {
    const g = geom[i];
    const mid = mids[i];
    if (!g || !mid) return null;
    const dir = dirOf(rel);
    const flow = flowOf(rel);
    let glyph = '·';
    if (dir === 'both') glyph = '↔';
    else if (flow) {
      const pos = (k: string) => {
        const nd = nodeByTable.get(tableOf(k));
        const y = rowY(k);
        return nd && y !== null ? { x: nd.x + nd.w / 2, y } : null;
      };
      const f = pos(flow.from);
      const to = pos(flow.to);
      if (f && to) glyph = Math.abs(to.x - f.x) > 8 ? (to.x > f.x ? '→' : '←') : to.y > f.y ? '↓' : '↑';
    }
    const label = dirLabel(dir);
    const w = MID_W;
    const press = () => flipDir(i);
    return (
      <g
        key={`${i}-mid`}
        className={`rel-pill rel-mid${dir === 'both' ? ' is-both' : ''}${locked ? ' is-static' : ''}`}
        {...(!locked
          ? {
              role: 'button',
              tabIndex: 0,
              'aria-label': T.relateDirAria(rel.a, rel.b, label),
              onClick: press,
              onKeyDown: (e: ReactKeyboardEvent<SVGGElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  press();
                }
              },
            }
          : { 'aria-hidden': true })}
      >
        {/* Прозрачная площадка 36 на 28: палец не промахивается мимо плашки в 20 px, соседи не перекрываются. */}
        <rect className="rel-hit-pad" x={mid.x - 18} y={mid.y - 14} width={36} height={28} />
        <rect x={mid.x - w / 2} y={mid.y - PILL_H / 2} width={w} height={PILL_H} rx={PILL_H / 2} />
        <text x={mid.x} y={mid.y} dominantBaseline="central" textAnchor="middle">
          {glyph}
        </text>
      </g>
    );
  };

  const node = (n: LayoutNode) => (
    <g key={n.table} className={`schema-node group-${n.group} is-static rel-node`}>
      <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} />
      <text className="rel-title" x={n.x + LAYOUT.padX} y={n.y + LAYOUT.titleH / 2} dominantBaseline="central">
        {n.table}
      </text>
      <line className="rel-sep" x1={n.x + 6} x2={n.x + n.w - 6} y1={n.y + LAYOUT.titleH} y2={n.y + LAYOUT.titleH} />
      {(n.rows ?? []).map((r) => {
        const key = colKey(n.table, r.name);
        const picked = state.pick === key;
        const linked = linkedCols.has(key);
        const interactive = !locked && !narrow;
        const press = () => tap(key);
        return (
          <g
            key={key}
            className={`rel-row${picked ? ' is-picked' : ''}${linked ? ' is-linked' : ''}${interactive ? '' : ' is-static'}`}
            {...(interactive
              ? {
                  role: 'button',
                  tabIndex: 0,
                  'aria-pressed': picked,
                  'aria-label': T.relateRowAria(key, picked, linked),
                  onClick: press,
                  onKeyDown: (e: ReactKeyboardEvent<SVGGElement>) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      press();
                    }
                  },
                }
              : {})}
          >
            <rect className="rel-hit" x={n.x + 4} y={r.y - LAYOUT.rowH / 2 + 1} width={n.w - 8} height={LAYOUT.rowH - 2} rx={6} />
            <text x={n.x + LAYOUT.padX} y={r.y} dominantBaseline="central">
              {r.name}
            </text>
          </g>
        );
      })}
    </g>
  );

  const trapCard = (tr: RelateTrap) => (
    <article key={tr.id} className="rel-trap">
      <dl>
        <div>
          <dt>{T.relateSymptom}</dt>
          <dd>{fillSymptom(tr.symptom, tr, locale)}</dd>
        </div>
        <div>
          <dt>{T.relateCause}</dt>
          <dd>{fillSymptom(tr.cause, tr, locale)}</dd>
        </div>
        <div>
          <dt>{T.relateFix}</dt>
          <dd>{fillSymptom(tr.fix, tr, locale)}</dd>
        </div>
        <div>
          <dt>{T.relateBusiness}</dt>
          <dd>{fillSymptom(tr.business, tr, locale)}</dd>
        </div>
      </dl>
    </article>
  );

  const hitTraps = spec.traps.filter((x) => state.verdict?.traps.includes(x.id));
  const seg = (rel: Rel, i: number, end: 'a' | 'b') => {
    const col = end === 'a' ? rel.a : rel.b;
    const now = end === 'a' ? rel.ca : rel.cb;
    return (
      <div className="rel-end">
        <code>{col}</code>
        <div className="rel-seg" role="group" aria-label={T.relateEndLabel(col)}>
          {(['one', 'many'] as const).map((c) => (
            <button
              key={c}
              type="button"
              className={`rel-seg-btn${now === c ? ' is-on' : ''}`}
              aria-pressed={now === c}
              disabled={locked}
              onClick={() => now !== c && flip(i, end)}
            >
              {cardLabel(c)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="rel">
      {spec.defect && <ReportTable defect={spec.defect} title={T.relateReportTitle} />}
      {!locked && (
        <p className="muted rel-note">
          {spec.defect ? `${T.relateNoteDefect} ` : ''}
          {narrow ? T.relateNoteNarrow : T.relateNote}
          {withDirs ? ` ${T.relateNoteDir}` : ''}
        </p>
      )}
      {state.pick && !narrow && !locked && (
        <p className="rel-picked" aria-live="polite">
          {T.relatePicked(state.pick)}
        </p>
      )}

      {layout && (
        <div className="schema-map-wrap rel-map">
          <svg
            className="schema-map"
            width={layout.width + (narrow ? 0 : ARC_ROOM) + 4}
            height={layout.height + 4}
            viewBox={`-2 -2 ${layout.width + (narrow ? 0 : ARC_ROOM) + 4} ${layout.height + 4}`}
            style={narrow ? { maxWidth: '100%', height: 'auto' } : undefined}
            role="group"
            aria-label={T.relateMapAria}
          >
            <text className="schema-map-caption" x={layout.factLabelX} y={layout.labelY}>
              {t.data.mapFactsLabel}
            </text>
            <text className="schema-map-caption" x={layout.dimLabelX} y={layout.dimLabelY ?? layout.labelY}>
              {t.data.mapDimsLabel}
            </text>
            {!narrow && state.rels.map((r, i) => (geom[i] ? <path key={`${r.a}|${r.b}`} className="rel-line" d={geom[i]!.d} /> : null))}
            {layout.nodes.map(node)}
            {!narrow && state.rels.map((r, i) => [pill(r, i, 'a'), pill(r, i, 'b')])}
            {!narrow && withDirs && state.rels.map((r, i) => midPill(r, i))}
          </svg>
        </div>
      )}

      {narrow && !locked && (
        <div className="rel-pick">
          {select(from, setFrom, T.relateFrom)}
          {select(to, setTo, T.relateTo)}
          <button
            type="button"
            className="btn secondary"
            disabled={!canAdd}
            onClick={() => {
              edit(toggleRel(state.rels, from, to));
              setFrom('');
              setTo('');
            }}
          >
            {T.relateAdd}
          </button>
        </div>
      )}

      <section className="rel-listbox" aria-label={T.relateListTitle}>
        <h4 className="rel-h">{T.relateListTitle}</h4>
        {state.rels.length === 0 ? (
          <p className="muted rel-empty">{T.relateEmpty}</p>
        ) : (
          <ul className="rel-list">
            {state.rels.map((r, i) => (
              <li key={`${r.a}|${r.b}`} className="rel-item">
                <div className="rel-ends">
                  {seg(r, i, 'a')}
                  {seg(r, i, 'b')}
                </div>
                {withDirs && (
                  <div className="rel-end rel-dir">
                    <span className="rel-dir-label">{T.relateDirLabel}</span>
                    <div className="rel-seg" role="group" aria-label={T.relateDirGroup(r.a, r.b)}>
                      {(['one', 'both'] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={`rel-seg-btn${dirOf(r) === d ? ' is-on' : ''}`}
                          aria-pressed={dirOf(r) === d}
                          disabled={locked}
                          onClick={() => dirOf(r) !== d && flipDir(i)}
                        >
                          {dirLabel(d)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {!locked && (
                  <button type="button" className="btn secondary rel-remove" aria-label={T.relateRemoveAria(r.a, r.b)} onClick={() => edit(state.rels.filter((_, j) => j !== i))}>
                    {T.relateRemove}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {!locked && (
        <div className="rel-run">
          <button type="button" className="btn" disabled={state.rels.length === 0 || !schema} onClick={check}>
            {T.relateCheck}
          </button>
        </div>
      )}

      {!locked && hitTraps.length > 0 && (
        <section className="rel-traps" aria-live="polite" aria-label={T.relateTrapsTitle}>
          <h4 className="rel-h">{T.relateTrapsTitle}</h4>
          {hitTraps.map(trapCard)}
        </section>
      )}

      {locked && spec.traps.length > 0 && (
        <details className="rel-alltraps">
          <summary>{T.relateAllTraps}</summary>
          {spec.traps.map(trapCard)}
        </details>
      )}
    </div>
  );
}

/** Фрагмент отчёта с симптомом: строки посчитал запрос к Kaiyo, гейт сверяет их при каждом прогоне. */
function ReportTable({ defect, title }: { defect: NonNullable<RelateStepDef['relate']['defect']>; title: string }) {
  const { locale } = useI18n();
  const { head, rows, labels } = defect.report;
  if (!head || !rows) return null;
  const tag = locale === 'ru' ? 'ru-RU' : 'en-US';
  const cell = (v: string | number) => (typeof v === 'number' ? `¥${v.toLocaleString(tag)}` : v);
  return (
    <figure className="rel-report">
      <figcaption>{title}</figcaption>
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} scope="col">
                {labels?.[h] ?? h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={typeof v === 'number' ? 'num' : undefined}>
                  {cell(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
