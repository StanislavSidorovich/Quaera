import { careerAxis, stagesOfRole, vacancies, GRADE_GROUPS, levelFor } from '../content/career';
import type { CareerRole } from '../content/career';
import { AXES } from '../career/readiness';
import type { AxisId, AxisReading, Level, RoleReadiness } from '../career/readiness';
import { useI18n } from '../i18n/context';
import { architecture } from '../content/architecture';
import { CareerRadar } from './CareerRadar';
import { RoleCompare } from './RoleCompare';
import { CeilingNote, LegacyNote, StepList, useCountedLine } from './careerSteps';
import type { StepCtx } from './careerSteps';
import { ProcessFigure } from './ProcessFigure';
import { IngestFigure } from './IngestFigure';
import { GoldArtifact, ServeArtifact } from './LayerArtifact';
import { TraceFigure } from './TraceFigure';
import { ForecastFigure } from './ForecastFigure';
import { MetricCard } from './MetricCard';
import type { ReactNode } from 'react';
import type { Locale } from '../i18n/context';
import './careerRole.css';

type Text = Record<Locale, string>;

/**
 * Статичная врезка «с чем работает роль»: подпись и рисунок. Рисунки те же,
 * что на карте данных, новой интерактивности здесь нет.
 */
const A = architecture.artifacts;
const ROLE_INSET: Record<string, { lead: Text; figure: ReactNode }> = {
  ba: { lead: A.process.careerLead, figure: <ProcessFigure /> },
  de: { lead: A.ingest.careerLead, figure: <IngestFigure /> },
  ae: {
    lead: A.gold.careerLead,
    figure: (
      <div className="arch-art">
        <GoldArtifact />
      </div>
    ),
  },
  bi: {
    lead: A.serve.careerLead,
    figure: (
      <div className="arch-art">
        <ServeArtifact />
      </div>
    ),
  },
  da: { lead: architecture.trace.figure.careerLead, figure: <TraceFigure kind="split" /> },
  ds: { lead: A.forecastAccuracy.careerLead, figure: <ForecastFigure /> },
  gov: { lead: A.metricCard.careerLead, figure: <MetricCard /> },
};

/**
 * Страница одной роли: что ищут компании (обобщённые доли по вакансиям Португалии),
 * разрыв по каждой оси с критериями уровней и шагами, сравнение с соседней ролью.
 * Роль здесь не обязательно выбранная цель: готовность считается по этой роли.
 */
