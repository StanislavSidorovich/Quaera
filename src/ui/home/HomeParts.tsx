import { packForTrack } from '../../content';
import type { Track } from '../../content/types';
import { getExecutor } from '../../engine/executors';
import { useI18n } from '../../i18n/context';
import { type Progress } from '../../srs/store';

export const TRACK_ORDER: Track[] = ['domain', 'sql', 'python', 'model'];

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
export const RECOMMENDED_TRACK: Track = 'sql';

/**
 * Переключатель треков — карта дорожной карты, а не просто навигация.
 * Черновые треки видны и кликабельны (можно посмотреть граф навыков),
 * но помечены статусом и не дают начать занятие — контента там пока нет.
 */
export function TrackSwitcher({
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
    <div className="tabs tracks" data-guide="tracks" role="tablist" aria-label={t.tracks.ariaLabel}>
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
export function TrackCards({
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
    <div className="track-cards" data-pair="tracks" data-guide="tracks">
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
export function WelcomeIntroBody({ withHeadline = true }: { withHeadline?: boolean }) {
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
export function WelcomeProofBody({
  onOnboarding,
  onOpenIntro,
}: {
  onOnboarding: () => void;
  onOpenIntro: () => void;
}) {
  const { t } = useI18n();
  return (
    <>
      {/*
       * Вопрос «что это вообще такое» стоит раньше вопроса «с чего начать» —
       * тот же порядок, что в боковом меню (Sidebar.tsx). На телефоне
       * бокового меню нет, а это единственный постоянный вход в экскурс для
       * вернувшегося человека: строка на главной (.home-intro-link) видна
       * только новичку, ровно до первой решённой задачи. Экран «О тренажёре»
       * при этом достижим с главной всегда — см. about.entryLink там же.
       */}
      <button type="button" className="home-intro-link" data-pair="intro" onClick={onOpenIntro} style={{ marginBottom: 14 }}>
        <span className="home-intro-glyph" aria-hidden>
          ?
        </span>
        <span>{t.home.introLink}</span>
      </button>
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
export function ProofSummary({
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
