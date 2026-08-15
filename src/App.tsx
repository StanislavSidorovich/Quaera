import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { isTrackTranslated, lessonBySkill, lessonBySkillFor, packForTrack, packs, trackBySkill } from './content';
import { toolsCompareAnswers, toolsCompareQuestion } from './content/tools-compare';
import type { Lesson, Pack, Skill, Task, Track } from './content/types';
import { getExecutor } from './engine/executors';
import { WORKER_FAILURE } from './engine/types';
import type { LoadState } from './engine/types';
import { useI18n, type Locale } from './i18n/context';
import { AUTHOR_LINKEDIN, AUTHOR_REPO } from './links';
import { promptInstall, subscribeInstallAvailable } from './pwa/installPrompt';
import { DataScreen } from './ui/DataScreen';
import { LessonCard } from './ui/LessonCard';
import { QueryLoop } from './ui/QueryLoop';
import { Sandbox } from './ui/Sandbox';
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
  clearedProgress,
  exportProgress,
  loadProgress,
  parseImportedProgress,
  saveProgress,
  skillState,
  streak,
  today,
  type Progress,
} from './srs/store';
import type { Session } from '@supabase/supabase-js';
import { signInWithGoogle, signOut, subscribeSession } from './sync/client';
import { pushProgress, syncProgress } from './sync/progressSync';

/** Состояние сведения прогресса с сервером — для подписи в карточке аккаунта. */
type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';
import {
  clearSession,
  fromStoredDraft,
  loadSession,
  saveSession,
  toStoredDraft,
  type StoredSession,
} from './session/store';

const SESSION_SIZE = 5;

/**
 * Просим браузер не вытеснять хранилище этого сайта.
 *
 * Кеш рантайма переживает и перезагрузку, и деплой — это проверено замером
 * (офлайн, при остановленном сервере, pandas поднимается за полсекунды).
 * Чего он не переживает — уборку по нехватке места: 52 МБ рантайма плюс
 * 3.5 МБ датасета делают этот источник первым кандидатом на вытеснение,
 * а согласие на загрузку хранится навсегда, и повторные 52 МБ поедут молча,
 * возможно по мобильному интернету. `persist()` переводит хранилище
 * в разряд тех, что убирают последними.
 *
 * Зовём ровно в момент согласия на тяжёлую загрузку, а не при старте
 * приложения: Chrome отвечает молча и решает по «вовлечённости» — установлено
 * ли приложение, часто ли заходят. На первой секунде первого визита ответом
 * будет отказ, и второго шанса спросить в этом визите не будет. Момент
 * согласия — единственный, когда человек уже выразил намерение,
 * и одновременно единственный, когда есть что беречь.
 *
 * Ответ намеренно не показываем: отказ ничего не ломает (всё продолжает
 * работать, просто с риском уборки), а объяснить его человеку нечем —
 * решение внутри браузера и от нас не зависит.
 */
function requestPersistentStorage(): void {
  void navigator.storage?.persist?.().catch(() => undefined);
}

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
  | { name: 'sandbox' }
  | { name: 'data' }
  | { name: 'lesson'; skill: string }
  | { name: 'about' }
  | { name: 'onboarding' }
  | { name: 'trackIntro'; track: Track };

/** Индекс карточки приёма этого навыка в очереди занятия, если она там есть, иначе -1. */
function lessonStepIndex(queue: Step[], skillId: string): number {
  return queue.findIndex((s) => s.kind === 'lesson' && s.lesson.skill === skillId);
}

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
      const lessonIndex = lessonStepIndex(current.queue, step.task.skill);
      if (lessonIndex >= 0 && lessonIndex < current.index) return { ...current, index: lessonIndex };
    }
  }
  return { name: 'home' };
}

const SCREEN_STORAGE_KEY = 'querium-screen';

/**
 * Открытый раздел переживает перезагрузку страницы.
 *
 * До этого его не переживало ничто: `screen` жил только в состоянии React,
 * и F5 на «Данных» или в песочнице возвращал на главную — при том что трек,
 * тема и кегль перезагрузку переживали (см. initialActiveTrack выше). Разница
 * читалась как случайность: часть выбора приложение помнит, часть теряет.
 *
 * Хранится не весь `Screen`, а его опознавательные признаки: имя раздела
 * и то немногое, без чего раздел не открыть (навык карточки, трек вводной).
 * У занятия признак — только имя: очередь, позиция и черновики лежат отдельно
 * и целиком (см. session/store.ts), а здесь записано ровно одно — что вкладку
 * закрыли внутри занятия, а не рядом с ним. Двух источников правды это не
 * заводит: содержимое занятия по-прежнему в одном месте, здесь только адрес.
 */
type StoredScreen = { name: Screen['name']; skill?: string; track?: Track };

function screenToStored(screen: Screen): StoredScreen {
  switch (screen.name) {
    // Конец занятия не восстанавливаем: продолжать нечего, само занятие
    // к этому моменту уже стёрто, и F5 показал бы поздравление с пустотой.
    case 'done':
      return { name: 'home' };
    case 'session':
      return { name: 'session' };
    case 'lesson':
      return { name: 'lesson', skill: screen.skill };
    case 'trackIntro':
      return { name: 'trackIntro', track: screen.track };
    default:
      return { name: screen.name };
  }
}

/**
 * Очередь занятия, собранная из хранимых id по текущим пакам.
 *
 * null — если хоть одного шага больше нет (контент переписан, задание
 * удалено): половина очереди с дырой посреди хуже честного «начните заново».
 * Общая для двух входов — восстановления при старте вкладки и кнопки
 * «продолжить» на главной, — потому что правило подъёма у них обязано быть
 * одно: расходись они, F5 поднимал бы занятие, которое кнопка отвергает.
 */
function buildSessionQueue(stored: StoredSession, locale: Locale): Step[] | null {
  const pack = packForTrack(stored.track, locale);
  const taskById = pack ? new Map(pack.tasks.map((t) => [t.id, t])) : null;
  const lessons = lessonBySkillFor(locale);
  const queue: Step[] = [];
  for (const s of stored.steps) {
    if (s.kind === 'lesson') {
      const lesson = lessons.get(s.skill);
      if (!lesson) return null;
      queue.push({ kind: 'lesson', lesson });
    } else {
      const task = taskById?.get(s.id);
      if (!task) return null;
      queue.push({ kind: 'task', task });
    }
  }
  return queue.length ? queue : null;
}

/**
 * Состояние вкладки на старте: раздел плюс — если поднимается занятие — всё,
 * что живёт ровно одно занятие и обязано появиться до первого рендера.
 *
 * Одним объектом, а не тремя вызовами, ровно потому, что решение тут одно:
 * либо занятие поднялось целиком (очередь, трек, черновики, зачтённые
 * попытки), либо не поднялось вовсе. Разложи это по отдельным инициализаторам
 * состояния — и появилась бы промежуточная комбинация «экран занятия есть,
 * черновиков нет», которую никто не проверяет.
 */
type Boot = {
  screen: Screen;
  /** Трек восстановленного занятия; null — занятия нет, трек берём из своего ключа. */
  track: Track | null;
  drafts: Map<string, TaskDraft>;
  recorded: Set<string>;
};

/**
 * Раздел из хранилища — с проверкой, что его ещё есть чем наполнить.
 *
 * Проверка не формальность: карточка приёма и вводная трека отрисовываются
 * по содержимому пака (`lessonBySkill.get`, `pack.intro`), и обе тихо отдают
 * пустоту, если содержимого не стало. Записанный неделю назад навык, который
 * с тех пор переименовали, встретил бы человека пустым экраном с заголовком —
 * тем же тупиком, что и наполовину поднятое занятие с дырой посреди очереди.
 *
 * Занятие, которое не собралось, отдаёт главную, а не пустой экран: там его
 * ждёт кнопка «продолжить», и она же честно погасит неподъёмную запись.
 */
function initialBoot(locale: Locale): Boot {
  const empty = { track: null, drafts: new Map<string, TaskDraft>(), recorded: new Set<string>() };
  let stored: StoredScreen | null = null;
  try {
    const raw = localStorage.getItem(SCREEN_STORAGE_KEY);
    stored = raw ? (JSON.parse(raw) as StoredScreen) : null;
  } catch {
    // localStorage недоступен или запись битая — открываем главную
  }
  if (!stored) return { screen: { name: 'home' }, ...empty };
  switch (stored.name) {
    case 'reference':
    case 'sandbox':
    case 'data':
    case 'about':
    case 'onboarding':
      return { screen: { name: stored.name }, ...empty };
    case 'session': {
      const session = loadSession();
      const queue = session ? buildSessionQueue(session, locale) : null;
      if (!session || !queue) return { screen: { name: 'home' }, ...empty };
      const maxIndex = Math.min(Math.max(session.maxIndex, 0), queue.length - 1);
      return {
        screen: {
          name: 'session',
          queue,
          index: Math.min(Math.max(session.index, 0), maxIndex),
          maxIndex,
        },
        // Трек берём у занятия, а не из своего ключа: они обязаны совпадать
        // (переключение трека уводит на главную), но если разошлись — прав
        // тот, чьи задания сейчас на экране, иначе исполнитель будет чужой.
        track: session.track,
        drafts: new Map(Object.entries(session.drafts).map(([id, d]) => [id, fromStoredDraft(d)])),
        recorded: new Set(session.recorded),
      };
    }
    case 'lesson':
      // Ключи карточек одинаковы на обеих локалях — меняется только проза
      // внутри (см. lessonBySkillFor), поэтому проверять достаточно по общей карте.
      return stored.skill && lessonBySkill.has(stored.skill)
        ? { screen: { name: 'lesson', skill: stored.skill }, ...empty }
        : { screen: { name: 'home' }, ...empty };
    case 'trackIntro':
      return stored.track &&
        ALL_TRACKS.includes(stored.track) &&
        packForTrack(stored.track, locale)?.intro
        ? { screen: { name: 'trackIntro', track: stored.track }, ...empty }
        : { screen: { name: 'home' }, ...empty };
    default:
      return { screen: { name: 'home' }, ...empty };
  }
}

