import { useEffect, useMemo, useRef, useState } from 'react';
import { lessonBySkill, packForTrack, packs } from './content';
import type { Lesson, Pack, Task, Track } from './content/types';
import { getExecutor } from './engine/executors';
import type { LoadState } from './engine/types';
import { useI18n } from './i18n/context';
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

type FontSize = 'md' | 'lg' | 'xl';
const FONT_SIZE_ORDER: FontSize[] = ['md', 'lg', 'xl'];
const FONT_SIZE_STORAGE_KEY = 'querium-font-size';

function initialFontSize(): FontSize {
  try {
    const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (stored === 'md' || stored === 'lg' || stored === 'xl') return stored;
  } catch {
    // localStorage недоступен — просто не запоминаем выбор
  }
  return 'md';
}

/** Раз в столько мс перестаём считать повторное «назад» подтверждением выхода. */
const EXIT_HINT_MS = 2000;

/**
 * Порядок треков на главной — не алфавитный, а порядок дорожной карты,
 * повторяющий реальный рабочий процесс: «аналитика как профессия» задаёт
 * контекст → SQL достаёт данные из системы-источника → pandas делает то,
 * что одним запросом неудобно → Power BI/DAX моделирует уже выгруженное
 * и приведённое в порядок. Пояснение для пользователя — в about.tracksWhy*.
 */
