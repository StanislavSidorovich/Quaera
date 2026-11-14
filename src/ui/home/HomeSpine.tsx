import { useMemo } from 'react';
import { packForTrack, trackBySkill } from '../../content';
import type { Pack, Track } from '../../content/types';
import { architecture } from '../../content/architecture';
import type { ArchLayer } from '../../content/architecture';
import { careerRole } from '../../content/career';
import { storyCampaign, storyClosesWeek, storyWeekOf } from '../../content/storymode';
import { useI18n } from '../../i18n/context';
import { FAMILY, FLOW_KAIYO, LAB_BUILD, LAB_PRACTICE_SQL, STRATASQL_MODEL, openFamilyLink } from '../../links';
import { estimateMinutes, layerStatuses, nextStep, type NextStep } from '../../home/nextStep';
import { mastery } from '../../srs/scheduler';
import type { Progress } from '../../srs/store';
import { IconBook, IconCompass, IconFlask, IconTable } from '../Sidebar';
import { TRACK_ORDER } from './HomeParts';
import { roleGoal } from '../RoleStrip';
import './homeSpine.css';
import './homeStatus.css';

import markLab from '../../../family/marks/lab.svg';
import markModel from '../../../family/marks/model.svg';
import markFlow from '../../../family/marks/flow.svg';
import markPandas from '../../../family/marks/pandas.svg';

const FAMILY_MARKS = { lab: markLab, model: markModel, flow: markFlow, pandas: markPandas } as const;
const FAMILY_NAME_KEY = { lab: 'familyNameLab', model: 'familyNameModel', flow: 'familyNameFlow', pandas: 'familyNamePandas' } as const;
const FAMILY_DESC_KEY = { lab: 'familyDescLab', model: 'familyDescModel', flow: 'familyDescFlow', pandas: 'familyDescPandas' } as const;
const FAMILY_WHO_KEY = { lab: 'familyWhoLab', model: 'familyWhoModel', flow: 'familyWhoFlow', pandas: 'familyWhoPandas' } as const;

/** Слои, на которых есть сборка руками в Lab (файл, чистка, модель, дашборд, ответ). */
const BUILD_LAYERS = new Set(['silver', 'gold', 'serve']);

/** Первое предложение «что здесь происходит»: слой на главной одной строкой, полный текст на карте. */
const firstSentence = (s: string) => {
  const m = /^.+?[.!?](?=\s|$)/.exec(s.trim());
  return m ? m[0] : s;
};

type Circle = 'learn' | 'practice' | 'apply';
interface LayerAction {
  key: string;
  label: string;
  circle: Circle;
  /** Тема трека: открывается занятием. Иначе ссылка на другое приложение. */
  skillId?: string;
  href?: string;
  app?: 'lab' | 'model' | 'flow';
}

export interface HomeSpineProps {
  activeTrack: Track;
  activePack: Pack;
  progress: Progress;
  isNewUser: boolean;
  dueCount: number;
  /** Подпись шага незаконченного занятия этого трека; null: продолжать нечего. */
  resume: string | null;
  loading: boolean;
  storyStarted: boolean;
  storyReachedId: string | null;
  onResume: () => void;
  /** Занятие на повторение (то же, что «Начать» в виде трека). */
  onReview: () => void;
  onStartSkill: (skillId: string) => void;
  onOpenStoryMode: (() => void) | null;
  onOpenStoryPart: ((partId: string) => void) | null;
  onOpenTrack: (track: Track) => void;
  onOpenMap: (map: { layer?: string; trace?: boolean }) => void;
  onOpenIntro: () => void;
  onOpenReference: () => void;
  onOpenSandbox: () => void;
  onOpenData: () => void;
  onOpenCareer: (role?: string | null) => void;
}

/** Вход сразу в часть 2 или 3, минуя предыдущие: для знающего SELECT и JOIN. Свёрнут в одну строку. */
function StoryEntry({ onOpenPart }: { onOpenPart: (partId: string) => void }) {
  const { t, locale } = useI18n();
  const campaign = storyCampaign(locale);
  const entries = [
    { id: 'p2', main: t.storyMode.entryPart2, sub: t.storyMode.entryPart2Sub },
    { id: 'p3', main: t.storyMode.entryPart3, sub: t.storyMode.entryPart3Sub },
  ];
  return (
    <details className="story-entry story-entry-row hs-entry">
      <summary className="story-entry-title story-entry-summary">{t.storyMode.entryTitle}</summary>
      {entries.map((e) => {
        const part = campaign.parts.find((p) => p.id === e.id);
        if (!part) return null;
        return (
          <button key={e.id} type="button" className="story-entry-btn" onClick={() => onOpenPart(e.id)}>
            <span className="story-entry-main">{e.main(part.title)}</span>
            <span className="story-entry-sub">{e.sub(campaign.weeks.filter((w) => w.part === e.id).length)}</span>
          </button>
        );
      })}
    </details>
  );
}

