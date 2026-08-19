import { useEffect, useRef } from 'react';
import { useI18n } from '../i18n/context';
import { storyForTrack, type MissionStory } from '../content/story';
import type { Track } from '../content/types';
import { currentMissionIndex, missionProgress, type Mission } from '../story/line';

/**
 * Экран сюжетной линии — ответ на два вопроса, которых у приложения
 * до сих пор не было: «где я во всём этом» и «когда я закончил».
 *
 * Занятие отвечает на «что сейчас», рекомендованный трек — на «с чего
 * начать», вводная — на «что это за трек». Ни один из трёх экранов не
 * показывает пути целиком, и это не украшение: человек, зашедший
 * по ссылке, решает пару запросов и уходит, потому что не видит ни длины
 * дороги, ни её конца.
 *
 * **Экран ничего не хранит и ничего не считает про человека сам.**
 * Пройденность миссии выводится из решённых заданий, которые и так лежат
 * в прогрессе. Отсюда важное следствие для поведения: задания, решённые
 * в обычном занятии, закрывают миссии линии — линия отражает состояние,
 * а не ведёт отдельный учёт параллельно ему.
 *
 * **Миссии впереди открыты.** Соблазн запереть их велик — так делает
 * половина курсов с «главами», и это добавляет линии вес. Но предпосылки
 * в этом проекте задают порядок, а не блокировку (см. Skill.prereqs
 * в content/types.ts), и карта навыков давно пускает в любую тему.
 * Запрет здесь противоречил бы соседнему экрану ради ощущения.
 * Разница между «вы здесь» и «впереди» проведена словом статуса и силой
 * кнопки: у текущей миссии она основная, у остальных — вторичная.
 */
