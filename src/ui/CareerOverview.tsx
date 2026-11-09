import { useEffect, useRef, useState } from 'react';
import { careerAxes, careerAxis, careerRoles, vacancies } from '../content/career';
import type { CareerRole } from '../content/career';
import { AXES } from '../career/readiness';
import type { AxisId, AxisReading, Level, RoleReadiness } from '../career/readiness';
import { noteText, weeklyChanges, withNote } from '../career/store';
import type { AxisLevels, CareerState } from '../career/store';
import { pacePlan } from '../career/readiness';
import { useI18n } from '../i18n/context';
import { CareerAxisBars, CareerRadar } from './CareerRadar';
import type { RadarAxis } from './CareerRadar';
import { EvidenceList, StepList, useCountedLine } from './careerSteps';
import type { StepCtx } from './careerSteps';
import { CareerStages } from './CareerStages';
import type { Progress } from '../srs/store';
import './careerOverview.css';
import './careerPick.css';

/**
 * Обзор «Пути к роли»: вы сейчас (паутинка и строка выбранной оси), плитки
 * семи ролей и ваша цель. Подробности роли (что ищут, разрыв по осям,
 * где подтянуть) живут на странице роли, а здесь только сравнить и выбрать.
 */
export function CareerOverview({
  progress,
  state,
  onCareerChange,
  ctx,
  readings,
  dueByAxis,
  readinessByRole,
  chosenRole,
  levels,
  onOpenRole,
  onChooseRole,
  onOpenSkill,
}: {
  progress: Progress;
  state: CareerState;
  onCareerChange: (update: (s: CareerState) => CareerState) => void;
  ctx: StepCtx;
  readings: Record<AxisId, AxisReading>;
  dueByAxis: Record<AxisId, string[]>;
  readinessByRole: Record<string, RoleReadiness>;
  chosenRole: CareerRole;
  levels: AxisLevels;
  onOpenRole: (id: string) => void;
  onChooseRole: (id: string) => void;
  onOpenSkill: (id: string) => void;
}) {
  const { t, locale } = useI18n();
  const c = t.career;
  const [active, setActive] = useState<AxisId | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const levelName = (n: number) => c.levels[n];
  const axisTitle = (id: AxisId) => careerAxis(id).title[locale];
  const chosen = state.roleAt !== null;

  /* Панель оси стоит под рисунком: на узком экране без прокрутки она осталась бы за краем. */
  useEffect(() => {
    if (active) panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [active]);

  const radarAxes = (role?: CareerRole): RadarAxis[] =>
    AXES.map((id) => ({
      id,
      label: careerAxis(id).short[locale],
      have: readings[id].level,
      progress: readings[id].progress,
      target: (role ? role.targets[id] : 0) as Level,
      due: role ? 0 : dueByAxis[id].length,
    }));
  const youAxes = chosen ? radarAxes(chosenRole).map((a) => ({ ...a, due: dueByAxis[a.id].length })) : radarAxes();
  const toggle = (id: AxisId) => setActive((cur) => (cur === id ? null : id));

  const mine = readinessByRole[chosenRole.id];
  const skillsLeft = mine.gaps.reduce((n, g) => n + g.skillsLeft, 0);
  const goalDate = noteText(state.goal);
  const pace = goalDate ? pacePlan(skillsLeft, goalDate, new Date()) : null;
  const setNote = (field: 'goal' | 'why' | 'obstacle', text: string) => onCareerChange((s) => withNote(s, field, text, new Date()));
  const whyText = noteText(state.why);
  const obstacleText = noteText(state.obstacle);
  const changes = weeklyChanges(state.weekly, levels);
  const BANDS = ['start', 'prejunior', 'nearly', 'ready'] as const;
  const bandStep = BANDS.indexOf(mine.band) + 1;

  return (
    <>
      <section className="card">
        <h2>{c.nowTitle}</h2>
        <p className="muted">{c.ov.nowLead}</p>
        <div className="cp-pick" role="group" aria-label={c.ov.pickGoal}>
          <span className="cp-pick-label">{c.ov.pickGoal}</span>
          <div className="cp-pick-chips">
            {careerRoles.map((r) => (
              <button key={r.id} type="button" className="cp-chip" aria-pressed={chosen && r.id === chosenRole.id} onClick={() => onChooseRole(r.id)}>
                {r.title[locale]}
              </button>
            ))}
          </div>
        </div>
        <CareerRadar
          axes={youAxes}
          hideGoal={!chosen}
          onAxis={toggle}
          activeAxis={active}
          ariaLabel={c.ov.radarAria(AXES.map((id) => c.ov.axisRow(axisTitle(id), levelName(readings[id].level))).join(' '))}
          legend={{ you: c.radarYou, goal: chosen ? c.ov.goalLegend(chosenRole.title[locale]) : c.radarGoal, due: c.radarDue, rings: c.radarRings }}
          ringNames={[c.levels[1], c.levels[2], c.levels[3]]}
        />
        <CareerAxisBars
          axes={youAxes}
          hideGoal={!chosen}
          onSelect={toggle}
          activeAxis={active}
          fullLabel={axisTitle}
          levelName={levelName}
          cellAria={(axis, level) => c.ov.barCell(axis, level)}
          ariaLabel={c.radarBarsAria}
        />
        <p className="muted co-hint">{c.ov.pickAxis}</p>
        {active && (
          <div ref={panelRef} className="co-axis" role="region" aria-label={c.ov.axisPanel(axisTitle(active))}>
            <AxisPanel axis={active} reading={readings[active]} due={dueByAxis[active]} ctx={ctx} onClose={() => setActive(null)} />
          </div>
        )}
        <p className="muted career-foot">
          {c.evidenceNote} {c.storageNote}
        </p>
      </section>

      <section className="card">
        <h2>{c.ov.goalTitle}</h2>
        {!chosen ? (
          <p className="muted">{c.ov.goalNone}</p>
        ) : (
          <>
            <p className="co-goal-role">
              <strong>{chosenRole.title[locale]}</strong>
            </p>
            <div className="career-band" role="img" aria-label={c.bandAria(c.bands[mine.band], bandStep)}>
              {BANDS.map((b, i) => (
                <span key={b} className={i < bandStep ? 'on' : ''} />
              ))}
            </div>
            <p className="career-band-label">
              <strong>{c.bands[mine.band]}</strong>
              <span className="muted">{c.bandCaption(mine.met, mine.total)}</span>
            </p>
            <button type="button" className="btn secondary" onClick={() => onOpenRole(chosenRole.id)}>
              {c.ov.goalOpen} →
            </button>
          </>
        )}

        <div className="career-goal">
          <label className="career-field-label" htmlFor="career-goal-date">
            {c.goalLabel} <span className="muted">({c.goalOptional})</span>
          </label>
          <div className="career-goal-row">
            <input id="career-goal-date" type="date" className="career-date" value={goalDate} onChange={(e) => setNote('goal', e.target.value)} />
            {goalDate && (
              <button type="button" className="btn secondary" onClick={() => setNote('goal', '')}>
                {c.goalClear}
              </button>
            )}
          </div>
          {goalDate && (
            <p className="career-pace" aria-live="polite">
              {!pace ? c.goalPast : skillsLeft === 0 ? c.goalNoSkills : c.goalPace(pace.weeks, pace.perWeek)}
            </p>
          )}
        </div>

        <div className="career-notes">
          <label className="career-field-label" htmlFor="career-why">
            {c.whyLabel} <span className="muted">({c.goalOptional})</span>
          </label>
          <textarea
            key={state.why?.at ?? 'why'}
            id="career-why"
            className="career-text"
            rows={2}
            maxLength={280}
            placeholder={c.whyHint}
            defaultValue={whyText}
            onBlur={(e) => setNote('why', e.target.value)}
          />
          <label className="career-field-label" htmlFor="career-obstacle">
            {c.obstacleLabel} <span className="muted">({c.goalOptional})</span>
          </label>
          <textarea
            key={state.obstacle?.at ?? 'obstacle'}
            id="career-obstacle"
            className="career-text"
            rows={2}
            maxLength={280}
            placeholder={c.obstacleHint}
            defaultValue={obstacleText}
            onBlur={(e) => setNote('obstacle', e.target.value)}
          />
        </div>

        {changes && (
          <p className="career-week muted">
            <strong>{c.weekTitle}.</strong> {changes.length ? changes.map((ch) => c.weekChange(axisTitle(ch.axis), ch.from, ch.to)).join('; ') : c.weekNone}
          </p>
        )}
        {(whyText || obstacleText) && (
          <ul className="career-week-notes" aria-label={c.notesTitle}>
            {whyText && (
              <li>
                <strong>{c.whyLabel}.</strong> {whyText}
              </li>
            )}
            {obstacleText && (
              <li>
                <strong>{c.obstacleLabel}.</strong> {obstacleText}
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>{c.rolesTitle}</h2>
        <p className="muted">{c.ov.rolesLead}</p>
        <p className="muted career-source">{c.sourceNote(vacancies.total, vacancies.linkedin, vacancies.boards)}</p>
        <div className="co-tiles">
          {careerRoles.map((r) => {
            const rr = readinessByRole[r.id];
            const left = c.ov.stepsLeft(rr.total - rr.met);
            const isGoal = chosen && r.id === chosenRole.id;
            return (
              <article key={r.id} className={`co-tile${isGoal ? ' on' : ''}`} aria-label={c.ov.tileAria(r.title[locale], left)}>
                <h3>
                  {r.title[locale]}
                  {isGoal && <span className="pill co-tile-pill">{c.roleChosen}</span>}
                </h3>
                <div className="co-tile-body">
                  <CareerRadar mini axes={radarAxes(r)} ariaLabel="" legend={{ you: '', goal: '', due: '', rings: '' }} ringNames={['', '', '']} />
                  <div>
                    <p className="co-tile-left">{left}</p>
                    <p className="muted co-tile-does">{r.does[locale]}</p>
                  </div>
                </div>
                <p className="co-tile-asked">
                  <span className="muted">{c.ov.asked}:</span> {r.ask.map(([id]) => vacancies.skillLabels[id][locale]).join(', ')}
                </p>
                {r.lowData && <p className="muted co-tile-low">{c.rp.lowData}: {c.sourceRole(r.ads)}</p>}
                <div className="co-tile-actions">
                  <button type="button" className="btn" onClick={() => onOpenRole(r.id)}>
                    {c.ov.openRole} →
                  </button>
                  <button type="button" className="btn secondary" disabled={isGoal} onClick={() => onChooseRole(r.id)}>
                    {isGoal ? c.roleChosen : c.roleChoose}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <p className="muted career-foot">{c.ov.stepsNote}</p>
      </section>

      <CareerStages skills={progress.skills} skillTitle={ctx.skillTitle} onStartSkill={ctx.onStartSkill} onOpenSkill={onOpenSkill} />
    </>
  );
}

/** Строка одной оси: что значит ваш уровень, что дальше, отметки и как ось видна в вакансиях. */
function AxisPanel({ axis, reading, due, ctx, onClose }: { axis: AxisId; reading: AxisReading; due: string[]; ctx: StepCtx; onClose: () => void }) {
  const { t, locale } = useI18n();
  const c = t.career;
  const counted = useCountedLine();
  const def = careerAxes.find((a) => a.id === axis)!;
  const have = reading.level;
  const next = have < 3 ? def.levels[have] : null;
  return (
    <>
      <div className="co-axis-head">
        <h3>{def.title[locale]}</h3>
        <button type="button" className="btn secondary" onClick={onClose}>
          {c.ov.close}
        </button>
      </div>
      <p className="muted career-axis-count">{c.axisCount(reading.atLeast1, reading.total, reading.atLeast2)}</p>
      <p>
        <strong>{c.ov.nowLevel(c.levels[have])}.</strong> {have === 0 ? c.ov.notStarted : def.levels[have - 1].does[locale]}
      </p>
      {next ? (
        <>
          <p>
            <strong>{c.ov.nextLevel(c.levels[have + 1])}.</strong> {next.does[locale]}
          </p>
          <p className="muted co-counted">
            {c.rp.counted}: {counted(axis, next.level)}.
          </p>
          <h4 className="co-h4">{c.ov.stepsHeading}</h4>
          <StepList steps={next.steps} axis={axis} ctx={ctx} />
        </>
      ) : (
        <p className="muted">{c.ov.top}</p>
      )}
      {due.length > 0 && (
        <p className="career-axis-due">
          <span>{c.dueNote(due.length)}</span>
          <button type="button" className="btn secondary career-skill-btn" onClick={() => ctx.onStartSkill(due[0])}>
            {c.dueButton}
          </button>
        </p>
      )}
      <h4 className="co-h4">{c.ov.marksHeading}</h4>
      <EvidenceList axis={axis} reading={reading} ctx={ctx} />
      <p className="muted career-axis-note">{def.note[locale]}</p>
      <p className="muted career-axis-note">
        {c.ov.marketHeading}: {def.market[locale]}
      </p>
    </>
  );
}
