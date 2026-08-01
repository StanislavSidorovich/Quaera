import { useEffect, useMemo, useState } from 'react';
import { pack, skills, tasks } from './content';
import type { Task } from './content/types';
import { initDatabase, subscribeLoad, type LoadState } from './engine/sqlClient';
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

type Screen = { name: 'home' } | { name: 'session'; queue: Task[]; index: number } | { name: 'done'; solved: number };

export default function App() {
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [load, setLoad] = useState<LoadState>({ phase: 'idle' });
  const [schemaOpen, setSchemaOpen] = useState(false);
  const schema = useSchema();

  useEffect(() => subscribeLoad(setLoad), []);
  // База грузится сразу на главной: 3.5 МБ по сети один раз, дальше из кеша.
  // Начинать загрузку в момент открытия задания — значит показать спиннер там,
  // где человек уже настроился думать.
  useEffect(() => {
    initDatabase().catch(() => undefined);
  }, []);
  useEffect(() => saveProgress(progress), [progress]);

  const dueCount = useMemo(
    () => skills.filter((s) => skillState(progress, s.id).reps > 0 && isDue(progress.skills[s.id])).length,
    [progress]
  );
  // Показываем начатые темы, а не «открытые»: открытых на старте всего одна,
  // и цифра «1 из 16» читается как «почти всё закрыто», хотя первая же сессия
  // разворачивает границу графа на пять тем.
  const startedCount = useMemo(
    () => skills.filter((s) => (progress.skills[s.id]?.reps ?? 0) > 0).length,
    [progress]
  );

  function startSession() {
    const queue = selectSession({
      skills,
      tasks,
      states: progress.skills,
      solvedTaskIds: new Set(Object.entries(progress.taskRecords).filter(([, r]) => r.solved).map(([id]) => id)),
      size: SESSION_SIZE,
    });
    if (!queue.length) return;
    setScreen({ name: 'session', queue, index: 0 });
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
    setScreen((s) => {
      if (s.name !== 'session') return s;
      const next = s.index + 1;
      if (next >= s.queue.length) return { name: 'done', solved: s.queue.length };
      return { ...s, index: next };
    });
    window.scrollTo({ top: 0 });
  }

  const current = screen.name === 'session' ? screen.queue[screen.index] : null;

  return (
    <div className="app">
      <header className="topbar">
        {screen.name !== 'home' && (
          <button className="icon-btn" onClick={() => setScreen({ name: 'home' })} aria-label="На главную">
            ←
          </button>
        )}
        <h1>
          {screen.name === 'session' ? 'Занятие' : 'Querium'}
          <span className="sub">
            {screen.name === 'session'
              ? `${screen.index + 1} из ${screen.queue.length}`
              : `${pack.title} · серия ${streak(progress.activeDays)} дн.`}
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
            <h3>Не удалось загрузить данные</h3>
            <p>{load.message}</p>
            <button className="btn secondary" onClick={() => location.reload()}>
              Перезагрузить
            </button>
          </div>
        )}

        {screen.name === 'home' && (
          <Home
            progress={progress}
            dueCount={dueCount}
            startedCount={startedCount}
            loading={load.phase === 'loading' || load.phase === 'idle'}
            onStart={startSession}
            onOpenSchema={() => setSchemaOpen(true)}
          />
        )}

        {current && (
          <TaskView
            key={current.id}
            task={current}
            schema={schema}
            onOpenSchema={() => setSchemaOpen(true)}
            onDone={(o) => handleDone(current, o)}
          />
        )}

        {screen.name === 'done' && (
          <div className="card">
            <h2>Занятие закончено</h2>
            <p className="muted">
              Пройдено заданий: {screen.solved}. Навыки, которых они касались, вернутся на повторение —
              интервал зависит от того, насколько уверенно вы их взяли.
            </p>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setScreen({ name: 'home' })}>
              На главную
            </button>
          </div>
        )}
      </main>

      {schemaOpen && <SchemaSheet doc={schema} onClose={() => setSchemaOpen(false)} />}
    </div>
  );
}

function Home({
  progress,
  dueCount,
  startedCount,
  loading,
  onStart,
  onOpenSchema,
}: {
  progress: Progress;
  dueCount: number;
  startedCount: number;
  loading: boolean;
  onStart: () => void;
  onOpenSchema: () => void;
}) {
  const byTier = useMemo(() => {
    const groups = new Map<number, typeof skills>();
    for (const s of skills) {
      const list = groups.get(s.tier) ?? [];
      list.push(s);
      groups.set(s.tier, list);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, []);

  const TIER_NAMES: Record<number, string> = {
    1: 'Основа',
    2: 'Агрегация и соединения',
    3: 'Реальные данные',
    4: 'Продвинутое',
  };

  return (
    <>
      <div className="card">
        <div className="hero">
          <div>
            <div className="big">{dueCount}</div>
            <div className="muted">на повторение</div>
          </div>
          <div>
            <div className="big">{progress.totalSolved}</div>
            <div className="muted">решено</div>
          </div>
          <div>
            <div className="big">{startedCount}</div>
            <div className="muted">из {skills.length} тем начато</div>
          </div>
        </div>
        <button className="btn" onClick={onStart} disabled={loading}>
          {loading ? 'Загружаю данные…' : dueCount > 0 ? 'Повторить и продолжить' : 'Начать занятие'}
        </button>
        <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
          {SESSION_SIZE} заданий, примерно 7 минут. Запросы выполняются по-настоящему — на данных
          дистрибьютора FMCG и OTC-фармы за два с половиной года.
        </p>
      </div>

      <div className="card">
        <h2>Карта навыков</h2>
        {byTier.map(([tier, list]) => (
          <div key={tier} style={{ marginTop: 12 }}>
            <p className="muted" style={{ margin: '0 0 2px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {TIER_NAMES[tier] ?? `Уровень ${tier}`}
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
                    <small>{unlocked ? s.summary : 'Откроется после предыдущих тем'}</small>
                  </div>
                  <div className={`bar${due ? ' due' : ''}`} title={`Освоено на ${Math.round(m * 100)}%`}>
                    <span style={{ width: `${Math.max(m * 100, m > 0 ? 8 : 0)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <button className="btn secondary" onClick={onOpenSchema}>
        Посмотреть схему данных
      </button>
    </>
  );
}
