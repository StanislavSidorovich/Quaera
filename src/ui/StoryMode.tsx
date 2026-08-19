import { useRef } from 'react';
import { useI18n } from '../i18n/context';
import type { Task } from '../content/types';
import type { Executor, SchemaDoc } from '../engine/types';
import { StoryArt, type StoryScene } from './StoryArt';
import { TaskView, type TaskDraftStore, type TaskOutcome } from './TaskView';
import type { StoryMission } from '../content/storymode';

/**
 * Экран режима истории — нарративная оболочка вокруг одного существующего
 * задания. В отличие от StoryLine (карта выведенных из графа миссий), здесь
 * миссия одна и рукописная, а её ход — маленькая машина фаз, которую крутит
 * этот экран. Задание на фазе `task` крутит тот же TaskView, что и обычное
 * занятие: движок, проверка эталоном, подсказки — всё настоящее.
 *
 * Порядок фаз и есть весь сюжет миссии:
 *   бриф (кто и зачем спрашивает)
 *   → теория (ровно перед нуждой)
 *   → задание (настоящее, с проверкой)
 *   → суждение (это уже ответ заказчику? ещё нет)
 *   → переход (что осталось и куда ведёт сюжет).
 *
 * Своего хранилища нет: решение задания уходит в прогресс через onTaskDone
 * (тот же путь, что handleDone у занятия), а фаза живёт в `screen` приложения.
 */
export type StoryPhase = 'brief' | 'theory' | 'task' | 'reflection' | 'hook';

/**
 * Порядок фаз в одном месте — он же порядок сюжета, и разъезжаться этим
 * двум спискам нельзя. Из него выводятся оба движения: «дальше» рисуют
 * кнопки внизу фазы, «назад» — стрелка в шапке (см. backTarget в App.tsx).
 */
const PHASE_ORDER: StoryPhase[] = ['brief', 'theory', 'task', 'reflection', 'hook'];

/**
 * Предыдущая фаза миссии, либо null на первой.
 *
 * Нужна шапке: до этой правки стрелка «назад» из любой точки миссии
 * выбрасывала на главную, то есть теряла всю миссию ради того, чтобы
 * перечитать предыдущий экран. Вопрос «а что там было в брифе?» возникает
 * ровно посреди задания — та же причина, по которой с задачи занятия
 * «назад» ведёт на карточку приёма, а не наружу.
 *
 * Возврат с суждения на задание намеренно разрешён: попытка уже записана
 * (см. `recorded` ниже), решение лежит в черновиках, и перечитать свой
 * запрос — законное желание. Второй записи это не заводит.
 */
export function storyPhaseBefore(phase: StoryPhase): StoryPhase | null {
  const i = PHASE_ORDER.indexOf(phase);
  return i > 0 ? PHASE_ORDER[i - 1] : null;
}

/**
 * Сцена-заставка каждой фазы. Ровно одна на фазу и ни одной на задание:
 * на экране задания всё внимание принадлежит редактору, и картинка сверху
 * отодвигала бы его вниз без всякой пользы.
 */
const PHASE_SCENE: Record<Exclude<StoryPhase, 'task'>, StoryScene> = {
  brief: 'office',
  theory: 'groups',
  reflection: 'trend',
  hook: 'split',
};

export function StoryMode({
  mission,
  task,
  executor,
  schema,
  drafts,
  skillTitle,
  phase,
  onPhase,
  onTaskDone,
  onOpenSchema,
  onExit,
}: {
  mission: StoryMission;
  /** Задание миссии, уже найденное в паке по mission.taskId. */
  task: Task;
  executor: Executor;
  schema: SchemaDoc | null;
  drafts: TaskDraftStore;
  skillTitle: string;
  /** Текущая фаза — живёт в `screen` приложения, чтобы шапка умела шаг назад. */
  phase: StoryPhase;
  onPhase: (next: StoryPhase) => void;
  /** Записывает попытку в прогресс — та же запись, что у обычного занятия. */
  onTaskDone: (task: Task, outcome: TaskOutcome) => void;
  onOpenSchema: (table?: string) => void;
  /** Выйти из миссии (на главную). */
  onExit: () => void;
}) {
  const { t } = useI18n();

  /*
   * Запись попытки — один раз за проход миссии. TaskView зовёт onDone на «Дальше»
   * после решения; ref защищает от второй записи, если человек вернулся стрелкой
   * на задание и прошёл его снова.
   */
  const recorded = useRef(false);
  function handleTaskDone(outcome: TaskOutcome) {
    if (!recorded.current) {
      recorded.current = true;
      onTaskDone(task, outcome);
    }
    onPhase('reflection');
  }

  if (phase === 'task') {
    return (
      <TaskView
        key={task.id}
        task={task}
        executor={executor}
        schema={schema}
        drafts={drafts}
        skillTitle={skillTitle}
        onOpenSchema={onOpenSchema}
        onDone={handleTaskDone}
      />
    );
  }

  return (
    <div className="card story-mode">
      <StoryArt scene={PHASE_SCENE[phase]} />

      {phase === 'brief' && (
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
          <button type="button" className="btn" onClick={() => onPhase('theory')}>
            {t.storyMode.toTheory}
          </button>
        </>
      )}

      {phase === 'theory' && (
        <>
          <h2>{t.storyMode.theoryTitle}</h2>
          {mission.theory.map((p, i) => (
            <p className="story-mode-para" key={i}>
              {p}
            </p>
          ))}
          <button type="button" className="btn" onClick={() => onPhase('task')}>
            {t.storyMode.toTask}
          </button>
        </>
      )}

      {phase === 'reflection' && (
        <>
          <h2>{t.storyMode.reflectionTitle}</h2>
          {mission.reflection.map((p, i) => (
            <p className="story-mode-para" key={i}>
              {p}
            </p>
          ))}
          <button type="button" className="btn" onClick={() => onPhase('hook')}>
            {t.storyMode.reflectionNext}
          </button>
        </>
      )}

      {phase === 'hook' && (
        <>
          {mission.hook.map((p, i) => (
            <p className="story-mode-para" key={i}>
              {p}
            </p>
          ))}
          <p className="story-mode-tbc">{t.storyMode.toBeContinued}</p>
          <button type="button" className="btn secondary" onClick={onExit}>
            {t.storyMode.finish}
          </button>
        </>
      )}
    </div>
  );
}
