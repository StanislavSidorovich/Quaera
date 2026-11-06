import { useMemo } from 'react';
import type { TaskStep } from '../content/types';
import {
  FOOTER_ROWS,
  FOOTER_TOTAL,
  buildSpot,
  cellStates,
  fillWhy,
  gradeSpot,
  type SpotVerdict,
} from '../engine/spot';
import type { Preview } from '../engine/types';
import { useI18n } from '../i18n/context';
import { ResultTable, type PickMode } from './ResultTable';
import './spotStep.css';

/**
 * Экран шага `spot`: готовый отчёт, который вот-вот уйдёт директору, клетки таблицы и подвала
 * отмечаются касанием, «Проверить» сверяет отметки с дефектами, «Всё в порядке» говорит, что дефектов нет.
 *
 * Таблицу рисует ResultTable в режиме касания: полосы, скролл и карточки на узком экране те же, что у
 * результата запроса. Дефекты движок выводит из `mutate` (engine/spot.ts); здесь только вид и разбор.
 *
 * После проверки разбор показывается по каждой клетке сразу, без повторной попытки: ответ уже раскрыт.
 * Состояние живёт в черновике шага (`StepDraft.spot`), как раскладка у `waves`.
 */

export type SpotStepDef = Extract<TaskStep, { kind: 'spot' }>;

export interface SpotState {
  /** Ключи отмеченных клеток. */
  marks: string[];
  /** Нажата «Всё в порядке». Пока шаг не зачтён, не хранится: проверка сразу фиксирует ответ. */
  allOk: boolean;
}

export const blankSpotState = (): SpotState => ({ marks: [], allOk: false });

interface Props {
  step: SpotStepDef;
  state: SpotState;
  solved: boolean;
  onState: (s: SpotState) => void;
  /** Нажата «Проверить» или «Всё в порядке»: вердикт уже посчитан. */
  onResult: (v: SpotVerdict) => void;
}

export function SpotStep({ step, state, solved, onState, onResult }: Props) {
  const { t, locale } = useI18n();
  const T = t.task;
  const numberLocale = locale === 'ru' ? 'ru-RU' : 'en-US';
  const spec = step.spot;
  const built = useMemo(() => buildSpot(spec), [spec]);

  const data: Preview = useMemo(
    () => ({ columns: spec.head, rows: built.rows, totalRows: built.rows.length }),
    [spec.head, built.rows]
  );
  const num = (v: number) => Math.round(v).toLocaleString(numberLocale);

  const footer = [
    ...(built.footerRows !== null ? [{ key: FOOTER_ROWS, text: T.spotFooterRows(num(built.footerRows)) }] : []),
    ...(built.footerTotal !== null && spec.footer?.total
      ? [{ key: FOOTER_TOTAL, text: T.spotFooterTotal(spec.footer.total, num(built.footerTotal)) }]
      : []),
  ];

  const verdict = solved ? gradeSpot(built, state.marks, state.allOk) : null;
  const states = verdict ? cellStates(built, state.marks, verdict) : undefined;
  const marked = useMemo(() => new Set(state.allOk ? [] : state.marks), [state]);

  const toggle = (key: string) => {
    if (solved) return;
    const next = state.marks.includes(key) ? state.marks.filter((k) => k !== key) : [...state.marks, key];
    onState({ marks: next, allOk: false });
  };

  const submit = (allOk: boolean) => {
    const v = gradeSpot(built, state.marks, allOk);
    onState({ marks: allOk ? [] : state.marks, allOk });
    onResult(v);
  };

  const pick: PickMode = {
    marked,
    states,
    locked: solved,
    onToggle: toggle,
    footer,
    cellAria: T.spotCellAria,
    footerAria: T.spotFooterAria,
  };

  const decoyKeys = built.decoyCells;
  const generalExtra = verdict ? verdict.extra.some((c) => !decoyKeys.includes(c)) : false;

  return (
    <div className="spot">
      {!solved && <p className="muted spot-note">{T.spotNote}</p>}
      <ResultTable data={data} pick={pick} />
      {!solved && (
        <div className="spot-actions">
          <span className="muted spot-count" aria-live="polite">
            {T.spotMarked(state.marks.length)}
          </span>
          <div className="row">
            <button type="button" className="btn" onClick={() => submit(false)} disabled={state.marks.length === 0}>
              {T.spotCheck}
            </button>
            <button type="button" className="btn secondary" onClick={() => submit(true)}>
              {T.spotAllOk}
            </button>
          </div>
        </div>
      )}
      {verdict && (
        <section className="spot-review" aria-label={T.spotReviewTitle}>
          <h4 className="spot-h">{T.spotReviewTitle}</h4>
          {spec.mutate.length === 0 && <p className="muted spot-clean">{T.spotCleanNote}</p>}
          <ul className="spot-list">
            {spec.mutate.map((m) => {
              const found = verdict.found.includes(m.id);
              return (
                <li key={m.id} data-state={found ? 'hit' : 'miss'}>
                  <span className="spot-badge">{found ? `✓ ${T.spotFound}` : `! ${T.spotMissed}`}</span>
                  <span>{fillWhy(m.why, { ...m, value: built.defects.find((d) => d.id === m.id)?.value }, built, locale)}</span>
                </li>
              );
            })}
            {spec.decoys.map((d, i) => {
              const hit = verdict.decoyHits.includes(i);
              return (
                <li key={`decoy-${i}`} data-state={hit ? 'extra' : 'decoy'}>
                  <span className="spot-badge">{hit ? `× ${T.spotExtraTitle}` : T.spotDecoyTitle}</span>
                  <span>{fillWhy(d.why, d, built, locale)}</span>
                </li>
              );
            })}
            {generalExtra && (
              <li data-state="extra">
                <span className="spot-badge">{`× ${T.spotExtraTitle}`}</span>
                <span>{T.spotExtraGeneral}</span>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
