import { useMemo } from 'react';
import { packForTrack } from '../content';
import type { Track } from '../content/types';
import { useI18n } from '../i18n/context';
import { AUTHOR_LINKEDIN, AUTHOR_NAME, COPYRIGHT_YEAR } from '../links';
import type { Progress } from '../srs/store';

/**
 * Боковая навигация — только для экранов от 1024px (скрыта через display: none,
 * см. styles.css). Это не «мобильное меню, растянутое вбок»: на телефоне
 * постоянного меню нет вовсе и не появляется — там разделы открываются
 * ссылками с главной, и добавлять к ним второй способ навигации значило бы
 * занимать высоту экрана ради того, что и так в одном касании.
 *
 * Sidebar сознательно не знает ни про экран занятия, ни про карточку приёма:
 * они открываются изнутри разделов и своего пункта меню не имеют — иначе
 * меню обещало бы вход туда, куда попадают только по ходу занятия.
 */
export type SidebarSection =
  | 'home'
  | 'story'
  | 'reference'
  | 'sandbox'
  | 'data'
  | 'about'
  | 'account'
  | 'onboarding'
  | null;

export function Sidebar({
  section,
  tracks,
  activeTrack,
  progress,
  streakDays,
  accountEmail,
  onHome,
  storyEnabled,
  onStory,
  onReference,
  onSandbox,
  onData,
  onAbout,
  onAccount,
  onOnboarding,
  onSelectTrack,
}: {
  /** Подсвеченный пункт. null — открыт экран без своего раздела (занятие, карточка). */
  section: SidebarSection;
  tracks: Track[];
  activeTrack: Track;
  progress: Progress;
  streakDays: number;
  /** Почта вошедшего или null. Печатается подписью под пунктом «Аккаунт и данные». */
  accountEmail: string | null;
  onHome: () => void;
  /** Экспериментальный раздел «Сюжет» спрятан за `?story` (см. App.tsx). */
  storyEnabled: boolean;
  onStory: () => void;
  onReference: () => void;
  onSandbox: () => void;
  onData: () => void;
  onAbout: () => void;
  onAccount: () => void;
  onOnboarding: () => void;
  onSelectTrack: (track: Track) => void;
}) {
  const { t } = useI18n();

  /**
   * Прогресс по всем трекам сразу, а не только по активному: смысл меню
   * в том, чтобы видеть карту целиком, не переключаясь. Считаем по решённым
   * заданиям, а не по «начатым темам»: это единственная величина, которая
   * одинаково честна и для трека из 60 заданий, и для черновика без заданий.
   * Локаль здесь не нужна — packForTrack без неё отдаёт русский пак, а нам
   * важны только id и количество.
   */
  const stats = useMemo(() => {
    const map = new Map<Track, { solved: number; total: number }>();
    for (const track of tracks) {
      const pack = packForTrack(track);
      const tasks = pack?.tasks ?? [];
      map.set(track, {
        solved: tasks.filter((task) => progress.taskRecords[task.id]?.solved).length,
        total: tasks.length,
      });
    }
    return map;
  }, [tracks, progress]);

  return (
    <nav className="sidebar" aria-label={t.nav.ariaLabel}>
      {/*
       * Внутренняя обёртка нужна ради двух несовместимых требований: полоса
       * с фоном и границей обязана тянуться на всю высоту страницы (иначе
       * граница обрывается там, где кончились пункты меню), а само меню —
       * оставаться на виду при прокрутке. Растянутый элемент липким сделать
       * нельзя: ему некуда двигаться внутри собственной области. Поэтому
       * тянется внешний nav, а прилипает внутренний блок.
       */}
      <div className="sidebar-inner">
        <div className="sidebar-brand">
          <span className="sidebar-mark" aria-hidden>
            Q
          </span>
          <span>
            <b>{t.app.name}</b>
            <small>{t.app.streakSuffix(streakDays)}</small>
          </span>
        </div>

        <div className="side-group">
          <h2>{t.nav.sectionsLabel}</h2>
          <button
            type="button"
            className="side-item"
            aria-current={section === 'home' ? 'page' : undefined}
            onClick={onHome}
          >
            <IconHome />
            {t.nav.home}
          </button>
          {storyEnabled && (
            <button
              type="button"
              className="side-item"
              aria-current={section === 'story' ? 'page' : undefined}
              onClick={onStory}
            >
              <IconRoute />
              {t.nav.story}
            </button>
          )}
          <button
            type="button"
            className="side-item"
            aria-current={section === 'reference' ? 'page' : undefined}
            onClick={onReference}
          >
            <IconBook />
            {t.nav.reference}
          </button>
          <button
            type="button"
            className="side-item"
            aria-current={section === 'sandbox' ? 'page' : undefined}
            onClick={onSandbox}
          >
            <IconFlask />
            {t.nav.sandbox}
          </button>
          {/*
           * «Данные» стоят после песочницы, а не рядом со справочником:
           * это не ещё один способ учиться, а описание того, на чём учат
           * все остальные разделы, — и заглядывают сюда обычно из них.
           */}
          <button
            type="button"
            className="side-item"
            aria-current={section === 'data' ? 'page' : undefined}
            onClick={onData}
          >
            <IconTable />
            {t.nav.data}
          </button>
        </div>

        <div className="side-group">
          <h2>{t.nav.tracksLabel}</h2>
          {tracks.map((track) => {
            const { solved, total } = stats.get(track) ?? { solved: 0, total: 0 };
            return (
              <button
                key={track}
                type="button"
                className={`side-item side-track track-${track}`}
                // Активный трек — это состояние приложения, а не открытая страница:
                // aria-pressed, а не aria-current, иначе на экране занятия
                // скринридер объявлял бы «текущей страницей» пункт меню,
                // на который никто не переходил.
                aria-pressed={track === activeTrack}
                onClick={() => onSelectTrack(track)}
              >
                <span className="side-track-head">
                  <span>{t.tracks.names[track]}</span>
                  <span>{total ? t.nav.trackProgress(solved, total) : t.tracks.draftBadge}</span>
                </span>
                {total > 0 && (
                  <span className="bar" aria-hidden>
                    <span style={{ width: `${Math.round((solved / total) * 100)}%` }} />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/*
         * «С чего начать» стоит в подвале рядом с «О тренажёре», а не первым
         * пунктом «Обучения»: это страница, на которую заходят один раз
         * и по своей воле, а меню читают каждый день — постоянное место
         * в верхней группе было бы ради разового действия. Тем же
         * соображением «Данные» стоят после песочницы, а не рядом
         * со справочником.
         */}
        <div className="side-foot">
          <button
            type="button"
            className="side-item"
            aria-current={section === 'onboarding' ? 'page' : undefined}
            onClick={onOnboarding}
          >
            <IconCompass />
            {t.nav.onboarding}
          </button>
          <button
            type="button"
            className="side-item"
            aria-current={section === 'about' ? 'page' : undefined}
            onClick={onAbout}
          >
            <IconInfo />
            {t.nav.about}
          </button>
          {/*
           * Аккаунт — последним в подвале и с подписью состояния.
           *
           * Внизу, а не в «Обучении»: разделы выше — то, чем занимаются,
           * этот — про сам аккаунт и накопленное, и открывают его редко.
           * Последним из трёх, потому что два соседних объясняют тренажёр,
           * а этот — единственный, который про самого человека.
           *
           * Подпись обязательна: пункт без неё не отличить от «О тренажёре»,
           * и вошёл ли ты — не видно нигде вообще. Почта в ней важнее
           * названия раздела, поэтому обрезается по ширине колонки,
           * а не переносится (см. .side-item-note).
           */}
          <button
            type="button"
            className="side-item side-account"
            aria-current={section === 'account' ? 'page' : undefined}
            onClick={onAccount}
          >
            <IconAccount />
            <span className="side-account-text">
              {t.nav.account}
              <small className="side-item-note">{accountEmail ?? t.nav.accountSignedOut}</small>
            </span>
          </button>
        </div>

        {/*
         * Копирайт — у самого низа колонки, а не сразу под пунктами подвала.
         *
         * Смысл у него другой, чем у всего, что выше: пункты открывают
         * разделы, это ничего не открывает внутри приложения и нажимается
         * раз в жизни. Поэтому и набран прозой на 11px, а не кнопкой:
         * сделай его кнопкой — и в подвале окажется три равноправных
         * пункта, один из которых уводит с сайта без предупреждения.
         * Прижат ко дну (`margin-top: auto` в растянутой на высоту окна
         * колонке) по той же причине: пустое место над ним говорит «список
         * кончился» убедительнее любого разделителя.
         *
         * Ни года, ни имени переводить нечего (см. links.ts), поэтому
         * строка одна на обе локали; ссылке нужна подпись для скринридера,
         * потому что «Stanislav Sidorovich» само по себе не говорит, куда
         * ведёт, — её и берём из уже переведённого about.linkedinBtn.
         */}
        <p className="sidebar-legal">
          © {COPYRIGHT_YEAR}{' '}
          <a
            href={AUTHOR_LINKEDIN}
            target="_blank"
            rel="noreferrer"
            aria-label={t.about.linkedinBtn}
          >
            {AUTHOR_NAME}
          </a>
        </p>
      </div>
    </nav>
  );
}

/*
 * Иконки — инлайновые SVG на 16px, обводкой в currentColor: так они
 * подхватывают и тему, и цвет активного пункта, и масштабирование крупным
 * шрифтом (zoom на .app), не требуя ни спрайта, ни шрифта иконок,
 * ни отдельного сетевого запроса.
 */
const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

const IconHome = () => (
  <svg {...iconProps}>
    <path d="M2.6 7.1 8 2.9l5.4 4.2V13a.6.6 0 0 1-.6.6H3.2a.6.6 0 0 1-.6-.6z" />
  </svg>
);

/*
 * Дорога с двумя точками: линия — это путь, а не список. Отличается
 * от IconCompass («с чего начать») тем, что у компаса нет направления
 * движения, а здесь оно и есть содержание раздела.
 */
const IconRoute = () => (
  <svg {...iconProps}>
    <circle cx="4.4" cy="3.6" r="1.5" />
    <circle cx="4.4" cy="12.4" r="1.5" />
    <path d="M4.4 5.1v5.8" />
    <path d="M8.4 3.6h5.2" />
    <path d="M8.4 12.4h3.4" />
  </svg>
);

const IconBook = () => (
  <svg {...iconProps}>
    <path d="M8 4.6v8.6" />
    <path d="M8 4.6C7.2 3.6 5.9 3 4.4 3H2.6v8.6h1.8c1.5 0 2.8.6 3.6 1.6" />
    <path d="M8 4.6C8.8 3.6 10.1 3 11.6 3h1.8v8.6h-1.8c-1.5 0-2.8.6-3.6 1.6" />
  </svg>
);

const IconCompass = () => (
  <svg {...iconProps}>
    <circle cx="8" cy="8" r="5.6" />
    <path d="m10.1 5.9-1.5 3.5-3.5 1.5 1.5-3.5z" />
  </svg>
);

const IconInfo = () => (
  <svg {...iconProps}>
    <circle cx="8" cy="8" r="5.6" />
    <path d="M8 7.3v3.4" />
    <path d="M8 5.2h.01" />
  </svg>
);

const IconFlask = () => (
  <svg {...iconProps}>
    <path d="M6.4 2.6h3.2" />
    <path d="M6.9 2.6v3.9L3.6 12c-.5.9.1 2 1.2 2h6.4c1.1 0 1.7-1.1 1.2-2L9.1 6.5V2.6" />
    <path d="M4.9 9.6h6.2" />
  </svg>
);

const IconTable = () => (
  <svg {...iconProps}>
    <rect x="2.4" y="3" width="11.2" height="10" rx="1.2" />
    <path d="M2.4 6.4h11.2" />
    <path d="M6.6 6.4V13" />
  </svg>
);

/**
 * Единственная иконка отсюда, которая нужна не только меню: на телефоне
 * бокового меню нет вовсе, и вход в «Аккаунт и данные» стоит в шапке
 * (см. .topbar-account в App.tsx). Экспортируется, а не копируется туда,
 * чтобы у одного раздела не завелось двух разных значков.
 */
export const IconAccount = () => (
  <svg {...iconProps}>
    <circle cx="8" cy="5.8" r="2.6" />
    <path d="M3.2 13.4c.6-2.2 2.5-3.4 4.8-3.4s4.2 1.2 4.8 3.4" />
  </svg>
);
