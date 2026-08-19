import { useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import type { Task } from '../content/types';
import type { Executor, SchemaDoc } from '../engine/types';
import { TaskView, type TaskDraftStore, type TaskOutcome } from './TaskView';
import type { StoryMission } from '../content/storymode';

/**
 * Экран режима истории — нарративная оболочка вокруг одного существующего
 * задания. В отличие от StoryLine (карта выведенных из графа миссий), здесь
 * миссия одна и рукописная, а её ход — маленькая машина фаз внутри компонента,
 * а не отдельный экран сессии. Задание на фазе `task` крутит тот же TaskView,
 * что и обычное занятие: движок, проверка эталоном, подсказки — всё настоящее.
 *
 * Порядок фаз и есть весь сюжет миссии:
 *   бриф (кто и зачем спрашивает)
 *   → теория (ровно перед нуждой)
 *   → задание (настоящее, с проверкой)
 *   → суждение (это уже ответ заказчику? ещё нет)
 *   → переход (что осталось и куда ведёт сюжет).
 *
 * Своего хранилища нет: решение задания уходит в прогресс через onTaskDone
 * (тот же путь, что handleDone у занятия), а фаза живёт только в памяти экрана.
 * Перезагрузка вернёт к брифу — для среза приемлемо: миссия короткая.
 */
type Phase = 'brief' | 'theory' | 'task' | 'reflection' | 'hook';

export function StoryMode({
  mission,
  task,
  executor,
  schema,
  drafts,
  skillTitle,
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
  /** Записывает попытку в прогресс — та же запись, что у обычного занятия. */
  onTaskDone: (task: Task, outcome: TaskOutcome) => void;
  onOpenSchema: (table?: string) => void;
  /** Выйти из миссии (на главную). */
  onExit: () => void;
}) {
  const { t } = useI18n();
  const [phase, setPhase] = useState<Phase>('brief');

  /*
   * Запись попытки — один раз за проход миссии. TaskView зовёт onDone на «Дальше»
   * после решения; в нашем потоке это единственный переход с задания, но ref
   * защищает на случай, если человек вернётся на задание и решит снова.
   */
  const recorded = useRef(false);
  function handleTaskDone(outcome: TaskOutcome) {
    if (!recorded.current) {
      recorded.current = true;
      onTaskDone(task, outcome);
    }
    setPhase('reflection');
    window.scrollTo({ top: 0 });
  }

  function go(next: Phase) {
    setPhase(next);
    window.scrollTo({ top: 0 });
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
          <button type="button" className="btn" onClick={() => go('theory')}>
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
          <button type="button" className="btn" onClick={() => go('task')}>
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
          <button type="button" className="btn" onClick={() => go('hook')}>
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
