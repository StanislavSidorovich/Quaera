import { useI18n } from '../i18n/context';
import type { StoryCampaign, StoryMission } from '../content/storymode';
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
 */
export function StoryProgress({
  campaign,
  mission,
  phase,
}: {
  campaign: StoryCampaign;
  mission: StoryMission;
  phase: StoryPhase;
}) {
  const { t } = useI18n();

  const dayIndex = campaign.missions.findIndex((m) => m.id === mission.id);
  /*
   * Номер задания берётся у шага, а не у экрана: подводка и задание одного
   * шага — это один и тот же пункт дня, и счётчик между ними меняться
   * не должен. Иначе «задание 2 из 3» на подводке превращалось бы в «3 из 3»
   * при переходе к самой задаче, хотя человек не сделал ничего.
   */
  const stepIndex = phase.kind === 'intro' || phase.kind === 'task' ? phase.step : null;
  const closing = phase.kind === 'reflection' || phase.kind === 'hook';

  return (
    <div className="story-progress">
      <p className="story-progress-case">
        <span className="story-progress-label">{t.storyMode.caseLabel}</span>
        <span className="story-progress-question">{campaign.question}</span>
      </p>

      <div className="story-progress-track">
        <ol className="story-progress-days" aria-label={t.storyMode.dayAria(dayIndex + 1, campaign.missions.length)}>
          {campaign.missions.map((m, i) => (
            <li
              key={m.id}
              className={i < dayIndex ? 'is-done' : i === dayIndex ? 'is-current' : 'is-ahead'}
              aria-current={i === dayIndex ? 'step' : undefined}
            >
              {m.short}
            </li>
          ))}
        </ol>

        <p className="story-progress-step">
          {closing
            ? t.storyMode.dayDone
            : stepIndex === null
              ? ''
              : t.storyMode.stepOf(stepIndex + 1, mission.steps.length)}
        </p>
      </div>
    </div>
  );
}
