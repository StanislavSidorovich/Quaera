import { useEffect, useMemo, useRef, useState } from 'react';
import { isTrackTranslated, packForTrack, packs } from '../../content';
import type { Pack, Track } from '../../content/types';
import { EXTRA_STAGE, nextStage, stageStates, type StageState } from '../../content/milestones';
import { useI18n } from '../../i18n/context';
import { FAMILY } from '../../links';
import { DataMapTeaser } from '../ArchitectureMap';
import { TaskShowcase } from '../TaskShowcase';
import { StoryWhereYouAre } from '../StoryWhereYouAre';
import { ReturnStoryCard } from '../ReturnStoryCard';
import { RoleStrip } from '../RoleStrip';
import { useMinWidth } from '../useMinWidth';
import { StoryWeekArt } from '../StoryWeekArt';
import { DayOnePreview } from '../DayOnePreview';
import { IconStory, IconBook, IconFlask, IconTable, IconCompass } from '../Sidebar';
import { StartGuide } from '../StartGuide';
import { TrackSwitcher, TrackCards, WelcomeIntroBody, ProofSummary } from './HomeParts';
import { storyCampaign } from '../../content/storymode';
import { isDue, isUnlocked, mastery } from '../../srs/scheduler';
import { type Progress } from '../../srs/store';

import markLab from '../../../family/marks/lab.svg';
import markModel from '../../../family/marks/model.svg';
import markFlow from '../../../family/marks/flow.svg';
import markPandas from '../../../family/marks/pandas.svg';

/** Значки приложений семейства (общий пакет family/, не менять) и ключи подписей блока «Ещё в Quaera». */
const FAMILY_MARKS = { lab: markLab, model: markModel, flow: markFlow, pandas: markPandas } as const;
const FAMILY_NAME_KEY = { lab: 'familyNameLab', model: 'familyNameModel', flow: 'familyNameFlow', pandas: 'familyNamePandas' } as const;
const FAMILY_DESC_KEY = { lab: 'familyDescLab', model: 'familyDescModel', flow: 'familyDescFlow', pandas: 'familyDescPandas' } as const;
const FAMILY_WHO_KEY = { lab: 'familyWhoLab', model: 'familyWhoModel', flow: 'familyWhoFlow', pandas: 'familyWhoPandas' } as const;

/**
 * Старая сюжетная линия (выведенная из графа) убрана из интерфейса на время
 * валидации режима истории: два «сюжетных» входа рядом путали пользователя.
 * Это флаг видимости, а не удаление — код и экран линии живы; когда решится
 * её судьба, флаг либо вернётся, либо линия уедет целиком. Режим истории
 * вышел на главную и линию замещает — тем более незачем показывать оба.
 */
export const SHOW_STORY_LINE = false;

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

/**
 * Вход сразу в часть 2 или 3, минуя предыдущие. Показывается там же, где
 * раньше стояла одна ссылка: пока в кампании нет сохранённого шага (условие
 * — «нет шага», а не «новичок»: знающий SQL, решивший одно задание в треке,
 * нуждается в этом так же). Названия частей и число недель — из кампании.
 *
 * В строке вернувшегося блок свёрнут: открытым он занимает 198px и уводил
 * кнопку «Начать занятие» с y=631 на 799 при окне 812 — за сгиб, против
 * правила «у вернувшегося кнопка занятия выше сгиба». В карточке новичка
 * он раскрыт: главная кнопка стоит выше него и запаса хватает.
 */
function StoryEntry({ onOpenPart, row = false }: { onOpenPart: (partId: string) => void; row?: boolean }) {
  const { t, locale } = useI18n();
  const campaign = storyCampaign(locale);
  const entries = [
    { id: 'p2', main: t.storyMode.entryPart2, sub: t.storyMode.entryPart2Sub },
    { id: 'p3', main: t.storyMode.entryPart3, sub: t.storyMode.entryPart3Sub },
  ];
  const buttons = entries.map((e) => {
    const part = campaign.parts.find((p) => p.id === e.id);
    if (!part) return null;
    return (
      <button key={e.id} type="button" className="story-entry-btn" onClick={() => onOpenPart(e.id)}>
        <span className="story-entry-main">{e.main(part.title)}</span>
        <span className="story-entry-sub">{e.sub(campaign.weeks.filter((w) => w.part === e.id).length)}</span>
      </button>
    );
  });
  if (row) {
    return (
      <details className="story-entry story-entry-row">
        <summary className="story-entry-title story-entry-summary">{t.storyMode.entryTitle}</summary>
        {buttons}
      </details>
    );
  }
  return (
    <div className="story-entry">
      <p className="story-entry-title">{t.storyMode.entryTitle}</p>
      {buttons}
    </div>
  );
}

