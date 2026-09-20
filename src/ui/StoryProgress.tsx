import { useI18n } from '../i18n/context';
import { storyClosesCampaign, storyPastCases, storyWeekOf, type StoryCampaign, type StoryMission } from '../content/storymode';
import type { StoryPhase } from './StoryMode';

/**
 * Полоса дела — единственное, что на экране режима истории говорит «ты
 * движешься», а не «вот ещё одно упражнение».
 *
 * Зачем. Неделя из двенадцати заданий распадается на двенадцать упражнений,
 * если человек в среду не помнит, зачем считал средние цены во вторник.
 * Задание на экране видно всегда, а цель — никогда: она осталась в брифе,
 * на четыре экрана назад. Полоса держит на виду три вещи, и ровно три:
 * вопрос расследования, какой сегодня день из пяти и где мы внутри дня.
 *
 * **Рисуется и над заданием тоже.** Это не украшение шапки: именно на
 * задании человек проводит больше всего времени, и именно там вопрос
 * «а зачем я это делаю» возникает. Поэтому её вставляет сам StoryMode
 * в обе свои ветки, а не карточка разговора.
 *
 * Чего здесь намеренно нет — процентов, очков и полоски заполнения. День
 * назван днём, потому что единица кампании — рабочий день, а не 20%
 * выполнения; см. запрет на награды-контролёры в шапке storymode.ts.
 *
 * **Пройденные дни кликабельны.** Полоса и так называет их поимённо, то есть
 * выглядит навигацией; не быть ею — обман, за который платит человек,
 * вспомнивший в четверг, что в среду был разговор про полку, и не имеющий
 * способа туда вернуться. Открыты дни до достигнутого включительно
 * (`openDayIds` считается в App), будущие остаются текстом: обещать вход
 * в пятницу тому, кто не читал понедельник, значит ломать неделю, ради
 * связности которой она и разложена по дням.
 *
 * **Прошлые недели — отдельным свёрнутым списком, а не в самой полосе.**
 * Полоса нарочно показывает только свою неделю (см. довод выше про делений
 * на 320px); списку прошлых дел ширина не грозит — свёрнутый `<details>`
 * занимает одну строку и разворачивается по клику, поэтому он живёт на
 * каждом экране кампании, а не только на брифе понедельника, как было
 * у прежней однохоповой «двери в прошлое дело».
 */
export function StoryProgress({
  campaign,
  mission,
  phase,
  openDayIds,
  onOpenDay,
}: {
  campaign: StoryCampaign;
  mission: StoryMission;
  phase: StoryPhase;
  /** Дни, куда разрешён возврат: всё до достигнутого включительно. */
  openDayIds: Set<string>;
  /** Открыть день; необязательная фаза — прошлые дела открываются сразу на итоге недели. */
  onOpenDay: (missionId: string, phase?: StoryPhase) => void;
}) {
  const { t } = useI18n();
  const pastCases = storyPastCases(campaign, mission.id);

  /*
   * Полоса показывает свою неделю, а не всю кампанию: пять или шесть делений
   * (с 2026-09-14 у недель есть суббота) и один вопрос расследования. Со
   * второй недели список дней стал сквозным (последний день первой ведёт
   * в понедельник второй), и без этого среза полоса выросла бы до десятков
   * делений на 320 пикселях, а вопрос над ней остался бы один на разные
   * истории.
   */
  const week = storyWeekOf(campaign, mission.id);
  const days = week?.missions ?? campaign.missions;
  const dayIndex = days.findIndex((m) => m.id === mission.id);
  /*
   * Номер задания берётся у шага, а не у экрана: подводка и задание одного
   * шага — это один и тот же пункт дня, и счётчик между ними меняться
   * не должен. Иначе «задание 2 из 3» на подводке превращалось бы в «3 из 3»
   * при переходе к самой задаче, хотя человек не сделал ничего.
   */
  const stepIndex =
    phase.kind === 'intro' || phase.kind === 'task' || phase.kind === 'interlude' ? phase.step : null;
  const closing = phase.kind === 'reflection' || phase.kind === 'summary' || phase.kind === 'finish' || phase.kind === 'hook' || phase.kind === 'letter';

  return (
    <div className="story-progress">
      <p className="story-progress-case">
        <span className="story-progress-label">{t.storyMode.caseLabel}</span>
        <span className="story-progress-question">{week?.week.question ?? ''}</span>
      </p>

      {pastCases.length > 0 && (
        <details className="story-known story-progress-past">
          <summary className="story-known-title">{t.storyMode.pastCases}</summary>
          <ul>
            {pastCases.map((c) => (
              <li key={c.week.id}>
                <button type="button" onClick={() => onOpenDay(c.lastDayId, { kind: 'summary' })}>
                  <strong>{t.storyMode.weekShort(c.weekNumber)}</strong> — {c.week.question}
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="story-progress-track">
        <ol className="story-progress-days" aria-label={t.storyMode.dayAria(dayIndex + 1, days.length)}>
          {days.map((m, i) => {
            /*
             * Текущий день кнопкой не делается: она вела бы на бриф того же
             * дня, то есть выглядела бы как «начать заново» — а с середины
             * дня это читается как угроза потерять сделанное.
             */
            const openable = i !== dayIndex && openDayIds.has(m.id);
            /*
             * Имя кнопки — aria-label, а не title: «Ср» само по себе диктору
             * ничего не говорит, а title смысла не несёт вовсе.
             */
            return (
              <li
                key={m.id}
                className={i < dayIndex ? 'is-done' : i === dayIndex ? 'is-current' : 'is-ahead'}
                aria-current={i === dayIndex ? 'step' : undefined}
              >
                {openable ? (
                  <button type="button" onClick={() => onOpenDay(m.id)} aria-label={t.storyMode.dayBack(m.short)}>
                    {m.short}
                  </button>
                ) : (
                  m.short
                )}
              </li>
            );
          })}
        </ol>

        <p className="story-progress-step">
          {closing
            ? phase.kind === 'finish'
              ? t.storyMode.partDone
              : phase.kind === 'summary' || phase.kind === 'letter'
                ? storyClosesCampaign(campaign, mission.id)
                  ? t.storyMode.campaignDone
                  : t.storyMode.weekDone
                : t.storyMode.dayDone
            : stepIndex === null
              ? ''
              : t.storyMode.stepOf(stepIndex + 1, mission.steps.length)}
        </p>
      </div>
    </div>
  );
}
