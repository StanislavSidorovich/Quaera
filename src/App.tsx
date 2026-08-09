import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { isTrackTranslated, lessonBySkill, lessonBySkillFor, packForTrack, packs, trackBySkill } from './content';
import type { Lesson, Pack, Skill, Task, Track } from './content/types';
import { getExecutor } from './engine/executors';
import type { LoadState } from './engine/types';
import { useI18n } from './i18n/context';
import { LessonCard } from './ui/LessonCard';
import { SchemaSheet, useSchema } from './ui/SchemaSheet';
import { Sidebar, type SidebarSection } from './ui/Sidebar';
import { TaskView, type TaskDraft, type TaskDraftStore, type TaskOutcome } from './ui/TaskView';
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
  exportProgress,
  loadProgress,
  parseImportedProgress,
  saveProgress,
  skillState,
  streak,
  today,
  type Progress,
} from './srs/store';

const SESSION_SIZE = 5;

/**
 * Автор и его публичные ссылки.
 *
 * Живут в коде, а не в i18n: адреса одинаковы на любой локали, а имя
 * различается только транслитерацией — её и держит перевод. Это первые
 * и пока единственные внешние ссылки в приложении, поэтому у них
 * `rel="noreferrer"`: обе ведут на профили, и передавать туда заголовок
 * Referer с адресом приложения незачем.
 *
 * Зачем вообще в интерфейсе, а не только в LICENSE: приложение раздаётся
 * по HTTP отдельно от репозитория, и человек, открывший querium.pages.dev,
 * файлов лицензий не видит вовсе. Без этого блока у него нет ни способа
 * узнать, кто автор, ни способа связаться — при том что контент отдан
 * под CC BY-NC-SA, которая требует указания авторства при переиспользовании.
 */
const AUTHOR_LINKEDIN = 'https://www.linkedin.com/in/stanislavsidorovich';
const AUTHOR_REPO = 'https://github.com/StanislavSidorovich/Querium';

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

/**
 * Тема оформления. 'system' — как в ОС (текущее поведение, media-запрос
 * в styles.css), 'light'/'dark' — принудительно, поверх системной настройки.
 * Класс вешается на <html>, а не на `.app`: переменные темы объявлены на
 * :root, и только там их можно надёжно переопределить в обе стороны.
 */
type Theme = 'system' | 'light' | 'dark';
const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];
const THEME_STORAGE_KEY = 'querium-theme';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'system' || stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage недоступен — просто не запоминаем выбор
  }
  return 'system';
}

const ACTIVE_TRACK_STORAGE_KEY = 'querium-active-track';
const ALL_TRACKS: Track[] = ['sql', 'model', 'python', 'domain'];

/**
 * Трек не сбрасывается на sql при перезагрузке страницы. Раньше activeTrack
 * жил только в состоянии React: F5 (или полная перезагрузка PWA на телефоне)
 * всегда возвращал на SQL, даже если человек был в domain или python, —
 * состояние занятия внутри трека при этом всё равно теряется (queue сессии
 * нигде не сохраняется), но хотя бы не приходится заново переключать трек.
 */
