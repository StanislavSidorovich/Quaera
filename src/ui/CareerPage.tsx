import { useEffect, useMemo, useState } from 'react';
import { careerAxes, careerEvidence, careerRole, careerRoles } from '../content/career';
import { packForTrack } from '../content';
import type { Track } from '../content/types';
import { useI18n } from '../i18n/context';
import { appStorage } from '../guestMode';
import type { Progress } from '../srs/store';
import { AXES, axisReading, labDoneEvidence, overdueSkills, roleReadiness } from '../career/readiness';
import type { AxisId, AxisReading } from '../career/readiness';
import { DEFAULT_ROLE, checkedIds, emptyCareerState, withRole, withToggledEvidence, withWeeklySnapshot, withQuizAttempt } from '../career/store';
import type { AxisLevels, CareerState } from '../career/store';
import { passedQuizEvidence } from '../career/quiz';
import { CareerQuiz } from './CareerQuiz';
import { useLabDone } from './LabDoneToast';
import { ArchitectureMap } from './ArchitectureMap';
import { CareerOverview } from './CareerOverview';
import { CareerRolePage } from './CareerRolePage';
import type { StepCtx } from './careerSteps';

const TRACKS: Track[] = ['sql', 'model', 'python', 'domain'];

/**
 * «Путь к роли»: два уровня. Обзор показывает, где вы сейчас (паутинка,
 * строка выбранной оси), семь ролей плитками и вашу цель. Страница роли
 * (`CareerRolePage`) отвечает на вопрос «что для этой роли и чего мне не хватает»:
 * что ищут компании, разрыв по каждой оси и где подтянуть.
 *
 * Данные приходят из content/career.ts, формула из career/readiness.ts;
 * здесь собираются общие расчёты и переключаются виды. Роль, отметки и снимки
 * лежат в `progress.career` и меняются через `onCareerChange`: своего
 * хранилища у экрана нет, иначе оно разошлось бы с тем, что уезжает на
 * второе устройство.
 */

/**
 * Вкладка, на которой экран был в последний раз: уход в занятие из карты
 * и возврат «назад» снова ставят экран заново, и без этого человек
 * возвращался бы на «Путь к роли», потеряв карту. Страница роли помнится так же.
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
/* Какая роль была открыта на странице роли (null — обзор): живёт, пока открыта вкладка браузера. */
let lastRoleView: string | null = null;

