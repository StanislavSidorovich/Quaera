import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaskStep } from '../content/types';
import { canRun, runWaves, type RunRow, type WaveGate, type WavesLayout } from '../engine/waves';
import { useI18n } from '../i18n/context';
import { CardColumns } from './CardColumns';
import { StatusChip } from './RunLogFigure';
import './wavesStep.css';

/**
 * Экран шага `waves`: карточки в колонки («Волна 1…N»), переключатель у каждой
 * стрелки между волнами, «Запустить» и журнал запуска. Раскладка карточек это
 * общая CardColumns; здесь только то, что принадлежит волнам: условия стрелок,
 * разыгрывание журнала (engine/waves.ts) и вердикт.
 *
 * Состояние раскладки живёт в черновике шага (`StepDraft.waves`), как порядок
 * у `order`: уход на карточку теории и возврат его не теряют.
 */

export type WavesStepDef = Extract<TaskStep, { kind: 'waves' }>;

export interface WavesState {
  /** id карточки → id колонки `w0..wN` или null (на столе). */
  placement: Record<string, string | null>;
  gates: (WaveGate | null)[];
  /** Журнал запущен и ещё соответствует раскладке. */
  ran: boolean;
}

export function blankWavesState(step: WavesStepDef): WavesState {
  return { placement: Object.fromEntries(step.items.map((i) => [i.id, null])), gates: new Array(step.waves - 1).fill(null), ran: false };
}

const colId = (i: number) => `w${i}`;

function toLayout(state: WavesState): WavesLayout {
  const placement: WavesLayout['placement'] = {};
  for (const [id, col] of Object.entries(state.placement)) placement[id] = col === null ? null : Number(col.slice(1));
  return { placement, gates: state.gates };
}

interface Props {
  step: WavesStepDef;
  /** Порядок показа карточек на столе (перемешан плеером, не по волнам). */
  order: number[];
  state: WavesState;
  solved: boolean;
  onState: (s: WavesState) => void;
  /** Журнал доиграл до конца: сборка верна или нет. Зовётся один раз на запуск. */
  onResult: (r: { correct: boolean; early: boolean; extra: boolean; gate: boolean }) => void;
}

export function WavesStep({ step, order, state, solved, onState, onResult }: Props) {
  const { t } = useI18n();
  const T = t.task;
  const layout = toLayout(state);
  const ready = canRun(step.items, layout);
  const run = useMemo(() => (state.ran && ready ? runWaves(step.items, layout) : null), [state.ran, ready, step.items, state.placement, state.gates]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Сколько волн журнал уже доиграл. Вернувшийся к решённому шагу видит журнал целиком. */
  const [shown, setShown] = useState(solved || !run ? step.waves : 0);
  const reported = useRef(solved || !run);
  const [runNo, setRunNo] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (reported.current) {
      setShown(step.waves);
      return;
    }
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setShown(step.waves);
      reported.current = true;
      onResult({ correct: run.correct, early: run.problems.early.length > 0, extra: run.problems.extraPlaced.length > 0, gate: run.problems.gateComplete });
      return;
    }
    setShown(0);
    let w = 0;
    const id = window.setInterval(() => {
      w++;
      setShown(w);
      if (w >= step.waves) {
        window.clearInterval(id);
        reported.current = true;
        onResult({ correct: run.correct, early: run.problems.early.length > 0, extra: run.problems.extraPlaced.length > 0, gate: run.problems.gateComplete });
      }
    }, 650);
    return () => window.clearInterval(id);
  }, [run, runNo]); // eslint-disable-line react-hooks/exhaustive-deps

  const cards = order.map((i) => ({ id: step.items[i].id, label: step.items[i].label }));
  const columns = Array.from({ length: step.waves }, (_, i) => ({ id: colId(i), title: T.wavesColumn(i + 1) }));
  const byId = new Map(step.items.map((i) => [i.id, i]));
  const rowStatus = (r: RunRow) => (r.wave < shown ? r.status : r.wave === shown ? 'running' : 'queued');

  const gate = (i: number) => (
    <div className="ws-gate" role="group" aria-label={T.wavesGateAria(i + 1, i + 2)}>
      <span className="ws-gate-label">{T.wavesGateLabel}</span>
      {(['success', 'complete'] as const).map((g) => (
        <button
          key={g}
          type="button"
          className={`ws-gate-btn ws-gate-btn--${g}${state.gates[i] === g ? ' is-on' : ''}`}
          aria-pressed={state.gates[i] === g}
          disabled={solved}
          onClick={() => {
            const gates = [...state.gates];
            gates[i] = g;
            onState({ ...state, gates, ran: false });
          }}
        >
          {g === 'success' ? T.wavesGateSuccess : T.wavesGateComplete}
        </button>
      ))}
    </div>
  );

  const resultText = (r: RunRow) => {
    if (r.note) return r.note;
    if (r.status === 'succeeded' && r.rows !== undefined) return T.wavesRowsWritten(r.rows);
    return '';
  };

  const logTable = (rows: RunRow[], live: boolean) => (
    <div className="rl-scroll">
      <table className="rl-table ws-log">
        <thead>
          <tr>
            {T.wavesLogHead.map((h) => (
              <th key={h} scope="col">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const st = live ? rowStatus(r) : r.status;
            return (
              <tr key={r.id}>
                <td>{byId.get(r.id)!.label}</td>
                <td>{r.wave + 1}</td>
                <td>
                  <StatusChip status={st} label={T.wavesStatus[st]} />
                </td>
                <td className={r.tone === 'err' && st === r.status ? 'ws-bad' : undefined}>{st === r.status && live ? resultText(r) : live ? '' : resultText(r)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const finished = run && shown >= step.waves;

  return (
    <div className="ws">
      <CardColumns
        columns={columns}
        cards={cards}
        placement={state.placement}
        locked={solved}
        onChange={(placement) => onState({ ...state, placement, ran: false })}
        between={gate}
        note={(c) => <span>{byId.get(c.id)!.why}</span>}
        labels={{
          pool: T.wavesPool,
          putHere: T.wavesPutHere,
          putBack: T.wavesPutBack,
          empty: T.wavesEmpty,
          poolEmpty: T.wavesPoolEmpty,
          selected: T.wavesSelected,
        }}
      />
      {!solved && (
        <div className="ws-run">
          <button type="button" className="btn" disabled={!ready || (state.ran && !finished)} onClick={() => {
              reported.current = false;
              setRunNo((n) => n + 1);
              onState({ ...state, ran: true });
            }}>
            {state.ran ? T.wavesRunAgain : T.wavesRun}
          </button>
          {!ready && <p className="muted ws-run-note">{T.wavesRunLocked}</p>}
        </div>
      )}
      {run && (
        <section className="ws-logbox" aria-label={T.wavesLogTitle} aria-live="polite">
          <h4 className="cc-h">{T.wavesLogTitle}</h4>
          {logTable(run.rows, true)}
          {finished && run.stress && (
            <div className="ws-stress">
              <p className="ws-stress-h">{T.wavesStressTitle}</p>
              <p className="muted ws-run-note">{T.wavesStressIntro}</p>
              {logTable(run.stress.rows, false)}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