export default function App() {
  const { t, locale, setLocale } = useI18n();
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  /**
   * Снимок хранилища на момент открытия вкладки — читается ровно один раз
   * (см. initialBoot). Дальше не обновляется и обновляться не должен: это
   * не состояние приложения, а то, с чего оно началось.
   */
  const [boot] = useState<Boot>(() => initialBoot(locale));
  const [screen, setScreen] = useState<Screen>(boot.screen);
  const [activeTrack, setActiveTrack] = useState<Track>(boot.track ?? initialActiveTrack);
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
  /** Какую таблицу раскрыть при открытии шторки — см. openSchema. null — общий вход, без фокуса. */
  const [schemaTable, setSchemaTable] = useState<string | null>(null);
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
  /**
   * Трек только что выбран — главной надо подвинуть себя к выбору (см.
   * switchTrack). Одноразовый сигнал, который Home гасит сам, а не счётчик
   * и не «прокрутить при монтировании»: Home монтируется и от нажатия
   * «Главная» в меню, и там двигать экран не за чем — человек попросил
   * главную целиком, а не трек.
   */
  const [pendingChooserScroll, setPendingChooserScroll] = useState(false);
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
   * своим прошлым ответом. Занятие, поднятое при старте вкладки, — то же
   * самое занятие, поэтому черновики приезжают вместе с ним (см. Boot).
   */
  const taskDraftsRef = useRef(boot.drafts);

  /**
   * Незаконченное занятие из хранилища — то, что предлагаем продолжить
   * на главной. Обновляется только когда занятие не на экране (см. эффект
   * ниже): пока человек внутри занятия, главная не отрисована, а лишний
   * setState на каждую запись черновика перерисовывал бы всё приложение
   * на каждую букву — ровно то, от чего taskDraftsRef и сделан ref'ом.
   */
  const [pendingSession, setPendingSession] = useState<StoredSession | null>(() => loadSession());
  const [session, setSession] = useState<Session | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');

  /**
   * Слепок текущего занятия для записи в хранилище.
   *
   * Ref, а не замыкание: черновики пишутся с задержкой (см. flushDraftsRef),
   * и к моменту записи актуальная очередь должна браться из одного места,
   * а не из того рендера, на котором человек нажал последнюю клавишу.
   * Живёт и после выхода из занятия — иначе отложенная запись, догнавшая
   * уже на главной, потеряла бы последнее, что человек набрал.
   */
  const sessionSnapshotRef = useRef<{ queue: Step[]; index: number; maxIndex: number; track: Track } | null>(null);
  const flushDraftsRef = useRef<number | undefined>(undefined);

  const taskDrafts = useMemo<TaskDraftStore>(
    () => ({
      read: (taskId) => taskDraftsRef.current.get(taskId),
      write: (taskId, draft) => {
        taskDraftsRef.current.set(taskId, draft);
        // Запись отложенная: черновик обновляется на каждое нажатие клавиши,
        // а localStorage синхронный — писать весь снимок занятия на букву
        // значит подвесить ввод в редакторе на длинном запросе.
        window.clearTimeout(flushDraftsRef.current);
        flushDraftsRef.current = window.setTimeout(persistSession, 600);
      },
    }),
    []
  );

  /**
   * Задания, попытка по которым уже ушла в прогресс. Возврат на решённый шаг
   * и повторное «Дальше» не должны считаться второй попыткой: SRS сдвинул бы
   * интервал повторения дважды за один и тот же ответ. Раньше это было почти
   * недостижимо (возврат обнулял экран, и задание пришлось бы решать заново),
   * теперь — один клик. После перезагрузки страницы тем более: без переноса
   * этого множества F5 на решённом шаге сдвигал бы интервал второй раз.
   */
  const recordedTasksRef = useRef(boot.recorded);

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

  /*
   * Синхронизация с сервером — три эффекта ниже.
   *
   * Порядок между ними важен и держится на `syncedForRef`: пока первое
   * слияние для этого пользователя не прошло, отправлять нельзя. Иначе
   * локальная копия свежеустановленного устройства (пустая) успела бы
   * перезаписать серверную до того, как их свели, — то есть ровно та потеря
   * данных, против которой писалась фаза 1.
   */
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const syncedForRef = useRef<string | null>(null);

  useEffect(() => subscribeSession(setSession), []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || syncedForRef.current === userId) return;
    syncedForRef.current = userId;
    setSyncStatus('syncing');
    let cancelled = false;
    void syncProgress(userId, progressRef.current).then(({ merged, ok }) => {
      if (cancelled) return;
      // Сравнение по значению, а не безусловный setProgress: слияние
      // с пустым сервером возвращает ту же копию, и лишний setState
      // перезапустил бы эффект отправки ниже без единого изменения.
      if (JSON.stringify(merged) !== JSON.stringify(progressRef.current)) setProgress(merged);
      setSyncStatus(ok ? 'synced' : 'error');
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || syncedForRef.current !== userId) return;
    /*
     * Задержка, а не отправка на каждое изменение: `progress` меняется
     * на каждой попытке, а занятие — это пять-десять попыток подряд.
     * Две секунды сводят занятие к одной-двум записям и не заставляют
     * ждать: уход со страницы прогресс не теряет, он уже в localStorage.
     */
    const timer = window.setTimeout(() => void pushProgress(userId, progress), 2000);
    return () => window.clearTimeout(timer);
  }, [progress, session]);

  /** Открытый раздел — на устройство, чтобы пережить перезагрузку (см. initialScreen). */
  useEffect(() => {
    try {
      localStorage.setItem(SCREEN_STORAGE_KEY, JSON.stringify(screenToStored(screen)));
    } catch {
      // см. initialScreen
    }
  }, [screen]);

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

  /**
   * Записывает текущее занятие на устройство — очередь ссылками, позицию,
   * зачтённые попытки и черновики (см. session/store.ts).
   *
   * Читает только ref'ы, поэтому безопасна из отложенного таймера: замыкание
   * первого рендера здесь ничем не отличается от замыкания последнего.
   */
  function persistSession() {
    const snapshot = sessionSnapshotRef.current;
    if (!snapshot) return;
    saveSession({
      version: 1,
      track: snapshot.track,
      steps: snapshot.queue.map((s) =>
        s.kind === 'lesson' ? { kind: 'lesson', skill: s.lesson.skill } : { kind: 'task', id: s.task.id }
      ),
      index: snapshot.index,
      maxIndex: snapshot.maxIndex,
      recorded: [...recordedTasksRef.current],
      drafts: Object.fromEntries([...taskDraftsRef.current].map(([id, d]) => [id, toStoredDraft(d)])),
      savedAt: new Date().toISOString(),
    });
  }

  /**
   * Занятие живёт на устройстве, пока не закончено.
   *
   * Пока оно на экране — обновляем слепок и пишем; закончилось — стираем
   * (продолжать нечего, а «Ещё занятие» на том же экране начнёт новое).
   * Уход на любой другой экран не делает ничего намеренно: ровно ради этого
   * всё и затевалось — выйти на главную за практикой по другой теме и
   * вернуться, а не потерять занятие целиком.
   */
  useEffect(() => {
    if (screen.name === 'session') {
      sessionSnapshotRef.current = {
        queue: screen.queue,
        index: screen.index,
        maxIndex: screen.maxIndex,
        track: activeTrack,
      };
      persistSession();
      return;
    }
    // Занятие ушло с экрана — дописываем то, что не успел отложенный таймер.
    // Без этого выход сразу после последней буквы забирал бы её с собой:
    // хранилище прочиталось бы на 600 мс раньше, чем в него дописали.
    if (flushDraftsRef.current !== undefined) {
      window.clearTimeout(flushDraftsRef.current);
      flushDraftsRef.current = undefined;
      persistSession();
    }
    if (screen.name === 'done') {
      sessionSnapshotRef.current = null;
      clearSession();
    }
    // Главная спрашивает хранилище только когда её показывают: внутри занятия
    // этот setState перерисовывал бы приложение на каждом шаге впустую.
    setPendingSession(loadSession());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, activeTrack]);

  /** Отложенная запись черновика не должна потеряться при закрытии вкладки. */
  useEffect(() => {
    const flush = () => {
      window.clearTimeout(flushDraftsRef.current);
      persistSession();
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Общий вход в занятие для обоих способов подбора — вместе со сбросом того, что живёт одно занятие. */
  function startQueue(queue: Step[]) {
    taskDraftsRef.current.clear();
    recordedTasksRef.current.clear();
    setScreen({ name: 'session', queue, index: 0, maxIndex: 0 });
  }

  /**
   * Восстановление занятия из хранилища по кнопке на главной.
   *
   * Очередь собирает buildSessionQueue — та же функция, что поднимает занятие
   * при старте вкладки (см. initialBoot): если хоть одного шага больше нет
   * (контент переписан, задание удалено), занятие не поднимается вовсе —
   * половина очереди с дырой посреди хуже честного «начните заново».
   */
  function resumeSession() {
    const stored = pendingSession;
    if (!stored) return;
    const queue = buildSessionQueue(stored, locale);
    if (!queue) {
      // Снимок гасим вместе с записью: иначе отложенная запись или флаш
      // на закрытии вкладки восстановили бы из памяти ровно то занятие,
      // которое мы только что признали неподъёмным.
      sessionSnapshotRef.current = null;
      clearSession();
      setPendingSession(null);
      return;
    }
    taskDraftsRef.current = new Map(
      Object.entries(stored.drafts).map(([id, d]) => [id, fromStoredDraft(d)])
    );
    recordedTasksRef.current = new Set(stored.recorded);
    const maxIndex = Math.min(Math.max(stored.maxIndex, 0), queue.length - 1);
    setScreen({ name: 'session', queue, index: Math.min(Math.max(stored.index, 0), maxIndex), maxIndex });
    window.scrollTo({ top: 0 });
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

  /**
   * Сброс прогресса — единственное необратимое действие в приложении.
   *
   * Занятие стирается вместе с прогрессом, а не остаётся жить отдельно:
   * очередь собрана планировщиком по состоянию навыков, которого больше нет,
   * и «Вернуться к занятию» на чистой главной поднимало бы шаги, выбранные
   * для человека, которого только что не стало.
   *
   * Снимок в памяти гасим первым — иначе флаш на `pagehide` перепишет
   * хранилище тем самым занятием, которое мы только что стёрли
   * (`sessionSnapshotRef` не обнуляется при уходе с экрана занятия,
   * см. эффект персиста ниже). Отложенный таймер черновиков — по той же
   * причине: он сработал бы через 600 мс уже после сброса.
   *
   * Чего сброс не трогает намеренно: сохранённые скрипты песочницы (они
   * не прогресс, а работа человека), тему, кегль, локаль и согласие
   * на Pyodide — снятое согласие означало бы 52 МБ заново, возможно
   * по мобильному интернету.
   */
  function resetProgress() {
    sessionSnapshotRef.current = null;
    window.clearTimeout(flushDraftsRef.current);
    flushDraftsRef.current = undefined;
    taskDraftsRef.current.clear();
    recordedTasksRef.current.clear();
    clearSession();
    setPendingSession(null);
    // clearedProgress, а не emptyProgress: метка сброса нужна будущему
    // слиянию копий, чтобы стёртое не вернулось с другого устройства
    // (см. resetAt в srs/store.ts и sync/merge.ts).
    setProgress(clearedProgress());
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
    /*
     * Выбор трека — единственное действие, после которого главную надо
     * подвинуть: меняется всё ниже переключателя (счётчики, полосы, карта
     * навыков), а «Начать занятие» при этом стоит ниже сгиба и на 1280×800
     * не видно ни новичку, ни вернувшемуся (замер: кнопка на y=1318 и y=949
     * при высоте окна 800). Человек видит, что карта навыков сменилась,
     * и не догадывается, что действие есть.
     *
     * Флаг, а не прокрутка прямо здесь: экран мог быть другим (трек
     * переключают и из бокового меню), Home в этот момент ещё не смонтирован,
     * и считать его геометрию неоткуда. Home прокрутит себя сам после
     * отрисовки и погасит флаг — см. scrollToChooser там же.
     */
    setPendingChooserScroll(true);
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

  /**
   * Открывает шторку схемы, при вызове с именем таблицы — сразу раскрытой
   * на ней (см. focusTable в SchemaSheet). Общий вход с главной и из карточки
   * приёма зовёт без аргумента: там нет одной таблицы, к которой стоило бы
   * вести — а вот с чипа задания под конкретное имя.
   */
  function openSchema(table?: string) {
    setSchemaTable(table ?? null);
    setSchemaOpen(true);
  }

  /**
   * Нужен ли этому треку тяжёлый рантайм — опознаём по `confirmDownload`:
   * он есть ровно у того исполнителя, которому есть что спрашивать перед
   * загрузкой. По имени трека было бы короче и разошлось бы с реальностью
   * на первом же новом исполнителе — тот же довод, что у метки «код
   * исполняется», которая берёт `runsCode` у исполнителя, а не у контента.
   */
  const heavyRuntime = Boolean(executor?.confirmDownload);

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

  /**
   * Где человек остановился в незаконченном занятии — теми же словами, что
   * и подпись шага в шапке (см. stepLabel): «Задача 2 из 5» или «Теория».
   * Считается по сохранённым шагам, а не по восстановленной очереди —
   * очередь поднимается только в момент возврата, а подпись нужна раньше.
   */
  const pendingSessionLabel = useMemo(() => {
    if (!pendingSession) return null;
    const total = pendingSession.steps.filter((s) => s.kind === 'task').length;
    if (pendingSession.steps[pendingSession.index]?.kind === 'lesson') return t.session.lessonStep;
    const done = pendingSession.steps.slice(0, pendingSession.index + 1).filter((s) => s.kind === 'task').length;
    return t.session.taskProgressOf(done, total);
  }, [pendingSession, t]);

  /**
   * Название навыка текущего шага занятия — то, чего в шапке не было вовсе:
   * заголовок называл тип экрана («Занятие»), а не тему, хотя тип и так
   * очевиден из того, что человек уже на нём стоит. Один подбор SRS может
   * собрать задания на два-три навыка подряд, поэтому это всегда текущий
   * шаг, а не единая подпись на всё занятие.
   */
  const currentSkillTitle = useMemo(() => {
    if (screen.name !== 'session') return null;
    const s = screen.queue[screen.index];
    const skillId = s?.kind === 'lesson' ? s.lesson.skill : s?.kind === 'task' ? s.task.skill : null;
    if (!skillId) return null;
    return activePack.skills.find((sk) => sk.id === skillId)?.title ?? null;
  }, [screen, activePack]);

  // Занятие, карточка приёма и вводная трека своего пункта в меню не имеют:
  // подсвечивать там «Главную» значило бы врать о том, где человек находится.
  const sidebarSection: SidebarSection =
    screen.name === 'home' || screen.name === 'done'
      ? 'home'
      : screen.name === 'reference'
        ? 'reference'
        : screen.name === 'sandbox'
          ? 'sandbox'
          : screen.name === 'data'
            ? 'data'
            : screen.name === 'about'
              ? 'about'
              : screen.name === 'onboarding'
                ? 'onboarding'
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
        onSandbox={() => setScreen({ name: 'sandbox' })}
        onData={() => setScreen({ name: 'data' })}
        onAbout={() => setScreen({ name: 'about' })}
        onOnboarding={() => setScreen({ name: 'onboarding' })}
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
              ? (currentSkillTitle ?? t.session.title)
              : screen.name === 'reference'
                ? t.reference.title
                : screen.name === 'sandbox'
                  ? t.sandbox.title
                  : screen.name === 'data'
                    ? t.data.title
                  : screen.name === 'lesson'
                    ? t.lesson.pill
                    : screen.name === 'about'
                      ? t.about.title
                      : screen.name === 'onboarding'
                        ? t.onboarding.title
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
                ? (
                    // Трек впереди подписи шага: название навыка в h1 уже
                    // говорит «о чём», а без трека «Задача 2 из 5» не говорит,
                    // где именно — на телефоне до шапки бокового меню не достать.
                    <>
                      {t.tracks.names[activeTrack]} · {stepLabel}
                    </>
                  )
                : screen.name === 'reference'
                  ? t.tracks.names[activeTrack]
                  : screen.name === 'sandbox'
                    ? /*
                       * Пусто, тем же приёмом, что и trackIntro ниже: заголовок
                       * уже назвал экран, а песочница не привязана к activeTrack —
                       * печатать здесь имя текущего трека значило бы соврать,
                       * что песочница именно про него, хотя внутри есть SQL и Python разом.
                       */
                      null
                    : screen.name === 'data'
                    ? /*
                       * Пусто по той же причине, что и в песочнице: данные
                       * общие для всех треков, и подпись именем активного
                       * трека обещала бы, что экран показывает только его.
                       */
                      null
                    : screen.name === 'lesson'
                    ? (lessonBySkill.get(screen.skill)?.title ?? '')
                    : screen.name === 'about'
                      ? t.app.name
                      : screen.name === 'onboarding'
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
          {/*
           * Группа вынесена в свой контейнер по тому же приёму, что и
           * progress-dots ниже: на узком экране это тоже целая строка,
           * а не три элемента, которые остаются в потоке шапки и сжимают
           * заголовок до нечитаемой колонки (было на 390px до этой правки).
           */}
          <div className="topbar-tools">
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
          </div>
        </header>

        <main className="content">
          {load.phase === 'error' && (
            <div className="feedback error">
              <h3>{t.loadError.title}</h3>
              {/* Воркер мог не сказать ничего — тогда показываем свою фразу
                  на языке интерфейса, а не служебную метку. */}
              <p>{load.message === WORKER_FAILURE ? t.loadError.workerBody : load.message}</p>
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
              heavyRuntime={heavyRuntime}
              consent={load.phase === 'consent' ? load.bytes : null}
              consentDeferred={consentDeferred}
              onConfirmDownload={() => {
                requestPersistentStorage();
                executor?.confirmDownload?.();
              }}
              onDeferConsent={() => setConsentDeferred(true)}
              onResumeConsent={() => setConsentDeferred(false)}
              onStart={startSession}
              onOpenData={() => setScreen({ name: 'data' })}
              onOpenReference={() => setScreen({ name: 'reference' })}
              onOpenSandbox={() => setScreen({ name: 'sandbox' })}
              onOpenAbout={() => setScreen({ name: 'about' })}
              onOpenOnboarding={() => setScreen({ name: 'onboarding' })}
              onSwitchTrack={switchTrack}
              onStartSkill={startSkillSession}
              onOpenTrackIntro={activePack.intro ? () => openTrackIntro(activeTrack) : undefined}
              /*
               * Незаконченное занятие показываем только на главной его же
               * трека: главная — экран одного трека (его карта, его прогресс,
               * его «начать занятие»), и вход отсюда в занятие соседнего
               * читался бы как принадлежность этому. Занятие при этом никуда
               * не девается — переключились обратно, и предложение вернулось.
               */
              resume={pendingSession?.track === activeTrack ? pendingSessionLabel : null}
              onResume={resumeSession}
              scrollToChooser={pendingChooserScroll}
              onChooserScrolled={() => setPendingChooserScroll(false)}
            />
          )}

          {screen.name === 'about' && (
            <About
              onSelectTrack={(track) => { switchTrack(track); }}
              onOpenOnboarding={() => setScreen({ name: 'onboarding' })}
              onExportProgress={downloadProgress}
              onImportProgress={importProgressFile}
              onResetProgress={resetProgress}
              accountEmail={session?.user.email ?? null}
              syncStatus={syncStatus}
              onSignIn={signInWithGoogle}
              onSignOut={async () => {
                await signOut();
                syncedForRef.current = null;
                setSyncStatus('idle');
              }}
            />
          )}

          {screen.name === 'onboarding' && (
            <Onboarding onFinish={() => setScreen({ name: 'home' })} />
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

          {step?.kind === 'task' && executor && (() => {
            // Пилюля навыка на карточке задания ведёт на карточку приёма
            // этого же занятия — если её в очереди не было (навык уже
            // введён раньше), пилюля остаётся текстом без клика: вести
            // на карточку из справочника значило бы бросить занятие,
            // а очередь занятия нигде не сохраняется.
            const lessonIndex = screen.name === 'session' ? lessonStepIndex(screen.queue, step.task.skill) : -1;
            return (
              <TaskView
                key={step.task.id}
                task={step.task}
                executor={executor}
                schema={schema}
                drafts={taskDrafts}
                skillTitle={activePack.skills.find((sk) => sk.id === step.task.skill)?.title ?? ''}
                onOpenLesson={lessonIndex >= 0 ? () => goToStep(lessonIndex) : undefined}
                onOpenSchema={openSchema}
                onDone={(o) => handleDone(step.task, o)}
              />
            );
          })()}

          {screen.name === 'reference' && (
            <Reference activeTrack={activeTrack} progress={progress} onOpen={(skill) => setScreen({ name: 'lesson', skill })} />
          )}

          {screen.name === 'sandbox' && <Sandbox schema={schema} onOpenSchema={openSchema} />}

          {screen.name === 'data' && <DataScreen doc={schema} />}

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
                  // Из справочника карточка вела в тупик — с карты навыков в практику
                  // перейти можно было, а отсюда нет (находка 2 из разбора навигации
                  // 2026-08-09). startSkillSession — тот же вход, что и у карты.
                  onPractice={() => startSkillSession(screen.skill)}
                />
              );
            })()
          )}

          {screen.name === 'done' && (
            <div className="card">
              <h2>{t.session.doneTitle}</h2>
              <p className="muted">{t.session.doneBody(screen.solved)}</p>
              {/*
               * Раньше здесь стояла одна кнопка «На главную» — тупик для
               * самого частого намерения в этой точке (продолжить, а не
               * выйти), см. находку 1 из разбора навигации 2026-08-09.
               * startSession() сам ничего не откроет, если в паке нет
               * заданий, — та же защита, что и на главном экране.
               */}
              <button className="btn" style={{ marginTop: 12 }} onClick={startSession}>
                {t.session.moreBtn}
              </button>
              <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setScreen({ name: 'home' })}>
                {t.session.homeBtn}
              </button>
            </div>
          )}
        </main>
      </div>

      {schemaOpen && (
        <SchemaSheet
          doc={schema}
          focusTable={schemaTable}
          onClose={() => {
            setSchemaOpen(false);
            setSchemaTable(null);
          }}
        />
      )}

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
            <p className="muted track-card-chain">
              {t.tracks.chainStage[track]}
              {/*
               * Метка «код исполняется» — по исполнителю, а не по названию
               * трека и не по режиму заданий. У model шесть DAX-заданий
               * в режиме fill: человек там пишет код, но движка нет, ответ
               * сверяется текстом, — проверка по режиму соврала бы именно
               * на нём. См. tracks.runsCodeBadge в i18n.
               */}
              {getExecutor(track)?.runsCode !== false && (
                <span className="track-card-runs">{t.tracks.runsCodeBadge}</span>
              )}
            </p>
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
 * Заголовок и абзац-питч, без обёртки card — WelcomeHero и Home решают сами,
 * в одну карточку это класть или в отдельную (см. оба ниже).
 */
function WelcomeIntroBody() {
  const { t } = useI18n();
  return (
    <>
      <h2 style={{ marginTop: 0 }}>{t.welcome.headline}</h2>
      <p className="brief" style={{ margin: '8px 0 10px' }}>{t.welcome.body}</p>
    </>
  );
}

/**
 * Вход в «С чего начать» плюс три довода и цепочка — тоже без обёртки card.
 *
 * Развёрнутый вид, только для «О тренажёре»: туда приходят читать, и прятать
 * там абзац за нажатием значило бы прятать ответ на вопрос, ради которого
 * страницу и открыли. На главной те же три довода стоят свёрнутыми
 * (см. ProofSummary) — там их читают не вместо занятия, а до него.
 *
 * Ссылка стоит первой, а не в конце блока, — на экране «О тренажёре»
 * сразу под ней идёт следующая карточка, а не ещё один ряд ссылок, поэтому
 * повторить дефект «два ряда ссылок подряд» здесь нечем.
 */
function WelcomeProofBody({ onOnboarding }: { onOnboarding: () => void }) {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        className="link-row"
        onClick={onOnboarding}
        style={{ margin: '0 0 14px' }}
      >
        {t.onboarding.entryLink}
      </button>
      <div className="proof-list">
        {t.welcome.proofPoints.map((p, i) => (
          <div className="proof-item" key={i}>
            <strong>{p.title}</strong>
            <span>{p.body}</span>
          </div>
        ))}
      </div>
      <ChainDiagram />
    </>
  );
}

