import { useEffect, useMemo, useState } from 'react';
import { lessonBySkill, packForTrack } from './content';
import type { Lesson, Pack, Task, Track } from './content/types';
import { getExecutor } from './engine/executors';
import type { LoadState } from './engine/types';
import { ru } from './i18n/ru';
import { LessonCard } from './ui/LessonCard';
import { SchemaSheet, useSchema } from './ui/SchemaSheet';
import { TaskView, type TaskOutcome } from './ui/TaskView';
import {
  gradeFromAttempt,
  isDue,
  isUnlocked,
  mastery,
  review,
  selectSession,
} from './srs/scheduler';
import {
  applyAttempt,
  loadProgress,
  saveProgress,
  skillState,
  streak,
  type Progress,
} from './srs/store';

const SESSION_SIZE = 5;

/**
 * Порядок треков на главной — не алфавитный, а порядок дорожной карты:
 * SQL → «аналитика как профессия» → модель данных → pandas. Карта навыков
 * должна читаться как план, а не как список файлов.
 */
const TRACK_ORDER: Track[] = ['sql', 'domain', 'model', 'python'];

/**
 * Шаг занятия — либо карточка приёма, либо задача. Карточка вставляется перед
 * первой задачей на незнакомый навык: иначе человек с нуля утыкается в задачу,
 * не зная приёма, и уходит. Дальше навык считается введённым, и карточка
 * больше не показывается — только по запросу из справочника.
 */
type Step = { kind: 'lesson'; lesson: Lesson } | { kind: 'task'; task: Task };

type Screen =
  | { name: 'home' }
  | { name: 'session'; queue: Step[]; index: number }
  | { name: 'done'; solved: number }
  | { name: 'reference' }
  | { name: 'lesson'; skill: string };