export function CareerRolePage({
  role,
  readiness,
  readings,
  levels,
  isGoal,
  ctx,
  backLabel,
  onBack,
  onChoose,
}: {
  role: CareerRole;
  readiness: RoleReadiness;
  readings: Record<AxisId, AxisReading>;
  levels: Record<AxisId, number>;
  isGoal: boolean;
  ctx: StepCtx;
  backLabel: string;
  onBack: () => void;
  onChoose: () => void;
}) {
  const { t, locale } = useI18n();
  const c = t.career;
  const counted = useCountedLine();
  const levelName = (n: number) => c.levels[n];
  const inset = ROLE_INSET[role.id];
  const BANDS = ['start', 'prejunior', 'nearly', 'ready'] as const;
  const bandStep = BANDS.indexOf(readiness.band) + 1;
  const ownOutside = role.outside !== undefined && role.ads >= vacancies.minRoleAds;
  const outside = ownOutside ? role.outside! : vacancies.outsideTotal;
  const outsideTotal = ownOutside ? role.ads : vacancies.total;
  const label = (id: string) => vacancies.skillLabels[id]?.[locale] ?? id;
  const radar = AXES.map((id) => ({
    id,
    label: careerAxis(id).short[locale],
    have: readings[id].level,
    progress: readings[id].progress,
    target: role.targets[id] as Level,
    due: 0,
  }));
  const neededAxes = readiness.axes.filter((a) => a.target > 0);
  const gapOrder = [...neededAxes].sort((a, b) => Number(a.met) - Number(b.met));
  const unneeded = readiness.axes.filter((a) => a.target === 0).map((a) => careerAxis(a.axis).title[locale]);

  return (
    <>
      <button type="button" className="btn secondary career-back-map" onClick={onBack}>
        ← {backLabel}
      </button>

      <section className="card career-target">
        <h2>{role.title[locale]}</h2>
        <p className="career-does">{role.does[locale]}</p>
        <div className="crp-head">
          <div>
            <div className="career-band" role="img" aria-label={c.bandAria(c.bands[readiness.band], bandStep)}>
              {BANDS.map((b, i) => (
                <span key={b} className={i < bandStep ? 'on' : ''} />
              ))}
            </div>
            <p className="career-band-label">
              <strong>{c.bands[readiness.band]}</strong>
              <span className="muted">{c.bandCaption(readiness.met, readiness.total)}</span>
            </p>
            <p className="muted crp-legend">{c.ov.stepsLeft(readiness.total - readiness.met)}.</p>
            <button type="button" className={isGoal ? "btn crp-chosen" : "btn"} disabled={isGoal} onClick={onChoose}>
              {isGoal ? c.roleChosen : c.rp.choose}
            </button>
          </div>
        </div>
        <CareerRadar
          axes={radar}
          ariaLabel={c.radarAria(role.title[locale], AXES.map((id) => c.ov.axisRow(careerAxis(id).title[locale], levelName(readings[id].level))).join(' '))}
          legend={{ you: c.radarYou, goal: c.ov.goalLegend(role.title[locale]), due: c.radarDue, rings: c.radarRings }}
          ringNames={[c.levels[1], c.levels[2], c.levels[3]]}
        />
        <dl className="career-dl">
          <dt>{c.roleStages}</dt>
          <dd>{stagesOfRole(role.id).map((s) => s.title[locale]).join(', ')}</dd>
          <dt>{c.roleHybrid}</dt>
          <dd>{role.hybrid[locale]}</dd>
          <dt>{c.roleAi}</dt>
          <dd>{role.ai[locale]}</dd>
        </dl>
        {inset && (
          <div className="career-inset">
            <p className="muted career-process-lead">{inset.lead[locale]}</p>
            {inset.figure}
          </div>
        )}
      </section>

      <section className="card">
        <h2>{c.rp.asksTitle}</h2>
        <p className="muted">{c.rp.asksLead(role.ads)}</p>
        {role.lowData && <p className="muted career-source">{c.lowDataNote(role.ads)}</p>}
        <ul className="crp-asks">
          {role.ask.map(([id, n]) => (
            <li key={id}>{c.rp.askLine(label(id), n, role.ads)}</li>
          ))}
        </ul>

        <h3 className="career-h3">{c.rp.gradesTitle}</h3>
        <div className="crp-grades">
          {GRADE_GROUPS.map((g) => {
            const cell = role.grades[g];
            const thin = cell.n < vacancies.minRoleAds;
            return (
              <div key={g} className={`crp-grade${thin ? ' thin' : ''}`}>
                <strong>{c.rp.gradeNames[g]}</strong>
                <span className="muted">{c.rp.gradeN(cell.n)}</span>
                {thin ? (
                  <em className="crp-low">{c.rp.lowData}</em>
                ) : (
                  <ul>
                    {cell.top.map(([id, n]) => (
                      <li key={id}>{c.rp.askLine(label(id), n, cell.n)}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
        <p className="muted career-foot">{c.rp.gradeNote}</p>

        <div className="career-outside">
          <h3 className="career-h3">{c.outsideTitle}</h3>
          <p className="muted career-outside-lead">{c.outsideLead}</p>
          <ul className="career-outside-list">
            {(['excel', 'english', 'comms'] as const).map((k) => (
              <li key={k}>
                <span>{c.outsideItems[k]}</span>
                <strong>{c.outsideShare(outside[k], outsideTotal)}</strong>
              </li>
            ))}
          </ul>
          <p className="career-excel">
            {c.excelNote(vacancies.excelEntry.hit, vacancies.excelEntry.of)}{' '}
            <a href="https://learn.microsoft.com/training/browse/?products=excel" target="_blank" rel="noreferrer">
              {c.learnPrefix} {c.excelLearn} ↗
            </a>
          </p>
          <p className="muted career-outside-basis">{ownOutside ? c.outsideBasisRole(role.ads) : c.outsideBasisAll(vacancies.total)}</p>
        </div>
        <p className="muted career-source">{c.sourceNote(vacancies.total, vacancies.linkedin, vacancies.boards, vacancies.roleTotal)}</p>
      </section>

      <section className="card">
        <h2>{c.rp.gapsTitle}</h2>
        <p className="muted">{c.rp.gapsLead}</p>
        {readiness.gaps.length === 0 && <p className="muted">{c.rp.emptyGaps}</p>}
        <ul className="crp-axes">
          {gapOrder.map((a) => {
            const def = careerAxis(a.axis);
            return (
              <li key={a.axis} className="crp-axis">
                <div className="career-axis-head">
                  <strong>{def.title[locale]}</strong>
                  <span className={a.met ? 'crp-ok' : 'muted'}>{a.met ? c.rp.axisMet(levelName(a.level)) : c.rp.axisGap(levelName(a.level), levelName(a.target))}</span>
                </div>
                <LegacyNote reading={a} />
                <ol className="crp-levels">
                  {def.levels.map((l) => {
                    const reached = a.level >= l.level;
                    const isTarget = a.target === l.level;
                    const inGap = !reached && l.level <= a.target;
                    return (
                      <li key={l.level} className={`crp-level${reached ? ' reached' : ''}${isTarget ? ' target' : ''}`}>
                        <p className="crp-level-head">
                          <strong>{c.rp.stepLevel(l.level, levelName(l.level))}</strong>
                          {a.level + 1 === l.level && !reached && <span className="crp-tag">{c.rp.youHere}</span>}
                          {reached && <span className="crp-tag done">{c.rp.reached}</span>}
                          {isTarget && <span className="crp-tag goal">{c.rp.goalHere}</span>}
                        </p>
                        <p>{levelFor(l, role.id).does[locale]}</p>
                        {inGap && (
                          <>
                            <p className="muted co-counted">
                              {c.rp.counted}: {counted(a.axis, l.level)}.
                            </p>
                            <CeilingNote axis={a.axis} level={l.level} />
                            <StepList steps={levelFor(l, role.id).steps} axis={a.axis} ctx={ctx} />
                          </>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </li>
            );
          })}
        </ul>
        {Object.entries(role.targetNotes ?? {}).map(([ax, note]) => (
          <p key={ax} className="muted career-target-notes">
            {c.targetNote(careerAxis(ax as AxisId).title[locale], note[locale])}
          </p>
        ))}
        {unneeded.length > 0 && <p className="muted career-foot">{c.rp.notNeededList(unneeded.join(', '))}</p>}
      </section>

      <section className="card">
        <h2>{c.rp.compareTitle}</h2>
        <RoleCompare roleId={role.id} levels={levels} defaultOther={role.neighbor} open />
      </section>

      <button type="button" className="btn secondary career-back-map" onClick={onBack}>
        ← {backLabel}
      </button>
    </>
  );
}