function initialActiveTrack(): Track {
  try {
    const stored = localStorage.getItem(ACTIVE_TRACK_STORAGE_KEY);
    if (ALL_TRACKS.includes(stored as Track)) return stored as Track;
  } catch {
    // localStorage недоступен — просто не запоминаем выбор
  }
  return 'sql';
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
  /**
   * `maxIndex` — самый дальний показанный шаг, а не длина очереди. Пока
   * ходить можно было только вперёд, он совпадал бы с index и был не нужен;
   * с возвратом на пройденный шаг появилось второе движение — вернуться
   * обратно туда, где остановился, не проходя середину заново.
   */
  | { name: 'session'; queue: Step[]; index: number; maxIndex: number }
  | { name: 'done'; solved: number }
  | { name: 'reference' }
  | { name: 'lesson'; skill: string }
  | { name: 'about' }
  | { name: 'trackIntro'; track: Track };

/**
 * Куда ведёт «назад» — одна функция на верхнюю стрелку и на аппаратную
 * кнопку телефона: раньше это условие стояло в двух местах и уже разъезжалось.
 *
 * С задания «назад» ведёт на карточку приёма этого же занятия, если она в нём
 * была, и только потом из занятия наружу. Причина в том, что вопрос «а как
 * это писалось?» возникает посреди задачи, а не вместо неё: выход на главную
 * стоил бы всего занятия целиком (очередь нигде не сохраняется), и человек
 * переставал за теорией ходить вовсе.
 */
function backTarget(current: Screen): Screen {
  // Из карточки возвращаемся в список приёмов, а не на главную:
  // в справочнике их обычно листают подряд.
  if (current.name === 'lesson') return { name: 'reference' };
  if (current.name === 'session') {
    const step = current.queue[current.index];
    if (step?.kind === 'task') {
      const lessonIndex = current.queue.findIndex(
        (s) => s.kind === 'lesson' && s.lesson.skill === step.task.skill
      );
      if (lessonIndex >= 0 && lessonIndex < current.index) return { ...current, index: lessonIndex };
    }
  }
  return { name: 'home' };
}

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [activeTrack, setActiveTrack] = useState<Track>(initialActiveTrack);
  const [load, setLoad] = useState<LoadState>({ phase: 'idle' });
  /**
   * Готовность Python-рантайма отдельно от activeTrack — нужна ровно для
   * одного случая: справочник сквозной по трекам (см. Reference), и карточку
   * python-навыка можно открыть, не заходя в сам трек python. Кнопка
   * «Выполнить» в такой карточке обязана остаться нерабочей (как для
   * domain/model), пока Pyodide не согласован и не загружен, — иначе клик
   * запускает initRuntime() в обход экрана согласия, который здесь не
   * отрисован, и виснет на фазе 'consent' без единой подсказки почему.
   * У SQL такого риска нет: initDatabase() не спрашивает согласия и просто
   * догружает 3.5 МБ по требованию, как и раньше.
   */
  const [pythonReady, setPythonReady] = useState(false);
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [showExitHint, setShowExitHint] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>(initialFontSize);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  /**
   * «Позже» на карточке согласия — только в памяти, без localStorage.
   * Само согласие хранится (см. CONSENT_KEY в pythonClient.ts), а отказ — нет:
   * запоминать «не хочу» надолго значило бы прятать единственный вход в трек
   * от человека, который через неделю вернулся уже по Wi-Fi.
   */
  const [consentDeferred, setConsentDeferred] = useState(false);
  const schema = useSchema();

  /**
   * Черновики шагов занятия: набранный запрос, выбранный вариант, открытые
   * подсказки, результат проверки — по одному на задание (см. TaskDraft).
   *
   * Ref, а не состояние: пишутся они на каждое нажатие клавиши в редакторе,
   * и через setState это перерисовывало бы всё приложение вместе с боковым
   * меню на каждую букву. Ничего от их содержимого не зависит при отрисовке
   * App — только сам экран задания при своём монтировании.
   *
   * Живут ровно одно занятие: новое начинается с чистого листа, иначе
   * задание, попавшее в подбор повторно через неделю, встретило бы человека
   * своим прошлым ответом.
   */
  const taskDraftsRef = useRef(new Map<string, TaskDraft>());
  const taskDrafts = useMemo<TaskDraftStore>(
    () => ({
      read: (taskId) => taskDraftsRef.current.get(taskId),
      write: (taskId, draft) => {
        taskDraftsRef.current.set(taskId, draft);
      },
    }),
    []
  );

  /**
   * Задания, попытка по которым уже ушла в прогресс. Возврат на решённый шаг
   * и повторное «Дальше» не должны считаться второй попыткой: SRS сдвинул бы
   * интервал повторения дважды за один и тот же ответ. Раньше это было почти
   * недостижимо (возврат обнулял экран, и задание пришлось бы решать заново),
   * теперь — один клик.
   */
  const recordedTasksRef = useRef(new Set<string>());

  const cycleFontSize = () => {
    const next = FONT_SIZE_ORDER[(FONT_SIZE_ORDER.indexOf(fontSize) + 1) % FONT_SIZE_ORDER.length];
    setFontSize(next);
    try {
      localStorage.setItem(FONT_SIZE_STORAGE_KEY, next);
    } catch {
      // см. initialFontSize
    }
  };

  const cycleTheme = () => {
    const next = THEME_ORDER[(THEME_ORDER.indexOf(theme) + 1) % THEME_ORDER.length];
    setTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // см. initialTheme
    }
  };

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('theme-light', theme === 'light');
    root.classList.toggle('theme-dark', theme === 'dark');
  }, [theme]);

  // Пак трека и его исполнитель — единственное место, где App знает,
  // что треков четыре. Всё остальное работает с activePack, не с конкретным sql-core.
  const activePack: Pack = packForTrack(activeTrack, locale)!;
  // Карточки приёмов на текущем языке — id скиллов одинаковы для обеих локалей,
  // меняется только проза внутри карточки (см. lessonBySkillFor в content/index.ts).
  const lessonBySkill = useMemo(() => lessonBySkillFor(locale), [locale]);
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

  // Пассивное наблюдение за python — subscribeLoad ничего не инициирует сам,
  // просто сообщает текущую фазу того же executor'а, который выше запускается
  // только когда python — активный трек. Здесь не .init(), а именно подписка.
  useEffect(() => {
    const pythonExecutor = getExecutor('python');
    if (!pythonExecutor) return;
    return pythonExecutor.subscribeLoad((s) => setPythonReady(s.phase === 'ready'));
  }, []);

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
      setScreen(backTarget(current));
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
  /**
   * Решено в этом треке, а не во всех сразу.
   *
   * Раньше сюда шёл progress.totalSolved — сумма по четырём трекам, — и стоял
   * он в одном ряду с двумя показателями текущего трека. На главной pandas
   * это выглядело так: карточка трека «0 / 43 выполнено», меню «0 / 43»,
   * а между ними счётчик «7 решено». Три числа рядом, разные знаменатели:
   * на дашборде это читается как ошибка в расчёте, а не как две разные метрики.
   * Считаем тем же способом, что карточка трека и меню, — по решённым
   * заданиям пака.
   */
  const solvedCount = useMemo(
    () => activePack.tasks.filter((task) => progress.taskRecords[task.id]?.solved).length,
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
    startQueue(queue);
  }

  /** Общий вход в занятие для обоих способов подбора — вместе со сбросом того, что живёт одно занятие. */
  function startQueue(queue: Step[]) {
    taskDraftsRef.current.clear();
    recordedTasksRef.current.clear();
    setScreen({ name: 'session', queue, index: 0, maxIndex: 0 });
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
    startQueue(queue);
  }

  function advance() {
    setScreen((s) => {
      if (s.name !== 'session') return s;
      const next = s.index + 1;
      if (next >= s.queue.length) {
        return { name: 'done', solved: s.queue.filter((q) => q.kind === 'task').length };
      }
      return { ...s, index: next, maxIndex: Math.max(s.maxIndex, next) };
    });
    window.scrollTo({ top: 0 });
  }

  /**
   * Переход на другой шаг занятия — не то же самое, что кнопка «назад»
   * в шапке (см. backTarget). Ходить можно по всему пройденному отрезку
   * в обе стороны: назад — перечитать теорию или свой прошлый ответ, вперёд —
   * вернуться туда, где остановился. Заглядывать за maxIndex нельзя:
   * следующая карточка и следующее задание ещё не показывались.
   */
  function goToStep(i: number) {
    setScreen((s) => (s.name === 'session' && i >= 0 && i <= s.maxIndex ? { ...s, index: i } : s));
    window.scrollTo({ top: 0 });
  }

  function handleDone(task: Task, outcome: TaskOutcome) {
    // Попытка засчитывается один раз за занятие — см. recordedTasksRef.
    // Шаг при этом двигается всегда: кнопка «Дальше» обязана вести дальше
    // и на решённом задании, куда человек просто вернулся посмотреть разбор.
    if (!recordedTasksRef.current.has(task.id)) {
      recordedTasksRef.current.add(task.id);
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
    }
    advance();
  }

  /** Скачивает текущий прогресс файлом — см. пояснение у exportProgress в srs/store.ts. */
  function downloadProgress() {
    const blob = new Blob([exportProgress(progress)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `querium-progress-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** true — файл распознан и прогресс заменён; false — не тот файл или битый JSON. */
  async function importProgressFile(file: File): Promise<boolean> {
    const raw = await file.text();
    const parsed = parseImportedProgress(raw);
    if (!parsed) return false;
    setProgress(parsed);
    return true;
  }

  /**
   * Переключение трека всегда ведёт на главную. Вводная карточка трека
   * никогда не показывается принудительно — только по кнопке с главного
   * экрана трека (см. openTrackIntro): раньше её навязывали при первом
   * входе, и это било по трекам с intro не одинаково (sql и domain её
   * показывали, python и model — нет, раз у них ещё нет текста), что
   * выглядело как случайное поведение, а не разница в наполнении.
   */
  function switchTrack(track: Track) {
    setActiveTrack(track);
    // Уход с трека закрывает вопрос о загрузке: вернувшись, человек снова
    // увидит карточку целиком, а не свёрнутую строку от прошлого отказа.
    setConsentDeferred(false);
    try {
      localStorage.setItem(ACTIVE_TRACK_STORAGE_KEY, track);
    } catch {
      // см. initialActiveTrack
    }
    setScreen({ name: 'home' });
  }

  function openTrackIntro(track: Track) {
    setScreen({ name: 'trackIntro', track });
  }

  const step = screen.name === 'session' ? screen.queue[screen.index] : null;

  /**
   * Подпись шага занятия. Карточки приёма в счёт задач не входят: они
   * стоят в той же очереди, но человек считает занятие задачами, а не
   * экранами (см. taskProgressOf в i18n).
   */
  const stepLabel = useMemo(() => {
    if (screen.name !== 'session') return null;
    const total = screen.queue.filter((s) => s.kind === 'task').length;
    if (screen.queue[screen.index]?.kind === 'lesson') return t.session.lessonStep;
    const done = screen.queue.slice(0, screen.index + 1).filter((s) => s.kind === 'task').length;
    return t.session.taskProgressOf(done, total);
  }, [screen, t]);

  // Занятие, карточка приёма и вводная трека своего пункта в меню не имеют:
  // подсвечивать там «Главную» значило бы врать о том, где человек находится.
  const sidebarSection: SidebarSection =
    screen.name === 'home' || screen.name === 'done'
      ? 'home'
      : screen.name === 'reference'
        ? 'reference'
        : screen.name === 'about'
          ? 'about'
          : null;

  return (
    <div className={`app${fontSize !== 'md' ? ` font-${fontSize}` : ''}`}>
      {/*
       * Постоянная боковая навигация — только от 1024px, на телефоне её нет
       * вовсе (см. Sidebar.tsx). Рендерится всегда: скрывает её CSS, а не
       * условие в JS, — иначе пришлось бы слушать resize и решать за браузер
       * то, что он и так знает, а на границе брейкпоинта компонент бы
       * размонтировался вместе со своим состоянием.
       */}
      <Sidebar
        section={sidebarSection}
        tracks={TRACK_ORDER}
        activeTrack={activeTrack}
        progress={progress}
        streakDays={streak(progress.activeDays)}
        onHome={() => setScreen({ name: 'home' })}
        onReference={() => setScreen({ name: 'reference' })}
        onAbout={() => setScreen({ name: 'about' })}
        onSelectTrack={switchTrack}
      />

      <div className="shell">
        <header className="topbar">
          {screen.name !== 'home' && (
            <button
              className="icon-btn"
              onClick={() => {
                setScreen(backTarget(screen));
                window.scrollTo({ top: 0 });
              }}
              aria-label={t.app.back}
            >
              ←
            </button>
          )}
          <h1 className={screen.name === 'home' ? 'brand' : undefined}>
            {screen.name === 'session'
              ? t.session.title
              : screen.name === 'reference'
                ? t.reference.title
                : screen.name === 'lesson'
                  ? t.lesson.pill
                  : screen.name === 'about'
                    ? t.about.title
                    : screen.name === 'trackIntro'
                      ? t.tracks.names[screen.track]
                      : /*
                         * На десктопе название приложения скрыто (см. .brand-word
                         * в styles.css): оно уже стоит в шапке бокового меню,
                         * в трёхстах пикселях левее. На телефоне меню нет,
                         * и это единственное место, где приложение называет себя.
                         */
                        <span className="brand-word">{t.app.name}</span>}
            <span className="sub">
              {screen.name === 'session'
                ? stepLabel
                : screen.name === 'reference'
                  ? t.tracks.names[activeTrack]
                  : screen.name === 'lesson'
                    ? (lessonBySkill.get(screen.skill)?.title ?? '')
                    : screen.name === 'about'
                      ? t.app.name
                      : screen.name === 'trackIntro'
                        ? /*
                           * Пусто: заголовок над подписью и так называет трек,
                           * и в общей ветке ниже он печатался бы вторым разом
                           * подряд — тот же дефект, что задвоенный логотип
                           * в шапке. Серия дней здесь тоже лишняя: она стоит
                           * в боковом меню, а этот экран открывают ради текста.
                           */
                          null
                        : (
                            <>
                              {t.tracks.names[activeTrack]}
                              {/* Серия дней тоже дублируется боковым меню — скрываем её там же. */}
                              <span className="ctx-streak"> · {t.app.streakSuffix(streak(progress.activeDays))}</span>
                            </>
                          )}
            </span>
          </h1>
          {screen.name === 'session' && screen.index > 0 && (
            <button className="icon-btn" onClick={() => goToStep(screen.index - 1)} aria-label={t.session.prevAria}>
              ‹
            </button>
          )}
          {/*
            * Точка кликабельна, если шаг уже показывали (i <= maxIndex),
            * кроме текущего: он и так на экране. Ещё не показанные шаги
            * остаются <i> — не кнопка, не фокусируется, не обещает перехода.
            */}
          {screen.name === 'session' && (
            <div className="progress-dots">
              {screen.queue.map((_, i) =>
                i <= screen.maxIndex && i !== screen.index ? (
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
          <button className="icon-btn" aria-label={t.theme.aria(theme)} onClick={cycleTheme}>
            {theme === 'system' ? '◐' : theme === 'light' ? '☀' : '☾'}
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
              solvedCount={solvedCount}
              loading={load.phase === 'loading' || load.phase === 'idle'}
              consent={load.phase === 'consent' ? load.bytes : null}
              consentDeferred={consentDeferred}
              onConfirmDownload={() => executor?.confirmDownload?.()}
              onDeferConsent={() => setConsentDeferred(true)}
              onResumeConsent={() => setConsentDeferred(false)}
              onStart={startSession}
              onOpenSchema={() => setSchemaOpen(true)}
              onOpenReference={() => setScreen({ name: 'reference' })}
              onOpenAbout={() => setScreen({ name: 'about' })}
              onSwitchTrack={switchTrack}
              onStartSkill={startSkillSession}
              onOpenTrackIntro={activePack.intro ? () => openTrackIntro(activeTrack) : undefined}
            />
          )}

          {screen.name === 'about' && (
            <About
              onSelectTrack={(track) => { switchTrack(track); }}
              onExportProgress={downloadProgress}
              onImportProgress={importProgressFile}
            />
          )}

          {screen.name === 'trackIntro' && (
            <TrackIntroScreen
              track={screen.track}
              onStart={startSession} // при пустом паке (не должно случиться, раз есть intro) сам никуда не переключит
              onSkip={() => setScreen({ name: 'home' })}
            />
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
              drafts={taskDrafts}
              onOpenSchema={() => setSchemaOpen(true)}
              onDone={(o) => handleDone(step.task, o)}
            />
          )}

          {screen.name === 'reference' && (
            <Reference activeTrack={activeTrack} progress={progress} onOpen={(skill) => setScreen({ name: 'lesson', skill })} />
          )}

          {screen.name === 'lesson' && lessonBySkill.get(screen.skill) && (
            /*
             * Справочник теперь сквозной по трекам (см. Reference ниже) —
             * карточку могут открыть не из своего трека, и runnable/executor
             * обязаны считаться по треку самого скилла, а не по activeTrack:
             * иначе SQL-карточка, открытая из справочника во время сессии
             * на python, показалась бы нерабочей без всякой причины.
             *
             * У python отдельная осторожность: RunnableSql вызывает
             * executor.exec() напрямую, а exec ждёт initRuntime() — и если
             * согласие на 52 МБ ещё не дано, initRuntime уходит в фазу
             * 'consent' и виснет там, потому что здесь, в справочнике,
             * экран согласия не отрисован (он есть только на самом треке
             * python). Поэтому runnable для python — не просто «это код»,
             * а «код и рантайм уже загружен» (pythonReady, см. состояние
             * выше): до этого момента карточка ведёт себя как domain/model —
             * пример читают, а не запускают. SQL такого риска не несёт —
             * initDatabase грузит 3.5 МБ молча, без экрана согласия.
             */
            (() => {
              const skillTrack = trackBySkill.get(screen.skill);
              const lessonExecutor = skillTrack ? getExecutor(skillTrack) : null;
              return (
                <LessonCard
                  lesson={lessonBySkill.get(screen.skill)!}
                  executor={lessonExecutor ?? executor!}
                  runnable={skillTrack === 'sql' || (skillTrack === 'python' && pythonReady)}
                />
              );
            })()
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
      </div>

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

/**
 * Обзор всех четырёх треков на десктопе — карточками, а не вкладками.
 *
 * TrackSwitcher выше (.tabs.tracks) остаётся мобильным переключателем:
 * компактные табы, где решение «куда переключиться» принимается за секунду.
 * TrackCards решает другую задачу — она нужна ровно там, где появляется
 * пространство её показать: обзор «что вообще есть и сколько уже сделано»
 * по всем направлениям сразу, крупнее, с описанием и прогресс-баром.
 * На телефоне спрятана через CSS (см. .track-cards в styles.css) — тот же
 * приём, что и с .tabs.tracks на десктопе, а не JS-развилка по ширине экрана.
 *
 * Прогресс каждой карточки — из progress.taskRecords, а не из activePack:
 * activePack показывает только текущий трек, а тут нужны все четыре сразу,
 * включая три, которые сейчас не выбраны.
 */
function TrackCards({
  active,
  progress,
  onSelect,
}: {
  active: Track;
  progress: Progress;
  onSelect: (track: Track) => void;
}) {
  const { t, locale } = useI18n();
  return (
    <div className="track-cards">
      {TRACK_ORDER.map((track) => {
        const pack = packForTrack(track, locale);
        if (!pack) return null;
        const total = pack.tasks.length;
        const ready = pack.status !== 'draft' && total > 0;
        const solved = ready
          ? pack.tasks.filter((task) => progress.taskRecords[task.id]?.solved).length
          : 0;
        const started = solved > 0;
        return (
          <button
            key={track}
            type="button"
            className={`track-card track-${track}${active === track ? ' active' : ''}${ready ? '' : ' draft'}`}
            onClick={() => onSelect(track)}
          >
            <div className="track-card-head">
              <span className="track-card-name">{t.tracks.names[track]}</span>
              <span className="pill">{ready ? t.tracks.readyBadge(total) : t.tracks.draftBadge}</span>
            </div>
            <p className="muted track-card-chain">{t.tracks.chainStage[track]}</p>
            <p className="muted track-card-desc">{pack.description}</p>
            {ready ? (
              <>
                <div className="bar" aria-hidden>
                  <span style={{ width: `${total ? Math.round((solved / total) * 100) : 0}%` }} />
                </div>
                <div className="track-card-foot">
                  <span className="muted">{t.tracks.solvedOf(solved, total)}</span>
                  <span className="track-card-cta">{started ? t.tracks.continueBtn : t.tracks.startBtn}</span>
                </div>
              </>
            ) : (
              <div className="track-card-foot">
                <span className="track-card-cta">{t.tracks.openBtn}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Питч тренажёра в первые пять секунд — до клика.
 *
 * Показывается дважды одним и тем же содержимым: на главной новичку (пока
 * не решена ни одна задача — см. isNewUser в Home) и первой карточкой
 * на экране «О тренажёре». Это единственное, что видит человек, пришедший
 * по ссылке из LinkedIn и не сделавший ни одного клика внутри приложения, —
 * поэтому текст ведёт не с описания структуры («четыре трека»), а с того,
 * что в тренажёре редко: код исполняется по-настоящему и числа в разборах
 * закреплены проверкой сборки, а не оставлены на честное слово.
 */
function WelcomeHero() {
  const { t } = useI18n();
  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>{t.welcome.headline}</h2>
      <p className="brief" style={{ margin: '8px 0 14px' }}>{t.welcome.body}</p>
      <div className="proof-list">
        {t.welcome.proofPoints.map((p, i) => (
          <div className="proof-item" key={i}>
            <strong>{p.title}</strong>
            <span>{p.body}</span>
          </div>
        ))}
      </div>
      <ChainDiagram />
    </div>
  );
}

/**
 * Цепочка «от вопроса до решения» — то же самое, что читается между строк
 * в порядке треков (about.tracksWhyBody), но названо явно и с шагами.
 * Живёт в WelcomeHero (см. .proof-item выше по стилю разделителя) и рядом
 * с каждым треком — TrackCards и About берут ту же t.tracks.chainStage,
 * чтобы подпись «на каком я шаге» не расходилась между экранами.
 */
function ChainDiagram() {
  const { t } = useI18n();
  return (
    <div className="chain">
      <p className="muted" style={{ margin: '14px 0 8px', fontSize: 13 }}>
        <strong style={{ color: 'var(--text)' }}>{t.welcome.chainTitle}.</strong> {t.welcome.chainIntro}
      </p>
      <div className="chain-steps" aria-hidden>
        {t.welcome.chainSteps.map((step, i) => (
          <span key={step} className="chain-step-wrap">
            <span className="pill chain-step">{step}</span>
            {i < t.welcome.chainSteps.length - 1 && <span className="chain-arrow">→</span>}
          </span>
        ))}
      </div>
      <div className="chain-legend">
        {TRACK_ORDER.map((track) => (
          <div className="chain-legend-item" key={track}>
            <span className={`chain-legend-dot track-${track}`} aria-hidden />
            <span>{t.tracks.names[track]}</span>
            <span className="muted">{t.tracks.chainStage[track]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Home({
  activeTrack,
  activePack,
  progress,
  dueCount,
  startedCount,
  solvedCount,
  loading,
  consent,
  consentDeferred,
  onConfirmDownload,
  onDeferConsent,
  onResumeConsent,
  onStart,
  onOpenSchema,
  onOpenReference,
  onOpenAbout,
  onSwitchTrack,
  onStartSkill,
  onOpenTrackIntro,
}: {
  activeTrack: Track;
  activePack: Pack;
  progress: Progress;
  dueCount: number;
  startedCount: number;
  /** Решено заданий в этом треке — не суммарно по всем (см. solvedCount в App). */
  solvedCount: number;
  loading: boolean;
  /** Байт для скачивания, если исполнитель ждёт согласия (см. LoadState 'consent'), иначе null. */
  consent: number | null;
  /** Человек нажал «Позже» — карточка согласия свёрнута до одной строки. */
  consentDeferred: boolean;
  onConfirmDownload: () => void;
  onDeferConsent: () => void;
  onResumeConsent: () => void;
  onStart: () => void;
  onOpenSchema: () => void;
  onOpenReference: () => void;
  onOpenAbout: () => void;
  onSwitchTrack: (track: Track) => void;
  /** Практика по одной теме прямо с карты навыков — не через подбор занятия. */
  onStartSkill: (skillId: string) => void;
  /** Вводная карточка трека. undefined — у трека intro ещё не написан, кнопку не показываем. */
  onOpenTrackIntro?: () => void;
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

  /**
   * Мастерство по уровням графа — отдельная метрика от solvedCount
   * и startedCount, а не их пересказ другими словами. Те считают решённые
   * задания и начатые темы; здесь — глубина освоения (интервал и качество
   * последних оценок SRS), сгруппированная по tier. Это агрегат, а не
   * дублирование карты навыков справа: там построчно перечислены все темы,
   * здесь — до четырёх усреднённых чисел, обзор без прокрутки. Заодно даёт
   * карточке занятия содержательную высоту, сопоставимую с картой навыков, —
   * не за счёт пустого отступа, а за счёт другого среза тех же данных.
   */
  const masteryByTier = useMemo(
    () =>
      byTier.map(([tier, list]) => {
        const sum = list.reduce((acc, s) => acc + mastery(progress.skills[s.id]), 0);
        return { tier, avg: sum / list.length };
      }),
    [byTier, progress]
  );

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
      {isNewUser && <WelcomeHero />}

      {/*
       * Постоянная ссылка, а не разовая карточка новичка: та показывается один
       * раз и исчезает после первой решённой задачи, а вопрос «что вообще
       * входит в тренажёр и как это устроено» у человека может возникнуть
       * и на второй, и на десятой сессии — особенно если он открывает
       * приложение по ссылке, а не проходит его сам с нуля. Стоит над
       * переключателем треков: это вопрос про тренажёр целиком, до выбора
       * конкретного трека, а не после.
       */}
      <button
        type="button"
        className="link-row"
        onClick={onOpenAbout}
        style={{ margin: '0 0 12px' }}
      >
        {t.about.entryLink}
      </button>

      <TrackSwitcher active={activeTrack} onSelect={onSwitchTrack} />
      <TrackCards
        active={activeTrack}
        progress={progress}
        // Клик по карточке уже активного трека раньше не делал ничего —
        // switchTrack на тот же трек не меняет ни состояние, ни экран,
        // а подпись кнопки при этом обещает «Продолжить». Для активного
        // трека клик запускает занятие напрямую, как обещает подпись;
        // для остальных — переключает трек, как и раньше.
        onSelect={(track) => (track === activeTrack ? onStart() : onSwitchTrack(track))}
      />

      {/*
       * Показываем только на английском и только на треке, контент которого
       * действительно не переведён. Раньше условие было одно — locale === 'en', —
       * и после того как sql, domain и python были переведены целиком, надпись
       * стала враньём: она сообщала о русских текстах на треке, полностью
       * английском. По-русски она неуместна в любом случае.
       */}
      {locale === 'en' && !isTrackTranslated(activeTrack) && (
        <p className="muted" style={{ margin: '-6px 0 12px', fontSize: 12 }}>{t.locale.partialNote}</p>
      )}

      {/*
       * Вводная карточка конкретного трека — не то же самое, что About:
       * там сводка по всем четырём сразу, здесь — что за инструмент, где
       * он встречается в работе и чего не даёт. Кнопка остаётся и после
       * первого показа: вопрос «что это вообще такое» может всплыть позже.
       */}
      {onOpenTrackIntro && (
        <button
          type="button"
          className="link-row"
          onClick={onOpenTrackIntro}
          style={{ margin: '-2px 0 12px' }}
        >
          {t.trackIntro.entryLink}
        </button>
      )}

      {/*
       * Две колонки на десктопе, одна на телефоне.
       *
       * Порядок в разметке выбран так, чтобы на узком экране страница
       * осталась ровно той же, что была: сначала блок «начать занятие»,
       * потом карта навыков, потом справочник и схема. На широком экране
       * левая колонка становится липкой — кнопка занятия и счётчики видны,
       * пока листаешь карту из двадцати тем, — а карта переезжает вправо,
       * получая ширину, при которой описание темы перестаёт обрезаться
       * многоточием.
       */}
      <div className="dashboard">
        <div className="dash-main">
          {/*
           * Согласие — приоритетнее обычного hero-блока: пока исполнитель ждёт
           * решения пользователя, начинать занятие нельзя (init() ещё не дошёл
           * до реальной загрузки), а показывать пустой счётчик «0 на повторение»
           * поверх невыполнимой кнопки было бы просто ложью на экране.
           */}
          {consent !== null && !consentDeferred && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>{t.consent.title}</h2>
              <p className="brief">{t.consent.body(Math.round(consent / 1e6))}</p>
              <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>{t.consent.note}</p>
              <div className="row">
                <button className="btn" onClick={onConfirmDownload}>
                  {t.consent.confirmBtn}
                </button>
                <button className="btn secondary" onClick={onDeferConsent}>
                  {t.consent.laterBtn}
                </button>
              </div>
            </div>
          )}

          {/*
           * Отложенное согласие. Карточку не прячем совсем: без движка трек
           * наполовину нерабочий, и об этом надо сказать прямо — но одной
           * строкой, а не тем же блоком на пол-экрана, от которого человек
           * только что отказался. Возврат ведёт обратно к полной карточке,
           * а не запускает скачивание сразу: 53 МБ не должны уходить
           * по одному случайному нажатию.
           */}
          {consent !== null && consentDeferred && (
            <div className="card">
              <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>{t.consent.deferredNote}</p>
              <button className="btn secondary" onClick={onResumeConsent}>
                {t.consent.resumeBtn(Math.round(consent / 1e6))}
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
                  <div className="big">{solvedCount}</div>
                  <div className="muted">{t.home.solvedLabel}</div>
                </div>
                <div>
                  <div className="big">{startedCount}</div>
                  <div className="muted">{t.home.startedOf(startedCount, activePack.skills.length)}</div>
                </div>
              </div>
              <div className="overall-progress">
                <p className="muted" style={{ margin: '0 0 8px', fontSize: 13 }}>{t.home.overallProgressLabel}</p>
                {masteryByTier.map(({ tier, avg }) => (
                  <div className="overall-progress-row" key={tier}>
                    <span className="overall-progress-tier">{activePack.tierNames?.[tier] ?? tier}</span>
                    <div className="bar-lg" title={t.home.masteryAria(Math.round(avg * 100))}>
                      <span style={{ width: `${Math.max(avg * 100, avg > 0 ? 3 : 0)}%` }} />
                    </div>
                    <span className="overall-progress-pct">{Math.round(avg * 100)}%</span>
                  </div>
                ))}
              </div>
              <button className="btn" onClick={onStart} disabled={loading}>
                {loading ? t.home.loading : dueCount > 0 ? t.home.startBtnResume : t.home.startBtnBegin}
              </button>
              {/*
               * Загрузка Pyodide (~50 МБ) занимает секунды, а не миллисекунды —
               * без визуальной обратной связи disabled-кнопка с текстом легко
               * читается как «зависло». Полоска не показывает настоящий процент
               * (реальный прогресс по байтам разбросан по десяткам файлов внутри
               * Pyodide и его не свести к одному числу дёшево) — она заполняется
               * по времени, с запасом не доходя до конца, и просто исчезает вместе
               * с disabled, когда загрузка правда завершится.
               */}
              {loading && (
                <div className="load-progress" role="presentation">
                  <div className="load-progress-bar" />
                </div>
              )}
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
        </div>

        <div className="dash-side">
          <div className="card">
            <h2>{t.home.skillMapTitle}</h2>
            {/*
             * Прокрутка внутри блока, а не по всей странице — карта на 20
             * навыков (domain) иначе растягивает .dash-side втрое выше
             * экрана, и липкая .dash-main слева просто исчезает из виду,
             * пока её листаешь. Высота ограничена только на десктопе
             * (см. .skill-map-list в styles.css) — на телефоне колонки нет,
             * там своя, уже проверенная прокрутка всей страницы.
             */}
            <div className="skill-map-list">
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
                  /*
                   * Практика с карты теперь открыта всегда — замок стал советом,
                   * не запретом (ROADMAP §6, п. 0). selectSession (автоподбор
                   * занятия) по-прежнему уважает предпосылки, так что разделение
                   * честное: алгоритм советует порядок, человек решает сам, что
                   * пройти прямо сейчас. Тусклый цвет строки (.locked) остаётся
                   * сигналом «не по порядку», а не блокировкой.
                   */
                  const prereqNames = unlocked
                    ? ''
                    : s.prereqs
                        .map((id) => activePack.skills.find((x) => x.id === id)?.title)
                        .filter((title): title is string => !!title)
                        .join(', ');
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`skill-row${unlocked ? '' : ' locked'}`}
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => onStartSkill(s.id)}
                      disabled={!ready}
                    >
                      <div className="name">
                        {s.title}
                        <small>{unlocked ? s.summary : t.home.unlockedAfter(prereqNames)}</small>
                      </div>
                      {ready && (
                        <div className={`bar${due ? ' due' : ''}`} title={t.home.masteryAria(Math.round(m * 100))}>
                          <span style={{ width: `${Math.max(m * 100, m > 0 ? 8 : 0)}%` }} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
            </div>
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
        </div>
      </div>
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
function About({
  onSelectTrack,
  onExportProgress,
  onImportProgress,
}: {
  onSelectTrack: (track: Track) => void;
  onExportProgress: () => void;
  /** true — файл распознан и прогресс заменён, false — не тот файл. */
  onImportProgress: (file: File) => Promise<boolean>;
}) {
  const { t, locale } = useI18n();
  const totalTasks = packs.reduce((n, p) => n + p.tasks.length, 0);
  const totalSkills = packs.reduce((n, p) => n + p.skills.length, 0);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'ok' | 'error' | null>(null);

  async function handleImportPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // тот же файл можно выбрать повторно, если первая попытка не удалась
    if (!file) return;
    setImportStatus((await onImportProgress(file)) ? 'ok' : 'error');
  }

  return (
    <>
      <WelcomeHero />

      {/*
       * Три плитки того же вида, что hero-счётчики на главной, — не декор,
       * а реальные числа, которые иначе читались бы только внутри предложения
       * structureIntro ниже. На широком экране заодно занимают часть пустого
       * места под текстом WelcomeHero, у которого абзац ограничен по ширине
       * ради читаемости (см. .card p { max-width: 68ch }).
       */}
      <div className="card">
        <div className="hero">
          <div>
            <div className="big">{TRACK_ORDER.length}</div>
            <div className="muted">{t.about.tracksStatLabel}</div>
          </div>
          <div>
            <div className="big">{totalSkills}</div>
            <div className="muted">{t.about.skillsStatLabel}</div>
          </div>
          <div>
            <div className="big">{totalTasks}</div>
            <div className="muted">{t.about.tasksStatLabel}</div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2>{t.about.structureTitle}</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          {t.about.structureIntro(totalSkills, totalTasks)}
        </p>
        {TRACK_ORDER.map((track) => {
          const p = packForTrack(track, locale);
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
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600 }}>
                {t.tracks.chainStage[track]}
              </p>
              <p className="muted" style={{ margin: '2px 0 0', fontSize: 13, lineHeight: 1.5 }}>
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

      {/*
       * Две независимые карточки-ответа рядом, а не друг под другом — тот же
       * приём, что и в TrackIntroScreen (.track-intro): на широком экране
       * узкий абзац (68ch) иначе оставлял пустую половину карточки. «Как
       * это устроено» длиннее «Приватности», но auto-fit это не мешает —
       * ряды выравниваются по высоте самой длинной карточки в строке
       * (align-items: start в CSS и так не растягивает их принудительно).
       */}
      <div className="about-grid">
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
      </div>

      <div className="card">
        <h2>{t.about.backupTitle}</h2>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.about.backupBody}</p>
        <div className="row">
          <button type="button" className="btn secondary" onClick={onExportProgress}>
            {t.about.exportBtn}
          </button>
          <button type="button" className="btn secondary" onClick={() => importInputRef.current?.click()}>
            {t.about.importBtn}
          </button>
        </div>
        <input
          ref={importInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={handleImportPick}
        />
        {importStatus && (
          <p
            role="status"
            style={{ margin: '10px 0 0', fontSize: 13, color: importStatus === 'ok' ? 'var(--ok)' : 'var(--err)' }}
          >
            {importStatus === 'ok' ? t.about.importSuccess : t.about.importError}
          </p>
        )}
      </div>

      {/*
       * Автор, связь и лицензия — закрывающий блок экрана.
       *
       * Стоит последним намеренно: человек, открывший «О тренажёре», пришёл
       * за тем, что это и как устроено, а не за тем, кто это сделал. Но
       * дочитавшему до конца больше некуда пойти — это единственное место
       * во всём приложении, откуда можно выйти на автора или на исходники.
       */}
      <div className="card">
        <h2>{t.about.authorTitle}</h2>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.about.authorBody}</p>
        <div className="row">
          <a className="btn secondary" href={AUTHOR_LINKEDIN} target="_blank" rel="noreferrer">
            {t.about.linkedinBtn}
          </a>
          <a className="btn secondary" href={AUTHOR_REPO} target="_blank" rel="noreferrer">
            {t.about.repoBtn}
          </a>
        </div>
        <p className="muted" style={{ margin: '12px 0 0', fontSize: 13, lineHeight: 1.55 }}>
          {t.about.licenseBody}
        </p>
      </div>
    </>
  );
}

/**
 * Вводная карточка трека. Пять полей в фиксированном порядке — сначала зачем
 * это в работе, потом идея, потом граница (см. TrackIntro в content/types.ts).
 * Не блокирует: «Пропустить» ведёт туда же, куда и «Начать», просто без сессии.
 */
function TrackIntroScreen({
  track,
  onStart,
  onSkip,
}: {
  track: Track;
  onStart: () => void;
  onSkip: () => void;
}) {
  const { t, locale } = useI18n();
  const pack = packForTrack(track, locale);
  const intro = pack?.intro;
  if (!intro) return null;

  /**
   * `pre-line`, а не `pre-wrap`: пустая строка в тексте становится границей
   * абзаца, а обычные переносы внутри абзаца по-прежнему делает браузер
   * по ширине экрана. Здесь это безопасно — в отличие от `.scenario`,
   * выравнивание пробелами тут не используется, текст сплошной.
   */
  const body = { margin: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-line' as const };

  return (
    <>
      {/*
       * Пять карточек в две колонки на десктопе (см. .track-intro в styles.css).
       * Одной колонкой текст занимал левую половину экрана, а правая оставалась
       * пустой: абзац ограничен 68ch по ширине для читаемости, и растягивать
       * его на всю страницу нельзя — а вот поставить карточки рядом можно.
       * Это не сплошная проза, а пять отдельных ответов на пять вопросов,
       * и читаются они самостоятельно, а не строго подряд.
       */}
      <div className="track-intro">
        <div className="card">
          <h2>{t.trackIntro.whatTitle}</h2>
          <p style={body}>{intro.what}</p>
        </div>
        <div className="card">
          <h2>{t.trackIntro.whereTitle}</h2>
          <p style={body}>{intro.where}</p>
        </div>
        <div className="card">
          <h2>{t.trackIntro.ideaTitle}</h2>
          <p style={body}>{intro.idea}</p>
        </div>
        <div className="card">
          <h2>{t.trackIntro.limitsTitle}</h2>
          <p style={body}>{intro.limits}</p>
        </div>
        {/* Мост к остальным трекам — закрывающий блок, поэтому во всю ширину. */}
        <div className="card track-intro-wide">
          <h2>{t.trackIntro.bridgeTitle}</h2>
          <p style={body}>{intro.bridge}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button className="btn" style={{ flex: 1 }} onClick={onStart}>
          {t.trackIntro.startBtn}
        </button>
        <button className="btn secondary" style={{ flex: 1 }} onClick={onSkip}>
          {t.trackIntro.skipBtn}
        </button>
      </div>
    </>
  );
}

/**
 * Справочник — сквозной по трекам, а не привязан к тому, что открыт сейчас
 * в занятиях. Раньше, находясь в pandas, посмотреть карточку SQL можно было
 * только выйдя из справочника и переключив весь activeTrack — то есть заодно
 * сменив контекст занятия. Вкладка трека здесь своя, локальная, ничего
 * не переключает вовне (см. filterTrack ниже, отдельно от activeTrack в App).
 */
function Reference({
  activeTrack,
  progress,
  onOpen,
}: {
  activeTrack: Track;
  progress: Progress;
  onOpen: (skill: string) => void;
}) {
  const { t, locale } = useI18n();
  const [filterTrack, setFilterTrack] = useState<Track>(activeTrack);
  const [query, setQuery] = useState('');

  const packsByTrack = useMemo(() => {
    const m = new Map<Track, Pack>();
    for (const tr of TRACK_ORDER) {
      const p = packForTrack(tr, locale);
      if (p) m.set(tr, p);
    }
    return m;
  }, [locale]);

  const visiblePack = packsByTrack.get(filterTrack);

  const byTier = useMemo(() => {
    if (!visiblePack) return [];
    const groups = new Map<number, Skill[]>();
    for (const s of visiblePack.skills) {
      if (!lessonBySkill.has(s.id)) continue;
      const list = groups.get(s.tier) ?? [];
      list.push(s);
      groups.set(s.tier, list);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [visiblePack]);

  /*
   * Поиск сквозной по всем трекам сразу, независимо от того, какая вкладка
   * открыта, — набрали «CALCULATE», нашли карточку в model, даже если
   * читаете справочник SQL. Вкладка трека при непустом запросе просто
   * не участвует в фильтрации, ей подчиняется только просмотр по темам.
   */
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const out: { skill: Skill; track: Track }[] = [];
    for (const [tr, p] of packsByTrack) {
      for (const s of p.skills) {
        if (!lessonBySkill.has(s.id)) continue;
        if (`${s.title} ${s.summary}`.toLowerCase().includes(q)) out.push({ skill: s, track: tr });
      }
    }
    return out;
  }, [query, packsByTrack]);

  const trackTabs = (
    <div className="tabs" role="tablist" aria-label={t.reference.trackFilterAria}>
      {TRACK_ORDER.map((tr) => (
        <button key={tr} type="button" role="tab" aria-pressed={filterTrack === tr} onClick={() => setFilterTrack(tr)}>
          {t.tracks.names[tr]}
        </button>
      ))}
    </div>
  );

  const searchBox = (
    <input
      type="search"
      className="reference-search"
      placeholder={t.reference.searchPlaceholder}
      aria-label={t.reference.searchAria}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  );

  const skillRow = (s: Skill, trackLabel?: string) => {
    const st = progress.skills[s.id];
    const seen = (st?.reps ?? 0) > 0;
    return (
      <button key={s.id} className="skill-row" onClick={() => onOpen(s.id)} style={{ width: '100%', textAlign: 'left' }}>
        <div className="name">
          {s.title}
          <small>
            {trackLabel ? `${trackLabel} · ` : ''}
            {seen ? s.summary : t.reference.notSeen}
          </small>
        </div>
        <span className="pill">{seen ? t.reference.openBtn : t.reference.nextBtn}</span>
      </button>
    );
  };

  if (searchResults) {
    return (
      <>
        {trackTabs}
        {searchBox}
        <div className="card">
          {searchResults.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t.reference.noResults(query)}</p>
          ) : (
            searchResults.map(({ skill: s, track: tr }) => skillRow(s, t.tracks.names[tr]))
          )}
        </div>
      </>
    );
  }

  if (!byTier.length) {
    return (
      <>
        {trackTabs}
        {searchBox}
        <div className="card">
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{t.reference.emptyNote}</p>
        </div>
      </>
    );
  }

  return (
    <>
      {trackTabs}
      {searchBox}
      <div className="card">
        <p className="muted" style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
          {visiblePack!.tasks.some((tk) => tk.mode !== 'predict') ? t.reference.intro : t.reference.introNoCode}
        </p>
      </div>
      <div className="card">
        {byTier.map(([tier, list]) => (
          <div key={tier} style={{ marginTop: tier === byTier[0][0] ? 0 : 14 }}>
            <p
              className="muted"
              style={{ margin: '0 0 2px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}
            >
              {visiblePack!.tierNames?.[tier] ?? `Уровень ${tier}`}
            </p>
            {list.map((s) => skillRow(s))}
          </div>
        ))}
      </div>
    </>
  );
}
