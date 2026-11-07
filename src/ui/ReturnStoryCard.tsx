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
 *
 * Низкая: рисунок недели и «неделя N, день M» (или зов в пять недель) в одной
 * строке, под ней одна тихая строка о том, что ждёт в дне. Строка собрана из
 * кампании, а не написана руками: заголовок первого шага дня и число заданий.
 * Так человек видит, к чему возвращается, а правка кампании правит и её.
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
  const camp = storyCampaign(locale);
  let where: string | null = null;
  if (started && reachedId) {
    const at = storyWeekOf(camp, reachedId);
    if (at) {
      const weekIdx = camp.weeks.findIndex((w) => w.id === at.week.id);
      const dayIdx = at.missions.findIndex((m) => m.id === reachedId);
      if (weekIdx >= 0 && dayIdx >= 0) where = s.retWhere(weekIdx + 1, dayIdx + 1);
    }
  }
  const day = where ? camp.missions.find((m) => m.id === reachedId) : camp.missions[0];
  const next = day ? (where ? s.retNext : s.retFirst)(day.steps[0]?.intro?.title ?? null, day.steps.length) : null;
  return (
    <div className="card story-invite return-story" data-pair="storymode" data-guide="story">
      <h2>
        <span className="pair-ico" aria-hidden>
          <IconStory />
        </span>
        {s.retTitle}
      </h2>
      <div className="return-story-row">
        <StoryWeekArt reachedId={reachedId} />
        <div className="return-story-side">
          {where && <p className="return-story-where">{where}</p>}
          <button type="button" className="return-story-link" onClick={onOpen}>
            {where ? s.retContinue : s.retStart}
          </button>
        </div>
      </div>
      {next && <p className="muted return-story-next">{next}</p>}
    </div>
  );
}