/** Веха уровня под шапкой группы на карте навыков: взятая целиком, следующая одной строкой, остальные скрыты. */
function MilestoneNote({ stage, isNext }: { stage?: StageState; isNext: boolean }) {
  const { t } = useI18n();
  if (!stage || (!stage.reached && !isNext)) return null;
  return (
    <div className={`milestone-note${stage.reached ? ' reached' : ''}`}>
      {stage.reached ? (
        <>
          <span className="milestone-tag">{t.home.milestoneTag}</span>
          <strong>{stage.milestone.title}</strong>
          <span className="muted">{stage.milestone.text}</span>
        </>
      ) : (
        <span className="muted">{t.home.milestoneNext(stage.milestone.title, stage.remaining)}</span>
      )}
    </div>
  );
}

export function Home({
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
  onOpenCareer,
  onOpenMap,
  onOpenAbout,
  onOpenIntro,
  onOpenOnboarding,
  onSwitchTrack,
  onStartSkill,
  onOpenAllTasks,
  onOpenTrackIntro,
  onOpenStory,
  storyAt,
  onOpenStoryMode,
  guide,
  storyStarted,
  storyReachedId,
  onOpenStoryPart,
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
  /** Строка «до роли»: id выбранной роли ведёт на её страницу, null (роль не выбрана) на обзор. */
  onOpenCareer: (role?: string | null) => void;
  /** Карта данных на экране «Путь к роли»: слой или сразу маршрут. */
  onOpenMap: (map: { layer?: string; trace?: boolean }) => void;
  onOpenAbout: () => void;
  /** Экскурс в профессию. Строку показываем только новичку — довод у самой строки. */
  onOpenIntro: () => void;
  onOpenOnboarding: () => void;
  onSwitchTrack: (track: Track) => void;
  /** Практика по одной теме прямо с карты навыков — не через подбор занятия. */
  onStartSkill: (skillId: string) => void;
  /** Шторка «Все задания» трека. */
  onOpenAllTasks: () => void;
  /** Вводная карточка трека. undefined — у трека intro ещё не написан, кнопку не показываем. */
  onOpenTrackIntro?: () => void;
  onOpenStory: () => void;
  /**
   * Вход в кампанию режима истории. null — кампания не разрешается в задания
   * (см. storyMissionTrack): вход, ведущий на пустой экран, хуже отсутствия
   * входа.
   */
  onOpenStoryMode: (() => void) | null;
  /**
   * Кампания уже начата — отличает «попробовать» от «продолжить».
   *
   * Считается по позиции кампании в хранилище, а не по решённым заданиям:
   * задания недели можно решить и обычным занятием, ни разу не открыв
   * историю, и тогда главная предлагала бы «продолжить» дело, которого
   * человек не начинал.
   */
  /** Сигнал гиду новичка: n растёт при каждом «открыть снова», tour запускает показ по шагам. */
  guide: { n: number; tour: boolean };
  storyStarted: boolean;
  storyReachedId: string | null;
  /** Вход сразу в часть кампании (id части); null — как у onOpenStoryMode. */
  onOpenStoryPart: ((partId: string) => void) | null;
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

  /**
   * Сводка по каждому уровню карты навыков — сколько тем начато и сколько
   * ещё не освоено до конца. `unfinished` считает открытую тему с полосой
   * меньше единицы: именно этот критерий выбирает уровень, раскрытый
   * по умолчанию (см. openTiers ниже), и он же печатается в свёрнутой
   * шапке группы, чтобы свёрнутый уровень не был слепой дверью.
   */
  const tierStats = useMemo(
    () =>
      byTier.map(([tier, list]) => {
        let started = 0;
        let unfinished = 0;
        for (const s of list) {
          const st = progress.skills[s.id];
          const unlocked = isUnlocked(s, progress.skills) || (st?.reps ?? 0) > 0;
          if ((st?.reps ?? 0) > 0) started += 1;
          if (unlocked && mastery(st) < 1) unfinished += 1;
        }
        return { tier, total: list.length, started, unfinished };
      }),
    [byTier, progress]
  );

  /** Вехи уровней: пройденные показываем, из будущих только следующую (src/content/milestones.ts). */
  const stages = useMemo(
    () => stageStates(activePack, (id) => !!progress.taskRecords[id]?.solved),
    [activePack, progress]
  );
  const nextMilestone = nextStage(stages);

  const [openTiers, setOpenTiers] = useState<Set<number>>(() => new Set());

  /**
   * Раскрытый по умолчанию уровень — первый, где есть незакрытая тема, а не
   * первый уровень вообще: новичок видит «что от вас хотят», а тот, кто его
   * прошёл, — уровень, на котором остановился. Пересчитывается только при
   * смене трека (activeTrack), не при каждом решённом задании — иначе
   * группа, которую раскрыли вручную, схлопывалась бы обратно на первом же
   * прогрессе внутри неё.
   */
  useEffect(() => {
    let defaultTier = tierStats.find((t) => t.unfinished > 0)?.tier;
    if (defaultTier === undefined) defaultTier = tierStats[tierStats.length - 1]?.tier;
    setOpenTiers(defaultTier === undefined ? new Set() : new Set([defaultTier]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTrack]);

  const toggleTier = (tier: number) => {
    setOpenTiers((prev) => {
      const next = new Set(prev);
      if (next.has(tier)) next.delete(tier);
      else next.add(tier);
      return next;
    });
  };

  const ready = activePack.status !== 'draft' && activePack.tasks.length > 0;
  /**
   * Пишет ли человек код в этом треке. Выводится из самих заданий, а не из
   * названия трека: пак, где всё в режиме predict, кода не требует, и обещать
   * «запросы выполняются по-настоящему» там нельзя. Схема данных по той же
   * причине не нужна — писать запрос к этим таблицам никто не будет.
   *
   * `order` считается наравне с `predict`: расставить шаги рассуждения —
   * это ответ без единой строки кода, и обещание «код выполняется» от одного
   * такого задания в паке стало бы неправдой про весь трек.
   */
  const writesCode = activePack.tasks.some((t) => t.mode !== 'predict' && t.mode !== 'order' && t.mode !== 'waves' && t.mode !== 'relate' && t.mode !== 'spot');
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

  /**
   * Первая полоса главной вернувшегося на десктопе (вариант B, 2026-11-07).
   *
   * Слева карточка занятия, справа сюжет и карта данных. Обзор
   * research/learning-evidence-2026-11/NOTES.md: сюжет рамка, а не главный путь,
   * поэтому его карточка тише кнопки занятия, а кнопка на экране одна.
   * Место карточки выбирает JS (matchMedia), а не CSS: она рендерится один раз,
   * иначе дважды жили бы ref кнопки и счётчики. На телефоне всё как было:
   * карточка в .dash-main, карта данных в .dash-side, сюжет строкой наверху.
   * Пока идёт согласие на рантайм или трек в черновике, полосы нет вовсе.
   */
  const wideHome = useMinWidth(1024);
  const returnBand = !isNewUser && wideHome && ready && consent === null && !!onOpenStoryMode;
  const loadingLabel = loading
    ? heavyRuntime
      ? runtimeCached
        ? t.home.loadingRuntimeCached
        : t.home.loadingRuntime
      : t.home.loading
    : null;
  const masteryBlock = (
    <div className="overall-progress" style={{ marginTop: returnBand ? 0 : 16 }}>
      {/* Подпись не .muted: рядом серое объяснение, два тусклых абзаца подряд склеились бы в комментарий. */}
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
  );
  const heroBlock =
    ready && consent === null ? (
      <div className={returnBand ? 'card return-hero' : 'card'}>
        {returnBand && <h2 className="return-hero-title">{t.tracks.names[activeTrack]}</h2>}
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
        {/* Сила памяти в полосе стоит над кнопкой и не дублируется ниже; на телефоне она под кнопкой, как раньше. */}
        {returnBand && masteryBlock}
        {resume && returnBand ? (
          /*
           * Одна основная кнопка. Новое занятие стирает незаконченное, поэтому оно
           * ссылкой и с ценой рядом: две кнопки подряд читались как одно и то же.
           */
          <>
            <button ref={startRef} className="btn" onClick={onResume} disabled={loading}>
              {t.home.resumeBtn}
            </button>
            <p className="muted return-resume-note">{t.home.resumeNote(resume)}</p>
            <p className="return-new">
              <button type="button" className="return-new-link" onClick={onStart} disabled={loading}>
                {loadingLabel ?? t.home.newSessionLink}
              </button>
              <span className="muted"> · {t.home.newSessionNote}</span>
            </p>
          </>
        ) : (
          <>
            {/*
             * Незаконченное занятие идёт первым и основной кнопкой: вернуться к нему
             * чаще, чем набрать новое. Новое при этом не прячется, а стирает старое.
             */}
            {resume && (
              <>
                <button className="btn" onClick={onResume} disabled={loading}>
                  {t.home.resumeBtn}
                </button>
                {/* Отступы неравные: подпись прижата к своей кнопке, а не к «Начать» под ней. */}
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
              {loadingLabel ?? (dueCount > 0 ? t.home.startBtnResume : t.home.startBtnBegin)}
            </button>
          </>
        )}
        {/*
         * Загрузка Pyodide (~50 МБ) занимает секунды: без обратной связи disabled-кнопка
         * читается как «зависло». Полоска не настоящий процент, а время с запасом.
         */}
        {loading && (
          <div className="load-progress" role="presentation">
            <div className="load-progress-bar" />
          </div>
        )}
        {/* Подпись только у тяжёлого рантайма: десятки секунд без объяснения читаются как «качает заново». */}
        {loading && heavyRuntime && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12 }}>
            {runtimeCached ? t.home.loadingRuntimeCachedNote : t.home.loadingRuntimeNote}
          </p>
        )}
        <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
          {writesCode ? t.home.heroNote : t.home.heroNoteNoCode}
        </p>
        {/* Видна только выбравшему pandas, не тронувшему SQL: ссылка на вводную трека, не пересказ. */}
        {showPandasSqlHint && onOpenTrackIntro && (
          <p className="muted track-prereq-hint" style={{ margin: '6px 0 0', fontSize: 13 }}>
            {t.home.pandasSqlNote}{' '}
            <button type="button" onClick={onOpenTrackIntro}>
              {t.trackIntro.entryLink}
            </button>
          </p>
        )}
        {!returnBand && masteryBlock}
      </div>
    ) : null;


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
      {/*
       * Строка чисел над заголовком (приём Exercism из скилла landing-showcase):
       * конкретное число убеждает быстрее абзаца. Числа считаются из паков,
       * как и счётчики на плитках треков, а не пишутся в текст: задания
       * добавляются каждым заходом, и строка в прозе протухла бы первой.
       */}
      <StartGuide
        isNewUser={isNewUser}
        storyStarted={storyStarted}
        signal={guide}
        onOpenMap={() => onOpenMap({})}
        onOpenStoryMode={onOpenStoryMode}
      />
      {isNewUser && (
        <p className="home-stats">
          {t.welcome.stats(
            packs.reduce((n, p) => n + (p.status === 'draft' ? 0 : p.tasks.length), 0),
            packs.length,
          ).map((part, i) => (
            <span key={i}>{part}</span>
          ))}
        </p>
      )}
      {isNewUser && <h2 className="home-headline">{t.welcome.headline}</h2>}

      {/*
       * Дверь для того, кто не понял, о чём вообще этот сайт.
       *
       * **Строка, а не карточка, и не всплывающее окно.** Экскурс сам по себе
       * длинный, но зовут в него одной строкой: человеку, который в теме,
       * она стоит 40px и читается за секунду, а перехватывать ею вход
       * значило бы поставить стену перед кампанией, которую только что
       * вывели наверх (см. замер сгиба ниже).
       *
       * **Выше кампании намеренно.** Тот, кто не понимает, о чём речь,
       * обязан встретить эту строку раньше, чем предложение начать работу
       * аналитика: предлагать «первый рабочий день» человеку, который
       * не знает, чем занимается аналитик, — значит терять его молча.
       *
       * **Только новичку.** У вернувшегося вопрос «что это такое» уже
       * отвечен самим фактом возвращения, а постоянная строка наверху
       * стоила бы ему высоты экрана каждый день. Постоянные входы для него
       * есть: пункт бокового меню на десктопе и прямая ссылка `?intro`.
       */}
      {isNewUser && (
        <button type="button" className="home-intro-link" data-pair="intro" onClick={onOpenIntro}>
          {/*
           * Знак вопроса — тот же, что у пункта этого раздела в боковом меню,
           * и он же делает строку опознаваемой без чтения: человек, который
           * не понимает, о чём сайт, скользит по нему глазами, а не читает
           * подряд. Декоративен: смысл несёт подпись рядом.
           */}
          <span className="home-intro-glyph" aria-hidden>
            ?
          </span>
          <span>{t.home.introLink}</span>
        </button>
      )}

      {/*
       * Кампания режима истории — первым делом на главной.
       *
       * **Почему первым.** Новичку четыре трека — это четыре решения до
       * первого действия, и до 2026-08-20 главная предлагала именно их
       * (плюс довод «начните с SQL», то есть совет о том, как выбирать).
       * Кампания даёт другое: один путь, где не выбирают ничего, а идут
       * за делом. Тем, кто хочет выбрать сам, треки остались строго ниже —
       * порядок «один путь → или выбери тему» лежит по убыванию уверенности,
       * а не по важности разделов.
       *
       * **Цена решения названа прямо: у новичка карточки треков ушли
       * под сгиб.** Это отменяет часть замера 2026-08-16, где их поднимали
       * наверх. Отменяет сознательно: тогда наверху боролись за выбор
       * из четырёх, теперь наверху стоит ответ на тот же вопрос («с чего
       * начать»), а выбор из четырёх стал запасным путём. Проверять теперь
       * по кнопке кампании: её низ обязан быть выше сгиба на 375×812
       * и 1280×800, обе локали.
       *
       * **Вернувшемуся — строкой, а не карточкой.** У него на главной уже
       * есть своё главное действие (кнопка занятия), и карточка сверху
       * отодвинула бы её за сгиб: замер до правки давал ей 130px запаса
       * при высоте карточки около 200. Строка занимает ~64px и обещает
       * ровно то же.
       */}
      {onOpenStoryMode &&
        (isNewUser ? (
          /*
           * Верх главной в две колонки (2026-11-03): слева компактная карточка
           * кампании, справа карта данных. Две двери рядом закрывают вопрос
           * «на чистом профиле ни блок карты, ни кнопка занятия не в первом
           * экране»: карта стояла в .dash-side на y≈1300, на два экрана ниже
           * сгиба 1366×768.
           *
           * Пример проверки (окно sql-006) переехал из карточки в полосу под
           * колонками и показывается только до первого шага: он доказывает
           * заголовок «ответ сверяется с данными» тому, кто ещё ничего не
           * решал, а вернувшемуся занимает высоту.
           *
           * В столбик (ниже ~780px контейнера) кампания идёт первой, карта второй:
           * довод у `.home-top-wrap` в styles.css.
           */
          <div className="home-top-wrap">
            <div className={`home-top${ready ? '' : ' home-top-solo'}`}>
            <div className="card story-invite home-top-story" data-pair="storymode" data-guide="story">
              <div className="story-invite-head">
                <div>
                  <p className="story-invite-badge">{t.storyMode.badge}</p>
                  <h2>
                    <span className="pair-ico" aria-hidden>
                      <IconStory />
                    </span>
                    {t.storyMode.homeTitle}
                  </h2>
                </div>
                <StoryWeekArt reachedId={storyReachedId} />
              </div>
              <p className="brief">{t.storyMode.homeBody}</p>
              <button className="btn" onClick={onOpenStoryMode}>
                {storyStarted ? t.storyMode.homeResumeBtn : t.storyMode.homeStartBtn}
              </button>
              {/* Что ждёт за кнопкой или где человек остановился; только в две колонки, довод в ui/DayOnePreview.tsx. */}
              {storyStarted && storyReachedId ? <StoryWhereYouAre reachedId={storyReachedId} /> : <DayOnePreview />}
              {/* Тише основной кнопки и только до первого шага: знающему SELECT и JOIN не нужны две недели азов. */}
              {!storyStarted && onOpenStoryPart && <StoryEntry onOpenPart={onOpenStoryPart} row />}
            </div>
            {ready && (
              <div className="home-top-map">
                <DataMapTeaser onOpen={onOpenMap} />
              </div>
            )}
            {!storyStarted && (
              <div className="home-top-proof">
                <TaskShowcase />
              </div>
            )}
            </div>
          </div>
        ) : returnBand ? (
          <div className="home-return-wrap">
            <div className="home-return">
              {heroBlock}
              <div className="home-return-side">
                <ReturnStoryCard reachedId={storyReachedId} started={storyStarted} onOpen={onOpenStoryMode} />
                <DataMapTeaser onOpen={onOpenMap} />
              </div>
            </div>
          </div>
        ) : (
          <>
            <button type="button" className="story-invite-row" data-pair="storymode" data-guide="story" onClick={onOpenStoryMode}>
              <span className="story-invite-row-head">
                <span className="story-invite-row-title">
                  <span className="pair-ico" aria-hidden>
                    <IconStory />
                  </span>
                  {t.storyMode.homeTitle}
                </span>
                <span className="pill">{t.storyMode.badge}</span>
              </span>
              <span className="story-invite-row-action">
                {storyStarted ? t.storyMode.homeResumeBtn : t.storyMode.homeStartBtn} →
              </span>
            </button>
            {/* Условие входа в часть 2 — «в кампании нет сохранённого шага», а не «новичок»: знающий SQL, решивший одно задание в треке, нуждается в нём так же. */}
            {!storyStarted && onOpenStoryPart && <StoryEntry onOpenPart={onOpenStoryPart} row />}
          </>
        ))}

      {/*
       * Единственная постоянная ссылка главной, а не разовая карточка новичка:
       * та показывается один раз и исчезает после первой решённой задачи,
       * а вопрос «что вообще входит в тренажёр и как это устроено» у человека
       * может возникнуть и на второй, и на десятой сессии — особенно если он
       * открывает приложение по ссылке, а не проходит его сам с нуля. Стоит над
       * переключателем треков: это вопрос про тренажёр целиком, до выбора
       * конкретного трека, а не после.
       */}
      <div className={returnBand ? 'home-aux' : undefined}>
        <button
          ref={chooserRef}
          type="button"
          className="link-row"
          onClick={onOpenAbout}
          style={{ margin: '0 0 12px' }}
        >
          {t.about.entryLink}
        </button>
        {/* Вернувшемуся: «до роли» в той же строке, что и ссылка выше, чтобы не сдвигать карточки треков вниз (замер сгиба в roleStrip.css). */}
        {returnBand && <RoleStrip progress={progress} onOpen={onOpenCareer} />}
      </div>

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
      <div className={returnBand ? "dashboard dashboard-return" : "dashboard"}>
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

          {!returnBand && heroBlock}
          {/* Узкий экран и планшет: строка «до роли» идёт под занятием, а не над ним, чтобы кнопка занятия не уехала вниз. */}
          {!returnBand && !isNewUser && heroBlock && <RoleStrip progress={progress} onOpen={onOpenCareer} />}

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
          {/*
           * Карта данных стоит первой в боковой колонке, выше карты навыков: аудит
           * docs/audit-start-here-2026-11.md, раздел D. Блок отвечает на вопрос «как данные
           * становятся решением» и нужен новичку раньше перечня из двадцати навыков. В основной
           * колонке на чистом профиле он уходил на 1773 px вниз, а здесь стоит вровень с карточкой
           * занятия и виден рядом с ней.
           */}
          {ready && !returnBand && !(isNewUser && onOpenStoryMode) && <DataMapTeaser onOpen={onOpenMap} />}
          <div className="card">
            <div className="skill-map-title-row">
              <h2>{t.home.skillMapTitle}</h2>
              <button type="button" className="btn-all-tasks" aria-haspopup="dialog" onClick={onOpenAllTasks}>
                {t.allTasks.open}
              </button>
            </div>
            {/*
             * Прокрутка внутри блока, а не по всей странице — карта на 20
             * навыков (domain) иначе растягивает .dash-side втрое выше
             * экрана, и липкая .dash-main слева просто исчезает из виду,
             * пока её листаешь. Высота ограничена только на десктопе
             * (см. .skill-map-list в styles.css) — на телефоне колонки нет,
             * там своя, уже проверенная прокрутка всей страницы.
             */}
            <div className="skill-map-list">
            {byTier.map(([tier, list]) => {
              const stats = tierStats.find((x) => x.tier === tier);
              const open = openTiers.has(tier);
              const groupId = `skill-map-tier-${tier}`;
              return (
              <div key={tier} className="skill-map-group" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="skill-map-group-header"
                  aria-expanded={open}
                  aria-controls={groupId}
                  onClick={() => toggleTier(tier)}
                >
                  <span className="skill-map-group-title">
                    {/* Запасная подпись берётся из локали: у пака без tierNames
                        захардкоженный «Уровень 2» был бы русским и на английском. */}
                    {activePack.tierNames?.[tier] ?? t.task.levelLabel(tier)}
                  </span>
                  <span className="skill-map-group-meta">
                    {t.home.tierSummary(stats?.started ?? 0, stats?.total ?? list.length)}
                  </span>
                  {ready && (
                    <div
                      className="bar"
                      role="img"
                      aria-label={t.home.masteryAria(Math.round((masteryByTier.find((x) => x.tier === tier)?.avg ?? 0) * 100))}
                    >
                      <span
                        style={{
                          width: `${Math.max((masteryByTier.find((x) => x.tier === tier)?.avg ?? 0) * 100, 0)}%`,
                        }}
                      />
                    </div>
                  )}
                  <span className="skill-map-group-chevron" aria-hidden="true">
                    {open ? '▾' : '▸'}
                  </span>
                </button>
                <MilestoneNote stage={stages.find((x) => x.stage === tier)} isNext={nextMilestone?.stage === tier} />
                {open && (
                <div id={groupId} className="skill-map-skills">
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
                )}
              </div>
              );
            })}
            <MilestoneNote stage={stages.find((x) => x.stage === EXTRA_STAGE)} isNext={nextMilestone?.stage === EXTRA_STAGE} />
            </div>
          </div>

          {ready && (
            <div className="row">
              <button className="btn secondary" data-pair="reference" onClick={onOpenReference}>
                <span className="pair-ico" aria-hidden>
                  <IconBook />
                </span>
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
              <button className="btn secondary" data-pair="sandbox" onClick={onOpenSandbox}>
                <span className="pair-ico" aria-hidden>
                  <IconFlask />
                </span>
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
              <button className="btn secondary" data-pair="data" onClick={onOpenData}>
                <span className="pair-ico" aria-hidden>
                  <IconTable />
                </span>
                {t.home.schemaBtn}
              </button>
              {/*
               * «Путь к роли» — по той же причине, что и песочница: пункт
               * стоит в боковом меню, а его видно только от 1024px, и на
               * телефоне и планшете экран открывался лишь адресом ?roles.
               */}
              <button className="btn secondary" data-pair="career" onClick={() => onOpenCareer()}>
                <span className="pair-ico" aria-hidden>
                  <IconCompass />
                </span>
                {t.nav.career}
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
          {/*
           * Картинки QueryLoop (запрос → результат → эталон полосками) здесь
           * больше нет: то же самое с настоящими числами и разбором ошибки
           * показывает окно задания в карточке кампании наверху (TaskShowcase).
           */}
          <WelcomeIntroBody withHeadline={false} />
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

      {/*
       * Остальные инструменты Quaera — самым последним блоком: к ним
       * переходят, когда с тренажёром всё ясно, и выше кнопки занятия
       * они бы только отвлекали. На всех ширинах, а не только в подвале
       * Sidebar: меню видно от 1024px, и на телефоне без этого блока
       * о семействе не узнать вовсе. Адреса и подписи общие с Sidebar.
       */}
      <nav className="card home-family" data-pair="family" data-guide="family" aria-label={t.nav.familyTitle}>
        <h2>{t.nav.familyTitle}</h2>
        <div className="home-family-links">
          {FAMILY.map((f) => (
            <a
              key={f.key}
              className="home-family-link"
              href={f.url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => window.quaeraOpenApp?.(e.currentTarget, e.nativeEvent, f.key)}
            >
              <img className="home-family-mark" src={FAMILY_MARKS[f.key]} alt="" width={36} height={36} />
              <span className="home-family-text">
                <span className="home-family-name">
                  {t.nav[FAMILY_NAME_KEY[f.key]]} ↗
                </span>
                <span className="home-family-desc">{t.nav[FAMILY_DESC_KEY[f.key]]}</span>
                <span className="home-family-who">{t.nav[FAMILY_WHO_KEY[f.key]]}</span>
              </span>
            </a>
          ))}
        </div>
      </nav>
    </>
  );
}