export function CareerPage({
  progress,
  onCareerChange,
  onStartSkill,
  onOpenSkill,
  onOpenStory,
  openMap,
  openRole,
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
  /** Режим истории; нет, если у активного пака нет сюжета. */
  onOpenStory?: () => void;
  /** Открыться на вкладке карты: с главной или по адресу `?roles=map`. */
  openMap?: { layer?: string; trace?: boolean; project?: boolean };
  /** Открыться на странице этой роли: адрес `?roles=<id>` и строка «до роли» на главной. */
  openRole?: string;
  /** Возврат из занятия: та же вкладка и то же место карты, откуда ушли. */
  restore?: boolean;
  /** Роль открыта с карты: на странице роли стоит кнопка возврата на карту. */
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
  const [quizAxis, setQuizAxis] = useState<AxisId | null>(null);
  const [tab, setTabState] = useState<'path' | 'map'>(() =>
    openMap ? (lastTab = 'map') : openRole || forcePath ? (lastTab = 'path') : lastTab
  );
  const [view, setViewState] = useState<string | null>(() => {
    if (openRole && careerRole(openRole)) return (lastRoleView = openRole);
    if (openMap || forcePath) return (lastRoleView = null);
    return lastRoleView && careerRole(lastRoleView) ? lastRoleView : null;
  });
  const setView = (id: string | null) => {
    lastRoleView = id;
    setViewState(id);
    window.scrollTo({ top: 0 });
  };
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

  const chosenRole = careerRole(state.role) ?? careerRole(DEFAULT_ROLE)!;
  /*
   * Засчитанные самопроверки и отметка Lab входят в формулу как отметки, но
   * выводятся из истории подходов и из `progress.career.labDone`, а не из галочек:
   * поставить их руками нельзя.
   */
  const labDone = useLabDone();
  const checked = useMemo(
    () => new Set([...checkedIds(state), ...passedQuizEvidence(careerEvidence, state.quiz, new Date()), ...labDoneEvidence(careerEvidence, labDone)]),
    [state, labDone]
  );

  /* Названия и уровни навыков — по текущей локали, из всех четырёх паков. */
  const skillInfo = useMemo(() => {
    const map = new Map<string, { title: string; tier: number }>();
    for (const track of TRACKS) {
      for (const s of packForTrack(track, locale)?.skills ?? []) map.set(s.id, { title: s.title, tier: s.tier });
    }
    return map;
  }, [locale]);
  const skillTitle = (id: string) => skillInfo.get(id)?.title ?? id;

  /* Ваши уровни по осям не зависят от роли; готовность считается по каждой из семи ролей (плитки и страница). */
  const readings = useMemo(
    () => Object.fromEntries(careerAxes.map((a) => [a.id, axisReading(a, progress.skills, careerEvidence, checked)])) as Record<AxisId, AxisReading>,
    [progress.skills, checked]
  );
  const readinessByRole = useMemo(
    () =>
      Object.fromEntries(
        careerRoles.map((r) => [r.id, roleReadiness(r, careerAxes, progress.skills, careerEvidence, checked, (id) => skillInfo.get(id)?.tier ?? 1)])
      ),
    [progress.skills, checked, skillInfo]
  );
  const levels = useMemo(() => Object.fromEntries(AXES.map((a) => [a, readings[a].level])) as AxisLevels, [readings]);
  const dueByAxis = useMemo(
    () => Object.fromEntries(careerAxes.map((a) => [a.id, overdueSkills(a, progress.skills, new Date())])) as Record<AxisId, string[]>,
    [progress.skills]
  );

  /* Снимок раз в неделю: при открытии, не при каждой отметке. */
  useEffect(() => {
    onCareerChange((s) => {
      const weekly = withWeeklySnapshot(s.weekly, levels, new Date());
      return weekly === s.weekly ? s : { ...s, weekly };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openQuiz = (axis: AxisId) => {
    setQuizAxis(axis);
    window.scrollTo({ top: 0 });
  };
  const closeQuiz = () => {
    setQuizAxis(null);
    window.scrollTo({ top: 0 });
  };
  const chooseRole = (id: string) => onCareerChange((s) => (s.role === id ? s : withRole(s, id, new Date())));
  const ctx: StepCtx = {
    checked,
    quiz: state.quiz,
    skillTitle,
    onStartSkill,
    onOpenStory,
    openQuiz,
    toggleEvidence: (id) => onCareerChange((s) => withToggledEvidence(s, id, new Date())),
  };

  if (quizAxis) {
    return (
      <div className="settings-column career-page">
        <CareerQuiz axis={quizAxis} attempts={state.quiz} onFinish={(attempt) => onCareerChange((s) => withQuizAttempt(s, attempt))} onClose={closeQuiz} />
      </div>
    );
  }

  const viewed = tab === 'path' && view ? careerRole(view) : undefined;

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
            lastTab = 'path';
            setTabState('path');
            setView(id);
            onFromMap(true);
          }}
        />
      )}

      {tab === 'path' && viewed && (
        <CareerRolePage
          role={viewed}
          readiness={readinessByRole[viewed.id]}
          readings={readings}
          levels={levels}
          isGoal={state.roleAt !== null && viewed.id === chosenRole.id}
          ctx={ctx}
          backLabel={fromMap ? c.map.backToMap : c.rp.back}
          onBack={() => {
            if (fromMap) {
              lastRoleView = null;
              onBackToMap();
            } else setView(null);
          }}
          onChoose={() => chooseRole(viewed.id)}
        />
      )}

      {tab === 'path' && !viewed && (
        <>
          {fromMap && (
            <button type="button" className="btn secondary career-back-map" onClick={onBackToMap}>
              ← {c.map.backToMap}
            </button>
          )}
          <p className="intro-lead">{c.lead}</p>
          <CareerOverview
            progress={progress}
            state={state}
            onCareerChange={onCareerChange}
            ctx={ctx}
            readings={readings}
            dueByAxis={dueByAxis}
            readinessByRole={readinessByRole}
            chosenRole={chosenRole}
            levels={levels}
            onOpenRole={(id) => setView(id)}
            onChooseRole={chooseRole}
            onOpenSkill={onOpenSkill}
          />
        </>
      )}
    </div>
  );
}
