import { useEffect, useMemo, useState } from 'react';
import { isTrackTranslated, packForTrack } from '../../content';
import type { Pack, Track } from '../../content/types';
import { EXTRA_STAGE, nextStage, stageStates, type StageState } from '../../content/milestones';
import { useI18n } from '../../i18n/context';
import { StartGuide } from '../StartGuide';
import { isDue, isUnlocked, mastery } from '../../srs/scheduler';
import { type Progress } from '../../srs/store';
import { HomeSpine } from './HomeSpine';
import './homeSpine.css';

/**
 * Старая сюжетная линия (выведенная из графа) убрана из интерфейса на время
 * валидации режима истории: два «сюжетных» входа рядом путали пользователя.
 * Это флаг видимости, а не удаление — код и экран линии живы; когда решится
 * её судьба, флаг либо вернётся, либо линия уедет целиком. Режим истории
 * вышел на главную и линию замещает — тем более незачем показывать оба.
 */
export const SHOW_STORY_LINE = false;

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

/**
 * Главная: хребет (рамка недели, карта пути данных, треки плиткой) и вид трека.
 *
 * Вид трека живёт внутри Home, а не отдельным экраном: плитка трека и выбор трека
 * в боковом меню зовут `switchTrack`, тот поднимает `scrollToChooser`, а Home
 * по этому сигналу открывает вид трека. В нём всё, что раньше стояло на главной
 * длинной полосой: счётчики, занятие, прочность по разделам, карта навыков,
 * согласие на рантайм, вводная трека. Вернуться на хребет можно ссылкой сверху.
 */
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
  /** «О тренажёре»: на телефоне бокового меню нет, и это единственный вход туда с главной. */
  onOpenAbout: () => void;
  /** Экскурс в профессию. Строку показываем только новичку — довод у самой строки. */
  onOpenIntro: () => void;
  onSwitchTrack: (track: Track) => void;
  /** Практика по одной теме прямо с карты навыков — не через подбор занятия. */
  onStartSkill: (skillId: string) => void;
  /** Шторка «Все задания» трека. */
  onOpenAllTasks: () => void;
  /** Вводная карточка трека. undefined — у трека intro ещё не написан, кнопку не показываем. */
  onOpenTrackIntro?: () => void;
  onOpenStory: () => void;
  /** Вход в кампанию режима истории. null — кампания не разрешается в задания: вход на пустой экран хуже отсутствия входа. */
  onOpenStoryMode: (() => void) | null;
  /** Сигнал гиду новичка: n растёт при каждом «открыть снова», tour запускает показ по шагам. */
  guide: { n: number; tour: boolean };
  /** Кампания уже начата (по позиции в хранилище, а не по решённым заданиям). */
  storyStarted: boolean;
  storyReachedId: string | null;
  /** Вход сразу в часть кампании (id части); null — как у onOpenStoryMode. */
  onOpenStoryPart: ((partId: string) => void) | null;
  /** Где человек на линии: `at` — индекс текущей миссии, равен `total` у пройденной. null — линии нет. */
  storyAt: { at: number; total: number } | null;
  /** Подпись шага незаконченного занятия этого трека («Задача 2 из 5»), null — продолжать нечего. */
  resume: string | null;
  onResume: () => void;
  /** Трек только что выбран (плитка или боковое меню) — открыть вид трека. */
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

  /** Вид трека открыт (иначе виден хребет). */
  const [trackView, setTrackView] = useState(false);
  useEffect(() => {
    if (!scrollToChooser) return;
    onChooserScrolled();
    setTrackView(true);
    window.scrollTo({ top: 0 });
  }, [scrollToChooser, onChooserScrolled]);

  /**
   * Лежит ли рантайм Python в кеше устройства. От этого зависит только текст
   * подписи под кнопкой — и это единственное место, где приложение может
   * отличить первую закачку 52 МБ от подъёма из кеша. Флаг согласия для
   * этого не годится: он хранится навсегда, а кеш браузер вправе вытеснить.
   *
   * `caches.match` без имени кеша ищет по всем кешам разом — имя вендорного
   * кеша содержит пин версии Pyodide, подставляемый в sw.js на сборке
   * (см. scripts/postbuild-sw.mjs), и в коде приложения его нет.
   *
   * `null` — «не знаем» (Cache API недоступен или проба не успела): тогда
   * показывается прежний текст про первую закачку. Ошибиться в эту сторону
   * дешевле: обещание «качается один раз» при подъёме из кеша лишь избыточно,
   * а обратная ошибка сказала бы «интернет не нужен» тому, кто тратит трафик.
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
   * трека» и значит «трек не открывали». Считаем по sql-паку конкретно:
   * сравнение с чужим треком, который скрыт под текущим выбором.
   */
  const showPandasSqlHint = useMemo(() => {
    if (activeTrack !== 'python') return false;
    const sqlPack = packForTrack('sql', locale);
    if (!sqlPack) return false;
    return sqlPack.skills.every((s) => (progress.skills[s.id]?.reps ?? 0) === 0);
  }, [activeTrack, progress, locale]);

  /**
   * Мастерство по уровням графа — глубина освоения (интервал и качество
   * последних оценок SRS), сгруппированная по tier. Это агрегат, а не
   * дублирование карты навыков: там построчно все темы, здесь до четырёх
   * усреднённых чисел, обзор без прокрутки.
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
   * первый уровень вообще. Пересчитывается только при смене трека
   * (activeTrack), не при каждом решённом задании — иначе группа, которую
   * раскрыли вручную, схлопывалась бы обратно на первом же прогрессе внутри неё.
   */
  useEffect(() => {
    let defaultTier = tierStats.find((x) => x.unfinished > 0)?.tier;
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
   * «запросы выполняются по-настоящему» там нельзя. `order` считается наравне
   * с `predict`: расставить шаги рассуждения — ответ без единой строки кода.
   */
  const writesCode = activePack.tasks.some((x) => x.mode !== 'predict' && x.mode !== 'order' && x.mode !== 'waves' && x.mode !== 'relate' && x.mode !== 'spot');
  // Новичок: ни навыков, ни решённых заданий. Хребет ведёт его на день 1.
  const isNewUser = Object.keys(progress.skills).length === 0 && progress.totalSolved === 0;

  const loadingLabel = loading
    ? heavyRuntime
      ? runtimeCached
        ? t.home.loadingRuntimeCached
        : t.home.loadingRuntime
      : t.home.loading
    : null;

  const masteryBlock = (
    <div className="overall-progress" style={{ marginTop: 16 }}>
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
        <button className={resume ? 'btn secondary' : 'btn'} onClick={onStart} disabled={loading}>
          {loadingLabel ?? (dueCount > 0 ? t.home.startBtnResume : t.home.startBtnBegin)}
        </button>
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
        {masteryBlock}
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
       * Гид «Как здесь всё устроено» открывается только по просьбе (пункт бокового
       * меню, `?guide=1`): автоматический показ новичку и окно-приглашение с главной
       * убраны схемой A, у главной теперь одна кнопка «Продолжить». Подсвечивает он
       * блоки с `data-guide`: рамка недели, карта, треки, семейство.
       */}
      {guide.n > 0 && (
        <StartGuide
          isNewUser={false}
          storyStarted={storyStarted}
          signal={guide}
          onOpenMap={() => onOpenMap({})}
          onOpenStoryMode={onOpenStoryMode}
        />
      )}

      {!trackView ? (
        <>
          <HomeSpine
            activeTrack={activeTrack}
            activePack={activePack}
            progress={progress}
            isNewUser={isNewUser}
            dueCount={dueCount}
            resume={resume}
            loading={loading}
            storyStarted={storyStarted}
            storyReachedId={storyReachedId}
            onResume={onResume}
            onReview={onStart}
            onStartSkill={onStartSkill}
            onOpenStoryMode={onOpenStoryMode}
            onOpenStoryPart={onOpenStoryPart}
            onOpenTrack={(track) => {
              if (track === activeTrack) {
                setTrackView(true);
                window.scrollTo({ top: 0 });
              } else onSwitchTrack(track);
            }}
            onOpenMap={onOpenMap}
            onOpenIntro={onOpenIntro}
            onOpenReference={onOpenReference}
            onOpenSandbox={onOpenSandbox}
            onOpenData={onOpenData}
            onOpenCareer={onOpenCareer}
          />
          {/*
           * Признак входа, дублирующий подвал бокового меню, — на десктопе
           * скрыт CSS-правилом, ниже никакого условия по ширине нет намеренно:
           * та же логика, что у .topbar-account/.brand-word/.ctx-streak.
           */}
          <button type="button" className="link-row hs-about" onClick={onOpenAbout}>
            {t.about.entryLink}
          </button>
          <p className="muted home-account-line">
            {accountEmail ? t.home.accountStatusSignedIn(accountEmail) : t.home.accountStatusSignedOut}
            <button type="button" onClick={onOpenAccount}>
              {accountEmail ? t.nav.account : t.home.accountStatusSignInBtn}
            </button>
          </p>
        </>
      ) : (
        <>
          <button type="button" className="link-row hs-back" onClick={() => setTrackView(false)}>
            {t.home.spine.backToHome}
          </button>
          <h2 className="hs-track-title">{t.tracks.names[activeTrack]}</h2>
          {/*
           * Показываем только на английском и только на треке, контент которого
           * действительно не переведён: после перевода sql, domain и python
           * надпись про русские тексты стала бы враньём.
           */}
          {locale === 'en' && !isTrackTranslated(activeTrack) && (
            <p className="muted" style={{ margin: '0 0 12px', fontSize: 12 }}>{t.locale.partialNote}</p>
          )}

          {/*
           * Две колонки на десктопе, одна на телефоне. Левая колонка липкая: кнопка
           * занятия и счётчики видны, пока листаешь карту из двадцати тем, а карта
           * получает ширину, при которой описание темы не обрезается многоточием.
           */}
          <div className="dashboard">
            <div className="dash-main">
              {/*
               * Согласие приоритетнее обычного hero-блока: пока исполнитель ждёт
               * решения пользователя, начинать занятие нельзя, а показывать пустой
               * счётчик «0 на повторение» поверх невыполнимой кнопки было бы ложью.
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
               * Отложенное согласие: одной строкой, а не блоком на пол-экрана, от
               * которого человек только что отказался. Возврат ведёт обратно к полной
               * карточке, а не запускает скачивание: 53 МБ не должны уходить
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

              {heroBlock}

              {!ready && (
                <div className="card">
                  <p className="brief" style={{ marginBottom: 6 }}>{activePack.description}</p>
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t.home.draftNote}</p>
                </div>
              )}

              {SHOW_STORY_LINE && storyAt && (
                <button type="button" className="link-row" onClick={onOpenStory} style={{ margin: '10px 0 0' }}>
                  {storyAt.at >= storyAt.total
                    ? t.story.entryLinkDone
                    : storyAt.at === 0
                      ? t.story.entryLinkStart(storyAt.total)
                      : t.story.entryLink(storyAt.at + 1, storyAt.total)}
                </button>
              )}

              {onOpenTrackIntro && (
                <button type="button" className="link-row" onClick={onOpenTrackIntro} style={{ margin: '10px 0 0' }}>
                  {t.trackIntro.entryLink}
                </button>
              )}
            </div>

            <div className="dash-side">
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
                 * экрана. Высота ограничена только на десктопе (см. .skill-map-list
                 * в styles.css); на телефоне колонки нет, там листается страница.
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
                               * Практика с карты открыта всегда — замок стал советом, не запретом.
                               * selectSession (автоподбор занятия) по-прежнему уважает предпосылки:
                               * алгоритм советует порядок, человек решает сам. Тусклый цвет
                               * строки (.locked) остаётся сигналом «не по порядку».
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
                                  {/* Полоса входит в имя кнопки строки: aria-label на потомке подклеивается к вычисляемому имени. */}
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
            </div>
          </div>
        </>
      )}
    </>
  );
}
