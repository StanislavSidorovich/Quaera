import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { careerAxes, careerEvidence, careerRole, careerRoles, careerStages, stagesOfRole, vacancies } from '../content/career';
import type { CareerStage } from '../content/career';
import { lessonBySkill, packForTrack } from '../content';
import type { Track } from '../content/types';
import { useI18n } from '../i18n/context';
import { FAMILY, openFamilyLink } from '../links';
import { appStorage } from '../guestMode';
import type { Progress } from '../srs/store';
import { AXES, overdueSkills, pacePlan, roleReadiness, skillLevel } from '../career/readiness';
import type { AxisId, Band, Level } from '../career/readiness';
import {
  DEFAULT_ROLE,
  checkedIds,
  emptyCareerState,
  weeklyChanges,
  noteText,
  withNote,
  withRole,
  withToggledEvidence,
  withWeeklySnapshot,
} from '../career/store';
import type { AxisLevels, CareerState } from '../career/store';
import { passedQuizEvidence, quizStatus } from '../career/quiz';
import { withQuizAttempt } from '../career/store';
import { CareerQuiz, useQuizStatusText } from './CareerQuiz';
import { CareerRadar } from './CareerRadar';
import { quizBank } from '../content/careerQuiz';
import { ArchitectureMap } from './ArchitectureMap';
import { RoleCompare } from './RoleCompare';
import { ProcessFigure } from './ProcessFigure';
import { IngestFigure } from './IngestFigure';
import { GoldArtifact, ServeArtifact } from './LayerArtifact';
import { TraceFigure } from './TraceFigure';
import { ForecastFigure } from './ForecastFigure';
import { MetricCard } from './MetricCard';
import { architecture } from '../content/architecture';
import type { Locale } from '../i18n/context';

type Text = Record<Locale, string>;
const TRACKS: Track[] = ['sql', 'model', 'python', 'domain'];
const BANDS: Band[] = ['start', 'prejunior', 'nearly', 'ready'];

/**
 * Статичная врезка «с чем работает роль» под описанием роли: подпись и рисунок.
 * Новой интерактивности здесь нет, рисунки те же, что на карте данных.
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
 * «Путь к роли»: куда целишься, чего не хватает и где в задаче живёт каждая роль.
 *
 * Экран ведёт в задания, а не рисует ещё одну карту: «что добрать» стоит
 * сразу под полосой готовности, и у каждого разрыва есть кнопка навыка.
 * Данные приходят из content/career.ts, формула из career/readiness.ts;
 * здесь только раскладка. Роль, отметки и снимки лежат в `progress.career`
 * и меняются через `onCareerChange`: своего хранилища у экрана нет, иначе
 * оно разошлось бы с тем, что уезжает на второе устройство.
 */
/**
 * Вкладка, на которой экран был в последний раз: уход в занятие из карты
 * и возврат «назад» снова ставят экран заново, и без этого человек
 * возвращался бы на «Путь к роли», потеряв карту.
 */
const TAB_KEY = 'quaera-career-tab';
function readTab(): 'path' | 'map' {
  try {
    return appStorage().getItem(TAB_KEY) === 'path' ? 'path' : 'map';
  } catch {
    return 'map';
  }
}
/* Первый вход открывает карту данных; дальше та вкладка, где человек был, и между запусками. */
let lastTab: 'path' | 'map' = readTab();