export default function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [activeTrack, setActiveTrack] = useState<Track>('sql');
  const [load, setLoad] = useState<LoadState>({ phase: 'idle' });
  const [schemaOpen, setSchemaOpen] = useState(false);
  const schema = useSchema();

  // Пак трека и его исполнитель — единственное место, где App знает,
  // что треков четыре. Всё остальное работает с activePack, не с конкретным sql-core.
  const activePack: Pack = packForTrack(activeTrack)!;
  const executor = useMemo(() => getExecutor(activeTrack), [activeTrack]);

  useEffect(() => {
    if (!executor) {
      setLoad({ phase: 'idle' });
      return;
    }
    const unsubscribe = executor.subscribeLoad(setLoad);
    // База грузится сразу при выборе трека: 3.5 МБ по сети один раз, дальше из кеша.
    // Начинать загрузку в момент открытия задания — значит показать спиннер там,
    // где человек уже настроился думать.
    executor.init().catch(() => undefined);
    return unsubscribe;
  }, [executor]);

  useEffect(() => saveProgress(progress), [progress]);

  const dueCount = useMemo(
    () => activePack.skills.filter((s) => skillState(progress, s.id).reps > 0 && isDue(progress.skills[s.id])).length,
    [progress, activePack]
  );
  // Показываем начатые темы, а не «открытые»: открытых на старте всего одна,
  // и цифра «1 из 16» читается как «почти всё закрыто», хотя первая же сессия
  // разворачивает границу графа на пять тем.
  const startedCount = useMemo(
    () => activePack.skills.filter((s) => (progress.skills[s.id]?.reps ?? 0) > 0).length,
    [progress, activePack]
  );

  function startSession() {
    if (!activePack.tasks.length) return; // черновой трек — заданий ещё нет
    const picked = selectSession({
      skills: activePack.skills,
      tasks: activePack.tasks,
      states: progress.skills,
      solvedTaskIds: new Set(Object.entries(progress.taskRecords).filter(([, r]) => r.solved).map(([id]) => id)),
      size: SESSION_SIZE,
    });
    if (!picked.length) return;

    // Перед первой задачей на навык вставляем карточку приёма. Признак «первой» —
    // отсутствие повторений: как только задача решена, счётчик растёт и теория
    // больше не всплывает.
    const introduced = new Set<string>();
    const queue: Step[] = [];
    for (const task of picked) {
      const lesson = lessonBySkill.get(task.skill);
      const isNew = (progress.skills[task.skill]?.reps ?? 0) === 0;
      if (lesson && isNew && !introduced.has(task.skill)) {
        introduced.add(task.skill);
        queue.push({ kind: 'lesson', lesson });
      }
      queue.push({ kind: 'task', task });
    }
    setScreen({ name: 'session', queue, index: 0 });
  }

  function advance() {
    setScreen((s) => {
      if (s.name !== 'session') return s;
      const next = s.index + 1;
      if (next >= s.queue.length) {
        return { name: 'done', solved: s.queue.filter((q) => q.kind === 'task').length };
      }
      return { ...s, index: next };
    });
    window.scrollTo({ top: 0 });
  }

  function handleDone(task: Task, outcome: TaskOutcome) {
    const grade = gradeFromAttempt(outcome);
    setProgress((p) =>
      applyAttempt(
        p,
        {
          taskId: task.id,
          skills: [task.skill, ...(task.alsoTrains ?? [])],
          correct: outcome.correct,
          wrongAttempts: outcome.wrongAttempts,
          hintsUsed: outcome.hintsUsed,
          grade,
        },
        review
      )
    );
    advance();
  }

  function switchTrack(track: Track) {
    setActiveTrack(track);
    setScreen({ name: 'home' });
  }

  const step = screen.name === 'session' ? screen.queue[screen.index] : null;

  return (
    <div className="app">
      <header className="topbar">
        {screen.name !== 'home' && (
          <button
            className="icon-btn"
            // Из карточки возвращаемся в список приёмов, а не на главную:
            // в справочнике их обычно листают подряд.
            onClick={() => setScreen(screen.name === 'lesson' ? { name: 'reference' } : { name: 'home' })}
            aria-label={ru.app.back}
          >
            ←
          </button>
        )}
        <h1>
          {screen.name === 'session'
            ? ru.session.title
            : screen.name === 'reference'
              ? ru.reference.title
              : screen.name === 'lesson'
                ? ru.lesson.pill
                : ru.app.name}
          <span className="sub">
            {screen.name === 'session'
              ? ru.session.progressOf(screen.index + 1, screen.queue.length)
              : screen.name === 'reference'
                ? activePack.title
                : screen.name === 'lesson'
                  ? (lessonBySkill.get(screen.skill)?.title ?? '')
                  : `${activePack.title} · серия ${streak(progress.activeDays)} дн.`}
          </span>
        </h1>
        {screen.name === 'session' && (
          <div className="progress-dots" aria-hidden>
            {screen.queue.map((_, i) => (
              <i key={i} className={i < screen.index ? 'done' : i === screen.index ? 'current' : ''} />
            ))}
          </div>
        )}
      </header>

      <main className="content">
        {load.phase === 'error' && (
          <div className="feedback error">
            <h3>{ru.loadError.title}</h3>
            <p>{load.message}</p>
            <button className="btn secondary" onClick={() => location.reload()}>
              {ru.loadError.reloadBtn}
            </button>
          </div>
        )}

        {screen.name === 'home' && (
          <Home
            activeTrack={activeTrack}
            activePack={activePack}
            progress={progress}
            dueCount={dueCount}
            startedCount={startedCount}
            loading={load.phase === 'loading' || load.phase === 'idle'}
            onStart={startSession}
            onOpenSchema={() => setSchemaOpen(true)}
            onOpenReference={() => setScreen({ name: 'reference' })}
            onSwitchTrack={switchTrack}
          />
        )}

        {step?.kind === 'lesson' && executor && (
          <LessonCard key={step.lesson.skill} lesson={step.lesson} executor={executor} onContinue={advance} />
        )}

        {step?.kind === 'task' && executor && (
          <TaskView
            key={step.task.id}
            task={step.task}
            executor={executor}
            schema={schema}
            onOpenSchema={() => setSchemaOpen(true)}
            onDone={(o) => handleDone(step.task, o)}
          />
        )}

        {screen.name === 'reference' && (
          <Reference activePack={activePack} progress={progress} onOpen={(skill) => setScreen({ name: 'lesson', skill })} />
        )}

        {screen.name === 'lesson' && lessonBySkill.get(screen.skill) && executor && (
          <LessonCard lesson={lessonBySkill.get(screen.skill)!} executor={executor} />
        )}

        {screen.name === 'done' && (
          <div className="card">
            <h2>{ru.session.doneTitle}</h2>
            <p className="muted">{ru.session.doneBody(screen.solved)}</p>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setScreen({ name: 'home' })}>
              {ru.session.homeBtn}
            </button>
          </div>
        )}
      </main>

      {schemaOpen && <SchemaSheet doc={schema} onClose={() => setSchemaOpen(false)} />}
    </div>
  );
}