const TRACK_ORDER: Track[] = ['domain', 'sql', 'python', 'model'];

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
  | { name: 'lesson'; skill: string }
  | { name: 'about' };

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [activeTrack, setActiveTrack] = useState<Track>('sql');
  const [load, setLoad] = useState<LoadState>({ phase: 'idle' });
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [showExitHint, setShowExitHint] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>(initialFontSize);
  const schema = useSchema();

  const cycleFontSize = () => {
    const next = FONT_SIZE_ORDER[(FONT_SIZE_ORDER.indexOf(fontSize) + 1) % FONT_SIZE_ORDER.length];
    setFontSize(next);
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, next);
    } catch {
      // см. initialFontSize
    }
  };

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

  /**
   * Аппаратная/жестовая кнопка «назад» на телефоне.
   *
   * Без этого эффекта первое же «назад» в PWA закрывает приложение: у вкладки
   * нет своей истории переходов, и браузеру/ОС уходить больше некуда. Держим
   * под текущим экраном одну запасную запись истории — тогда «назад» всегда
   * сначала попадает сюда, а не сразу в закрытие. Popstate обрабатываем так же,
   * как верхнюю стрелку в шапке (лекция → справочник, всё остальное → главная),
   * и сразу восстанавливаем запас, чтобы следующее «назад» тоже перехватилось.
   *
   * На главном экране запас не восстанавливаем при повторном «назад» подряд —
   * тогда следующее нажатие уходит на закрытие по-настоящему. Это и есть
   * «нажмите ещё раз, чтобы выйти»: полностью гарантировать закрытие ровно
   * на втором нажатии нельзя (JS не видит самое первое «назад» с пустой
   * историей ни при каких ухищрениях), но начиная с этого места дальше
   * выход больше не будет неожиданным.
   */
  const exitArmedRef = useRef(false);
  const exitTimerRef = useRef<number | undefined>(undefined);
  const schemaOpenRef = useRef(schemaOpen);
  useEffect(() => {
    schemaOpenRef.current = schemaOpen;
  }, [schemaOpen]);
  // Текущий экран читаем через ref, а не из замыкания: обработчик popstate
  // сам вызывает setState (и side-effect'ы вроде pushState/таймера), а делать
  // это внутри функционального апдейтера setScreen нельзя — React вправе
  // вызвать такой апдейтер повторно (и делает это в StrictMode), и тогда
  // history задваивается, а подсказка о выходе взводится не тем нажатием.
  const screenRef = useRef(screen);
  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  useEffect(() => {
    history.replaceState(null, '');
    history.pushState(null, '');

    function onPopState() {
      // Открытая шторка со схемой — самый верхний слой: «назад» должен закрыть
      // её, а не менять экран под ней (тот и не виден, пока шторка открыта).
      if (schemaOpenRef.current) {
        setSchemaOpen(false);
        history.pushState(null, '');
        return;
      }
      const current = screenRef.current;
      if (current.name === 'home') {
        if (exitArmedRef.current) return; // второе «назад» подряд — не мешаем выходу
        exitArmedRef.current = true;
        setShowExitHint(true);
        window.clearTimeout(exitTimerRef.current);
        exitTimerRef.current = window.setTimeout(() => {
          exitArmedRef.current = false;
          setShowExitHint(false);
        }, EXIT_HINT_MS);
        history.pushState(null, '');
        return;
      }
      history.pushState(null, '');
      setScreen(current.name === 'lesson' ? { name: 'reference' } : { name: 'home' });
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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

  /**
   * Практика по одной теме — вход не через подбор SRS, а напрямую с карты
   * навыков или из справочника: карточка приёма (если есть) плюс несколько
   * заданий именно на этот навык. В отличие от startSession, тема здесь не
   * выбирается алгоритмом — человек уже выбрал её сам, кликнув по строке.
   */
  function startSkillSession(skillId: string) {
    const pool = activePack.tasks.filter((t) => t.skill === skillId);
    if (!pool.length) return;
    const solvedTaskIds = new Set(
      Object.entries(progress.taskRecords).filter(([, r]) => r.solved).map(([id]) => id)
    );
    // Нерешённые вперёд — как и в обычном подборе; если решено всё, берём
    // пачку для повторения, а не отказываем в практике.
    const unsolved = pool.filter((t) => !solvedTaskIds.has(t.id)).sort((a, b) => a.level - b.level);
    const picked = (unsolved.length ? unsolved : pool).slice(0, 3);

    const lesson = lessonBySkill.get(skillId);
    const queue: Step[] = lesson ? [{ kind: 'lesson', lesson }] : [];
    for (const task of picked) queue.push({ kind: 'task', task });
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

  /**
   * Возврат к уже пройденному шагу занятия — не то же самое, что кнопка
   * «назад» в шапке (та выходит из занятия целиком на главную). Индекс
   * ограничен снизу нулём и сверху текущим шагом: заглядывать вперёд,
   * минуя ещё не показанные карточки и задания, нельзя.
   */
  function goToStep(i: number) {
    setScreen((s) => (s.name === 'session' && i >= 0 && i < s.index ? { ...s, index: i } : s));
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
    <div className={`app${fontSize !== 'md' ? ` font-${fontSize}` : ''}`}>
      <header className="topbar">
        {screen.name !== 'home' && (
          <button
            className="icon-btn"
            // Из карточки возвращаемся в список приёмов, а не на главную:
            // в справочнике их обычно листают подряд.
            onClick={() => setScreen(screen.name === 'lesson' ? { name: 'reference' } : { name: 'home' })}
            aria-label={t.app.back}
          >
            ←
          </button>
        )}
        <h1>
          {screen.name === 'session'
            ? t.session.title
            : screen.name === 'reference'
              ? t.reference.title
              : screen.name === 'lesson'
                ? t.lesson.pill
                : screen.name === 'about'
                  ? t.about.title
                  : t.app.name}
          <span className="sub">
            {screen.name === 'session'
              ? t.session.progressOf(screen.index + 1, screen.queue.length)
              : screen.name === 'reference'
                ? t.tracks.names[activeTrack]
                : screen.name === 'lesson'
                  ? (lessonBySkill.get(screen.skill)?.title ?? '')
                  : screen.name === 'about'
                    ? t.app.name
                    : `${t.tracks.names[activeTrack]} · серия ${streak(progress.activeDays)} дн.`}
          </span>
        </h1>
        {screen.name === 'session' && screen.index > 0 && (
          <button className="icon-btn" onClick={() => goToStep(screen.index - 1)} aria-label={t.session.prevAria}>
            ‹
          </button>
        )}
        {screen.name === 'session' && (
          <div className="progress-dots">
            {screen.queue.map((_, i) =>
              i < screen.index ? (
                <button
                  key={i}
                  className="dot done"
                  onClick={() => goToStep(i)}
                  aria-label={t.session.stepAria(i + 1)}
                />
              ) : (
                <i key={i} className={`dot${i === screen.index ? ' current' : ''}`} aria-hidden />
              )
            )}
          </div>
        )}
        <button className="icon-btn" aria-label={t.fontSize.aria} onClick={cycleFontSize}>
          {fontSize === 'md' ? 'A' : fontSize === 'lg' ? 'A+' : 'A++'}
        </button>
        <button
          className="icon-btn"
          aria-label={t.locale.switchAriaLabel}
          onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')}
        >
          {locale === 'ru' ? 'EN' : 'RU'}
        </button>
      </header>

      <main className="content">
        {load.phase === 'error' && (
          <div className="feedback error">
            <h3>{t.loadError.title}</h3>
            <p>{load.message}</p>
            <button className="btn secondary" onClick={() => location.reload()}>
              {t.loadError.reloadBtn}
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
            consent={load.phase === 'consent' ? load.bytes : null}
            onConfirmDownload={() => executor?.confirmDownload?.()}
            onStart={startSession}
            onOpenSchema={() => setSchemaOpen(true)}
            onOpenReference={() => setScreen({ name: 'reference' })}
            onOpenAbout={() => setScreen({ name: 'about' })}
            onSwitchTrack={switchTrack}
            onStartSkill={startSkillSession}
          />
        )}

        {screen.name === 'about' && (
          <About onSelectTrack={(track) => { switchTrack(track); }} />
        )}

        {step?.kind === 'lesson' && executor && (
          <LessonCard
            key={step.lesson.skill}
            lesson={step.lesson}
            executor={executor}
            runnable={activeTrack === 'sql' || activeTrack === 'python'}
            onContinue={advance}
          />
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
          <LessonCard
            lesson={lessonBySkill.get(screen.skill)!}
            executor={executor}
            runnable={activeTrack === 'sql' || activeTrack === 'python'}
          />
        )}

        {screen.name === 'done' && (
          <div className="card">
            <h2>{t.session.doneTitle}</h2>
            <p className="muted">{t.session.doneBody(screen.solved)}</p>
            <button className="btn" style={{ marginTop: 12 }} onClick={() => setScreen({ name: 'home' })}>
              {t.session.homeBtn}
            </button>
          </div>
        )}
      </main>

      {schemaOpen && <SchemaSheet doc={schema} onClose={() => setSchemaOpen(false)} />}

      {showExitHint && <div className="exit-hint">{t.app.exitHint}</div>}
    </div>
  );
}

/**
 * Переключатель треков — карта дорожной карты, а не просто навигация.
 * Черновые треки видны и кликабельны (можно посмотреть граф навыков),
 * но помечены статусом и не дают начать занятие — контента там пока нет.
 */
function TrackSwitcher({ active, onSelect }: { active: Track; onSelect: (track: Track) => void }) {
  const { t } = useI18n();
  return (
    <div className="tabs tracks" role="tablist" aria-label={t.tracks.ariaLabel}>
      {TRACK_ORDER.map((track) => {
        const p = packForTrack(track);
        if (!p) return null;
        const ready = p.status !== 'draft' && p.tasks.length > 0;
        return (
          <button
            key={track}
            role="tab"
            aria-selected={active === track}
            aria-pressed={active === track}
            className={ready ? undefined : 'draft'}
            onClick={() => onSelect(track)}
          >
            <span>{t.tracks.names[track]}</span>
            <small>{ready ? t.tracks.readyBadge(p.tasks.length) : t.tracks.draftBadge}</small>
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
  consent,
  onConfirmDownload,
  onStart,
  onOpenSchema,
  onOpenReference,
  onOpenAbout,
  onSwitchTrack,
  onStartSkill,
}: {
  activeTrack: Track;
  activePack: Pack;
  progress: Progress;
  dueCount: number;
  startedCount: number;
  loading: boolean;
  /** Байт для скачивания, если исполнитель ждёт согласия (см. LoadState 'consent'), иначе null. */
  consent: number | null;
  onConfirmDownload: () => void;
  onStart: () => void;
  onOpenSchema: () => void;
  onOpenReference: () => void;
  onOpenAbout: () => void;
  onSwitchTrack: (track: Track) => void;
  /** Практика по одной теме прямо с карты навыков — не через подбор занятия. */
  onStartSkill: (skillId: string) => void;
}) {
  const { t, locale } = useI18n();
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
  /**
   * Пишет ли человек код в этом треке. Выводится из самих заданий, а не из
   * названия трека: пак, где всё в режиме predict, кода не требует, и обещать
   * «запросы выполняются по-настоящему» там нельзя. Схема данных по той же
   * причине не нужна — писать запрос к этим таблицам никто не будет.
   */
  const writesCode = activePack.tasks.some((t) => t.mode !== 'predict');
  // Показываем ровно один раз, до первой же решённой задачи или начатого навыка —
  // дальше это уже не «что это такое», а лишняя строчка над картой навыков.
  const isNewUser = Object.keys(progress.skills).length === 0 && progress.totalSolved === 0;

  return (
    <>
      {isNewUser && (
        <div className="card">
          <p className="brief" style={{ margin: 0 }}>{t.welcome.body}</p>
        </div>
      )}

      <TrackSwitcher active={activeTrack} onSelect={onSwitchTrack} />

      {/*
       * Показываем только на английском: это признание, что контент заданий
       * ещё не переведён, и по-русски оно просто неуместно.
       */}
      {locale === 'en' && (
        <p className="muted" style={{ margin: '-6px 0 12px', fontSize: 12 }}>{t.locale.partialNote}</p>
      )}

      {/*
       * Постоянная ссылка, а не разовая карточка новичка: та показывается один
       * раз и исчезает после первой решённой задачи, а вопрос «что вообще
       * входит в тренажёр и как это устроено» у человека может возникнуть
       * и на второй, и на десятой сессии — особенно если он открывает
       * приложение по ссылке, а не проходит его сам с нуля.
       */}
      <button
        type="button"
        className="link-row"
        onClick={onOpenAbout}
        style={{ margin: '-2px 0 12px' }}
      >
        {t.about.entryLink}
      </button>

      {/*
       * Согласие — приоритетнее обычного hero-блока: пока исполнитель ждёт
       * решения пользователя, начинать занятие нельзя (init() ещё не дошёл
       * до реальной загрузки), а показывать пустой счётчик «0 на повторение»
       * поверх невыполнимой кнопки было бы просто ложью на экране.
       */}
      {consent !== null && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t.consent.title}</h2>
          <p className="brief">{t.consent.body(Math.round(consent / 1e6))}</p>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>{t.consent.note}</p>
          <button className="btn" onClick={onConfirmDownload}>
            {t.consent.confirmBtn}
          </button>
        </div>
      )}

      {ready && consent === null && (
        <div className="card">
          <div className="hero">
            <div>
              <div className="big">{dueCount}</div>
              <div className="muted">{t.home.dueLabel}</div>
            </div>
            <div>
              <div className="big">{progress.totalSolved}</div>
              <div className="muted">{t.home.solvedLabel}</div>
            </div>
            <div>
              <div className="big">{startedCount}</div>
              <div className="muted">{t.home.startedOf(startedCount, activePack.skills.length)}</div>
            </div>
          </div>
          <button className="btn" onClick={onStart} disabled={loading}>
            {loading ? t.home.loading : dueCount > 0 ? t.home.startBtnResume : t.home.startBtnBegin}
          </button>
          <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
            {writesCode ? t.home.heroNote : t.home.heroNoteNoCode}
          </p>
        </div>
      )}

      {!ready && (
        <div className="card">
          <p className="brief" style={{ marginBottom: 6 }}>{activePack.description}</p>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t.home.draftNote}</p>
        </div>
      )}

      <div className="card">
        <h2>{t.home.skillMapTitle}</h2>
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
              const clickable = ready && unlocked;
              const row = (
                <>
                  <div className="name">
                    {s.title}
                    <small>{unlocked ? s.summary : t.home.lockedNote}</small>
                  </div>
                  {ready && (
                    <div className={`bar${due ? ' due' : ''}`} title={`Освоено на ${Math.round(m * 100)}%`}>
                      <span style={{ width: `${Math.max(m * 100, m > 0 ? 8 : 0)}%` }} />
                    </div>
                  )}
                </>
              );
              return clickable ? (
                <button
                  key={s.id}
                  type="button"
                  className="skill-row"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => onStartSkill(s.id)}
                >
                  {row}
                </button>
              ) : (
                <div className={`skill-row${unlocked ? '' : ' locked'}`} key={s.id}>
                  {row}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {ready && (
        <div className="row">
          <button className="btn secondary" onClick={onOpenReference}>
            {t.home.referenceBtn}
          </button>
          {writesCode && (
            <button className="btn secondary" onClick={onOpenSchema}>
              {t.home.schemaBtn}
            </button>
          )}
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
/**
 * «О тренажёре» — единственный экран, который отвечает на вопрос «что это
 * вообще такое и что тут есть», не требуя пройти хотя бы одну сессию.
 * Карточка новичка на главной решает ту же задачу, но исчезает после первой
 * решённой задачи; этот экран остаётся доступен всегда — по ссылке, из
 * справочника или просто когда человек вернулся через неделю и забыл,
 * что где лежит.
 */
function About({ onSelectTrack }: { onSelectTrack: (track: Track) => void }) {
  const { t } = useI18n();
  const totalTasks = packs.reduce((n, p) => n + p.tasks.length, 0);
  const totalSkills = packs.reduce((n, p) => n + p.skills.length, 0);

  return (
    <>
      <div className="card">
        <p className="brief" style={{ margin: 0 }}>{t.welcome.body}</p>
      </div>

      <div className="card">
        <h2>{t.about.structureTitle}</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          {t.about.structureIntro(totalSkills, totalTasks)}
        </p>
        {TRACK_ORDER.map((track) => {
          const p = packForTrack(track);
          if (!p) return null;
          const ready = p.status !== 'draft' && p.tasks.length > 0;
          return (
            <button
              key={track}
              type="button"
              className="track-summary"
              onClick={() => onSelectTrack(track)}
            >
              <div className="track-summary-head">
                <span>{t.tracks.names[track]}</span>
                <span className={`pill ${ready ? '' : 'draft'}`}>
                  {ready ? t.tracks.readyBadge(p.tasks.length) : t.tracks.draftBadge}
                </span>
              </div>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13, lineHeight: 1.5 }}>
                {p.description}
              </p>
            </button>
          );
        })}
        <p
          className="muted"
          style={{ margin: '14px 0 2px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {t.about.tracksWhyTitle}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          {t.about.tracksWhyBody}
        </p>
      </div>

      <div className="card">
        <h2>{t.about.howTitle}</h2>
        <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>{t.about.howSrs}</p>
        <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>{t.about.howModes}</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{t.about.howData}</p>
      </div>

      <div className="card">
        <h2>{t.about.privacyTitle}</h2>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{t.about.privacyBody}</p>
      </div>
    </>
  );
}

function Reference({
  activePack,
  progress,
  onOpen,
}: {
  activePack: Pack;
  progress: Progress;
  onOpen: (skill: string) => void;
}) {
  const { t } = useI18n();
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
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t.reference.emptyNote}</p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          {activePack.tasks.some((t) => t.mode !== 'predict') ? t.reference.intro : t.reference.introNoCode}
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
                    <small>{seen ? s.summary : t.reference.notSeen}</small>
                  </div>
                  <span className="pill">{seen ? t.reference.openBtn : t.reference.nextBtn}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
