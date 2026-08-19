import { useRef } from 'react';
import { useI18n } from '../i18n/context';
import type { Task } from '../content/types';
import type { Executor, SchemaDoc } from '../engine/types';
import { StoryArt } from './StoryArt';
import { TaskView, type TaskDraftStore, type TaskOutcome } from './TaskView';
import type { StoryMission } from '../content/storymode';

/**
 * Экран режима истории — нарративная оболочка вокруг нескольких существующих
 * заданий. В отличие от StoryLine (карта выведенных из графа миссий), здесь
 * миссия рукописная, а её ход — маленькая машина фаз, которую крутит этот
 * экран. Задания крутит тот же TaskView, что и обычное занятие: движок,
 * проверка эталоном, подсказки — всё настоящее.
 *
 * Один день миссии выглядит так:
 *   бриф (кто и зачем спрашивает)
 *   → [подводка → задание] столько раз, сколько заданий в дне
 *   → суждение (это уже ответ заказчику? ещё нет)
 *   → крючок (что осталось и куда ведёт сюжет).
 *
 * **Почему фаза — объект, а не строка.** Раньше день держал ровно одно
 * задание, и пяти имён хватало. Как только в дне их стало три, фаза обязана
 * называть ещё и номер шага: «задание» без номера не отличает первое задание
 * понедельника от третьего, а стрелке «назад» надо попадать ровно на тот
 * экран, откуда пришли. Порядок фаз при этом по-прежнему существует в одном
 * месте — storyPhases(), — и оба движения выводятся из него.
 *
 * Своего хранилища нет: решения уходят в прогресс через onTaskDone (тот же
 * путь, что handleDone у занятия), а фаза живёт в `screen` приложения.
 */
export type StoryPhase =
  | { kind: 'brief' }
  | { kind: 'intro'; step: number }
  | { kind: 'task'; step: number }
  | { kind: 'reflection' }
  | { kind: 'hook' };

/**
 * Порядок экранов дня — единственный источник правды о ходе миссии.
 * Из него растут и «дальше», и «назад»; разъехаться им негде, потому что
 * оба считают индекс в этом же списке.
 *
 * Подводка появляется только у тех шагов, где она написана: задание, которому
 * нечего предпослать, идёт сразу за предыдущим. Пустой экран ради симметрии
 * читался бы как заминка.
 */
export function storyPhases(mission: StoryMission): StoryPhase[] {
  const phases: StoryPhase[] = [{ kind: 'brief' }];
  mission.steps.forEach((step, i) => {
    if (step.intro) phases.push({ kind: 'intro', step: i });
    phases.push({ kind: 'task', step: i });
  });
  phases.push({ kind: 'reflection' }, { kind: 'hook' });
  return phases;
}

function samePhase(a: StoryPhase, b: StoryPhase): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'intro' || a.kind === 'task') {
    return a.step === (b as { step: number }).step;
  }
  return true;
}

function phaseAt(mission: StoryMission, phase: StoryPhase, delta: number): StoryPhase | null {
  const phases = storyPhases(mission);
  const i = phases.findIndex((p) => samePhase(p, phase));
  if (i < 0) return null;
  return phases[i + delta] ?? null;
}

/**
 * Предыдущий экран дня, либо null на первом.
 *
 * Нужна шапке: до этой правки стрелка «назад» из любой точки миссии
 * выбрасывала на главную, то есть теряла весь день ради того, чтобы
 * перечитать предыдущий экран. Вопрос «а что там было в брифе?» возникает
 * ровно посреди задания — та же причина, по которой с задачи занятия
 * «назад» ведёт на карточку приёма, а не наружу.
 *
 * Возврат на решённое задание намеренно разрешён: попытка уже записана
 * (см. `recorded` ниже), решение лежит в черновиках, и перечитать свой
 * запрос — законное желание. Второй записи это не заводит.
 */
export function storyPhaseBefore(mission: StoryMission, phase: StoryPhase): StoryPhase | null {
  return phaseAt(mission, phase, -1);
}

/** Следующий экран дня, либо null на крючке (дальше уже переход между днями). */
export function storyPhaseAfter(mission: StoryMission, phase: StoryPhase): StoryPhase | null {
  return phaseAt(mission, phase, 1);
}

/** Задание дня вместе с названием приёма — разрешается в App по паку активного трека. */
export interface StoryStepView {
  task: Task;
  skillTitle: string;
}