export function CareerPage({
  progress,
  onCareerChange,
  onStartSkill,
  onOpenSkill,
  openMap,
  restore,
  fromMap,
  onFromMap,
  onBackToMap,
  forcePath,
}: {
  progress: Progress;
  /** Правка состояния экрана; функция получает текущее и возвращает новое (или то же, если менять нечего). */
  onCareerChange: (update: (s: CareerState) => CareerState) => void;
  /** Практика по навыку (переключает трек, если навык чужой). */
  onStartSkill: (skillId: string) => void;
  /** Карточка приёма навыка. */
  onOpenSkill: (skillId: string) => void;
  /** Открыться на вкладке карты: с главной или по адресу `?roles=map`. */
  openMap?: { layer?: string; trace?: boolean; project?: boolean };
  /** Возврат из занятия: та же вкладка и то же место карты, откуда ушли. */
  restore?: boolean;
  /** Роль открыта с карты: на вкладке «Путь к роли» стоит кнопка возврата. */
  fromMap?: boolean;
  onFromMap: (on: boolean) => void;
  /** Вернуться на карту ровно туда, откуда ушли. */
  onBackToMap: () => void;
  /** Адрес `?roles=path`: перебивает запомненную вкладку. */
  forcePath?: boolean;
}) {
  const { t, locale } = useI18n();
  const c = t.career;

  const state = progress.career ?? emptyCareerState();
  const [openStage, setOpenStage] = useState<string | null>(null);
  const [quizAxis, setQuizAxis] = useState<AxisId | null>(null);
  const [tab, setTabState] = useState<'path' | 'map'>(() => (openMap ? (lastTab = 'map') : forcePath ? (lastTab = 'path') : lastTab));
  const setTab = (next: 'path' | 'map') => {
    lastTab = next;
    try {
      appStorage().setItem(TAB_KEY, next);
    } catch {
      // хранилище недоступно — вкладка запомнится только до перезагрузки
    }
    if (fromMap) onFromMap(false);
    setTabState(next);
  };
  /* Роль, на которую повела ссылка с карты: после смены вкладки к её карточке прокручивается экран. */
  const [roleJump, setRoleJump] = useState<string | null>(null);
  const quizStatusText = useQuizStatusText();
  const narrow = useNarrow();

  const role = careerRole(state.role) ?? careerRole(DEFAULT_ROLE)!;
  /*
   * Засчитанные самопроверки входят в формулу как отметки, но выводятся
   * из истории подходов, а не из галочек: поставить их руками нельзя.
   */
  const checked = useMemo(
    () => new Set([...checkedIds(state), ...passedQuizEvidence(careerEvidence, state.quiz, new Date())]),
    [state]
  );
  /* Отметка-тест оси и непустой банк: цель роли может быть выше единицы, и тогда в разрыве самой отметки нет, а первая ступень всё равно за тестом. */
  const hasQuiz = (axis: AxisId) => careerEvidence.some((e) => e.axis === axis && e.source === 'quiz') && quizBank(axis).length > 0;
  const isQuiz = (id: string) => careerEvidence.find((e) => e.id === id)?.source === 'quiz';
  const openQuiz = (axis: AxisId) => {
    setQuizAxis(axis);
    window.scrollTo({ top: 0 });
  };
  useEffect(() => {
    if (!roleJump || tab !== 'path') return;
    document.getElementById(`career-role-${roleJump}`)?.scrollIntoView({ block: 'start' });
    setRoleJump(null);
  }, [roleJump, tab]);
  const closeQuiz = () => {
    setQuizAxis(null);
    window.scrollTo({ top: 0 });
  };

  /* Названия и уровни навыков — по текущей локали, из всех четырёх паков. */
  const skillInfo = useMemo(() => {
    const map = new Map<string, { title: string; tier: number }>();
    for (const track of TRACKS) {
      for (const s of packForTrack(track, locale)?.skills ?? []) map.set(s.id, { title: s.title, tier: s.tier });
    }
    return map;
  }, [locale]);
  const skillTitle = (id: string) => skillInfo.get(id)?.title ?? id;

  const readiness = useMemo(
    () => roleReadiness(role, careerAxes, progress.skills, careerEvidence, checked, (id) => skillInfo.get(id)?.tier ?? 1),
    [role, progress.skills, checked, skillInfo]
  );

  const levels = useMemo(
    () => Object.fromEntries(readiness.axes.map((a) => [a.axis, a.level])) as AxisLevels,
    [readiness]
  );

  /* Снимок раз в неделю: при открытии, не при каждой отметке. */
  useEffect(() => {
    onCareerChange((s) => {
      const weekly = withWeeklySnapshot(s.weekly, levels, new Date());
      return weekly === s.weekly ? s : { ...s, weekly };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const now = new Date();
  /* Просроченные повторения по осям: уровень не трогаем, только сообщаем. */
  const dueByAxis = useMemo(
    () => Object.fromEntries(careerAxes.map((a) => [a.id, overdueSkills(a, progress.skills, new Date())])) as Record<AxisId, string[]>,
    [progress.skills]
  );
  const skillsLeft = readiness.gaps.reduce((n, g) => n + g.skillsLeft, 0);
  const goalDate = noteText(state.goal);
  const pace = goalDate ? pacePlan(skillsLeft, goalDate, now) : null;
  const ownOutside = role.outside !== undefined && role.ads >= vacancies.minRoleAds;
  const outside = ownOutside ? role.outside! : vacancies.outsideTotal;
  const outsideTotal = ownOutside ? role.ads : vacancies.total;
  const setNote = (field: 'goal' | 'why' | 'obstacle', text: string) => onCareerChange((s) => withNote(s, field, text, new Date()));
  const whyText = noteText(state.why);
  const obstacleText = noteText(state.obstacle);
  const changes = weeklyChanges(state.weekly, levels);
  const axisTitle = (id: AxisId) => careerAxes.find((a) => a.id === id)!.title[locale];
  const levelName = (n: number) => c.levels[n];

  const toggleEvidence = (id: string) => onCareerChange((s) => withToggledEvidence(s, id, new Date()));
  const chooseRole = (id: string) => onCareerChange((s) => (s.role === id ? s : withRole(s, id, new Date())));

  const bandStep = BANDS.indexOf(readiness.band) + 1;
  const evidenceTitle = (id: string) => careerEvidence.find((e) => e.id === id)!.title[locale];

  const skillButton = (id: string, label: string, primary = false) => (
    <button key={id} type="button" className={primary ? 'btn career-skill-btn' : 'btn secondary career-skill-btn'} onClick={() => onStartSkill(id)}>
      {label}
    </button>
  );

  const stageDetail = (stage: CareerStage) => (
    <div className="career-stage-detail">
      <dl className="career-dl">
        <dt>{c.stageWho}</dt>
        <dd>{stage.who.map((r) => careerRole(r)?.title[locale] ?? r).join(', ')}</dd>
        <dt>{c.stageTools}</dt>
        <dd>{stage.tools.join(', ')}</dd>
        <dt>{c.stageAi}</dt>
        <dd>{stage.ai[locale]}</dd>
        <dt>{c.stageCourse}</dt>
        <dd>{stage.courses[locale]}</dd>
      </dl>
      <h3 className="career-h3">{c.stageSkills}</h3>
      {stage.skills.length ? (
        <ul className="career-skill-list">
          {stage.skills.map((id) => {
            const lvl = skillLevel(progress.skills[id]);
            const hasCard = lessonBySkill.has(id);
            return (
              <li key={id}>
                <button type="button" className="link-row career-skill-link" onClick={() => (hasCard ? onOpenSkill(id) : onStartSkill(id))}>
                  <span className="career-dots" role="img" aria-label={c.skillLevelAria(lvl)}>
                    {[1, 2].map((n) => (
                      <i key={n} className={lvl >= n ? 'on' : ''} />
                    ))}
                  </span>
                  {skillTitle(id)}
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">{c.stageNoSkills}</p>
      )}
      {stage.apps.length > 0 && (
        <>
          <h3 className="career-h3">{c.stageApps}</h3>
          <div className="career-apps">
            {FAMILY.filter((f) => stage.apps.includes(f.key)).map((f) => (
              <a
                key={f.key}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => openFamilyLink(e.currentTarget, e.nativeEvent, f.key)}
              >
                {{ model: t.nav.familyModel, flow: t.nav.familyFlow, pandas: t.nav.familyPandas, lab: t.nav.familyLab }[f.key]} ↗
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const chosenStage = careerStages.find((s) => s.id === openStage);

  if (quizAxis) {
    return (
      <div className="settings-column career-page">
        <CareerQuiz
          axis={quizAxis}
          attempts={state.quiz}
          onFinish={(attempt) => onCareerChange((s) => withQuizAttempt(s, attempt))}
          onClose={closeQuiz}
        />
      </div>
    );
  }

  return (
    <div className={`settings-column career-page${tab === 'map' ? ' career-wide' : ''}`}>
      <div className="tabs career-tabs" role="group" aria-label={c.tabsAria}>
        <button type="button" aria-pressed={tab === 'map'} onClick={() => setTab('map')}>
          {c.tabMap}
        </button>
        <button type="button" aria-pressed={tab === 'path'} onClick={() => setTab('path')}>
          {c.tabPath}
        </button>
      </div>

      {tab === 'path' && fromMap && (
        <button type="button" className="btn secondary career-back-map" onClick={onBackToMap}>
          ← {c.map.backToMap}
        </button>
      )}

      {tab === 'map' && (
        <ArchitectureMap
          initialLayer={openMap?.layer}
          startTrace={openMap?.trace}
          startProject={openMap?.project}
          restore={restore}
          skills={progress.skills}
          skillTitle={skillTitle}
          onStartSkill={onStartSkill}
          onOpenRole={(id) => {
            setRoleJump(id);
            lastTab = 'path';
            setTabState('path');
            onFromMap(true);
          }}
        />
      )}

      {tab === 'path' && (
        <>
      <p className="intro-lead">{c.lead}</p>

      <section className="card career-target">
        <h2 id="career-target-label">{c.targetLabel}</h2>
        <p className="muted career-source">{c.sourceNote(vacancies.total)}</p>
        <div className="career-roles-pick" role="radiogroup" aria-labelledby="career-target-label">
          {careerRoles.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={r.id === role.id}
              className={`pill career-role-pill${r.id === role.id ? ' on' : ''}`}
              onClick={() => chooseRole(r.id)}
            >
              {r.title[locale]}
            </button>
          ))}
        </div>
        <p className="career-does">{role.does[locale]}</p>
        <p className="muted career-source">
          {c.roleTargets}: {c.sourceRole(role.ads)}.
        </p>
        <RoleCompare roleId={role.id} levels={levels} />
        {ROLE_INSET[role.id] && (
          <div className="career-inset">
            <p className="muted career-process-lead">{ROLE_INSET[role.id].lead[locale]}</p>
            {ROLE_INSET[role.id].figure}
          </div>
        )}

        <div className="career-band" role="img" aria-label={c.bandAria(c.bands[readiness.band], bandStep)}>
          {BANDS.map((b, i) => (
            <span key={b} className={i < bandStep ? 'on' : ''} />
          ))}
        </div>
        <p className="career-band-label">
          <strong>{c.bands[readiness.band]}</strong>
          <span className="muted">{c.bandCaption(readiness.met, readiness.total)}</span>
        </p>

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
          <p className="muted career-outside-basis">{ownOutside ? c.outsideBasisRole(role.ads) : c.outsideBasisAll(vacancies.total)}</p>
        </div>

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
            <strong>{c.weekTitle}.</strong>{' '}
            {changes.length
              ? changes.map((ch) => c.weekChange(axisTitle(ch.axis), ch.from, ch.to)).join('; ')
              : c.weekNone}
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
        <h2>{c.gapsTitle}</h2>
        {readiness.gaps.length === 0 ? (
          <p className="muted">{c.gapsEmpty}</p>
        ) : (
          <ul className="career-gaps">
            {readiness.gaps.slice(0, 3).map((g) => (
              <li key={g.axis}>
                <p className="career-gap-line">{c.gapLine(axisTitle(g.axis), levelName(g.have), levelName(g.need))}</p>
                {g.skills.length > 0 && (
                  <div className="career-gap-actions">
                    {g.skills.map((id, i) => skillButton(id, c.practice(skillTitle(id)), i === 0))}
                  </div>
                )}
                {levels[g.axis] < 1 && hasQuiz(g.axis) && (
                  <>
                    <p className="muted career-gap-note">{c.quiz.gapNote}</p>
                    <button
                      type="button"
                      className="btn secondary career-skill-btn"
                      disabled={!quizStatus(state.quiz, g.axis, new Date()).canStart}
                      onClick={() => openQuiz(g.axis)}
                    >
                      {c.quiz.gapButton(axisTitle(g.axis))}
                    </button>
                    {!quizStatus(state.quiz, g.axis, new Date()).canStart && (
                      <p className="muted career-gap-note">{quizStatusText(state.quiz, g.axis, new Date()).slice(-1)[0]}</p>
                    )}
                  </>
                )}
                {g.evidence.filter((id) => !isQuiz(id)).length > 0 && (
                  <>
                    <p className="muted career-gap-note">{g.skills.length ? c.evidenceToCheck : c.beyondTrainer}</p>
                    <ul className="career-gap-evidence">
                      {g.evidence.filter((id) => !isQuiz(id)).map((id) => (
                        <li key={id}>{evidenceTitle(id)}</li>
                      ))}
                    </ul>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>{c.nowTitle}</h2>
        <p className="muted">{c.nowLead}</p>
        <CareerRadar
          axes={readiness.axes.map((a) => ({
            id: a.axis,
            label: careerAxes.find((x) => x.id === a.axis)!.short[locale],
            have: a.level,
            target: a.target,
            due: dueByAxis[a.axis].length,
          }))}
          ariaLabel={c.radarAria(
            role.title[locale],
            readiness.axes
              .map((a) => c.radarRow(axisTitle(a.axis), levelName(a.level), a.target > 0 ? String(a.target) : c.radarNoGoal, dueByAxis[a.axis].length))
              .join(' ')
          )}
          legend={{ you: c.radarYou, goal: c.radarGoal, due: c.radarDue }}
        />
        <ul className="career-axes">
          {readiness.axes.map((a) => {
            const def = careerAxes.find((x) => x.id === a.axis)!;
            const evs = careerEvidence.filter((e) => e.axis === a.axis);
            return (
              <li key={a.axis} className="career-axis">
                <div className="career-axis-head">
                  <strong>{def.title[locale]}</strong>
                  <span className="muted">{c.axisLevel(levelName(a.level), a.target > 0 ? levelName(a.target) : null)}</span>
                </div>
                <div className="career-level-bar" aria-hidden>
                  {[1, 2, 3].map((n) => (
                    <span key={n} className={`${a.level >= n ? 'on' : ''}${a.target === n ? ' target' : ''}`} />
                  ))}
                </div>
                <p className="muted career-axis-count">{c.axisCount(a.atLeast1, a.total, a.atLeast2)}</p>
                {dueByAxis[a.axis].length > 0 && (
                  <p className="career-axis-due">
                    <span>{c.dueNote(dueByAxis[a.axis].length)}</span>
                    <button type="button" className="btn secondary career-skill-btn" onClick={() => onStartSkill(dueByAxis[a.axis][0])}>
                      {c.dueButton}
                    </button>
                  </p>
                )}
                <p className="muted career-axis-note">{def.note[locale]}</p>
                {evs.length > 0 && (
                  <ul className="career-evidence">
                    {evs.map((e) =>
                      e.source === 'quiz' ? (
                        <li key={e.id} className="career-quiz-row">
                          <span>{e.title[locale]}</span>
                          {quizStatusText(state.quiz, e.axis, new Date()).map((line) => (
                            <small key={line} className="muted">
                              {line}
                            </small>
                          ))}
                          {!quizStatus(state.quiz, e.axis, new Date()).passed && quizBank(e.axis).length > 0 && (
                            <button
                              type="button"
                              className="btn secondary"
                              disabled={!quizStatus(state.quiz, e.axis, new Date()).canStart}
                              onClick={() => openQuiz(e.axis)}
                            >
                              {c.quiz.start}
                            </button>
                          )}
                        </li>
                      ) : (
                        <li key={e.id}>
                          <label>
                            <input type="checkbox" checked={checked.has(e.id)} onChange={() => toggleEvidence(e.id)} />
                            <span>
                              {e.title[locale]}
                              {a.evidenceCapped.includes(e.id) && <small className="career-capped"> {c.evidenceCapped}</small>}
                            </span>
                          </label>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
        <p className="muted career-foot">
          {c.evidenceNote} {c.storageNote}
        </p>
      </section>

      <section className="card">
        <h2>{c.stagesTitle}</h2>
        <p className="muted">{c.stagesLead}</p>
        {narrow ? (
          <ol className="career-stages career-stages-v">
            {careerStages.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="career-stage-btn"
                  aria-expanded={openStage === s.id}
                  onClick={() => setOpenStage(openStage === s.id ? null : s.id)}
                >
                  <span className="career-stage-n">{i + 1}</span>
                  {s.title[locale]}
                </button>
                {openStage === s.id && stageDetail(s)}
              </li>
            ))}
          </ol>
        ) : (
          <>
            <ol className="career-stages career-stages-h">
              {careerStages.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="career-stage-btn"
                    aria-expanded={openStage === s.id}
                    aria-label={c.stageOpen(i + 1, s.title[locale])}
                    onClick={() => setOpenStage(openStage === s.id ? null : s.id)}
                  >
                    <span className="career-stage-n">{i + 1}</span>
                    <span className="career-stage-name">{s.title[locale]}</span>
                  </button>
                </li>
              ))}
            </ol>
            {chosenStage && stageDetail(chosenStage)}
          </>
        )}
      </section>

      <section className="card">
        <h2>{c.rolesTitle}</h2>
        <div className="career-role-cards">
          {careerRoles.map((r) => (
            <article key={r.id} id={`career-role-${r.id}`} className="career-role-card">
              <h3>{r.title[locale]}</h3>
              <dl className="career-dl">
                <dt>{c.roleDoes}</dt>
                <dd>{r.does[locale]}</dd>
                <dt>{c.roleStages}</dt>
                <dd>{stagesOfRole(r.id).map((s) => s.title[locale]).join(', ')}</dd>
                <dt>{c.roleTargets}</dt>
                <dd>
                  {AXES.filter((a) => r.targets[a] > 0)
                    .map((a) => `${axisTitle(a)} ${r.targets[a] as Level}`)
                    .join(', ')}
                </dd>
                <dt>{c.roleHybrid}</dt>
                <dd>{r.hybrid[locale]}</dd>
                <dt>{c.roleAi}</dt>
                <dd>{r.ai[locale]}</dd>
              </dl>
              <button
                type="button"
                className="btn secondary"
                disabled={r.id === role.id}
                onClick={() => {
                  chooseRole(r.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {r.id === role.id ? c.roleChosen : c.roleChoose}
              </button>
            </article>
          ))}
        </div>
      </section>
        </>
      )}
    </div>
  );
}

/** Узкий экран: этапы встают столбиком, и тап раскрывает подробности под этапом. */
function useNarrow(): boolean {
  const query = '(max-width: 640px)';
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}
