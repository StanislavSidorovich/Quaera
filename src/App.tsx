import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { isTrackTranslated, lessonBySkill, lessonBySkillFor, packForTrack, packs, trackBySkill } from './content';
import { toolsCompareAnswers, toolsCompareQuestion } from './content/tools-compare';
import type { Lesson, Pack, Skill, Task, Track } from './content/types';
import { getExecutor } from './engine/executors';
import { WORKER_FAILURE } from './engine/types';
import type { LoadState } from './engine/types';
import { useI18n, type Locale } from './i18n/context';
import { AUTHOR_LINKEDIN, AUTHOR_REPO } from './links';
import { promptInstall, subscribeInstallAvailable } from './pwa/installPrompt';
import {
  disablePush,
  enablePush,
  hasPushSubscription,
  pushState,
  syncWake,
  type PushState,
} from './push/client';
import { DataScreen } from './ui/DataScreen';
import { LessonCard } from './ui/LessonCard';
import { QueryLoop } from './ui/QueryLoop';
import { Sandbox } from './ui/Sandbox';
import { SchemaSheet, useSchema } from './ui/SchemaSheet';
import { Sidebar, IconAccount, type SidebarSection } from './ui/Sidebar';
import { QuaeraMark, TrackGlyph } from './ui/Marks';
import { StoryLine } from './ui/StoryLine';
import { buildLine, currentMissionIndex, type Mission } from './story/line';
import { StoryMode, storyPhaseBefore, type StoryPhase, type StoryStepView } from './ui/StoryMode';
import { storyCampaign, type StoryMission } from './content/storymode';
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
import { deleteAccount, pushProgress, syncProgress } from './sync/progressSync';

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
const FONT_SIZE_STORAGE_KEY = 'quaera-font-size';

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
const THEME_STORAGE_KEY = 'quaera-theme';

function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'system' || stored === 'light' || stored === 'dark') return stored;
  } catch {
    // localStorage недоступен — просто не запоминаем выбор
  }
  return 'system';
}

const ACTIVE_TRACK_STORAGE_KEY = 'quaera-active-track';
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
 * Трек, с которого советуем начать тому, кто ещё ничего не решал.
 *
 * Отдельно от TRACK_ORDER намеренно: список выше — порядок работы аналитика
 * (вопрос → данные → анализ → модель), и менять его ради совета значило бы
 * сломать то, что этот порядок объясняет (about.chainBody, tracksWhyBody).
 * Совет отвечает на другой вопрос — с чего начать учиться, — и ответ у него
 * законно другой. Разница названа прямо в tracksWhyBody, чтобы список
 * и метка не выглядели противоречием.
 *
 * Почему sql: его спрашивают почти в любой вакансии аналитика; это
 * единственный готовый трек без докачки (3.5 МБ датасета против 52 МБ
 * Pyodide у pandas, а у model движка нет вовсе и ответ сверяется текстом);
 * и проверка там идёт по результату запроса — то есть первое же занятие
 * показывает то, ради чего тренажёр существует. Совпадает с initialActiveTrack.
 */
const RECOMMENDED_TRACK: Track = 'sql';

/**
 * Экспериментальные разделы (сейчас — сюжетная линия) спрятаны за параметром
 * адреса `?story`, а не убраны из сборки: код уже в проде, но показывать его
 * всем рано — сначала проверяем саму идею на скрытом входе. Открывший `?story`
 * включает вход для себя, и флаг запоминается, чтобы не набирать параметр
 * на каждой навигации; `?story=0` выключает обратно. Экран линии по-прежнему
 * рендерится штатно — прячутся только два видимых входа в него (пункт меню
 * и ссылка на главной), поэтому без флага раздел просто недостижим.
 */
function readStoryEnabled(): { enabled: boolean; fromUrl: boolean } {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('story')) {
      const on = params.get('story') !== '0';
      localStorage.setItem('quaera.story', on ? '1' : '0');
      /*
       * Параметр стирается из адреса сразу, как прочитан. Иначе он остаётся
       * в строке навсегда, и каждое обновление страницы снова выбрасывало бы
       * в миссию — из главной было бы не выйти, не почистив адрес руками.
       * Своё дело он к этому моменту сделал: флаг записан в localStorage,
       * а открыть раздел просят один раз, не при каждом F5.
       */
      params.delete('story');
      const rest = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
      return { enabled: on, fromUrl: on };
    }
    return { enabled: localStorage.getItem('quaera.story') === '1', fromUrl: false };
  } catch {
    return { enabled: false, fromUrl: false };
  }
}
const STORY_FLAG = readStoryEnabled();
const STORY_ENABLED = STORY_FLAG.enabled;

/**
 * Адрес `?story` не просто включает раздел, а сразу его и открывает.
 *
 * До этого вход в режим истории стоял ссылкой на главной — то есть
 * незаконченный прототип занимал место на первом экране, который человек
 * видит каждый заход. Экспериментальному разделу там не место, а другого
 * входа на телефоне не бывает: бокового меню там нет вовсе. Ответ — сам
 * адрес: `quaera.app/?story` открывает миссию с первой фазы, а запомненный
 * флаг после этого держит пункт в боковом меню на десктопе. Свежий
 * пользователь по-прежнему не видит ни входа, ни следа раздела.
 */
const STORY_OPEN_ON_BOOT = STORY_FLAG.fromUrl;

/**
 * Старая сюжетная линия (выведенная из графа) убрана из интерфейса на время
 * валидации режима истории: два «сюжетных» входа рядом путали пользователя.
 * Это флаг видимости, а не удаление — код и экран линии живы; когда решится
 * её судьба, флаг либо вернётся, либо линия уедет целиком. Режим истории
 * при этом остаётся за `?story` (STORY_ENABLED), он линию и замещает.
 */
const SHOW_STORY_LINE = false;

/**
 * Докуда дошла кампания режима истории — id миссии, которую откроет вход.
 *
 * Единственное, что режим истории хранит про себя. Ход внутри миссии
 * (фаза, ответы) не переживает перезагрузку намеренно — миссия рассчитана
 * на один присест, — но кампания из нескольких миссий обязана: заставлять
 * человека проходить первый день заново ради второго значит наказывать
 * за возвращение. Прогрессом заданий это не подменить: `sql-010` можно
 * решить в обычном занятии, ни разу не открыв историю, и тогда вход
 * выбросил бы в середину сюжета без брифа.
 */
const STORY_MISSION_STORAGE_KEY = 'quaera.story.mission';

