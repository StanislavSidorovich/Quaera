import { useI18n } from '../i18n/context';
import { storyCampaign, storyWeekOf } from '../content/storymode';
import { IconStory } from './Sidebar';
import { StoryWeekArt } from './StoryWeekArt';

/**
 * Карточка режима истории в первой полосе главной вернувшегося на десктопе.
 *
 * Сюжет здесь рамка, а не главный путь (research/learning-evidence-2026-11/NOTES.md):
 * свой тон, как у карточки новичка, но без своей кнопки `.btn`. Основная кнопка
 * на экране одна, это кнопка занятия слева; сюда ведёт ссылка со стрелкой.
 * Начатая кампания называет неделю и день из `reachedId`, не начатая зовёт
 * в пять недель. Вместо прежней тихой строки под кнопкой занятия и прежней
 * `.story-invite-row` на десктопе: дублей сюжета на экране нет.
 */
export function ReturnStoryCard({
  reachedId,
  started,
  onOpen,
}: {
  reachedId: string | null;
  started: boolean;
  onOpen: () => void;
}) {
  const { t, locale } = useI18n();
  const s = t.storyMode;
  let where: string | null = null;
  if (started && reachedId) {
    const camp = storyCampaign(locale);
    const at = storyWeekOf(camp, reachedId);
    if (at) {
      const weekIdx = camp.weeks.findIndex((w) => w.id === at.week.id);
      const dayIdx = at.missions.findIndex((m) => m.id === reachedId);
      if (weekIdx >= 0 && dayIdx >= 0) where = s.retWhere(weekIdx + 1, dayIdx + 1);
    }
  }
  return (
    <div className="card story-invite return-story" data-pair="storymode" data-guide="story">
      <h2>
        <span className="pair-ico" aria-hidden>
          <IconStory />
        </span>
        {s.retTitle}
      </h2>
      <StoryWeekArt reachedId={reachedId} />
      {where && <p className="return-story-where">{where}</p>}
      <button type="button" className="return-story-link" onClick={onOpen}>
        {where ? s.retContinue : s.retStart}
      </button>
    </div>
  );
}