export function HomeSpine(p: HomeSpineProps) {
  const { t, locale } = useI18n();
  const s = t.home.spine;
  const labDone = p.progress.career?.labDone ?? {};
  const isStarted = (id: string) => (p.progress.skills[id]?.reps ?? 0) > 0;
  const layers = architecture.layers;

  /* Рабочая неделя: достигнутый день или первая неделя для новичка. */
  const camp = useMemo(() => storyCampaign(locale), [locale]);
  const reachedAt = p.storyReachedId ? storyWeekOf(camp, p.storyReachedId) : null;
  const week = reachedAt?.week ?? camp.weeks[0];
  const days = reachedAt?.missions ?? camp.missions.filter((m) => m.week === week?.id);
  const reachedDay = reachedAt ? days.findIndex((m) => m.id === p.storyReachedId) : -1;
  const weekIdx = week ? camp.weeks.findIndex((w) => w.id === week.id) : 0;
  const asker = days[0]?.messages[0]?.from;
  const dayOne = camp.missions[0];

  /* Письмо открыто, когда в сборке Lab дан ответ или достигнут день, закрывающий неделю. */
  const reachedMissionIdx = p.storyReachedId ? camp.missions.findIndex((m) => m.id === p.storyReachedId) : -1;
  const firstWeekCloseIdx = camp.missions.findIndex((m) => storyClosesWeek(camp, m.id));
  const letterOpen =
    Boolean(labDone['build:kaiyo-sales']) || (reachedMissionIdx >= 0 && firstWeekCloseIdx >= 0 && reachedMissionIdx >= firstWeekCloseIdx);

  /* Следующий шаг и подпись кнопки. */
  const skillTitle = (id: string): string => {
    const track = trackBySkill.get(id);
    return packForTrack(track ?? p.activeTrack, locale)?.skills.find((x) => x.id === id)?.title ?? id;
  };
  const step: NextStep = nextStep({
    resume: p.resume,
    isNewUser: p.isNewUser,
    dayOne: p.onOpenStoryMode && dayOne ? { title: s.stepDayOne, tasks: dayOne.steps.length } : null,
    layers: layers.map((l) => ({ id: l.id, skills: l.practice.skills })),
    isStarted,
  });
  const layerTitle = (l: ArchLayer) => l.title[locale];
  let stepText = '';
  let minutes: number | null = null;
  if (step.kind === 'resume') stepText = s.stepResume(step.stepName);
  else if (step.kind === 'day-one') {
    stepText = step.stepName;
    minutes = estimateMinutes(step.tasks);
  } else {
    const l = layers.find((x) => x.id === step.layerId)!;
    stepText = s.stepLayer(layerTitle(l), step.skillId ? skillTitle(step.skillId) : null);
    if (step.skillId) {
      const track = trackBySkill.get(step.skillId);
      const pool = packForTrack(track ?? p.activeTrack, locale)?.tasks.filter((x) => x.skill === step.skillId) ?? [];
      const open = pool.filter((x) => !p.progress.taskRecords[x.id]?.solved).length;
      minutes = estimateMinutes(Math.min(3, open || pool.length));
    }
  }
  const onMain = () => {
    if (step.kind === 'resume') p.onResume();
    else if (step.kind === 'day-one') p.onOpenStoryMode?.();
    else if (step.skillId) p.onStartSkill(step.skillId);
    else p.onOpenMap({ layer: step.layerId });
  };
  const mainLabel = step.kind === 'day-one' ? s.startBtn(stepText) : s.continueBtn(stepText);

  /* Карта: состояния слоёв и действия текущего. */
  const states = layerStatuses(layers.map((l) => ({ id: l.id, skills: l.practice.skills })), isStarted);
  const hereId = (states.find((x) => x.state === 'next') ?? states[states.length - 1]).id;
  const roleName = (id: string) => careerRole(id)?.title[locale] ?? id;
  const actionsFor = (l: ArchLayer): LayerAction[] => {
    const out: LayerAction[] = [];
    const st = states.find((x) => x.id === l.id);
    const skillId = st?.unstarted[0] ?? l.practice.skills[0];
    if (skillId) out.push({ key: 'topic', label: s.actTopic(skillTitle(skillId)), circle: 'learn', skillId });
    if (l.practice.mode === 'hands') {
      const app = l.practice.apps.find((a): a is 'lab' | 'model' | 'flow' => a === 'lab' || a === 'model' || a === 'flow');
      if (app) {
        out.push({
          key: app,
          app,
          circle: 'practice',
          label: app === 'lab' ? s.actLab : app === 'model' ? s.actModel : s.actFlow,
          href: app === 'lab' ? LAB_PRACTICE_SQL : app === 'model' ? STRATASQL_MODEL : FLOW_KAIYO,
        });
      }
      if (l.practice.apps.includes('lab') && BUILD_LAYERS.has(l.id)) {
        out.push({ key: 'build', app: 'lab', circle: 'apply', label: s.actBuild, href: LAB_BUILD });
      }
    }
    return out.slice(0, 3);
  };
  const circleText: Record<Circle, string> = { learn: s.circleLearn, practice: s.circlePractice, apply: s.circleApply };

  /* Текущая тема трека: начатая и не доведённая (самая свежая), иначе первая нетронутая. */
  const topicOf = (pack: Pack): { title: string; started: boolean } | null => {
    let best: { id: string; at: string } | null = null;
    for (const sk of pack.skills) {
      const st = p.progress.skills[sk.id];
      if (!st || st.reps === 0 || mastery(st) >= 1 || !st.lastReviewedAt) continue;
      if (!best || st.lastReviewedAt > best.at) best = { id: sk.id, at: st.lastReviewedAt };
    }
    const cur = best ? pack.skills.find((x) => x.id === best!.id) : null;
    if (cur) return { title: cur.title, started: true };
    const fresh = pack.skills.find((x) => (p.progress.skills[x.id]?.reps ?? 0) === 0);
    return fresh ? { title: fresh.title, started: false } : null;
  };
  const here = topicOf(p.activePack);
  const topic = here?.started ? here.title : null;
  const strength = Math.round(
    (p.activePack.skills.reduce((n, sk) => n + mastery(p.progress.skills[sk.id]), 0) / Math.max(1, p.activePack.skills.length)) * 100,
  );
  const activeSolved = p.activePack.tasks.filter((x) => p.progress.taskRecords[x.id]?.solved).length;
  const goal = useMemo(() => roleGoal(p.progress), [p.progress]);

  const link = (a: LayerAction) => (
    <a
      className="hs-act"
      href={a.href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => a.app && openFamilyLink(e.currentTarget, e.nativeEvent, a.app)}
    >
      <span className={`hs-circle hs-circle-${a.circle}`}>{circleText[a.circle]}</span>
      <span className="hs-act-label">{a.label} ↗</span>
    </a>
  );

  return (
    <div className="hs">
      <div className="hs-cols">
        <div className="hs-left">
          {/* Режим истории: вопрос заказчика, пять дней и письмо, одна главная кнопка. */}
          <section className="card hs-frame" data-guide="story" aria-labelledby="hs-frame-title">
            <p className="hs-kicker" id="hs-frame-title">
              {s.frameKicker}
              {week && <span> · {s.weekOf(weekIdx + 1, camp.weeks.length)}</span>}
            </p>
            {week && (
              <p className="hs-question">
                {asker && <span className="hs-asker">{s.asks(asker)}: </span>}«{week.question}»
              </p>
            )}
            <p className="hs-what">{s.frameWhat}</p>
            {days.length > 0 && (
              <ol className="hs-days">
                {days.map((m, i) => {
                  const state = reachedDay < 0 ? (i === 0 ? 'now' : 'ahead') : i < reachedDay ? 'done' : i === reachedDay ? 'now' : 'ahead';
                  return (
                    <li key={m.id} className={`hs-day ${state}`} aria-label={s.dayAria(i + 1, state)} aria-current={state === 'now' ? 'step' : undefined}>
                      <span className="hs-dot" aria-hidden />
                      <span className="hs-day-name" aria-hidden>
                        {m.short}
                      </span>
                    </li>
                  );
                })}
                <li className={`hs-day hs-letterday ${letterOpen ? 'open' : 'locked'}`} aria-label={s.letterAria(letterOpen)}>
                  {letterOpen && p.onOpenStoryMode ? (
                    <button type="button" className="hs-letterbtn" onClick={p.onOpenStoryMode}>
                      <span className="hs-dot" aria-hidden />
                      <span className="hs-day-name" aria-hidden>
                        {s.letterShort}
                      </span>
                    </button>
                  ) : (
                    <>
                      <span className="hs-dot" aria-hidden />
                      <span className="hs-day-name" aria-hidden>
                        {s.letterShort} 🔒
                      </span>
                    </>
                  )}
                </li>
              </ol>
            )}
            <button type="button" className="btn hs-main" onClick={onMain} disabled={p.loading && step.kind === 'resume'}>
              <span className="hs-main-text">{mainLabel}</span>
              {minutes !== null && <span className="hs-main-min">{s.minutes(minutes)}</span>}
            </button>
            <div className="hs-quiet">
              {p.isNewUser && (
                <p className="hs-intro">
                  {s.introLead}{' '}
                  <button type="button" className="hs-textlink" data-pair="intro" onClick={p.onOpenIntro}>
                    {s.introLink}
                  </button>
                </p>
              )}
              {!p.isNewUser && p.onOpenStoryMode && (
                <p className="hs-intro">
                  <button type="button" className="hs-textlink" data-pair="storymode" onClick={p.onOpenStoryMode}>
                    {p.storyStarted ? s.storyContinue : s.storyStart} →
                  </button>
                </p>
              )}
              {!p.storyStarted && p.onOpenStoryPart && <StoryEntry onOpenPart={p.onOpenStoryPart} />}
            </div>
          </section>

          {/* Карта пути данных: «вы здесь» по прогрессу, действия только у текущего слоя. */}
          <section className="card hs-map" data-pair="career" data-guide="map" aria-labelledby="hs-map-title">
            <h2 id="hs-map-title">
              <span className="pair-ico" aria-hidden>
                <IconCompass />
              </span>
              {t.career.map.teaserTitle}
            </h2>
            <ol className="hs-layers">
              {layers.map((l, i) => {
                const st = states[i].state;
                const here = l.id === hereId;
                const acts = here ? actionsFor(l) : [];
                return (
                  <li key={l.id} className={`hs-layer ${st}${here ? ' here' : ''}`}>
                    <button
                      type="button"
                      className="hs-layer-head"
                      aria-label={t.career.map.teaserLayer(layerTitle(l))}
                      aria-current={here ? 'step' : undefined}
                      onClick={() => p.onOpenMap({ layer: l.id })}
                    >
                      <span className="hs-layer-n" aria-hidden>
                        {st === 'done' ? '✓' : i + 1}
                      </span>
                      <span className="hs-layer-name">{layerTitle(l)}</span>
                      <span className="hs-layer-roles">{l.roles.map(roleName).join(', ')}</span>
                      <span className="hs-layer-state">{here ? s.mapHere : s.layerState[st]}</span>
                    </button>
                    {here && (
                      <div className="hs-layer-body">
                        <p className="hs-layer-what">{firstSentence(l.what[locale])}</p>
                        {acts.length > 0 && (
                          <ul className="hs-acts" aria-label={s.actionsLabel}>
                            {acts.map((a) => (
                              <li key={a.key}>
                                {a.skillId ? (
                                  <button type="button" className="hs-act" onClick={() => p.onStartSkill(a.skillId!)}>
                                    <span className={`hs-circle hs-circle-${a.circle}`}>{circleText[a.circle]}</span>
                                    <span className="hs-act-label">{a.label}</span>
                                  </button>
                                ) : (
                                  link(a)
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="hs-map-links">
              <button type="button" className="link-row" onClick={() => p.onOpenMap({})}>
                {s.mapOpen}
              </button>
              <button type="button" className="link-row" onClick={() => p.onOpenMap({ trace: true })}>
                {s.mapTrace}
              </button>
            </p>
          </section>
        </div>

        {/* Правая колонка: где вы сейчас и треки 2×2 высотой по содержимому. */}
        <div className="hs-right">
          <section className="card hs-now" aria-labelledby="hs-now-title">
            <h2 id="hs-now-title">{s.nowTitle}</h2>
            <p className="hs-now-topic">
              <span className="hs-k">{s.nowTopic}</span>
              <span className="hs-v">{topic ?? s.nowTopicNone}</span>
            </p>
            <p className="hs-now-sub">{topic ? s.nowOf(activeSolved, p.activePack.tasks.length) : s.nowNoneHint}</p>
            <div className="hs-now-bar">
              <span className="hs-k">{s.nowStrength(t.trackShort[p.activeTrack], strength)}</span>
              <span className="bar" role="img" aria-label={`${strength}%`}>
                <span style={{ width: `${strength}%` }} />
              </span>
              <span className="hs-v">{strength}%</span>
            </div>
            <p className="hs-now-goal">
              <button type="button" className="hs-textlink" onClick={() => p.onOpenCareer(goal.chosen ? goal.role.id : null)}>
                {goal.chosen ? s.nowGoal(goal.role.title[locale], goal.met, goal.total) : s.nowPickRole} →
              </button>
            </p>
            {p.dueCount > 0 && (
              <div className="hs-now-review">
                <button type="button" className="btn secondary" onClick={p.onReview} disabled={p.loading}>
                  {s.reviewBtn(p.dueCount)}
                </button>
                <span className="hs-k">{s.reviewHint}</span>
              </div>
            )}
          </section>

          <section className="hs-tracks" data-pair="tracks" data-guide="tracks" aria-label={s.tracksTitle}>
            {TRACK_ORDER.map((track) => {
              const pack = packForTrack(track, locale);
              if (!pack) return null;
              const total = pack.tasks.length;
              const ready = pack.status !== 'draft' && total > 0;
              const solved = ready ? pack.tasks.filter((x) => p.progress.taskRecords[x.id]?.solved).length : 0;
              const nextTopic = ready ? topicOf(pack) : null;
              const circle: Circle = track === 'domain' ? 'apply' : 'learn';
              return (
                <button
                  key={track}
                  type="button"
                  className={`card hs-tile track-${track}${track === p.activeTrack ? ' active' : ''}${ready ? '' : ' draft'}`}
                  onClick={() => p.onOpenTrack(track)}
                >
                  <span className="hs-tile-head">
                    <span className="hs-tile-name">{t.tracks.names[track]}</span>
                    <span className={`hs-circle hs-circle-${circle}`}>{circleText[circle]}</span>
                  </span>
                  <span className="hs-tile-stage">{s.tileLearn[track]}</span>
                  {ready && (
                    <span className="bar" aria-hidden>
                      <span style={{ width: `${total ? Math.round((solved / total) * 100) : 0}%` }} />
                    </span>
                  )}
                  <span className="hs-tile-count">{ready ? s.tileOf(solved, total) : t.tracks.draftBadge}</span>
                  <span className="hs-tile-cta">
                    {nextTopic ? (nextTopic.started ? s.tileContinue(nextTopic.title) : s.tileStart(nextTopic.title)) : s.tileOpen}
                  </span>
                </button>
              );
            })}
          </section>
        </div>
      </div>

      <nav className="hs-links" aria-label={s.linksLabel}>
        <button type="button" className="btn secondary" data-pair="reference" onClick={p.onOpenReference}>
          <span className="pair-ico" aria-hidden>
            <IconBook />
          </span>
          {t.home.referenceBtn}
        </button>
        <button type="button" className="btn secondary" data-pair="sandbox" onClick={p.onOpenSandbox}>
          <span className="pair-ico" aria-hidden>
            <IconFlask />
          </span>
          {t.home.sandboxBtn}
        </button>
        <button type="button" className="btn secondary" data-pair="data" onClick={p.onOpenData}>
          <span className="pair-ico" aria-hidden>
            <IconTable />
          </span>
          {t.home.schemaBtn}
        </button>
        <button type="button" className="btn secondary" data-pair="career" onClick={() => p.onOpenCareer()}>
          <span className="pair-ico" aria-hidden>
            <IconCompass />
          </span>
          {t.nav.career}
        </button>
      </nav>

      <nav className="card home-family" data-pair="family" data-guide="family" aria-label={t.nav.familyTitle}>
        <h2>{t.nav.familyTitle}</h2>
        <div className="home-family-links">
          {FAMILY.map((f) => (
            <a
              key={f.key}
              className="home-family-link"
              href={f.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => window.quaeraOpenApp?.(e.currentTarget, e.nativeEvent, f.key)}
            >
              <img className="home-family-mark" src={FAMILY_MARKS[f.key]} alt="" width={36} height={36} />
              <span className="home-family-text">
                <span className="home-family-name">{t.nav[FAMILY_NAME_KEY[f.key]]} ↗</span>
                <span className="home-family-desc">{t.nav[FAMILY_DESC_KEY[f.key]]}</span>
                <span className="home-family-who">{t.nav[FAMILY_WHO_KEY[f.key]]}</span>
              </span>
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