/**
 * Переключатель треков — карта дорожной карты, а не просто навигация.
 * Черновые треки видны и кликабельны (можно посмотреть граф навыков),
 * но помечены статусом и не дают начать занятие — контента там пока нет.
 */
function TrackSwitcher({ active, onSelect }: { active: Track; onSelect: (t: Track) => void }) {
  return (
    <div className="tabs tracks" role="tablist" aria-label={ru.tracks.ariaLabel}>
      {TRACK_ORDER.map((t) => {
        const p = packForTrack(t);
        if (!p) return null;
        const ready = p.status !== 'draft' && p.tasks.length > 0;
        return (
          <button
            key={t}
            role="tab"
            aria-selected={active === t}
            aria-pressed={active === t}
            className={ready ? undefined : 'draft'}
            onClick={() => onSelect(t)}
          >
            <span>{p.title}</span>
            <small>{ready ? ru.tracks.readyBadge(p.tasks.length) : ru.tracks.draftBadge}</small>
          </button>
        );
      })}
    </div>
  );
}

function Home({
  activeTrack,
  activePack,
  progress,
  dueCount,
  startedCount,
  loading,
  onStart,
  onOpenSchema,
  onOpenReference,
  onSwitchTrack,
}: {
  activeTrack: Track;
  activePack: Pack;
  progress: Progress;
  dueCount: number;
  startedCount: number;
  loading: boolean;
  onStart: () => void;
  onOpenSchema: () => void;
  onOpenReference: () => void;
  onSwitchTrack: (t: Track) => void;
}) {
  const byTier = useMemo(() => {
    const groups = new Map<number, typeof activePack.skills>();
    for (const s of activePack.skills) {
      const list = groups.get(s.tier) ?? [];
      list.push(s);
      groups.set(s.tier, list);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [activePack]);

  const ready = activePack.status !== 'draft' && activePack.tasks.length > 0;
  // Показываем ровно один раз, до первой же решённой задачи или начатого навыка —
  // дальше это уже не «что это такое», а лишняя строчка над картой навыков.
  const isNewUser = Object.keys(progress.skills).length === 0 && progress.totalSolved === 0;

  return (
    <>
      {isNewUser && (
        <div className="card">
          <p className="brief" style={{ margin: 0 }}>{ru.welcome.body}</p>
        </div>
      )}

      <TrackSwitcher active={activeTrack} onSelect={onSwitchTrack} />

      {ready && (
        <div className="card">
          <div className="hero">
            <div>
              <div className="big">{dueCount}</div>
              <div className="muted">{ru.home.dueLabel}</div>
            </div>
            <div>
              <div className="big">{progress.totalSolved}</div>
              <div className="muted">{ru.home.solvedLabel}</div>
            </div>
            <div>
              <div className="big">{startedCount}</div>
              <div className="muted">{ru.home.startedOf(startedCount, activePack.skills.length)}</div>
            </div>
          </div>
          <button className="btn" onClick={onStart} disabled={loading}>
            {loading ? ru.home.loading : dueCount > 0 ? ru.home.startBtnResume : ru.home.startBtnBegin}
          </button>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
            {ru.home.heroNote}
          </p>
        </div>
      )}

      {!ready && (
        <div className="card">
          <p className="brief" style={{ marginBottom: 6 }}>{activePack.description}</p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{ru.home.draftNote}</p>
        </div>
      )}

      <div className="card">
        <h2>{ru.home.skillMapTitle}</h2>
        {byTier.map(([tier, list]) => (
          <div key={tier} style={{ marginTop: 12 }}>
            <p className="muted" style={{ margin: '0 0 2px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {activePack.tierNames?.[tier] ?? `Уровень ${tier}`}
            </p>
            {list.map((s) => {
              const st = progress.skills[s.id];
              // Уже начатая тема не может быть «закрытой», даже если предпосылка
              // взята неуверенно: планировщик выдаёт темы волной, и подпись
              // «откроется позже» на пройденном задании выглядит как сбой.
              const unlocked = isUnlocked(s, progress.skills) || (st?.reps ?? 0) > 0;
              const m = mastery(st);
              const due = st && st.reps > 0 && isDue(st);
              return (
                <div className={`skill-row${unlocked ? '' : ' locked'}`} key={s.id}>
                  <div className="name">
                    {s.title}
                    <small>{unlocked ? s.summary : ru.home.lockedNote}</small>
                  </div>
                  {ready && (
                    <div className={`bar${due ? ' due' : ''}`} title={`Освоено на ${Math.round(m * 100)}%`}>
                      <span style={{ width: `${Math.max(m * 100, m > 0 ? 8 : 0)}%` }} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {ready && (
        <div className="row">
          <button className="btn secondary" onClick={onOpenReference}>
            {ru.home.referenceBtn}
          </button>
          <button className="btn secondary" onClick={onOpenSchema}>
            {ru.home.schemaBtn}
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Справочник приёмов.
 *
 * Отдельный от занятий режим чтения — под сценарий «освежить перед задачей
 * на работе или перед собеседованием». Без него теория существует только
 * внутри занятия и добраться до неё второй раз невозможно.
 */
function Reference({
  activePack,
  progress,
  onOpen,
}: {
  activePack: Pack;
  progress: Progress;
  onOpen: (skill: string) => void;
}) {
  const byTier = useMemo(() => {
    const groups = new Map<number, typeof activePack.skills>();
    for (const s of activePack.skills) {
      if (!lessonBySkill.has(s.id)) continue;
      const list = groups.get(s.tier) ?? [];
      list.push(s);
      groups.set(s.tier, list);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [activePack]);

  if (!byTier.length) {
    return (
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>{ru.reference.emptyNote}</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          {ru.reference.intro}
        </p>
      </div>
      <div className="card">
        {byTier.map(([tier, list]) => (
          <div key={tier} style={{ marginTop: tier === byTier[0][0] ? 0 : 14 }}>
            <p
              className="muted"
              style={{ margin: '0 0 2px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}
            >
              {activePack.tierNames?.[tier] ?? `Уровень ${tier}`}
            </p>
            {list.map((s) => {
              const st = progress.skills[s.id];
              const seen = (st?.reps ?? 0) > 0;
              return (
                <button
                  key={s.id}
                  className="skill-row"
                  onClick={() => onOpen(s.id)}
                  style={{ width: '100%', textAlign: 'left' }}
                >
                  <div className="name">
                    {s.title}
                    <small>{seen ? s.summary : ru.reference.notSeen}</small>
                  </div>
                  <span className="pill">{seen ? ru.reference.openBtn : ru.reference.nextBtn}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
