import { useI18n } from '../i18n/context';
import { storyCampaign, storyWeekOf } from '../content/storymode';

/**
 * «Где вы сейчас» в карточке начатой кампании: недели чипами (пройдена, текущая,
 * впереди), вопрос текущей недели и три шага дня.
 *
 * Заняла место под кнопкой «Продолжить дело», где человеку, вернувшемуся
 * в кампанию, нечего было прочесть (2026-11-03). Всё берётся из кампании и
 * из отметки `reachedId`; нового состояния и нового контента нет.
 *
 * **Шаги дня без отметки «остановились здесь».** На главной известен только
 * достигнутый день, а где человек встал внутри него (бриф, задание, вывод),
 * хранит экран истории. Показать угаданную отметку хуже, чем показать три
 * шага как обещание того, что внутри дня.
 */
export function StoryWhereYouAre({ reachedId }: { reachedId: string }) {
  const { t, locale } = useI18n();
  const s = t.storyMode;
  const campaign = storyCampaign(locale);
  const at = storyWeekOf(campaign, reachedId);
  if (!at) return null;
  const nowIdx = campaign.weeks.findIndex((w) => w.id === at.week.id);
  const dayIdx = at.missions.findIndex((m) => m.id === reachedId);
  const day = at.missions[dayIdx];
  if (!day) return null;

  return (
    <section className="story-where" aria-label={s.whereTitle}>
      <p className="story-where-title">{s.whereTitle}</p>
      <ol className="story-where-weeks">
        {campaign.weeks.map((w, i) => {
          const state = i < nowIdx ? 'done' : i === nowIdx ? 'now' : 'ahead';
          return (
            <li
              key={w.id}
              className={`story-where-week ${state}`}
              aria-label={s.whereWeekAria(i + 1, state)}
              aria-current={state === 'now' ? 'step' : undefined}
            >
              {i + 1}
            </li>
          );
        })}
      </ol>
      <p className="story-where-now">{s.whereNow(nowIdx + 1, dayIdx + 1, at.missions.length)}</p>
      <p className="story-where-q">{at.week.question}</p>
      <ol className="story-where-steps" aria-label={s.whereStepsAria}>
        <li>{s.whereStepBrief}</li>
        <li>{s.whereStepTasks(day.steps.length)}</li>
        <li>{s.whereStepWrap}</li>
      </ol>
    </section>
  );
}