function readStoryMissionId(): string | null {
  try {
    return localStorage.getItem(STORY_MISSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveStoryMissionId(id: string) {
  try {
    localStorage.setItem(STORY_MISSION_STORAGE_KEY, id);
  } catch {
    // приватный режим или переполнение — кампания просто начнётся сначала
  }
}

/**
 * Миссия, с которой открывается режим: запомненная, а если её больше нет
 * в кампании (переписали контент) — первая. Возврат к началу здесь честнее
 * пустого экрана: сюжет читается подряд, и первая миссия ничего не ломает.
 */
function storyEntryMission(locale: Locale): StoryMission | null {
  const missions = storyCampaign(locale).missions;
  const saved = readStoryMissionId();
  return missions.find((m) => m.id === saved) ?? missions[0] ?? null;
}

/** Следующая миссия кампании, либо null — если эта последняя. */
function storyMissionAfter(locale: Locale, id: string): StoryMission | null {
  const missions = storyCampaign(locale).missions;
  const i = missions.findIndex((m) => m.id === id);
  return i >= 0 ? missions[i + 1] ?? null : null;
}

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
  /**
   * `fromStory` — занятие было миссией линии, и «Занятие закончено» обязано
   * вернуть на линию, а не на главную. Флаг, а не id миссии: экран линии
   * сам вычислит, где человек теперь, из решённых заданий, — а хранить
   * здесь номер значило бы завести вторую правду о прогрессе.
   */
  | { name: 'done'; solved: number; fromStory?: boolean }
  | { name: 'story' }
  /**
   * `phase` — где человек внутри дня (бриф → подводки и задания → суждение
   * → крючок; см. storyPhases в StoryMode). Живёт в экране, а не внутри
   * StoryMode, ровно по той же причине, по которой `index` занятия живёт
   * здесь: шапке нужен шаг назад, а стрелка в шапке умеет только менять
   * экран. `missionId` рядом потому, что в кампании дней несколько и «назад»
   * обязано попадать в свой день, а не в первый.
   */
  | { name: 'storymode'; missionId: string; phase: StoryPhase }
  | { name: 'reference' }
  | { name: 'sandbox' }
  | { name: 'data' }
  | { name: 'lesson'; skill: string }
  | { name: 'about' }
  | { name: 'account' }
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
function backTarget(current: Screen, locale: Locale): Screen {
  // Из карточки возвращаемся в список приёмов, а не на главную:
  // в справочнике их обычно листают подряд.
  if (current.name === 'lesson') return { name: 'reference' };
  /*
   * Из миссии «назад» ведёт на предыдущую фазу той же миссии, а наружу —
   * только с первой. Причина та же, что у занятия ниже: перечитать бриф
   * посреди задания — вопрос по ходу дела, а выход на главную стоил бы
   * всей миссии целиком (её ход нигде не сохраняется).
   */
  if (current.name === 'storymode') {
    /*
     * Порядок экранов дня считается по самой миссии: в дне может быть одно
     * задание, а может три, и подводка есть не у каждого. Поэтому миссию
     * приходится поднять из кампании — по её id и текущей локали.
     */
    const mission = storyCampaign(locale).missions.find((m) => m.id === current.missionId);
    const before = mission ? storyPhaseBefore(mission, current.phase) : null;
    if (before) return { ...current, phase: before };
  }
  if (current.name === 'session') {
    const step = current.queue[current.index];
    if (step?.kind === 'task') {
      const lessonIndex = lessonStepIndex(current.queue, step.task.skill);
      if (lessonIndex >= 0 && lessonIndex < current.index) return { ...current, index: lessonIndex };
    }
  }
  return { name: 'home' };
}

const SCREEN_STORAGE_KEY = 'quaera-screen';

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
  /*
   * Трек берётся у самой миссии, а не из своего ключа: миссия крутит внутри
   * настоящее задание, а исполнитель и схема приходят из активного трека —
   * войти в неё с чужим значило бы дать SQL-заданию питоновский движок.
   */
  if (STORY_OPEN_ON_BOOT) {
    const mission = storyEntryMission(locale);
    if (mission) {
      return { screen: { name: 'storymode', missionId: mission.id, phase: { kind: 'brief' } }, ...empty, track: mission.track };
    }
  }
  if (!stored) return { screen: { name: 'home' }, ...empty };
  switch (stored.name) {
    // Линия выводится из пака и существует у любого готового трека, так что
    // проверять здесь нечего: пустой трек экран объявляет сам, текстом.
    case 'story':
    case 'reference':
    case 'sandbox':
    case 'data':
    case 'about':
    case 'account':
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
  /**
   * Сюжетная линия трека — чистая функция от пака (см. story/line.ts), поэтому
   * зависит только от него: прогресс сюда не входит намеренно. Линия — это
   * дорога, а не положение на ней; положение считает уже сам экран, из решённых
   * заданий. Пересобирать её на каждую решённую задачу было бы и лишней работой,
   * и приглашением однажды сделать состав миссий зависящим от успехов.
   */
  const line = useMemo(() => buildLine(activePack), [activePack]);
  /**
   * Положение на линии — только ради подписи ссылки на главной.
   *
   * Число стоит в самой ссылке, а не за ней: «где я» — это и есть вопрос,
   * ради которого линия сделана, и заставлять человека переходить, чтобы
   * его задать, значит отвечать на него дороже, чем он стоит.
   */
  const storyAt = useMemo(() => {
    if (!line.length) return null;
    const at = currentMissionIndex(line, (id) => progress.taskRecords[id]?.solved === true);
    return { at, total: line.length };
  }, [line, progress]);

  /**
   * Миссия режима истории и её задание, найденное в паке. Срез — одна миссия,
   * привязанная к sql (см. content/storymode.ts). Показываем только когда
   * активен тот же трек: тогда executor и schema соответствуют заданию.
   * Спрятано за STORY_ENABLED, как и оба входа в старую линию.
   */
  /**
   * Трек миссии режима истории. Отдельно от storyMission ниже потому, что
   * нужен раньше него: вход обязан знать, куда переключаться, ещё до того,
   * как миссия станет доступной (а доступной она становится только на своём
   * треке — иначе исполнитель и схема будут чужие).
   */
  const storyMissionTrack = useMemo(() => storyEntryMission(locale)?.track ?? null, [locale]);

  /**
   * Дни кампании, у которых на активном треке нашлись все их задания, — по id.
   *
   * Картой, а не одним днём: экран называет свой по id, и разрешать его нужно
   * в момент отрисовки. День, которому не хватило хотя бы одного задания,
   * сюда не попадает целиком — это тот же приём, что у восстановления
   * занятия: лучше не открыть раздел, чем открыть его с дырой посреди дня,
   * где кнопка «дальше» упирается в пустоту.
   */
  const storyMissions = useMemo(() => {
    const byId = new Map<string, { mission: StoryMission; steps: StoryStepView[] }>();
    if (!STORY_ENABLED) return byId;
    for (const mission of storyCampaign(locale).missions) {
      if (mission.track !== activeTrack) continue;
      const steps: StoryStepView[] = [];
      for (const step of mission.steps) {
        const task = activePack.tasks.find((tk) => tk.id === step.taskId);
        if (!task) break;
        steps.push({ task, skillTitle: activePack.skills.find((sk) => sk.id === task.skill)?.title ?? '' });
      }
      if (steps.length !== mission.steps.length) continue;
      byId.set(mission.id, { mission, steps });
    }
    return byId;
  }, [locale, activePack, activeTrack]);

  const storyMission = screen.name === 'storymode' ? storyMissions.get(screen.missionId) ?? null : null;

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
  // Локаль — тем же приёмом и по той же причине: backTarget поднимает по ней
  // миссию, чтобы посчитать порядок экранов дня, а обработчик popstate висит
  // с пустыми зависимостями и из замыкания видел бы локаль первого рендера.
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

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
      setScreen(backTarget(current, localeRef.current));
    }

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const dueCount = useMemo(
    () => activePack.skills.filter((s) => skillState(progress, s.id).reps > 0 && isDue(progress.skills[s.id])).length,
    [progress, activePack]
  );

  /**
   * Сколько тем ждёт повторения **во всех треках сразу** — число для бейджа
   * на иконке приложения. Отдельно от dueCount выше, и это не дубль:
   * тот считает по активному треку, потому что стоит на главной этого трека
   * рядом с его же полосой прогресса. Иконка приложения одна на все четыре,
   * и «3» на ней, когда в SQL одна тема, а в pandas две, — единственное
   * честное число.
   *
   * Считается обходом паков, а не ключей progress.skills, — и это не вкус.
   * В хранилище остаются навыки, которых в паках уже нет: переименованный
   * или удалённый id никто оттуда не вычищает. Счёт по ключам показал бы
   * на иконке темы, которых в приложении не существует, и открывший его
   * человек не нашёл бы, что повторять (замер на подсеянном прогрессе:
   * три просроченных ключа, из них реальный навык один). Тот же довод,
   * по которому занятие хранит id шагов и пересобирается по текущим пакам.
   */
  const dueTotal = useMemo(
    () =>
      ALL_TRACKS.reduce((sum, track) => {
        const pack = packForTrack(track, locale);
        if (!pack) return sum;
        return (
          sum + pack.skills.filter((s) => skillState(progress, s.id).reps > 0 && isDue(progress.skills[s.id])).length
        );
      }, 0),
    [progress, locale]
  );

  /**
   * Те же навыки, но списком id — для расписания push (src/push/schedule.ts).
   *
   * Отдельно от `dueTotal`, потому что вопросы разные: тот отвечает «сколько
   * подошло сейчас», это — «за какими вообще следим». Но источник обязан быть
   * один и тот же обход паков: возьми расписание ключи `progress.skills`,
   * и человека будили бы ради тем, удалённых из паков месяц назад.
   *
   * Не зависит от локали по существу (id навыка один на оба языка), но
   * `packForTrack` требует её аргументом, и подставлять сюда фиксированную
   * значило бы завести второй способ добраться до паков.
   */
  const allSkillIds = useMemo(
    () =>
      ALL_TRACKS.flatMap((track) => packForTrack(track, locale)?.skills.map((s) => s.id) ?? []),
    [locale]
  );

  /**
   * Бейдж на иконке установленного приложения.
   *
   * Зачем вообще: всё расписание тренажёра построено на возвратах через дни
   * и недели, а до этого в приложении не было ни одного механизма, который
   * о возврате напоминает. Полоса прочности, интервалы SRS и «серия дней»
   * видны только тому, кто уже открыл приложение, то есть работают ровно
   * для того, кому напоминание не нужно.
   *
   * **Граница честности, которую важно знать до того, как на бейдж
   * положатся:** число обновляется только пока приложение открыто, и потом
   * остаётся на иконке до следующего запуска. То есть бейдж хорошо ловит
   * «я ушёл, не доделав» и совсем не ловит «сегодня подошли три темы».
   * Второе закрыто отдельным механизмом — Web Push (src/push/), — и они
   * намеренно не пересекаются: бейдж показывает уже просроченное, push
   * будит на переход «подошло, пока приложение было закрыто». Бейдж при
   * этом остаётся нужен и сам по себе: он работает без разрешений,
   * без сервера и у тех, кто напоминания не включал.
   *
   * Тихо ничего не делает там, где API нет (Firefox, обычная вкладка вместо
   * установленного приложения): это украшение, и ни одна ошибка отсюда
   * не должна доходить до человека.
   */
  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (typeof nav.setAppBadge !== 'function') return;
    const done = dueTotal > 0 ? nav.setAppBadge(dueTotal) : nav.clearAppBadge?.();
    // Отказ штатен: в неустановленном приложении часть браузеров отклоняет вызов.
    done?.catch(() => {});
  }, [dueTotal]);

  /**
   * Взведение будильника push по текущему прогрессу.
   *
   * Два момента, и оба нужны по разным причинам.
   *
   * **При открытии приложения** — потому что это единственный момент, когда
   * взведение точно случится: закрытие вкладки браузер волен не показать
   * странице вовсе (телефон убил процесс, система выгрузила фон).
   * Взводим по прогрессу, каким он поднялся из хранилища и слился
   * с серверным, то есть по актуальному на этот запуск.
   *
   * **При уходе со страницы** — потому что за сессию прогресс меняется,
   * и будильник, взведённый на входе, отстанет ровно на всё, что человек
   * сегодня решил. `pagehide`, а не `beforeunload`: второй на мобильных
   * не срабатывает при сворачивании, а именно так приложение и закрывают.
   * Запрос уходит с `keepalive` (см. push/client.ts) — обычный браузер
   * оборвал бы вместе со страницей.
   *
   * Не на каждый ответ: расписание меняется вместе с прогрессом, но сеть
   * на каждое решённое задание — это батарея и трафик ради числа, которое
   * всё равно уточнится при закрытии.
   *
   * Ошибки не обрабатываются здесь намеренно: `syncWake` не бросает вовсе,
   * а нет подписки — тихо ничего не делает. Напоминания это удобство поверх
   * работающего приложения, и ни одна их неудача не должна доходить
   * до человека.
   */
  useEffect(() => {
    void syncWake(progress, allSkillIds, locale);
    const onHide = () => void syncWake(progressRef.current, allSkillIds, locale);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
    /*
     * Намеренно НЕ зависит от progress: иначе обработчик переподписывался бы
     * на каждый ответ, а первый вызов уходил бы в сеть столько же раз.
     * Свежий прогресс обработчик берёт из ref — то же решение, что уже
     * принято для `recordedTasksRef` и по той же причине: значение нужно
     * на момент события, а не на момент подписки.
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSkillIds, locale]);
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

    startQueue(withLessons(picked));
  }

  /**
   * Задания плюс карточки приёма перед первой задачей на незнакомый навык.
   *
   * Признак «первой» — отсутствие повторений: как только задача решена,
   * счётчик растёт и теория больше не всплывает сама, оставаясь в справочнике.
   *
   * Общая для занятия и для миссии линии намеренно. Правило показа теории —
   * то самое, из-за которого новичок не утыкается в задачу, не зная приёма;
   * разъедься эти два входа, и линия начала бы вести себя не как занятие
   * ровно там, где человек впервые видит тему.
   */
  function withLessons(tasks: Task[]): Step[] {
    const introduced = new Set<string>();
    const queue: Step[] = [];
    for (const task of tasks) {
      const lesson = lessonBySkill.get(task.skill);
      const isNew = (progress.skills[task.skill]?.reps ?? 0) === 0;
      if (lesson && isNew && !introduced.has(task.skill)) {
        introduced.add(task.skill);
        queue.push({ kind: 'lesson', lesson });
      }
      queue.push({ kind: 'task', task });
    }
    return queue;
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
      version: 2,
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

  /**
   * Миссия сюжетной линии — третий вход в занятие, и самый простой из трёх:
   * состав уже определён линией (см. story/line.ts), подбирать нечего.
   * Задания идут в том же порядке, в каком их выстроила линия: сначала
   * разобранный образец, потом достраивание, потом с нуля.
   *
   * Пройденную миссию можно начать заново, и она соберётся из тех же заданий.
   * Это не ошибка учёта: повторное решение уходит в SRS как обычная попытка,
   * а «пройдено» у миссии от него не меняется — оно и так уже верно.
   */
  function startMission(mission: Mission) {
    const queue = withLessons(mission.tasks);
    if (!queue.length) return;
    startQueue(queue);
    window.scrollTo({ top: 0 });
  }

  /**
   * Была ли очередь занятия миссией линии — по составу, а не по флагу.
   *
   * Флаг в памяти вкладки соврал бы после перезагрузки: занятие поднимается
   * из хранилища целиком (см. initialBoot), а флаг к тому моменту потерян,
   * и «Занятие закончено» увело бы с линии на главную только потому, что
   * посреди миссии нажали F5. Состав же в хранилище есть — по нему и считаем.
   */
  function queueMission(queue: Step[]): Mission | null {
    const ids = queue.flatMap((step) => (step.kind === 'task' ? [step.task.id] : []));
    if (!ids.length) return null;
    return line.find((m) => ids.every((id) => m.tasks.some((t) => t.id === id))) ?? null;
  }

  function advance() {
    setScreen((s) => {
      if (s.name !== 'session') return s;
      const next = s.index + 1;
      if (next >= s.queue.length) {
        return {
          name: 'done',
          solved: s.queue.filter((q) => q.kind === 'task').length,
          fromStory: queueMission(s.queue) !== null,
        };
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

  /**
   * Записывает попытку в прогресс и SRS. Вынесено из handleDone, чтобы тем же
   * путём писал режим истории (см. StoryMode): у него нет сессии и своего
   * счётчика recordedTasksRef, поэтому «один раз» он стережёт сам, а сюда
   * приходит уже с решением, которое надо зачесть.
   */
  function recordAttempt(task: Task, outcome: TaskOutcome) {
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

  function handleDone(task: Task, outcome: TaskOutcome) {
    // Попытка засчитывается один раз за занятие — см. recordedTasksRef.
    // Шаг при этом двигается всегда: кнопка «Дальше» обязана вести дальше
    // и на решённом задании, куда человек просто вернулся посмотреть разбор.
    if (!recordedTasksRef.current.has(task.id)) {
      recordedTasksRef.current.add(task.id);
      recordAttempt(task, outcome);
    }
    advance();
  }

  /** Скачивает текущий прогресс файлом — см. пояснение у exportProgress в srs/store.ts. */
  function downloadProgress() {
    const blob = new Blob([exportProgress(progress)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `quaera-progress-${today()}.json`;
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

  /**
   * Вход в режим истории — переключает трек на тот, которому принадлежит
   * задание миссии, и только потом открывает экран.
   *
   * Без переключения вход был обусловлен: раздел показывался, только пока
   * активен sql, — то есть человек с открытым pandas просто не видел, что
   * режим существует, а адрес `?story` привёл бы его на пустой экран.
   * Прокрутки к выбору трека здесь нет, в отличие от switchTrack: она
   * нужна главной, а мы с главной уходим.
   */
  function openStoryMode() {
    if (!storyMissionTrack) return;
    if (storyMissionTrack !== activeTrack) {
      setActiveTrack(storyMissionTrack);
      setConsentDeferred(false);
      try {
        localStorage.setItem(ACTIVE_TRACK_STORAGE_KEY, storyMissionTrack);
      } catch {
        // см. initialActiveTrack
      }
    }
    const mission = storyEntryMission(locale);
    if (!mission) return;
    setScreen({ name: 'storymode', missionId: mission.id, phase: { kind: 'brief' } });
  }

  /**
   * Вход в режим истории из «О тренажёре».
   *
   * Отличается от openStoryMode одним: запоминает флаг. Адрес `?story`
   * делает это сам (readStoryEnabled), и без этого человек, вошедший
   * из приложения, терял бы раздел из бокового меню при каждом
   * возвращении — то есть каждый раз искал бы вход заново.
   */
  function openStoryModeFromApp() {
    try {
      localStorage.setItem('quaera.story', '1');
    } catch {
      // приватный режим — вход сработает, просто не запомнится
    }
    openStoryMode();
  }

  /**
   * Что делает кнопка в конце миссии, если кампания на ней не кончается.
   *
   * null означает «эта миссия последняя» — тогда крючок прощается словами
   * «продолжение следует» и уводит на главную. Проверяется не только наличие
   * следующей в кампании, но и то, что она разрешилась в задание на активном
   * треке: обещать переход, который упрётся в пустой экран, хуже, чем честно
   * закончить кампанию на миссию раньше.
   */
  function nextStoryMission(currentId: string): (() => void) | null {
    const next = storyMissionAfter(locale, currentId);
    if (!next || !storyMissions.has(next.id)) return null;
    return () => {
      saveStoryMissionId(next.id);
      setScreen({ name: 'storymode', missionId: next.id, phase: { kind: 'brief' } });
      window.scrollTo({ top: 0 });
    };
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
  const SIDEBAR_SECTIONS: Partial<Record<Screen['name'], SidebarSection>> = {
    home: 'home',
    // Конец занятия принадлежит главной: своего пункта у него нет, а подсветить
    // нечего — раздел, из которого занятие начали, уже не восстановить.
    done: 'home',
    story: 'story',
    storymode: 'storymode',
    reference: 'reference',
    sandbox: 'sandbox',
    data: 'data',
    about: 'about',
    account: 'account',
    onboarding: 'onboarding',
  };
  const sidebarSection: SidebarSection = SIDEBAR_SECTIONS[screen.name] ?? null;

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
        storyEnabled={SHOW_STORY_LINE}
        onStory={() => setScreen({ name: 'story' })}
        storyModeEnabled={STORY_ENABLED && storyMissionTrack !== null}
        onStoryMode={openStoryMode}
        onSandbox={() => setScreen({ name: 'sandbox' })}
        onData={() => setScreen({ name: 'data' })}
        onAbout={() => setScreen({ name: 'about' })}
        onAccount={() => setScreen({ name: 'account' })}
        accountEmail={session?.user.email ?? null}
        onOnboarding={() => setScreen({ name: 'onboarding' })}
        onSelectTrack={switchTrack}
      />

      <div className="shell">
        <header className="topbar">
          {screen.name !== 'home' && (
            <button
              className="icon-btn"
              onClick={() => {
                setScreen(backTarget(screen, locale));
                window.scrollTo({ top: 0 });
              }}
              aria-label={t.app.back}
            >
              ←
            </button>
          )}
          {/*
           * Знак приложения — только на главной и только там, где нет
           * бокового меню (см. .topbar-mark в styles.css). Слово «Quaera»
           * при этом остаётся на месте, справа от знака: знак опознаётся
           * быстрее, а имя всё равно нужно — приложение называет себя
           * на телефоне ровно один раз, и это единственное такое место.
           */}
          {screen.name === 'home' && (
            <span className="topbar-mark">
              <QuaeraMark />
            </span>
          )}
          <h1 className={screen.name === 'home' ? 'brand' : undefined}>
            {screen.name === 'session'
              ? (currentSkillTitle ?? t.session.title)
              : screen.name === 'storymode'
                ? t.storyMode.headerTitle
              : screen.name === 'story'
                ? t.story.title
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
                      : screen.name === 'account'
                        ? t.account.title
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
                : screen.name === 'storymode'
                  ? null
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
                      : screen.name === 'account'
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
          {/*
           * Полоска треков в шапке главной — постоянная дорога к треку там,
           * где бокового меню нет вовсе.
           *
           * До этого перейти к треку на телефоне можно было только через
           * карточки в теле главной, то есть через конкретную вёрстку одного
           * экрана: любая её перестановка рвала единственный путь. Здесь путь
           * привязан к шапке — к тому, что на экране не двигается.
           *
           * Знаком, а не буквой (A/S/p/D): буквы без подписи не опознаются,
           * см. TrackGlyph. Активный трек назван не цветом текста, а заливкой
           * и полосой под знаком — цвета треков задуманы заливкой и текстом
           * дают меньше 4.5:1 (замер у --track-* в styles.css).
           */}
          {screen.name === 'home' && (
            <nav className="track-strip" aria-label={t.nav.tracksLabel}>
              {TRACK_ORDER.map((track) => (
                <button
                  key={track}
                  type="button"
                  className={`track-chip track-${track}${track === activeTrack ? ' is-active' : ''}`}
                  // aria-pressed, а не aria-current, — по той же причине, что
                  // и у треков в боковом меню: активный трек это состояние
                  // приложения, а не открытая страница.
                  aria-pressed={track === activeTrack}
                  aria-label={t.tracks.names[track]}
                  onClick={() => switchTrack(track)}
                >
                  <TrackGlyph track={track} />
                </button>
              ))}
            </nav>
          )}
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
            {/*
             * Вход в «Аккаунт и данные» — только там, где нет бокового меню
             * (скрыт от 1024px, см. .topbar-account в styles.css). Тем же
             * приёмом шапка договаривает название приложения на телефоне
             * (.brand-word) и серию дней (.ctx-streak): на десктопе это
             * стоит в меню в трёхстах пикселях левее, и второй вход был бы
             * дублем навигации, которого Sidebar сознательно избегает.
             *
             * На телефоне постоянного меню нет вовсе, и без этой иконки
             * единственной дорогой к входу оставалась бы ссылка в конце
             * «О тренажёре» — два с половиной экрана прокрутки. Высоты она
             * не занимает: строка инструментов в шапке уже есть.
             */}
            <button
              className={`icon-btn topbar-account${session ? ' signed-in' : ''}`}
              aria-label={session ? t.account.signedInAs(session.user.email ?? '') : t.nav.account}
              aria-current={screen.name === 'account' ? 'page' : undefined}
              onClick={() => setScreen({ name: 'account' })}
            >
              <IconAccount />
            </button>
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
              onOpenStory={() => setScreen({ name: 'story' })}
              storyAt={storyAt}
              /* Вход в режим истории — только когда миссия разрешена (флаг + её трек). */
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
              accountEmail={session?.user.email ?? null}
              onOpenAccount={() => setScreen({ name: 'account' })}
            />
          )}

          {screen.name === 'about' && (
            <About
              onSelectTrack={(track) => { switchTrack(track); }}
              onOpenOnboarding={() => setScreen({ name: 'onboarding' })}
              onOpenAccount={() => setScreen({ name: 'account' })}
              onOpenStoryMode={storyMissionTrack ? openStoryModeFromApp : null}
            />
          )}

          {screen.name === 'account' && (
            <AccountScreen
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
              /*
               * Выход после удаления обязателен, и именно локальный:
               * на сервере пользователя уже нет, но `supabase-js` держит
               * в хранилище его токены и продолжает их обновлять — до
               * первого отказа, который случится не здесь и будет выглядеть
               * поломкой на ровном месте. Всё остальное — то же, что
               * при обычном выходе: без сброса `syncedForRef` следующий
               * вход под другим аккаунтом отправил бы на сервер копию,
               * ещё не сведённую с его собственной.
               */
              onDeleteAccount={async () => {
                if (!(await deleteAccount())) return false;
                await signOut();
                syncedForRef.current = null;
                setSyncStatus('idle');
                return true;
              }}
              onEnablePush={() => enablePush(progress, allSkillIds, locale)}
              onDisablePush={disablePush}
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
            /*
             * Пилюля навыка на карточке задания ведёт на карточку приёма
             * этого же занятия, если она в очереди была. Если нет (навык
             * уже введён раньше, и сегодняшняя очередь его карточку
             * не включила) — на карточку из справочника, тем же переходом,
             * что и Reference.onOpen ниже. Занятие при этом не бросается:
             * уход с экрана 'session' на любой другой сохраняет его
             * снимок на устройстве (см. persistSession выше), тем же
             * путём, каким уже работает «Вернуться к занятию» с главной.
             */
            const lessonIndex = screen.name === 'session' ? lessonStepIndex(screen.queue, step.task.skill) : -1;
            const skillId = step.task.skill;
            return (
              <TaskView
                key={step.task.id}
                task={step.task}
                executor={executor}
                schema={schema}
                drafts={taskDrafts}
                skillTitle={activePack.skills.find((sk) => sk.id === step.task.skill)?.title ?? ''}
                onOpenLesson={
                  lessonIndex >= 0
                    ? () => goToStep(lessonIndex)
                    : lessonBySkill.has(skillId)
                      ? () => setScreen({ name: 'lesson', skill: skillId })
                      : undefined
                }
                onOpenSchema={openSchema}
                onDone={(o) => handleDone(step.task, o)}
              />
            );
          })()}

          {screen.name === 'story' && (
            <StoryLine
              track={activeTrack}
              line={line}
              isSolved={(id) => progress.taskRecords[id]?.solved === true}
              onStartMission={startMission}
            />
          )}

          {screen.name === 'storymode' && storyMission && executor && (
            <StoryMode
              /*
               * Смена миссии — это новый экран, а не новые пропсы того же.
               * Внутри StoryMode живёт ref «попытку уже зачёл», и без
               * перемонтирования он приехал бы во вторую миссию взведённым:
               * её задание молча не попало бы в прогресс.
               */
              key={storyMission.mission.id}
              campaign={storyCampaign(locale)}
              mission={storyMission.mission}
              steps={storyMission.steps}
              executor={executor}
              schema={schema}
              drafts={taskDrafts}
              phase={screen.phase}
              onPhase={(phase) => {
                setScreen({ name: 'storymode', missionId: storyMission.mission.id, phase });
                window.scrollTo({ top: 0 });
              }}
              onTaskDone={recordAttempt}
              onOpenSchema={openSchema}
              onNext={nextStoryMission(storyMission.mission.id)}
              onExit={() => setScreen({ name: 'home' })}
            />
          )}

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
              {/*
               * Миссия возвращает на линию, а не на главную: следующий шаг
               * пути стоит именно там, и уводить оттуда на главную значило бы
               * рвать линию ровно в точке, ради которой она и заводилась.
               * Занятие, собранное планировщиком, по-прежнему ведёт на главную —
               * его следующий шаг там.
               */}
              <button
                className="btn secondary"
                style={{ marginTop: 8 }}
                onClick={() => {
                  setScreen(screen.fromStory ? { name: 'story' } : { name: 'home' });
                  window.scrollTo({ top: 0 });
                }}
              >
                {screen.fromStory ? t.session.lineBtn : t.session.homeBtn}
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
function TrackSwitcher({
  active,
  onSelect,
  recommend,
}: {
  active: Track;
  onSelect: (track: Track) => void;
  /*
   * Показывать ли метку рекомендованного трека. Приходит извне, а не
   * считается здесь: тот же признак нужен карточкам (TrackCards), и два
   * независимых вычисления «человек ещё ничего не решал» разошлись бы
   * ровно в тот момент, когда первое задание решено — метка исчезла бы
   * на одной ширине экрана и осталась на другой.
   */
  recommend: boolean;
}) {
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
            {/*
             * Метка обязана быть и здесь, а не только на карточках: на
             * телефоне .track-cards скрыты вовсе (см. styles.css), то есть
             * без этой строки совет не доходил бы ровно до того экрана,
             * ради которого затевался. Вместо счётчика заданий, а не рядом
             * с ним — плитка узкая, две подписи в ней встают в три строки.
             */}
            {recommend && track === RECOMMENDED_TRACK ? (
              <small className="track-tab-recommended">{t.tracks.recommendedBadge}</small>
            ) : (
              <small>{ready ? t.tracks.readyBadge(p.tasks.length) : t.tracks.draftBadge}</small>
            )}
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
  recommend,
}: {
  active: Track;
  progress: Progress;
  onSelect: (track: Track) => void;
  /** Показывать метку и довод рекомендованного трека — см. TrackSwitcher. */
  recommend: boolean;
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
        const highlighted = recommend && track === RECOMMENDED_TRACK;
        return (
          <button
            key={track}
            type="button"
            className={`track-card track-${track}${active === track ? ' active' : ''}${ready ? '' : ' draft'}${highlighted ? ' track-card-highlight' : ''}`}
            onClick={() => onSelect(track)}
          >
            <div className="track-card-head">
              <span className="track-card-name">{t.tracks.names[track]}</span>
              {highlighted && <span className="track-card-recommended">{t.tracks.recommendedBadge}</span>}
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
 *
 * `withHeadline` нужен ровно одному вызову: на главной заголовок вынесен
 * из карточки и стоит над выбором трека, а карточка с абзацем уехала под
 * него (см. Home). На «О тренажёре» карточка остаётся целой — там решение
 * не принимают, там читают.
 */
function WelcomeIntroBody({ withHeadline = true }: { withHeadline?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      {withHeadline && <h2 style={{ marginTop: 0 }}>{t.welcome.headline}</h2>}
      <p className="brief" style={{ margin: withHeadline ? '8px 0 10px' : '0 0 10px' }}>{t.welcome.body}</p>
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
 * на экране «О тренажёре». На главной он с 2026-08-12 разобран на части
 * ради входа в занятие, который иначе стоял ниже сгиба и на ноутбуке,
 * и на телефоне; с 2026-08-18 разбор доведён до конца — наверху остался
 * только заголовок, а абзац и доводы уехали в конец главной, потому что
 * за сгибом оказались уже сами треки. На «О тренажёре» решение не читают —
 * там абзац сразу ведёт к доказательствам, и WelcomeHero остаётся одной
 * карточкой, как раньше. Обратный вход тоже цел: WelcomeHero открывает экран
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
  onOpenStory,
  storyAt,
  resume,
  onResume,
  scrollToChooser,
  onChooserScrolled,
  accountEmail,
  onOpenAccount,
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
  onOpenStory: () => void;
  /** Где человек на линии: `at` — индекс текущей миссии, равен `total` у пройденной. null — линии нет. */
  storyAt: { at: number; total: number } | null;
  /** Вход в режим истории (эксперимент за `?story`). undefined — миссия не разрешена, ссылку не показываем. */
  /** Подпись шага незаконченного занятия этого трека («Задача 2 из 5»), null — продолжать нечего. */
  resume: string | null;
  onResume: () => void;
  /** Трек только что выбран — подвинуть экран к выбору (см. switchTrack в App). */
  scrollToChooser: boolean;
  /** Сигнал получен и отработан — гасим его, чтобы он не сработал второй раз. */
  onChooserScrolled: () => void;
  /** Почта вошедшего или null — для строки состояния входа (см. .home-account-line). */
  accountEmail: string | null;
  onOpenAccount: () => void;
}) {
  const { t, locale } = useI18n();

  /*
   * Прежний адрес Cloudflare Pages продолжает работать и отдаёт то же
   * приложение (см. [[querium-links]]) — отключить его, не сломав деплой,
   * нельзя. Читается один раз при монтировании: домен не меняется на лету.
   */
  const isOldDomain = typeof location !== 'undefined' && location.hostname.endsWith('.pages.dev');

  /**
   * Лежит ли рантайм Python в кеше устройства. От этого зависит только текст
   * подписи под кнопкой — и это единственное место, где приложение может
   * отличить первую закачку 52 МБ от подъёма из кеша. Флаг согласия для
   * этого не годится: он хранится навсегда, а кеш браузер вправе вытеснить.
   *
   * `caches.match` без имени кеша ищет по всем кешам разом — и это здесь
   * не лень, а необходимость: имя вендорного кеша содержит пин версии
   * Pyodide, подставляемый в sw.js на сборке (см. scripts/postbuild-sw.mjs),
   * и в коде приложения его нет.
   *
   * `null` — «не знаем» (Cache API недоступен или проба не успела): тогда
   * показывается прежний текст про первую закачку. Ошибиться в эту сторону
   * дешевле — обещание «качается один раз» при подъёме из кеша всего лишь
   * избыточно, а обратная ошибка сказала бы «интернет не нужен» тому, кто
   * как раз сейчас тратит трафик.
   */
  const [runtimeCached, setRuntimeCached] = useState<boolean | null>(null);
  useEffect(() => {
    if (!heavyRuntime || typeof caches === 'undefined') {
      setRuntimeCached(null);
      return;
    }
    let alive = true;
    caches.match('/pyodide/pyodide.asm.wasm').then(
      (hit) => {
        if (alive) setRuntimeCached(Boolean(hit));
      },
      () => {
        if (alive) setRuntimeCached(null);
      },
    );
    return () => {
      alive = false;
    };
  }, [heavyRuntime]);

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
   * Видна только тому, кто выбрал pandas и ни разу не прикасался к SQL —
   * `reps` растёт после первой же оценки SRS, поэтому «0 у каждого навыка
   * трека» и значит «трек не открывали». Считаем не по activePack (это
   * всегда python здесь), а по sql-паку конкретно: сравнение с чужим
   * треком, который скрыт под текущим выбором.
   */
  const showPandasSqlHint = useMemo(() => {
    if (activeTrack !== 'python') return false;
    const sqlPack = packForTrack('sql', locale);
    if (!sqlPack) return false;
    return sqlPack.skills.every((s) => (progress.skills[s.id]?.reps ?? 0) === 0);
  }, [activeTrack, progress, locale]);

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
  /*
   * Совет «начните отсюда» живёт по тому же признаку, что и карточка-питч,
   * и это не совпадение: оба отвечают человеку, который ещё ничего не решал.
   * Как только он начал — неважно, с какого трека, — совет становится
   * неверным (он уже начал) и превращается в шум на самом видном месте.
   * Признак один на переключатель и на карточки, потому что это одна
   * и та же развилка на двух ширинах экрана.
   */
  const showRecommendation = isNewUser;

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
  /*
   * Не только кнопка «Начать занятие» — три состояния карточки ниже
   * (согласие на рантайм, отложенное согласие, готовый трек) взаимно
   * исключают друг друга, и в каждом это ref висит на своей главной
   * кнопке. Раньше он ставился только в третьем состоянии: на треке
   * pandas без подтверждённого согласия startRef.current был пуст,
   * прокрутка доводила лишь до ссылки-выбора, а «Скачать и продолжить»
   * оставалось за сгибом — то самое действие, которого человек и искал.
   */
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
      {isOldDomain && (
        <div className="domain-notice">
          <span>{t.home.oldDomainNotice}</span>
          <a href="https://quaera.app/">{t.home.oldDomainNoticeBtn}</a>
        </div>
      )}
      {/*
       * Заголовок питча — отдельной строкой над выбором трека, а сама
       * карточка с абзацем и доводами уехала в конец главной (см. ниже).
       *
       * Причина — замер с телефона на чистом хранилище, 360×780: карточка
       * занимала 134→646, довод «почему SQL» 718→815, а переключатель
       * треков начинался только на 825, то есть все четыре трека целиком
       * лежали за сгибом и человек не видел, о чём вообще речь, пока
       * не проскроллит. На десктопе 1280×800 то же в мягком виде:
       * карточки треков 586→1005, верх виден, CTA обрезан.
       *
       * Наверх поднята одна строка, а не весь блок: без неё первым, что
       * видит пришедший по ссылке, стали бы четыре имени треков без единого
       * слова о том, что это вообще за приложение. Остальное читают уже
       * после выбора — тем же доводом, которым питч разделили надвое
       * в 2026-08-12.
       */}
      {isNewUser && <h2 className="home-headline">{t.welcome.headline}</h2>}

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

      {/*
       * Довод «почему SQL» — над выбором, а не под карточками (было заведено
       * в ROADMAP отдельным пунктом 2026-08-16: замер на чистом хранилище
       * показал y=975 из 800px на десктопе и y=905 из 812 на телефоне, то есть
       * ниже сгиба на обоих размерах, при том что сам бейдж виден. Причина —
       * страница читает сверху вниз, а довод стоял ПОСЛЕ решения, которое
       * объясняет; поднят до чтения самого решения, отступ снизу маленький —
       * он держится вплотную к переключателю/карточкам, которые объясняет,
       * а не к абзацу выше.
       */}
      {showRecommendation && <p className="muted track-recommend-note">{t.tracks.recommendedNote}</p>}

      <TrackSwitcher active={activeTrack} onSelect={onSwitchTrack} recommend={showRecommendation} />
      <TrackCards
        active={activeTrack}
        progress={progress}
        recommend={showRecommendation}
        // Клик по карточке уже активного трека раньше не делал ничего —
        // switchTrack на тот же трек не меняет ни состояние, ни экран,
        // а подпись кнопки при этом обещает «Продолжить». Для активного
        // трека клик запускает занятие напрямую, как обещает подпись;
        // для остальных — переключает трек, как и раньше.
        onSelect={(track) => (track === activeTrack ? onStart() : onSwitchTrack(track))}
      />

      {/*
       * Признак входа, дублирующий подвал бокового меню, — на десктопе
       * скрыт CSS-правилом, ниже никакого условия по ширине нет намеренно:
       * та же логика, что у .topbar-account/.brand-word/.ctx-streak. Стоит
       * здесь, а не первой строкой экрана (было так раньше): на первом
       * визите это не то, ради чего человек открыл главную, а 300px высоты
       * до выбора трека дороже, чем более раннее знакомство с состоянием входа.
       */}
      <p className="muted home-account-line">
        {accountEmail ? t.home.accountStatusSignedIn(accountEmail) : t.home.accountStatusSignedOut}
        <button type="button" onClick={onOpenAccount}>
          {accountEmail ? t.nav.account : t.home.accountStatusSignInBtn}
        </button>
      </p>

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
                <button ref={startRef} className="btn" onClick={onConfirmDownload}>
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
              <button ref={startRef} className="btn secondary" onClick={onResumeConsent}>
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
                    ? runtimeCached
                      ? t.home.loadingRuntimeCached
                      : t.home.loadingRuntime
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
                  {runtimeCached ? t.home.loadingRuntimeCachedNote : t.home.loadingRuntimeNote}
                </p>
              )}
              <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
                {writesCode ? t.home.heroNote : t.home.heroNoteNoCode}
              </p>
              {/*
               * Узко и намеренно: видна только тому, кто выбрал pandas
               * и ещё не тронул SQL (см. showPandasSqlHint выше) — тем,
               * кому первое же занятие подсунет навык, объясняемый
               * сопоставлением с треком, которого он не видел. У остальных
               * довод неверен или не нужен, поэтому шумом для них не станет.
               * Ссылается на уже написанную вводную трека, а не пересказывает
               * её — та же вводная, что открывается ссылкой «О треке →» ниже.
               */}
              {showPandasSqlHint && onOpenTrackIntro && (
                <p className="muted track-prereq-hint" style={{ margin: '6px 0 0', fontSize: 13 }}>
                  {t.home.pandasSqlNote}{' '}
                  <button type="button" onClick={onOpenTrackIntro}>
                    {t.trackIntro.entryLink}
                  </button>
                </p>
              )}
              {/*
               * Перенесена сюда, под кнопку и её подпись (была сразу под
               * счётчиками) — замер 2026-08-16 показал, что она отодвигала
               * кнопку «Начать» на 204px ниже без пользы для решения «нажимать
               * ли сейчас»: это ретроспектива («как у меня дела вообще»),
               * а не то, что нужно перед действием («что меня ждёт сейчас»).
               * Объяснение полосы стоит видимой строкой, а не в `title`.
               * Раньше оно было только там — и на телефоне не показывалось
               * никак: `title` не открывается ни по тапу, ни по долгому
               * нажатию. Получалось, что текст, написанный ровно против
               * прочтения «приложение оценивает меня на 3%», не доходил
               * до тех, у кого это прочтение и возникает. Одна тусклая
               * строка на 12px — не баннер, прятать её под раскрытие
               * незачем: она объясняет числа, стоящие тут же под ней.
               */}
              <div className="overall-progress" style={{ marginTop: 16 }}>
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
            </div>
          )}

          {!ready && (
            <div className="card">
              <p className="brief" style={{ marginBottom: 6 }}>{activePack.description}</p>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t.home.draftNote}</p>
            </div>
          )}

          {/*
           * Вводная карточка конкретного трека — не то же самое, что About:
           * там сводка по всем четырём сразу, здесь — что за инструмент, где
           * он встречается в работе и чего не даёт. Кнопка остаётся и после
           * первого показа: вопрос «что это вообще такое» может всплыть позже.
           *
           * Перенесена сюда, в dash-main после карточки, — раньше стояла
           * между карточками треков и всей приборной панелью, отдельной
           * строкой, отодвигая решение «начать занятие» ещё на 40px без
           * необходимости: вопрос «что это за инструмент» уместен рядом
           * с самим треком, а не между его выбором и панелью.
           */}
          {/*
           * Вход на линию стоит выше вводной трека: вводная отвечает на «что
           * это за инструмент» — вопрос разовый, а линия на «где я и сколько
           * осталось» — вопрос каждого захода. Обе ссылкой, а не кнопкой:
           * основное действие на этом экране одно, и второй крупной кнопкой
           * рядом оно перестало бы быть основным.
           */}
          {SHOW_STORY_LINE && storyAt && (
            <button
              type="button"
              className="link-row"
              onClick={onOpenStory}
              style={{ margin: '10px 0 0' }}
            >
              {storyAt.at >= storyAt.total
                ? t.story.entryLinkDone
                : storyAt.at === 0
                  ? t.story.entryLinkStart(storyAt.total)
                  : t.story.entryLink(storyAt.at + 1, storyAt.total)}
            </button>
          )}

          {onOpenTrackIntro && (
            <button
              type="button"
              className="link-row"
              onClick={onOpenTrackIntro}
              style={{ margin: '10px 0 0' }}
            >
              {t.trackIntro.entryLink}
            </button>
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

      {/*
       * Питч целиком — последним блоком главной, заголовок от него остался
       * наверху. Порядок «что это → выбор → действие → почему этому верить»
       * продолжает решение 2026-08-12, которым питч впервые разделили надвое.
       *
       * Почему не сразу под треками, где он стоял полдня этой правки:
       * между выбором и кнопкой «Начать занятие» он вставал стеной в 459px,
       * и прокрутка после нажатия на трек (см. scrollToChooser выше) уводила
       * сами треки за верх экрана — она обязана довести до кнопки, а кнопка
       * оказывалась на y=1143. Замер на 360×780: треки после прокрутки
       * на −61, на 1280×800 на −127. То есть человек нажимал на трек
       * и терял из виду, на какой нажал. Ниже кнопки этой стены нет:
       * треки остаются на экране вместе с действием.
       */}
      {isNewUser && (
        <div className="card welcome-intro">
          <div className="welcome-intro-grid">
            <div>
              <WelcomeIntroBody withHeadline={false} />
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
           * отвечает на «почему этому стоит верить», одним блоком и в одном
           * месте страницы.
           */}
          <ProofSummary onOnboarding={onOpenOnboarding} onSandbox={onOpenSandbox} />
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
function About({
  onSelectTrack,
  onOpenOnboarding,
  onOpenAccount,
  onOpenStoryMode,
}: {
  onSelectTrack: (track: Track) => void;
  onOpenOnboarding: () => void;
  onOpenAccount: () => void;
  /**
   * Вход в режим истории — единственный внутри приложения, и стоит он
   * здесь, а не на главной. Довод тот же, по которому раздел спрятан
   * за `?story` (см. STORY_OPEN_ON_BOOT): незаконченный прототип не занимает
   * первый экран. Но `?story` — адрес, а установленное приложение
   * открывается с иконки, без адресной строки, и другого способа туда
   * попасть у него нет. «О тренажёре» — компромисс: свежий пользователь
   * сюда не приходит, а тот, кто дочитал до «как это устроено», уже
   * достаточно любопытен, чтобы прототип его не отпугнул.
   *
   * null — если кампания не разрешается в задания (см. storyMissionTrack):
   * ссылка, ведущая на пустой экран, хуже отсутствия ссылки.
   */
  onOpenStoryMode: (() => void) | null;
}) {
  const { t, locale } = useI18n();
  const totalTasks = packs.reduce((n, p) => n + p.tasks.length, 0);
  const totalSkills = packs.reduce((n, p) => n + p.skills.length, 0);
  // false до первого beforeinstallprompt и снова false после prompt() —
  // событие одноразовое, см. src/pwa/installPrompt.ts.
  const [installAvailable, setInstallAvailable] = useState(false);
  useEffect(() => subscribeInstallAvailable(setInstallAvailable), []);

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
       * колонки ниже балансируются по высоте, и карточка, появляющаяся
       * только иногда, сдвигала бы баланс и оттесняла «Автора» от низа
       * второй колонки — то самое, что там прямо запрещено правилом
       * «остаётся последним и внизу».
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
       * Три закрывающие карточки — колоночным потоком, а не сеткой.
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
       * сам. Порядок чтения при этом меняется с «слева направо» на «сверху
       * вниз по колонке», и это допустимо ровно потому, что карточки
       * независимы: три ответа на три разных вопроса, а не абзацы одного
       * текста. «Автор и лицензия» остаётся последним и внизу — см. ниже,
       * почему это важно.
       *
       * Карточек было пять: аккаунт и резервная копия со сбросом уехали
       * на свой экран (см. AccountScreen). Здесь от них осталась ссылка
       * под «Приватностью» — не пересказ, а адрес.
       *
       * Замер на 1280×800: 424 слева против 614 справа (264 «Приватность»
       * + 16 + 334 «Автор»), то есть низы колонок расходятся на 190px.
       * Ровнее с этими тремя высотами не выйдет ничем, кроме растягивания
       * карточки, — порядок в потоке последовательный, и второе возможное
       * разбиение (688/334) заметно хуже. Оставлено как есть: дыра
       * приходится на конец страницы, где под ней ничего нет.
       *
       * **Полная проза приватности сюда не поместилась — и это замер,
       * а не вкус.** Четыре подраздела (что остаётся на устройстве, что
       * уходит на сервер, чего нет вовсе, сколько хранится) дают карточку
       * в 957px против 424 у соседа: балансир уводит в правую колонку
       * и её, и «Автора», под левой остаётся 867px пустоты вместо
       * нынешних 190. Текст уехал на «Аккаунт и данные», к кнопкам,
       * которыми эти данные и убирают; здесь остался краткий ответ
       * и ссылка. Довод целиком — у about.privacyBody в ru.ts.
       */}
      <div className="about-columns">
        <div className="card">
          <h2>{t.about.howTitle}</h2>
          <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>{t.about.howSrs}</p>
          <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6 }}>{t.about.howModes}</p>
          <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.about.howData}</p>
          {onOpenStoryMode && (
            <button type="button" className="link-row" onClick={onOpenStoryMode}>
              {t.about.storyModeLink}
            </button>
          )}
        </div>

        <div className="card">
          <h2>{t.about.privacyTitle}</h2>
          <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.about.privacyBody}</p>
          {/*
           * `link-row`, а не кнопка: это переход в соседний раздел, а не
           * действие с данными, — тот же вид, что у входа на «О тренажёре»
           * с главной. Кнопкой она встала бы в один ряд с «Установить»
           * и «Скачать файл» и обещала бы, что здесь что-то произойдёт.
           */}
          <button type="button" className="link-row" onClick={onOpenAccount}>
            {t.about.accountLink}
          </button>
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
 * Карточка напоминаний.
 *
 * Состояние спрашивается у браузера при монтировании, а не хранится
 * в приложении, и это не мелочь: разрешение живёт в настройках браузера,
 * его можно отозвать снаружи в любой момент, и запомненное приложением
 * «включено» пережило бы отзыв и врало бы человеку, который как раз пошёл
 * проверять. Единственный источник правды здесь — `Notification.permission`
 * плюс наличие подписки, и оба спрашиваются заново.
 *
 * Разрешение спрашивается только по нажатию. Спросить на загрузке нельзя
 * ни при каких обстоятельствах: отказ необратим из приложения — вернуть
 * его можно лишь в настройках сайта в браузере, — то есть преждевременный
 * вопрос закрывает возможность навсегда. Цена ошибки несимметрична,
 * поэтому и вопрос откладывается до явного намерения.
 */
/**
 * Состояние с учётом подписки, а не одного разрешения.
 *
 * `pushState()` синхронна и потому знает только `Notification.permission` —
 * подписку у браузера надо спрашивать асинхронно. Разница видна ровно там,
 * где эти две вещи расходятся, а расходятся они постоянно: разрешение живёт
 * в настройках браузера навсегда после первого согласия, подписка же
 * снимается `unsubscribe()`, теряется при отзыве push-сервисом и не
 * переживает смены ключа VAPID. Карточка, судящая по разрешению, в этом
 * состоянии показывает «включено» там, где не придёт ничего.
 */
async function resolvePushState(): Promise<PushState> {
  const base = pushState();
  if (base !== 'granted') return base;
  return (await hasPushSubscription()) ? 'granted' : 'default';
}

function PushCard({
  onEnable,
  onDisable,
}: {
  onEnable: () => Promise<PushState>;
  onDisable: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [state, setState] = useState<PushState>(() => pushState());
  /*
   * 'pending' отдельно от состояния разрешения по той же причине, по которой
   * оно заведено у удаления аккаунта: между нажатием и ответом здесь стоит
   * и системный диалог браузера, и запрос к push-сервису, и запрос к своей
   * функции. Без явного «просим» человек секунду смотрит на неизменившуюся
   * кнопку и жмёт второй раз.
   */
  const [pending, setPending] = useState(false);
  /*
   * Отдельно от `state`: подписка могла не создаться при выданном разрешении
   * (сеть, отозванный push-сервис, iOS вне standalone). Смешав это с 'denied',
   * человеку предложили бы идти в настройки браузера чинить то, что там
   * не сломано.
   */
  const [failed, setFailed] = useState(false);

  /*
   * Разрешение и подписка расходятся на практике, а не только в теории:
   * `pushState()` в исходном состоянии выше знает только про разрешение,
   * подписку он не спрашивает (это асинхронно, а инициализатор `useState`
   * должен быть синхронным). Без этой проверки экран показывал бы «включено»
   * бесконечно после любого сбоя между разрешением и подпиской (сеть,
   * отозванный push-сервис, смена VAPID-ключа при живой старой подписке) —
   * ровно тот сценарий, что и у `failed` ниже, только не пойманный сразу
   * после нажатия, а переживший перезагрузку страницы.
   */
  useEffect(() => {
    let alive = true;
    resolvePushState().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="card">
      <h2>{t.account.pushTitle}</h2>
      <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.account.pushBody}</p>
      {/*
       * Пример текста уведомления стоит ДО кнопки, а не после включения:
       * человек вправе увидеть, на что соглашается, пока согласие ещё
       * не дано. После нажатия показывать образец поздно — разрешение
       * уже выдано, и образец превращается в отчёт.
       */}
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.55 }}>
        {t.account.pushExample}
      </p>

      {state === 'granted' ? (
        <>
          <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>{t.account.pushOn}</p>
          <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.55 }}>
            {t.account.pushOnNote}
          </p>
          <button
            type="button"
            className="btn secondary"
            disabled={pending}
            onClick={async () => {
              setPending(true);
              await onDisable();
              /*
               * `pushState()` здесь врал: он смотрит только на разрешение,
               * а `disablePush()` снимает подписку, разрешение не трогая, —
               * оно из приложения и не снимается. Карточка после успешного
               * выключения оставалась в 'granted', то есть показывала
               * «Напоминания включены» и ту же кнопку «Выключить». Со стороны
               * это выглядело как мёртвая кнопка: она отрабатывала полностью
               * и молча, а на экране не менялось ничего.
               */
              setState(await resolvePushState());
              setPending(false);
            }}
          >
            {t.account.pushDisableBtn}
          </button>
        </>
      ) : state === 'denied' ? (
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
          {t.account.pushDenied}
        </p>
      ) : state === 'unsupported-ios' ? (
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
          {t.account.pushIosNote}
        </p>
      ) : state === 'unsupported' ? (
        <p className="muted" style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}>
          {t.account.pushUnsupported}
        </p>
      ) : (
        <button
          type="button"
          className="btn secondary"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setFailed(false);
            const granted = await onEnable();
            /*
             * Разрешение выдано, а подписки нет — единственный случай,
             * который состоянием разрешения не описывается. Раньше он
             * ставил состояние в 'granted' (его и возвращает `enablePush`
             * из своего catch — разрешение ведь на месте) и карточка
             * противоречила сама себе: «Напоминания включены», кнопка
             * «Выключить» и красная строка «не удалось включить» разом.
             * Теперь состояние берётся с учётом подписки: кнопка остаётся
             * «Включить», а красная строка объясняет, почему нажать
             * придётся ещё раз.
             */
            const next = await resolvePushState();
            setState(next);
            setFailed(granted === 'granted' && next !== 'granted');
            setPending(false);
          }}
        >
          {t.account.pushEnableBtn}
        </button>
      )}
      {failed && (
        <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--err)' }}>
          {t.account.pushFailed}
        </p>
      )}
    </div>
  );
}

/**
 * «Аккаунт и данные» — экран, а не хвост «О тренажёре», где всё это жило
 * до 2026-08-15.
 *
 * Причина та же, по которой отдельным экраном вынесен онбординг: разный жанр.
 * About объясняет, что это такое, читается в любом порядке и раскладывается
 * колонками; здесь человек не читает, а делает — входит, скачивает файл,
 * сбрасывает, — и порядок обязан быть один, сверху вниз. Замер прежней
 * раскладки: до кнопки входа надо было пролистать два с половиной экрана,
 * а порядок карточек в потоке `columns` определялся длиной их текстов,
 * то есть не задавался вовсе.
 *
 * Отсюда и `.settings-column`: одна колонка фиксированной ширины вместо
 * двух балансируемых. Ровная левая кромка и одинаковая ширина карточек
 * получаются по построению, а не подбором высот, и добавление четвёртой
 * карточки (удаление аккаунта — следующий шаг) ничего не сдвинет.
 */
function AccountScreen({
  onExportProgress,
  onImportProgress,
  onResetProgress,
  accountEmail,
  syncStatus,
  onSignIn,
  onSignOut,
  onDeleteAccount,
  onEnablePush,
  onDisablePush,
}: {
  onExportProgress: () => void;
  /** true — файл распознан и прогресс заменён, false — не тот файл. */
  onImportProgress: (file: File) => Promise<boolean>;
  onResetProgress: () => void;
  /** null — не вошли; иначе почта аккаунта, которым вошли. */
  accountEmail: string | null;
  syncStatus: SyncStatus;
  onSignIn: () => Promise<{ error: string | null }>;
  onSignOut: () => Promise<void>;
  /** true — аккаунт удалён и сессия закрыта; false — сервер не ответил. */
  onDeleteAccount: () => Promise<boolean>;
  /**
   * Спросить разрешение и подписаться. Возвращает то, что реально видит
   * браузер после попытки, а не «получилось / не получилось»: состояний
   * у разрешения больше двух, и каждое требует своего объяснения.
   */
  onEnablePush: () => Promise<PushState>;
  onDisablePush: () => Promise<void>;
}) {
  const { t } = useI18n();
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
  /*
   * Отдельно от syncStatus: та ошибка про сведение уже вошедшего, эта —
   * про то, что вход не начался вовсе. Смешав их в одну подпись, человек
   * с отвалившейся сетью прочитал бы «прогресс сохранён на устройстве»
   * там, где ему не удалось даже нажать кнопку.
   */
  const [signInError, setSignInError] = useState(false);
  /**
   * Пять состояний против трёх у сброса — из-за сети.
   *
   * Сброс локальный и происходит мгновенно, поэтому там между «да»
   * и «готово» нет ничего. Здесь между ними запрос к серверной функции:
   * без 'pending' человек секунду смотрит на кнопку, не понимая, нажалась
   * ли она, и жмёт второй раз. 'error' отдельно от 'idle' по той же
   * причине, что и у входа: молча вернуться к кнопке — значит сказать,
   * что ничего не произошло, хотя произошла неудача.
   */
  const [deleteStage, setDeleteStage] = useState<'idle' | 'confirm' | 'pending' | 'done' | 'error'>(
    'idle'
  );

  async function handleImportPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // тот же файл можно выбрать повторно, если первая попытка не удалась
    if (!file) return;
    setImportStatus((await onImportProgress(file)) ? 'ok' : 'error');
  }

  return (
    <div className="settings-column">
      {/*
       * Аккаунт — своя карточка перед «Резервной копией», а не раздел
       * внутри неё. Обе про «что будет с накопленным», но отвечают
       * по-разному: вход убирает проблему, файл её страхует. Слитые
       * в одну карточку, они читались бы двумя равными кнопками
       * с одинаковым весом — а веса у них разные, и порядок это говорит.
       */}
      <div className="card">
        <h2>{t.account.syncTitle}</h2>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.account.syncBody}</p>
        {accountEmail ? (
          <>
            <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600 }}>
              {t.account.signedInAs(accountEmail)}
            </p>
            <button type="button" className="btn secondary" onClick={() => void onSignOut()}>
              {t.account.signOutBtn}
            </button>
          </>
        ) : (
          /*
           * secondary, а не акцентная, и правило пережило переезд: на этом
           * экране акцентной кнопки нет вовсе. Синяя кнопка настаивала бы
           * ровно там, где текст двумя строками выше обещает, что вход
           * добровольный, — а заметности хватает и заголовка карточки,
           * которая теперь стоит первой на своём экране.
           */
          <button
            type="button"
            className="btn secondary"
            onClick={async () => {
              setSignInError(Boolean((await onSignIn()).error));
            }}
          >
            {t.account.signInBtn}
          </button>
        )}
        {signInError && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--err)' }}>
            {t.account.signInError}
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
              ? t.account.syncing
              : syncStatus === 'synced'
                ? t.account.synced
                : t.account.syncError}
          </p>
        )}


        {/*
         * Удаление — раздел карточки аккаунта, а не своя карточка, и это
         * тот же довод, по которому сброс живёт внутри «Резервной копии»:
         * необратимое действие стоит рядом с тем, что оно уничтожает,
         * и под своей чертой. Экран получается симметричным — в каждой
         * карточке сверху безопасное действие, под чертой необратимое.
         *
         * Видно только вошедшему: без входа удалять нечего, и кнопка,
         * которая ничего не делает, объясняла бы себя дольше, чем стоит.
         * Исключение — 'done': после удаления сессия закрыта, `accountEmail`
         * стал null, и по общему правилу раздел исчез бы вместе
         * с подтверждением ровно в ту секунду, когда его читают. Тогда
         * остаётся один текст без кнопки — над ним карточка уже
         * предлагает войти заново, и это правда: аккаунта больше нет.
         */}
        {(accountEmail || deleteStage === 'done') && (
          <>
            <hr className="card-rule" />
            <h3 className="card-subhead">{t.account.deleteTitle}</h3>
            {deleteStage !== 'done' && (
              <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>
                {t.account.deleteBody}
              </p>
            )}
            {deleteStage === 'confirm' ? (
              <>
                <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>
                  {t.account.deleteConfirm}
                </p>
                <div className="row">
                  <button
                    type="button"
                    className="btn danger"
                    onClick={async () => {
                      setDeleteStage('pending');
                      setDeleteStage((await onDeleteAccount()) ? 'done' : 'error');
                    }}
                  >
                    {t.account.deleteConfirmBtn}
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => setDeleteStage('idle')}
                  >
                    {t.account.deleteCancelBtn}
                  </button>
                </div>
              </>
            ) : deleteStage === 'pending' ? (
              <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)' }}>
                {t.account.deleting}
              </p>
            ) : deleteStage === 'done' ? (
              <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--ok)' }}>
                {t.account.deleteDone}
              </p>
            ) : (
              <button
                type="button"
                className="btn secondary"
                onClick={() => setDeleteStage('confirm')}
              >
                {t.account.deleteBtn}
              </button>
            )}
            {deleteStage === 'error' && (
              <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--err)' }}>
                {t.account.deleteError}
              </p>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h2>{t.account.backupTitle}</h2>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.account.backupBody}</p>
        <div className="row">
          <button type="button" className="btn secondary" onClick={onExportProgress}>
            {t.account.exportBtn}
          </button>
          <button type="button" className="btn secondary" onClick={() => importInputRef.current?.click()}>
            {t.account.importBtn}
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
            {importStatus === 'ok' ? t.account.importSuccess : t.account.importError}
          </p>
        )}

        {/*
         * Сброс — раздел этой же карточки, а не карточка рядом.
         *
         * Довод пережил переезд, но опирается теперь на смысл, а не на замер
         * колонок: по смыслу это один и тот же вопрос «что делать
         * с накопленным», и файл выше — единственный способ отменить сброс
         * ниже. Возражение «необратимое не мешать с сохраняющим» при этом
         * не нарушено: оно было против третьей кнопки в том же ряду, где две
         * безопасных отличались бы от неё только подписью. Здесь другое —
         * своя черта, свой заголовок, красная кнопка и вопрос перед ней.
         */}
        <hr className="card-rule" />
        <h3 className="card-subhead">{t.account.resetTitle}</h3>
        <p style={{ margin: '0 0 12px', fontSize: 14, lineHeight: 1.6 }}>{t.account.resetBody}</p>
        {resetStage === 'confirm' ? (
          <>
            {/*
             * Вопрос стоит над кнопками, а не вместо подписи на них: подпись
             * «Да, сбросить» отвечает на вопрос, но сама его не задаёт,
             * и человеку, нажавшему случайно, читать было бы нечего.
             */}
            <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, fontWeight: 600 }}>
              {t.account.resetConfirm}
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
                {t.account.resetConfirmBtn}
              </button>
              <button type="button" className="btn secondary" onClick={() => setResetStage('idle')}>
                {t.account.resetCancelBtn}
              </button>
            </div>
          </>
        ) : (
          <button type="button" className="btn secondary" onClick={() => setResetStage('confirm')}>
            {t.account.resetBtn}
          </button>
        )}
        {resetStage === 'done' && (
          <p role="status" style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--ok)' }}>
            {t.account.resetDone}
          </p>
        )}
      </div>

      {/*
       * Напоминания — своя карточка, третьей, и порядок здесь не случайный.
       *
       * Первые две про одно и то же — «не потерять накопленное»: вход
       * убирает проблему, файл её страхует, и читать их надо подряд.
       * Напоминания отвечают на другой вопрос, «как не забыть вернуться»,
       * и вклиниваться между входом и копией им незачем.
       *
       * После карточки со сбросом, а не до неё: сброс необратим и стоит
       * под своей чертой в конце своей карточки, а начинать следующую
       * карточку сразу за красной кнопкой безопаснее, чем ставить перед ней
       * ещё один блок с кнопкой — тогда красная оказалась бы посреди экрана,
       * между двумя безобидными.
       */}
      <PushCard onEnable={onEnablePush} onDisable={onDisablePush} />

      {/*
       * Полный текст про данные — закрывающая карточка экрана, и место
       * выбрано двумя доводами.
       *
       * Почему на этом экране, а не на «О тренажёре»: там он ломает
       * балансир about-columns (957px против 424px у соседа, дыра
       * в 867px вместо прежних 168 — замер до переноса), и там же он
       * оторван от кнопки, ради решения о которой его читают. Здесь
       * раскладка — стопка в .settings-column, балансировать нечего.
       *
       * Почему последней, а не первой: экран собран как последовательность
       * действий, и ровно за этим сюда идут. Четыре абзаца объяснения
       * перед кнопкой входа воспроизвели бы то, ради устранения чего
       * экран и заводился, — вход, до которого надо дочитать. Порядок тот
       * же, что у «Автора и лицензии» на about: справка закрывает страницу,
       * а не открывает её.
       *
       * Черт между подразделами нет намеренно, в отличие от карточек выше:
       * там черта отделяет необратимое действие от безопасного, то есть
       * несёт смысл. Здесь все четыре абзаца одного рода, и три черты
       * подряд разрезали бы связный текст на карточки внутри карточки.
       * Подзаголовки при этом обязательны: этот блок читают не подряд,
       * а ища свой вопрос («почту-то они хранят?»), и они работают
       * оглавлением.
       */}
      <div className="card">
        <h2>{t.account.dataTitle}</h2>
        {[
          [t.account.dataDeviceTitle, t.account.dataDeviceBody],
          [t.account.dataServerTitle, t.account.dataServerBody],
          [t.account.dataNoneTitle, t.account.dataNoneBody],
          [t.account.dataKeepTitle, t.account.dataKeepBody],
        ].map(([title, body], i, all) => (
          <Fragment key={title}>
            <h3 className="card-subhead-item">{title}</h3>
            <p
              style={{
                margin: i === all.length - 1 ? 0 : '0 0 12px',
                fontSize: 14,
                lineHeight: 1.6,
              }}
            >
              {body}
            </p>
          </Fragment>
        ))}
      </div>
    </div>
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
