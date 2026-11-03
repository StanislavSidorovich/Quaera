import { useI18n } from '../i18n/context';
import { storyCampaign } from '../content/storymode';

/**
 * Первый день кампании тремя строками в карточке новичка: утром вопрос
 * заказчика, днём задания, вечером находка.
 *
 * Стоит в левой колонке под кнопкой, где рядом с высоким окном задания
 * оставалась пустота (2026-11-03). Вместо фотографии «день аналитика»:
 * сток не говорит ничего о продукте, а эти строки отвечают на вопрос
 * новичка «что меня ждёт после кнопки».
 *
 * **Текст не скопирован, а взят из кампании**: время из `place`, вопрос
 * недели, число заданий и `found` первого дня. Правка кампании меняет
 * и эти строки, второго источника правды нет.
 */
export function DayOnePreview() {
  const { t, locale } = useI18n();
  const s = t.storyMode;
  const campaign = storyCampaign(locale);
  const day = campaign.missions[0];
  const week = campaign.weeks.find((w) => w.id === day?.week);
  const client = day?.messages[0];
  if (!day || !week || !client) return null;
  const time = day.place.match(/\d{1,2}:\d{2}/)?.[0];

  return (
    <figure className="day-one" aria-label={s.dayOneTitle}>
      <figcaption className="day-one-title">{s.dayOneTitle}</figcaption>
      <ol className="day-one-steps">
        <li>
          <span className="day-one-time">{time}</span>
          <span className="day-one-who">{client.from}</span>
          <span className="day-one-text">{week.question}</span>
        </li>
        <li>
          <span className="day-one-time">{s.dayOneDay}</span>
          <span className="day-one-text">{s.dayOneTasks(day.steps.length)}</span>
        </li>
        <li>
          <span className="day-one-time">{s.dayOneEvening}</span>
          <span className="day-one-who">{s.dayOneFound}</span>
          <span className="day-one-text">{day.found}</span>
        </li>
      </ol>
    </figure>
  );
}