/**
 * Те же три довода на главной — заголовками, тело раскрывается нажатием.
 *
 * Стоят выше карточек треков, а не под ними. Разложенные под треками они
 * оказывались между выбором трека и картой навыков — то есть между решением
 * и его продолжением, — и разрывали единственный путь, ради которого экран
 * и открыт. Но и вернуть их наверх целиком нельзя: тремя абзацами они
 * отодвигали кнопку «Начать» под сгиб, чем и был вызван прошлый перенос.
 * Свёрнутые, они занимают одну строку на довод и не делают ни того ни другого.
 *
 * <details>, а не своё состояние на useState: раскрытие одного пункта —
 * ровно та задача, для которой элемент и существует, вместе с клавиатурой,
 * фокусом и объявлением состояния скринридеру. Ни одна из этих трёх вещей
 * не досталась бы бесплатно кнопке с onClick.
 *
 * Цепочки «от вопроса до решения» здесь нет намеренно: её легенда называет
 * трек и его шаг, а карточки треков строкой ниже пишут то же самое каждая
 * у себя (tracks.chainStage в обоих местах). На «О тренажёре» диаграмма
 * остаётся — там до карточек треков полэкрана, и легенда читается как ключ
 * к картинке, а не как второй список того же.
 */
function ProofSummary({
  onOnboarding,
  onSandbox,
}: {
  onOnboarding: () => void;
  onSandbox: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="welcome-proof">
      <div className="proof-list">
        {t.welcome.proofPoints.map((p, i) => (
          <details className="proof-item" key={i}>
            <summary>{p.title}</summary>
            <span>{p.body}</span>
          </details>
        ))}
      </div>
      {/*
       * Два входа в одном ряду, а не двумя рядами подряд: рядов подряд
       * уже стоил одной правки (граница карточки в тёмной теме тоньше
       * межстрочного расстояния, и два ряда читались одним списком).
       *
       * Но и одинаковыми они стоять не должны, чем и был следующий дефект:
       * две синие ссылки одного кегля в десяти пикселях друг от друга
       * читались одной фразой. Разведены двумя способами разом — расстоянием
       * (песочница уходит к правому краю) и видом: ссылка слева, кнопка
       * справа. Одного расстояния мало — на широкой карточке два одинаковых
       * обрывка в разных углах не связываются в ряд, а просто теряются;
       * одного вида мало — они остались бы вплотную.
       *
       * Кнопка не акцентная: заметность ей даёт форма, а не цвет. Заливка
       * акцентом здесь читалась бы главным действием карточки, тогда как
       * главное — «Начать» ниже. Почему заливка именно утопленная — замер
       * у .link-chip в styles.css.
       *
       * Песочница вынесена сюда, хотя она есть и в боковом меню, и под
       * картой навыков: оба места для того, кто уже внутри, а пришедшему
       * по ссылке нужен вход, не требующий выбрать трек и начать занятие.
       */}
      <div className="welcome-proof-links">
        <button type="button" className="link-row" onClick={onOnboarding}>
          {t.onboarding.entryLink}
        </button>
        <button type="button" className="link-chip" onClick={onSandbox}>
          {t.welcome.sandboxLink}
        </button>
      </div>
    </div>
  );
}