export function StoryLine({
  track,
  line,
  isSolved,
  onStartMission,
}: {
  track: Track;
  line: Mission[];
  isSolved: (taskId: string) => boolean;
  onStartMission: (mission: Mission) => void;
}) {
  const { t, locale } = useI18n();
  const story = storyForTrack(track, locale);

  if (!line.length) {
    return (
      <div className="card">
        <h2>{t.story.title}</h2>
        <p className="muted">{t.story.emptyTrack}</p>
      </div>
    );
  }

  const currentIndex = currentMissionIndex(line, isSolved);
  const finished = currentIndex >= line.length;
  const currentRef = useRef<HTMLLIElement | null>(null);

  /*
   * При открытии линию прокручиваем к текущей миссии.
   *
   * Без этого экран отвечал на «где я» только тому, кто прошёл одну-две
   * миссии: на телефоне действие текущей упиралось в нижний край уже при
   * одной пройденной (811px из 812), а при шести не помещалось бы никаким
   * сокращением строк — пройденные карточки занимают место по определению.
   * Сжатие карточек этой задачи не решает, прокрутка решает при любой длине.
   *
   * Один раз, на монтировании, а не на каждое изменение прогресса: экран
   * не должен дёргаться под человеком, пока он читает список.
   *
   * Отступ считается от настоящей высоты шапки, а не задан числом:
   * шапка липкая и на телефоне занимает две строки, на десктопе одну.
   * С числом (пробовали 76px) на 375px карточка вставала под шапку,
   * и номер миссии со статусом оказывались наполовину перекрыты — то есть
   * прокрутка приводила ровно к тому, от чего должна была спасти.
   */
  useEffect(() => {
    const el = currentRef.current;
    if (currentIndex === 0 || !el) return;
    const header = document.querySelector('.topbar');
    const offset = (header?.getBoundingClientRect().height ?? 0) + 12;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <div className="card">
        {/*
         * Заголовком стоит положение, а не название трека: название уже
         * напечатано подзаголовком шапки в двадцати пикселях выше, и два
         * одинаковых заголовка подряд читались одним задвоенным элементом
         * (та же находка, что с логотипом на десктопной главной).
         */}
        <h2 className="story-line-heading">
          {finished ? t.story.progressDone(line.length) : t.story.progressLabel(currentIndex + 1, line.length)}
        </h2>
        {/*
         * Полоса считает пройденные миссии, а не решённые задания.
         * Знаменатель обязан совпадать с тем, что написано строкой выше:
         * два разных знаменателя рядом уже один раз читались как ошибка
         * в расчёте (см. solvedCount в App.tsx).
         */}
        <div className="story-bar" role="presentation">
          <span style={{ width: `${Math.round((currentIndex / line.length) * 100)}%` }} />
        </div>
        {/*
         * Вводная развёрнута только пока линию не начали.
         *
         * На телефоне два её абзаца занимают весь первый экран, и у
         * вернувшегося единственным видимым действием оказывалась кнопка
         * «Пройти заново» уже пройденной миссии, а «Начать миссию» текущей
         * уходила под сгиб. Ровно та болезнь, которую чинили на верху
         * главной: у экрана два разных первых посетителя, и действие
         * второго обязано быть видно без прокрутки.
         */}
        {story && (
          <details className="story-opening-wrap" open={currentIndex === 0}>
            <summary>{t.story.openingSummary}</summary>
            <p className="story-opening">{story.opening}</p>
          </details>
        )}
      </div>

      <ol className="story-missions">
        {line.map((mission, i) => (
          <MissionCard
            key={mission.id}
            mission={mission}
            story={story?.missions[i]}
            state={i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'ahead'}
            progress={missionProgress(mission, isSolved)}
            onStart={() => onStartMission(mission)}
            cardRef={
              i === currentIndex
                ? (el) => {
                    currentRef.current = el;
                  }
                : undefined
            }
          />
        ))}
      </ol>

      {finished && story && (
        <div className="card story-ending">
          <h2>{t.story.endingTitle}</h2>
          <p>{story.ending}</p>
        </div>
      )}
    </>
  );
}

function MissionCard({
  mission,
  story,
  state,
  progress,
  onStart,
  cardRef,
}: {
  mission: Mission;
  /** Проза этой миссии или undefined, если у трека её ещё не писали. */
  story: MissionStory | undefined;
  state: 'done' | 'current' | 'ahead';
  progress: ReturnType<typeof missionProgress>;
  onStart: () => void;
  /**
   * Ставится только текущей миссии — к ней прокручивается экран при открытии.
   * Ref-функция, а не объект: объектный ref у React 19 типизирован как
   * `RefObject<T | null>` и в проп `ref` не проходит, а перекладывать его
   * через `as` значило бы прятать несовпадение вместо того, чтобы его не заводить.
   */
  cardRef?: (el: HTMLLIElement | null) => void;
}) {
  const { t } = useI18n();

  /*
   * Название без прозы собирается из названий навыков. Это честный запасной
   * вариант, а не заглушка: линия выведена из графа целиком, и названия тем
   * в ней настоящие — не хватает только связки, объясняющей, зачем этот шаг
   * идёт здесь. Треки без прозы работают, просто читаются суше.
   */
  const title = story?.title ?? mission.skills.map((s) => s.title).join(' · ');

  return (
    <li className={`card story-mission ${state}`} ref={cardRef}>
      <div className="story-mission-main">
        <div className="story-mission-head">
          <span className="story-mission-num" aria-hidden>
            {mission.number}
          </span>
          <h2>
            {/*
             * Статус словом, а не номером: номер уже стоит кружком слева,
             * и «1» рядом с «Миссия 1» читались одним элементом. Заодно
             * состояние перестало держаться на одной силе кнопки — а на
             * телефоне, где нет наведения, это единственный способ его назвать.
             */}
            <span className="story-mission-label">
              {state === 'done'
                ? t.story.statusDone
                : state === 'current'
                  ? t.story.statusCurrent
                  : t.story.statusAhead}
            </span>
            {title}
          </h2>
        </div>

        {/*
         * До прохождения — связка (зачем этот шаг), после — итог (что теперь
         * есть). Одновременно они не показываются: связка написана в будущем
         * времени и над пройденной миссией читалась бы как невыполненное
         * обещание, а итог над непройденной выдал бы содержание вперёд.
         */}
        {state === 'done'
          ? story && (
              <p className="story-mission-outcome">
                <b>{t.story.outcomeLabel}</b> {story.outcome}
              </p>
            )
          : story && <p className="story-mission-hook">{story.hook}</p>}

        {/*
         * Пилюли навыков — только у непройденной миссии: они отвечают
         * на «что там будет», а у пройденной ответ уже дан итогом строкой
         * выше. На линии из восьми карточек каждая лишняя строка отодвигает
         * текущую миссию под сгиб.
         */}
        {state !== 'done' && (
          <div className="story-mission-skills">
            {mission.skills.map((s) => (
              <span className="pill" key={s.id}>
                {s.title}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="story-mission-side">
        <p className="story-mission-meta">
          {t.story.meta(mission.tasks.length, mission.minutes)}
          {/*
           * Счётчик решённого — только у начатой и незаконченной миссии.
           * У пройденной он всегда «4 из 4», то есть повторяет статусом
           * сказанное строкой выше; у нетронутой ему нечего показать.
           */}
          {progress.started && (
            <>
              <br />
              {t.story.solvedOf(progress.solved, progress.total)}
            </>
          )}
        </p>
        {/*
         * У пройденной миссии повтор — ссылкой, а не кнопкой. Кнопкой он
         * на светлой теме выходил самым заметным блоком экрана: белый
         * прямоугольник на приглушённой карточке спорил за внимание
         * с единственным действием, которое здесь и правда основное.
         */}
        <button
          type="button"
          className={state === 'done' ? 'story-replay' : `btn${state === 'current' ? '' : ' secondary'}`}
          onClick={onStart}
        >
          {state === 'done'
            ? t.story.againBtn
            : progress.started
              ? t.story.continueBtn
              : state === 'current'
                ? t.story.startBtn
                : t.story.openBtn}
        </button>
      </div>
    </li>
  );
}