export function StoryMode({
  mission,
  steps,
  executor,
  schema,
  drafts,
  phase,
  onPhase,
  onTaskDone,
  onOpenSchema,
  onNext,
  onExit,
}: {
  mission: StoryMission;
  /** Задания дня по порядку mission.steps — уже найденные в паке. */
  steps: StoryStepView[];
  executor: Executor;
  schema: SchemaDoc | null;
  drafts: TaskDraftStore;
  /** Текущий экран — живёт в `screen` приложения, чтобы шапка умела шаг назад. */
  phase: StoryPhase;
  onPhase: (next: StoryPhase) => void;
  /** Записывает попытку в прогресс — та же запись, что у обычного занятия. */
  onTaskDone: (task: Task, outcome: TaskOutcome) => void;
  onOpenSchema: (table?: string) => void;
  /**
   * Перейти к следующей миссии кампании, либо null — если эта последняя.
   * Признак приходит снаружи, а не считается здесь: порядок дней знает
   * кампания, а экран знает только свой.
   */
  onNext: (() => void) | null;
  /** Выйти из миссии (на главную). */
  onExit: () => void;
}) {
  const { t } = useI18n();

  /*
   * Записанные попытки — множеством, а не флагом: в дне несколько заданий,
   * и «уже зачёл» относится к конкретному, а не ко дню целиком. Ref защищает
   * от второй записи, если человек вернулся стрелкой на решённое задание
   * и прошёл его снова.
   */
  const recorded = useRef(new Set<string>());

  const after = storyPhaseAfter(mission, phase);

  function goNext() {
    if (after) onPhase(after);
  }

  function handleTaskDone(task: Task, outcome: TaskOutcome) {
    if (!recorded.current.has(task.id)) {
      recorded.current.add(task.id);
      onTaskDone(task, outcome);
    }
    goNext();
  }

  if (phase.kind === 'task') {
    const step = steps[phase.step];
    if (!step) return null;
    return (
      <TaskView
        key={step.task.id}
        task={step.task}
        executor={executor}
        schema={schema}
        drafts={drafts}
        skillTitle={step.skillTitle}
        onOpenSchema={onOpenSchema}
        onDone={(outcome) => handleTaskDone(step.task, outcome)}
      />
    );
  }

  /*
   * Подпись кнопки выводится из того, что будет дальше, а не из того, где мы
   * сейчас: «Взяться за задачу» перед заданием и «Дальше» перед разговором.
   * Иначе подпись пришлось бы держать в каждой ветке отдельно и следить,
   * чтобы она не разъехалась с порядком фаз.
   */
  const nextLabel = after?.kind === 'task' ? t.storyMode.toTask : t.storyMode.next;

  const intro = phase.kind === 'intro' ? mission.steps[phase.step]?.intro : null;
  const scene =
    phase.kind === 'brief'
      ? mission.scenes.brief
      : phase.kind === 'reflection'
        ? mission.scenes.reflection
        : phase.kind === 'hook'
          ? mission.scenes.hook
          : intro?.scene;

  return (
    <div className="card story-mode">
      {scene && <StoryArt scene={scene} />}

      {phase.kind === 'brief' && (
        <>
          <p className="story-mode-badge">{t.storyMode.badge}</p>
          <p className="story-mode-place">{mission.place}</p>
          <div className="story-mode-thread">
            {mission.messages.map((m, i) => (
              <div className="story-mode-msg" key={i}>
                <p className="story-mode-from">{m.from}</p>
                <p className="story-mode-text">{m.text}</p>
              </div>
            ))}
          </div>
          <button type="button" className="btn" onClick={goNext}>
            {nextLabel}
          </button>
        </>
      )}

      {phase.kind === 'intro' && intro && (
        <>
          {intro.title && <h2>{intro.title}</h2>}
          {intro.paras.map((p, i) => (
            <p className="story-mode-para" key={i}>
              {p}
            </p>
          ))}
          <button type="button" className="btn" onClick={goNext}>
            {nextLabel}
          </button>
        </>
      )}

      {phase.kind === 'reflection' && (
        <>
          <h2>{t.storyMode.reflectionTitle}</h2>
          {mission.reflection.map((p, i) => (
            <p className="story-mode-para" key={i}>
              {p}
            </p>
          ))}
          <button type="button" className="btn" onClick={goNext}>
            {nextLabel}
          </button>
        </>
      )}

      {phase.kind === 'hook' && (
        <>
          {mission.hook.map((p, i) => (
            <p className="story-mode-para" key={i}>
              {p}
            </p>
          ))}
          {onNext ? (
            <button type="button" className="btn" onClick={onNext}>
              {t.storyMode.nextMission}
            </button>
          ) : (
            <>
              <p className="story-mode-tbc">{t.storyMode.toBeContinued}</p>
              <button type="button" className="btn secondary" onClick={onExit}>
                {t.storyMode.finish}
              </button>
            </>
          )}
        </>
      )}
    </div>
  );
}