/**
 * Питч тренажёра в первые пять секунд — до клика.
 *
 * Показывается дважды одним и тем же содержимым: на главной новичку (пока
 * не решена ни одна задача — см. isNewUser в Home) и первой карточкой
 * на экране «О тренажёре». На главной с 2026-08-12 это уже не один блок:
 * между WelcomeIntroBody и WelcomeProofBody встали карточки треков — вход
 * в занятие иначе стоял ниже сгиба и на ноутбуке, и на телефоне (сгиб
 * замерен на 1280×800 и 375×812), а обоснование («код выполняется
 * по-настоящему», цепочка шагов) читают уже после того, как выбрали, что
 * делать, а не до. На «О тренажёре» решение не читают — там абзац сразу
 * ведёт к доказательствам, и WelcomeHero остаётся одной карточкой,
 * как раньше. Обратный вход тоже цел: WelcomeHero открывает экран
 * «О тренажёре», то есть с телефона (бокового меню там нет) обе страницы
 * достижимы с любой из них.
 */
function WelcomeHero({ onOnboarding }: { onOnboarding: () => void }) {
  return (
    <div className="card welcome-hero">
      <WelcomeIntroBody />
      <WelcomeProofBody onOnboarding={onOnboarding} />
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

/** События, любое из которых означает «человек взялся за экран сам». */
const SCROLL_INTERRUPTS = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Плавная прокрутка, переживающая перерисовку страницы.
 *
 * Нативный `behavior: 'smooth'` здесь не годится, и это замер, а не вкус:
 * браузер отменяет свою анимацию, если позицию прокрутки меняет кто-то
 * ещё, — а её меняет якорь прокрутки при любом изменении высоты документа.
 * На главной высота меняется ровно тем действием, ради которого прокрутка
 * и затевалась (см. вызов в Home). Здесь позицию каждый кадр назначаем мы,
 * поэтому отменять нечего.
 *
 * `goalAt` — функция, а не число: она читает якорь заново на каждом кадре,
 * так что переехавшая цель просто уводит анимацию за собой, а не оставляет
 * её ехать в старую точку.
 *
 * Прерывается любым собственным движением человека: догонять палец
 * анимацией — худшее, что можно сделать с прокруткой.
 */
function smoothScrollTo(goalAt: () => number): () => void {
  const clamp = (top: number) =>
    Math.max(0, Math.min(top, document.documentElement.scrollHeight - window.innerHeight));

  // Уважаем системную настройку: там, где движение мешает, оно и здесь мешает.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.scrollTo({ top: clamp(goalAt()), behavior: 'auto' });
    return () => {};
  }

  const from = window.scrollY;
  const distance = Math.abs(clamp(goalAt()) - from);
  if (distance < 2) return () => {};
  /*
   * Длительность от расстояния, но с потолком: постоянные 320 мс на сдвиге
   * в полсотни пикселей выглядят вязко, а на полутора тысячах — щелчком.
   * Верхняя граница важнее нижней — прокрутка не должна успеть надоесть.
   */
  const ms = Math.max(220, Math.min(460, 180 + distance * 0.35));
  const started = performance.now();
  let frame = 0;
  let running = true;

  const stop = () => {
    if (!running) return;
    running = false;
    cancelAnimationFrame(frame);
    for (const ev of SCROLL_INTERRUPTS) window.removeEventListener(ev, stop);
  };

  const tick = (now: number) => {
    if (!running) return;
    const t = Math.min(1, (now - started) / ms);
    const eased = 1 - Math.pow(1 - t, 3); // ease-out: быстро трогается, мягко доводит
    window.scrollTo(0, from + (clamp(goalAt()) - from) * eased);
    if (t < 1) frame = requestAnimationFrame(tick);
    else stop();
  };

  for (const ev of SCROLL_INTERRUPTS) window.addEventListener(ev, stop, { passive: true });
  frame = requestAnimationFrame(tick);
  return stop;
}

function Home({
  activeTrack,
  activePack,
  progress,
  dueCount,
  startedCount,
  solvedCount,
  loading,
  heavyRuntime,
  consent,
  consentDeferred,
  onConfirmDownload,
  onDeferConsent,
  onResumeConsent,
  onStart,
  onOpenData,
  onOpenReference,
  onOpenSandbox,
  onOpenAbout,
  onOpenOnboarding,
  onSwitchTrack,
  onStartSkill,
  onOpenTrackIntro,
  resume,
  onResume,
  scrollToChooser,
  onChooserScrolled,
}: {
  activeTrack: Track;
  activePack: Pack;
  progress: Progress;
  dueCount: number;
  startedCount: number;
  /** Решено заданий в этом треке — не суммарно по всем (см. solvedCount в App). */
  solvedCount: number;
  loading: boolean;
  /** Треку нужен тяжёлый рантайм (Pyodide) — от этого зависит подпись под кнопкой во время загрузки. */
  heavyRuntime: boolean;
  /** Байт для скачивания, если исполнитель ждёт согласия (см. LoadState 'consent'), иначе null. */
  consent: number | null;
  /** Человек нажал «Позже» — карточка согласия свёрнута до одной строки. */
  consentDeferred: boolean;
  onConfirmDownload: () => void;
  onDeferConsent: () => void;
  onResumeConsent: () => void;
  onStart: () => void;
  onOpenData: () => void;
  onOpenReference: () => void;
  onOpenSandbox: () => void;
  onOpenAbout: () => void;
  onOpenOnboarding: () => void;
  onSwitchTrack: (track: Track) => void;
  /** Практика по одной теме прямо с карты навыков — не через подбор занятия. */
  onStartSkill: (skillId: string) => void;
  /** Вводная карточка трека. undefined — у трека intro ещё не написан, кнопку не показываем. */
  onOpenTrackIntro?: () => void;
  /** Подпись шага незаконченного занятия этого трека («Задача 2 из 5»), null — продолжать нечего. */
  resume: string | null;
  onResume: () => void;
  /** Трек только что выбран — подвинуть экран к выбору (см. switchTrack в App). */
  scrollToChooser: boolean;
  /** Сигнал получен и отработан — гасим его, чтобы он не сработал второй раз. */
  onChooserScrolled: () => void;
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

  /**
   * Куда двигать экран после выбора трека. Два якоря, а не один, и второй
   * обязателен — это показал замер, а не осторожность.
   *
   * Просили «доводить до ссылки „Что входит в тренажёр“»: над ней стоит только
   * карточка-питч, и на высоком окне после такой прокрутки видно всё разом —
   * карточки треков, ссылку на трек и кнопку занятия. Но питч показывается
   * ровно один раз (isNewUser), и у вернувшегося человека эта ссылка стоит
   * на y=85: прокрутка к ней не делает ничего, а кнопка как была на y=949
   * при окне 800, так и осталась за сгибом. То есть один якорь чинил бы
   * ровно первый визит и ровно на высоком экране.
   *
   * Поэтому якорь — нижняя граница: доводим до ссылки, а если кнопка занятия
   * при этом всё равно не попала в окно, прокручиваем ровно настолько, чтобы
   * попала. На 1280×800 это стоит верхних ~70px карточек треков — но трек
   * только что выбран нажатием, а действие, которого человек не находил,
   * оказывается на экране.
   */
  const chooserRef = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLButtonElement>(null);
  /*
   * Отмена анимации живёт в ref, а не в возврате эффекта, и это не стиль,
   * а починка: `onChooserScrolled` — стрелка, создаваемая заново на каждом
   * рендере, поэтому эффект перезапускается при любом обновлении Home,
   * а его cleanup гасит то, что запустил предыдущий заход. Мгновенная
   * прокрутка это переживала — она заканчивалась внутри одного кадра;
   * анимация умирала на втором (замер: два вызова scrollTo вместо
   * полутора десятков, scrollY остался нулём). Отменяем только при
   * размонтировании и при новом сигнале.
   */
  const scrollAnimRef = useRef<(() => void) | null>(null);
  useEffect(() => () => scrollAnimRef.current?.(), []);
  useEffect(() => {
    if (!scrollToChooser) return;
    onChooserScrolled();
    if (!chooserRef.current) return;
    scrollAnimRef.current?.();
    /*
     * Цель — функция, а не число, и пересчитывается каждый кадр. Ровно
     * из-за этого прежняя правка отказалась от плавности вовсе: перерисовка,
     * которую вызывает сам переключатель треков, отменяла нативную анимацию
     * (при уходе с pandas исчезает карточка согласия на рантайм, документ
     * садится с 2785 до 2597, браузер пересчитывает якорь прокрутки — замер
     * на 390×844 показал вызов scrollTo(627, smooth) при scrollY, оставшемся
     * нулём). Своя анимация, читающая якорь заново на каждом кадре, к этому
     * безразлична: страница подросла или села — цель просто переехала,
     * и доводить её всё равно докуда надо. См. smoothScrollTo.
     */
    scrollAnimRef.current = smoothScrollTo(() => {
      const chooser = chooserRef.current;
      if (!chooser) return window.scrollY;
      const pageY = (el: Element) => el.getBoundingClientRect().top + window.scrollY;
      let top = pageY(chooser) - 12;
      const start = startRef.current;
      if (start) {
        // Нижняя граница кнопки, а не верхняя: показать её наполовину — то же,
        // что не показать, человек всё равно не прочтёт подпись целиком.
        const needed = pageY(start) + start.offsetHeight + 16 - window.innerHeight;
        if (needed > top) top = needed;
      }
      return top;
    });
  }, [scrollToChooser, onChooserScrolled]);

  return (
    <>
      {/*
       * Заголовок и абзац отдельной карточкой, а не всем WelcomeHero сразу —
       * решение (карточки треков) должно быть видно раньше обоснования.
       * До этой правки WelcomeHero целиком (питч + три довода + цепочка,
       * ~580px на 1280px и больше 1000px на телефоне) стоял перед картами
       * треков, и кнопка «Начать» не помещалась на первый экран ни на
       * ноутбуке, ни на телефоне. См. WelcomeProofBody ниже — туда уехали
       * «С чего начать», три довода и цепочка.
       */}
      {isNewUser && (
        <div className="card welcome-intro">
          <div className="welcome-intro-grid">
            <div>
              <WelcomeIntroBody />
            </div>
            {/*
             * Картинка только здесь, не в WelcomeHero: на «О тренажёре»
             * справа от этого же абзаца стоят три доказательства в ряд
             * и цепочка, там пустоты нет. Прячется на узком экране через
             * CSS (.welcome-intro-figure), а не развилкой по ширине в JS, —
             * тот же приём, что у .track-cards и .tabs.tracks.
             */}
            <div className="welcome-intro-figure">
              <QueryLoop />
            </div>
          </div>
          {/*
           * Свёрнутые доводы — в той же карточке, а не отдельной под ней.
           * Отдельная стоила своих 16px зазора и 32px padding сверх высоты
           * содержимого, и на этих 48px кнопка «Начать» переставала помещаться
           * на первый экран ноутбука 1366×768. Смысл тот же: карточка целиком
           * отвечает на «что это», а решение начинается ниже, с треков.
           */}
          <ProofSummary onOnboarding={onOpenOnboarding} onSandbox={onOpenSandbox} />
        </div>
      )}

      {/*
       * Единственная постоянная ссылка главной, а не разовая карточка новичка:
       * та показывается один раз и исчезает после первой решённой задачи,
       * а вопрос «что вообще входит в тренажёр и как это устроено» у человека
       * может возникнуть и на второй, и на десятой сессии — особенно если он
       * открывает приложение по ссылке, а не проходит его сам с нуля. Стоит над
       * переключателем треков: это вопрос про тренажёр целиком, до выбора
       * конкретного трека, а не после.
       */}
      <button
        ref={chooserRef}
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
              {/*
               * Объяснение полосы стоит видимой строкой, а не в `title`.
               * Раньше оно было только там — и на телефоне не показывалось
               * никак: `title` не открывается ни по тапу, ни по долгому
               * нажатию. Получалось, что текст, написанный ровно против
               * прочтения «приложение оценивает меня на 3%», не доходил
               * до тех, у кого это прочтение и возникает. Одна тусклая
               * строка на 12px — не баннер, прятать её под раскрытие
               * незачем: она объясняет числа, стоящие тут же под ней.
               */}
              <div className="overall-progress">
                {/*
                 * Подпись не `.muted`, в отличие от прежней версии: рядом
                 * с ней теперь стоит серое объяснение в две строки, и двумя
                 * одинаково тусклыми абзацами подряд заголовок блока
                 * переставал быть заголовком — читалось как один сплошной
                 * комментарий неизвестно к чему. Порядок должен читаться
                 * сразу: что это → почему так → сами числа.
                 */}
                <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 600 }}>{t.home.overallProgressLabel}</p>
                <p className="muted" style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.5 }}>
                  {t.home.overallProgressHint}
                </p>
                {masteryByTier.map(({ tier, avg }) => (
                  <div className="overall-progress-row" key={tier}>
                    <span className="overall-progress-tier">{activePack.tierNames?.[tier] ?? tier}</span>
                    <div
                      className="bar-lg"
                      role="img"
                      aria-label={t.home.masteryAria(Math.round(avg * 100))}
                      title={t.home.masteryAria(Math.round(avg * 100))}
                    >
                      <span style={{ width: `${Math.max(avg * 100, avg > 0 ? 3 : 0)}%` }} />
                    </div>
                    <span className="overall-progress-pct">{Math.round(avg * 100)}%</span>
                  </div>
                ))}
              </div>
              {/*
               * Незаконченное занятие идёт первым и основной кнопкой: если оно
               * есть, вернуться к нему — намерение более частое, чем набрать
               * новое, и та же расстановка уже стоит на «Занятие закончено».
               * Кнопка старта при этом не прячется: начать новое занятие
               * поверх старого — законный выбор, он просто перестаёт быть
               * единственным (раньше он был единственным и молча стирал очередь).
               */}
              {resume && (
                <>
                  <button className="btn" onClick={onResume} disabled={loading}>
                    {t.home.resumeBtn}
                  </button>
                  {/*
                   * Отступы неравные намеренно: подпись стоит между двумя
                   * кнопками, и при близких зазорах (было 8 сверху, 12 снизу)
                   * она читалась как пояснение к «Начать занятие» под ней —
                   * то есть обещала сохранённое ровно тому действию, которое
                   * сохранённое затирает. Прижата к своей кнопке.
                   */}
                  <p className="muted" style={{ margin: '6px 0 20px', fontSize: 13 }}>
                    {t.home.resumeNote(resume)}
                  </p>
                </>
              )}
              <button
                ref={startRef}
                className={resume ? 'btn secondary' : 'btn'}
                onClick={onStart}
                disabled={loading}
              >
                {loading
                  ? heavyRuntime
                    ? t.home.loadingRuntime
                    : t.home.loading
                  : dueCount > 0
                    ? t.home.startBtnResume
                    : t.home.startBtnBegin}
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
              {/*
               * Подпись только у тяжёлого рантайма. У датасета в 3.5 МБ
               * полоска исчезает раньше, чем строку успеют прочитать, —
               * а вот десятки секунд на 52 МБ без объяснения читаются как
               * «качает заново каждый раз», и это ровно тот вопрос, который
               * пришёл от человека, прошедшего тренажёр.
               */}
              {loading && heavyRuntime && (
                <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
                  {t.home.loadingRuntimeNote}
                </p>
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
                  {/* Запасная подпись берётся из локали: у пака без tierNames
                      захардкоженный «Уровень 2» был бы русским и на английском. */}
                  {activePack.tierNames?.[tier] ?? t.task.levelLabel(tier)}
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
                      {/*
                       * Полоса теперь входит в имя кнопки строки: `aria-label`
                       * на потомке подклеивается к вычисляемому имени, и это
                       * стало уместно ровно после того, как masteryAria
                       * сократилась до значения. Прежним текстом в полтора
                       * предложения диктор читал бы одно и то же правило
                       * на каждой из двадцати тем карты.
                       */}
                      {ready && (
                        <div
                          className={`bar${due ? ' due' : ''}`}
                          role="img"
                          aria-label={t.home.masteryAria(Math.round(m * 100))}
                          title={t.home.masteryAria(Math.round(m * 100))}
                        >
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
              {/*
               * Не гейтится writesCode: песочница всегда про SQL и Python,
               * а не про открытый сейчас трек — с карточки domain до неё
               * так же одно нажатие, как со сходной sql. Мобильный вход
               * важен вдвойне: боковое меню (тот же пункт) видно только
               * от 1024px, и без этой кнопки на телефоне до песочницы
               * не добраться вовсе.
               */}
              <button className="btn secondary" onClick={onOpenSandbox}>
                {t.home.sandboxBtn}
              </button>
              {/*
               * Больше не гейтится writesCode, и это смена решения, а не
               * недосмотр. Гейт был верен, пока кнопка открывала шторку для
               * набора запроса: где код не пишут, схема колонок не нужна.
               * Теперь кнопка ведёт на экран «Данные», который отвечает
               * на другой вопрос — что это за данные и как они связаны, —
               * и нужен он как раз там, где код не пишут: трек модели
               * данных состоит из звезды и гранулярности, а трек профессии
               * разбирает ситуации, собранные на этих же строках.
               */}
              <button className="btn secondary" onClick={onOpenData}>
                {t.home.schemaBtn}
              </button>
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
  onOpenOnboarding,
  onExportProgress,
  onImportProgress,
  onResetProgress,
  accountEmail,
  syncStatus,
  onSignIn,
  onSignOut,
}: {
  onSelectTrack: (track: Track) => void;
  onOpenOnboarding: () => void;
  onExportProgress: () => void;
  /** true — файл распознан и прогресс заменён, false — не тот файл. */
  onImportProgress: (file: File) => Promise<boolean>;
  onResetProgress: () => void;
  /** null — не вошли; иначе почта аккаунта, которым вошли. */
  accountEmail: string | null;
  syncStatus: SyncStatus;
  onSignIn: () => Promise<{ error: string | null }>;
  onSignOut: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const totalTasks = packs.reduce((n, p) => n + p.tasks.length, 0);
  const totalSkills = packs.reduce((n, p) => n + p.skills.length, 0);
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importStatus, setImportStatus] = useState<'ok' | 'error' | null>(null);
  /**
   * Три состояния, а не два: 'idle' — обычная кнопка, 'confirm' — вопрос
   * с двумя ответами вместо неё, 'done' — подтверждение, что сброс прошёл.
   *
   * Подтверждение в самой карточке, а не `confirm()`: системный диалог в PWA
   * выглядит чужим окном браузера ровно там, где важнее всего, чтобы человек
   * прочитал текст, а не отмахнулся от привычной коробки. Заодно тот же приём,
   * что у импорта строкой ниже, — результат остаётся на экране.
   */
  const [resetStage, setResetStage] = useState<'idle' | 'confirm' | 'done'>('idle');
  // false до первого beforeinstallprompt и снова false после prompt() —
  // событие одноразовое, см. src/pwa/installPrompt.ts.
  const [installAvailable, setInstallAvailable] = useState(false);
  useEffect(() => subscribeInstallAvailable(setInstallAvailable), []);
  /*
   * Отдельно от syncStatus: та ошибка про сведение уже вошедшего, эта —
   * про то, что вход не начался вовсе. Смешав их в одну подпись, человек
   * с отвалившейся сетью прочитал бы «прогресс сохранён на устройстве»
   * там, где ему не удалось даже нажать кнопку.
   */
  const [signInError, setSignInError] = useState(false);

  async function handleImportPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // тот же файл можно выбрать повторно, если первая попытка не удалась
    if (!file) return;
    setImportStatus((await onImportProgress(file)) ? 'ok' : 'error');
  }

  return (
    <>
      <WelcomeHero onOnboarding={onOpenOnboarding} />

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

      {/*
       * Стоит до «Структуры» намеренно: сколько внутри треков и заданий,
       * видно и по плиткам выше, а чей это уровень — не видно ниоткуда,
       * и это первый вопрос человека, впервые открывшего экран.
       */}
      <div className="card">
        <h2>{t.about.audienceTitle}</h2>
        {/* div вокруг каждой пары — валидный HTML5 внутри dl и единственный
            способ разложить пары сеткой: без обёртки dt и dd стали бы
            отдельными ячейками и разъехались бы по разным колонкам. */}
        <dl className="audience">
          {[
            [t.about.audienceWhoLabel, t.about.audienceWhoBody],
            [t.about.audienceStartLabel, t.about.audienceStartBody],
            [t.about.audienceCeilingLabel, t.about.audienceCeilingBody],
            [t.about.audienceNotLabel, t.about.audienceNotBody],
          ].map(([label, body]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{body}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="card">
        <h2>{t.about.structureTitle}</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
          {t.about.structureIntro(totalSkills, totalTasks)}
        </p>
        {/*
         * Четыре трека — сеткой, а не столбиком во всю ширину.
         *
         * Описание трека ограничено 68ch (см. .card p в styles.css), поэтому
         * в один столбец правая половина карточки высотой почти в экран
         * оставалась пустой — та же причина, по которой .about-columns
         * и .track-intro идут в две колонки. Треков ровно четыре
         * и они независимы: это четыре ответа на один вопрос «что внутри»,
         * а не текст, который читают строго сверху вниз.
         */}
        <div className="track-summary-list">
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
        </div>
        {/*
         * Два блока, а не один абзац с подзаголовком: первый объясняет сам
         * путь «вопрос → решение» (диаграмма в WelcomeHero его рисует, но
         * нигде не сказано, зачем различать шаги), второй — почему треки
         * разложены вдоль него именно так. Порядок обязателен: без пути
         * порядок треков нечем обосновать, кроме «так принято».
         *
         * Заголовок первого — тот же t.welcome.chainTitle, что подписывает
         * диаграмму в питче: читатель встречает знакомое название и получает
         * к картинке объяснение, а не второе имя того же самого.
         *
         * Набран в полную силу, а не .muted, — и это исправление после ревью
         * глазами. Приглушённым 13px он читался как сноска о порядке треков,
         * хотя рядом, в карточке «Как это устроено», текст той же смысловой
         * важности идёт 14px обычным цветом. Приглушённым остаётся только
         * второй абзац: он и правда примечание к списку выше.
         */}
        <p
          className="muted"
          style={{ margin: '14px 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {t.welcome.chainTitle}
        </p>
        <p style={{ margin: '0 0 14px', fontSize: 14, lineHeight: 1.6 }}>{t.about.chainBody}</p>
        <p
          className="muted"
          style={{ margin: '0 0 2px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}
        >
          {t.about.tracksWhyTitle}
        </p>
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          {t.about.tracksWhyBody}
        </p>
      </div>

      {/*
       * Условная карточка, во всю ширину и вне about-columns намеренно:
       * колонки ниже сбалансированы по высоте под ровно четыре карточки
       * (см. комментарий у about-columns), и пятая, появляющаяся только
       * иногда, сдвинула бы баланс и оттеснила «Автора» от низа второй
       * колонки — то самое, что там прямо запрещено правилом «остаётся
       * последним и внизу».
       *
       * Видна только пока браузер прислал beforeinstallprompt
       * (Chrome/Edge/Android) и установка ещё не случилась — на iOS Safari
       * и в уже установленном приложении события нет вовсе, и пустая
       * кнопка обманывала бы.
       */}
      {installAvailable && (
        <div className="card">
          <h2>{t.about.installTitle}</h2>
          <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.about.installBody}</p>
          <button type="button" className="btn secondary" onClick={() => { void promptInstall(); }}>
            {t.about.installBtn}
          </button>
        </div>
      )}

      {/*
       * Четыре закрывающие карточки — колоночным потоком, а не сеткой.
       *
       * Рядом, а не друг под другом, они стоят по той же причине, что
       * карточки в TrackIntroScreen: абзац ограничен 68ch ради читаемости,
       * и во всю ширину каждая оставляла бы пустой правую половину.
       *
       * Но сетка здесь давала свой дефект, ради которого всё и переделано:
       * ряд выравнивается по самой высокой карточке, а «Приватность» втрое
       * короче «Как это устроено» — под ней зияла дыра в четверть экрана,
       * пока следующий ряд ждал конца соседа. Растянуть короткую карточку
       * было бы хуже: та же дыра, только внутри рамки.
       *
       * `columns` раскладывает карточки потоком и балансирует высоту колонок
       * сам — здесь это даёт почти ровные 581 и 555. Порядок чтения при этом
       * меняется с «слева направо» на «сверху вниз по колонке», и это
       * допустимо ровно потому, что карточки независимы: четыре ответа
       * на четыре разных вопроса, а не абзацы одного текста. «Автор
       * и лицензия» остаётся последним и внизу — см. ниже, почему это важно.
       */}
      <div className="about-columns">
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

      {/*
       * Аккаунт — своя карточка перед «Резервной копией», а не раздел
       * внутри неё. Обе про «что будет с накопленным», но отвечают
       * по-разному: вход убирает проблему, файл её страхует. Слитые
       * в одну карточку, они читались бы двумя равными кнопками
       * с одинаковым весом — а веса у них разные, и порядок это говорит.
       */}
      <div className="card">
        <h2>{t.about.accountTitle}</h2>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.about.accountBody}</p>
        {accountEmail ? (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
              {t.about.accountSignedInAs(accountEmail)}
            </p>
            <button type="button" className="btn secondary" onClick={() => void onSignOut()}>
              {t.about.accountSignOutBtn}
            </button>
          </>
        ) : (
          /*
           * secondary, а не акцентная. Полноширинная синяя кнопка была
           * единственной акцентной на всём экране и читалась главным
           * действием «О тренажёре» — то есть настаивала ровно там, где
           * текст двумя строками выше обещает, что вход добровольный.
           * Заметности хватает собственного заголовка карточки.
           */
          <button
            type="button"
            className="btn secondary"
            onClick={async () => {
              setSignInError(Boolean((await onSignIn()).error));
            }}
          >
            {t.about.accountSignInBtn}
          </button>
        )}
        {signInError && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--err)' }}>
            {t.about.accountSignInError}
          </p>
        )}
        {accountEmail && syncStatus !== 'idle' && (
          <p
            role="status"
            style={{
              margin: '10px 0 0',
              fontSize: 13,
              color: syncStatus === 'error' ? 'var(--err)' : syncStatus === 'synced' ? 'var(--ok)' : 'var(--text-dim)',
            }}
          >
            {syncStatus === 'syncing'
              ? t.about.accountSyncing
              : syncStatus === 'synced'
                ? t.about.accountSynced
                : t.about.accountSyncError}
          </p>
        )}
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

        {/*
         * Сброс — раздел этой же карточки, а не пятая карточка рядом,
         * и это замер, а не вкус.
         *
         * Пятой карточкой он вставал в верх правой колонки `about-columns`
         * (x=764, y=1850 при 1280×800) — то есть выше и «Приватности»,
         * и самой «Резервной копии», на которую ссылается его текст. Заодно
         * ломался баланс потока: 788 против 602, и под «Автором» зияли 186px,
         * хотя ровно про этот блок сказано, что он остаётся последним и внизу.
         *
         * Довод «необратимое не мешать с сохраняющим» при этом не нарушен:
         * возражение было против третьей кнопки в том же ряду, где две
         * безопасных отличались бы от неё только подписью. Здесь другое —
         * своя черта, свой заголовок, красная кнопка и вопрос перед ней.
         * По смыслу это один и тот же вопрос «что делать с накопленным»:
         * файл выше и есть единственный способ отменить сброс ниже.
         */}
        <hr className="card-rule" />
        <h3 className="card-subhead">{t.about.resetTitle}</h3>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.about.resetBody}</p>
        {resetStage === 'confirm' ? (
          <>
            {/*
             * Вопрос стоит над кнопками, а не вместо подписи на них: подпись
             * «Да, сбросить» отвечает на вопрос, но сама его не задаёт,
             * и человеку, нажавшему случайно, читать было бы нечего.
             */}
            <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>
              {t.about.resetConfirm}
            </p>
            <div className="row">
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  onResetProgress();
                  setResetStage('done');
                }}
              >
                {t.about.resetConfirmBtn}
              </button>
              <button type="button" className="btn secondary" onClick={() => setResetStage('idle')}>
                {t.about.resetCancelBtn}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn secondary" onClick={() => setResetStage('confirm')}>
            {t.about.resetBtn}
          </button>
        )}
        {resetStage === 'done' && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ok)' }}>
            {t.about.resetDone}
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
      </div>
    </>
  );
}

/**
 * «С чего начать» — экран, а не раздел «О тренажёре» (развилка закрыта
 * 2026-08-10, см. ROADMAP). Причина в жанре: about отвечает на «что это»
 * и читается в любом порядке, этот экран — на «что мне делать» и читается
 * сверху вниз один раз, отсюда и единственная в приложении нумерация шагов.
 *
 * Ничего не пересказывает: сравнение инструментов, порядок действий и список
 * «чего здесь нет» — единственное, чего не сказано ни в about.how*,
 * ни в четырёх intro.what/limits каждого пака. Подробное обоснование текста —
 * в i18n/ru.ts у блока onboarding.
 */
function Onboarding({ onFinish }: { onFinish: () => void }) {
  const { t, locale } = useI18n();

  return (
    <>
      {/*
       * Без заголовка намеренно: шапка экрана уже печатает t.onboarding.title
       * (см. h1 в App), и h2 с той же строкой стоял бы в шестидесяти пикселях
       * под ней — тот же дефект, что задвоенный логотип и что второй раз
       * названный трек в trackIntro. Ни один другой экран так не делает:
       * у about, sandbox, data и reference заголовок живёт только в шапке.
       * Карточка остаётся ради врезки — абзац крупнее остального текста,
       * как .brief у WelcomeHero, потому что читают его первым.
       */}
      <div className="card">
        <p className="brief" style={{ margin: 0 }}>{t.onboarding.intro}</p>
      </div>

      {/*
       * Не повтор intro.what четырёх паков, а то, чего там нет: правило
       * выбора между инструментами. В паках оно рассыпано по четырём
       * intro.limits и видно только тому, кто открыл все четыре вводных.
       * Раскладка и цветная точка — те же классы, что у списка треков
       * на «О тренажёре» и у легенды ChainDiagram, без новых стилей.
       */}
      <div className="card">
        <h2>{t.onboarding.toolsTitle}</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.toolsIntro}
        </p>
        <div className="track-summary-list">
          {TRACK_ORDER.map((track) => (
            <div key={track} className="track-summary">
              <div className="track-summary-head">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={`chain-legend-dot track-${track}`} aria-hidden />
                  {t.tracks.names[track]}
                </span>
              </div>
              <dl className="audience" style={{ marginTop: 8 }}>
                <div>
                  <dt>{t.onboarding.toolsWhenLabel}</dt>
                  <dd>{t.onboarding.toolsWhen[track]}</dd>
                </div>
                <div>
                  <dt>{t.onboarding.toolsCostLabel}</dt>
                  <dd>{t.onboarding.toolsCost[track]}</dd>
                </div>
              </dl>
            </div>
          ))}
        </div>
      </div>

      {/*
       * Один вопрос — три ответа. Единственное место экрана, где новичок
       * видит сам код, и потому единственное, что здесь проверяется сборкой:
       * гейт выполняет sql- и python-фрагменты и сверяет их результаты между
       * собой (см. content/tools-compare.ts). Порядок карточек берётся
       * из файла, а не из TRACK_ORDER: сравниваются три инструмента,
       * а domain среди них не инструмент.
       */}
      <div className="card">
        <h2>{t.onboarding.compareTitle}</h2>
        <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.compareIntro}
        </p>
        <p className="muted" style={{ margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {t.onboarding.compareQuestionLabel}
        </p>
        <p style={{ margin: '0 0 16px', fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>
          {toolsCompareQuestion(locale)}
        </p>
        <div className="compare-list">
          {toolsCompareAnswers.map((answer) => (
            <div key={answer.track} className="compare-item">
              <div className="compare-head">
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 14 }}>
                  <span className={`chain-legend-dot track-${answer.track}`} aria-hidden />
                  {t.tracks.names[answer.track]}
                </span>
                {/*
                 * Пометка исполнимости — не украшение: во всём остальном
                 * тренажёре код выполняется по-настоящему, и без явной
                 * подписи читатель по привычке решит, что и мера DAX
                 * прогнана по данным. Она не прогнана и прогнана быть
                 * не может.
                 *
                 * Выделена та пилюля, которая говорит неожиданное. Сначала
                 * было наоборот — две исполнимые светились акцентом,
                 * а единственная предупреждающая была обычной серой,
                 * и глаз проскакивал именно её. Правило общее: подсвечивать
                 * исключение, а не правило, иначе подсветка перестаёт
                 * что-либо значить.
                 */}
                <span className={`pill${answer.runnable ? '' : ' warn'}`}>
                  {answer.runnable ? t.onboarding.compareRunnable : t.onboarding.compareNotRunnable}
                </span>
              </div>
              <pre className="sql-block" style={{ marginTop: 8, fontSize: 12.5 }}>{answer.code}</pre>
              <p className="muted" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.55 }}>
                {answer.note[locale]}
              </p>
            </div>
          ))}
        </div>
        <p className="muted" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.compareFooter}
        </p>
      </div>

      {/*
       * Единственное место в приложении, где нумерация уместна: это
       * последовательность действий, а не набор ответов на разные вопросы
       * (см. комментарий у onboarding.steps в i18n/ru.ts). Номер рисует
       * экран по индексу массива, а не текст, — переставить шаг местами
       * не потребует правки строк в двух локалях.
       */}
      <div className="card">
        <h2>{t.onboarding.stepsTitle}</h2>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.stepsIntro}
        </p>
        <ol className="onboard-steps">
          {t.onboarding.steps.map((step, i) => (
            <li key={step.title} className="onboard-step">
              <span className="onboard-step-num" aria-hidden>
                {i + 1}
              </span>
              {/*
               * Тело шага — обычным цветом, а не .muted. Соседние карточки
               * устроены наоборот: в dl.audience подпись серая, а ответ
               * полной силы, и «Как проходить» была единственным местом,
               * где серым набран как раз ответ. Читая экран подряд,
               * натыкаешься на инверсию ровно там, где содержание самое
               * инструментальное. Иерархию держит начертание заголовка.
               */}
              <span>
                <strong style={{ display: 'block', marginBottom: 2, fontSize: 14 }}>{step.title}</strong>
                <span style={{ fontSize: 14, lineHeight: 1.6 }}>{step.body}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="muted" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.stepsNote}
        </p>
        <p className="muted" style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.installNote}
        </p>
      </div>

      {/*
       * Два списка, не один: «пробел рядом» и «соседняя профессия» — разные
       * обещания, и слить их значило бы поставить машинное обучение вровень
       * со сводными таблицами (см. onboarding.extraNear/extraAdjacent в ru.ts).
       * extraAdjacent обязан дословно продолжать about.audienceNotBody.
       */}
      <div className="card">
        <h2>{t.onboarding.extraTitle}</h2>
        <p className="muted" style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.extraIntro}
        </p>
        {/*
         * Карта окрестностей: три зоны от «внутри» к «снаружи», рельс слева
         * гаснет от акцентного цвета к цвету линии. Диаграмма здесь —
         * сама раскладка, а не картинка рядом с текстом: рисовать отдельную
         * схему значило бы вывести названия пунктов дважды.
         *
         * Первая зона без описаний намеренно (см. extraInsideLabel в ru.ts):
         * четыре трека уже описаны выше на этом экране, и нужна она не ради
         * содержимого, а ради границы — два списка ниже перечисляют
         * отсутствующее, и без «внутри» непонятно, относительно чего.
         */}
        <div className="zone-map">
          <div className="zone zone-inside">
            <p className="zone-label">{t.onboarding.extraInsideLabel}</p>
            <div className="zone-chips">
              {TRACK_ORDER.map((track) => (
                <span key={track} className="pill">
                  <span className={`chain-legend-dot track-${track}`} aria-hidden style={{ marginRight: 6 }} />
                  {t.tracks.names[track]}
                </span>
              ))}
            </div>
          </div>

          <div className="zone zone-near">
            <p className="zone-label">{t.onboarding.extraNearLabel}</p>
            <dl className="audience">
              {t.onboarding.extraNear.map((item) => (
                <div key={item.title}>
                  <dt>{item.title}</dt>
                  <dd>{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="zone zone-outside">
            <p className="zone-label">{t.onboarding.extraAdjacentLabel}</p>
            <dl className="audience">
              {t.onboarding.extraAdjacent.map((item) => (
                <div key={item.title}>
                  <dt>{item.title}</dt>
                  <dd>{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
        <p className="muted" style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.5 }}>
          {t.onboarding.extraClosing}
        </p>
      </div>

      {/*
       * Экран обязан куда-то вести — тот же принцип, что не пустил
       * «Занятие закончено» остаться тупиком с одной кнопкой (см. находку
       * навигации в ROADMAP). Ведёт на главную, а не в конкретный трек:
       * выбор трека — отдельное решение, страница его не делает за человека.
       */}
      <button type="button" className="btn" style={{ marginTop: 4 }} onClick={onFinish}>
        {t.onboarding.startBtn}
      </button>
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
              {/* См. ту же подпись на карте навыков: запасной вариант из локали. */}
              {visiblePack!.tierNames?.[tier] ?? t.task.levelLabel(tier)}
            </p>
            {list.map((s) => skillRow(s))}
          </div>
        ))}
      </div>
    </>
  );
}
