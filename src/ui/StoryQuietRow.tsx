import { useI18n } from '../i18n/context';
import { storyCampaign, storyWeekOf } from '../content/storymode';
import { IconStory } from './Sidebar';
import { StoryWeekArt } from './StoryWeekArt';

/**
 * Тихая строка режима истории под кнопкой занятия у вернувшегося на десктопе.
 *
 * Карточка кампании у него скрыта (см. `.story-invite-row` в styles.css), а
 * вернуть её сверху значило бы снова отодвинуть кнопку занятия за сгиб.
 * Здесь это ссылка-строка без рамки и фона, ниже кнопки: правило «кнопка
 * занятия выше сгиба» цело, а дорога в сюжет с главной есть.
 * Начатая кампания называет неделю и день из `reachedId`, не начатая зовёт
 * в пять недель. На телефоне строка скрыта: там своя `.story-invite-row`.
 */
export function StoryQuietRow({ reachedId, onOpen }: { reachedId: string | null; onOpen: () => void }) {
  const { t, locale } = useI18n();
  const s = t.storyMode;
  let label: string = s.quietStart;
  if (reachedId) {
    const at = storyWeekOf(storyCampaign(locale), reachedId);
    if (at) {
      const weekIdx = storyCampaign(locale).weeks.findIndex((w) => w.id === at.week.id);
      const dayIdx = at.missions.findIndex((m) => m.id === reachedId);
      if (weekIdx >= 0 && dayIdx >= 0) label = s.quietResume(weekIdx + 1, dayIdx + 1);
    }
  }
  return (
    <button type="button" className="story-quiet-row" onClick={onOpen}>
      {/* Рисунок недели из карточки новичка в малом виде: по выделенному дню видно, где человек в кампании. */}
      <StoryWeekArt reachedId={reachedId} />
      <span className="story-quiet-label">
        <span className="pair-ico" aria-hidden>
          <IconStory />
        </span>
        <span>{label}</span>
        <span aria-hidden>→</span>
      </span>
    </button>
  );
}
