import { useI18n } from '../i18n/context';
import { storyCampaign, storyWeekOf } from '../content/storymode';
import './storyWeekArt.css';

/**
 * Рабочая неделя рисунком в шапке карточки кампании: пять дней, в каждом
 * мини-график своего вида (гистограмма, боксплот, линия, столбцы), в пятом
 * отметка «решение». Читается как «каждый день недели аналитик что-то
 * смотрит в данных, а к пятнице решает».
 *
 * **Графики схематичные, без чисел и осей**: это не данные Kaiyo, и рисунок
 * не должен выглядеть так, будто в нём можно что-то прочесть. Цифры дней
 * одинаковы на любом языке, поэтому подписей из i18n рисунок не требует.
 * Декор: `aria-hidden`, смысл несут заголовок и абзац рядом.
 *
 * Если кампания начата, текущий день недели выделен акцентом, пройденные
 * приглушены; недели длиннее пяти дней (суббота) показывают на пятом.
 * Цвета только из токенов темы, поэтому обе темы работают без отдельных правил.
 */
export function StoryWeekArt({ reachedId }: { reachedId: string | null }) {
  const { locale } = useI18n();
  const at = reachedId ? storyWeekOf(storyCampaign(locale), reachedId) : null;
  const dayIdx = at ? at.missions.findIndex((m) => m.id === reachedId) : -1;
  const now = dayIdx < 0 ? -1 : Math.min(dayIdx, 4);
  const state = (i: number) => (now < 0 ? '' : i < now ? ' done' : i === now ? ' now' : '');
  const x = (i: number) => i * 41;

  return (
    <svg className="week-art" viewBox="0 0 200 56" aria-hidden="true" focusable="false">
      {[0, 1, 2, 3, 4].map((i) => (
        <g key={i} className={`week-art-day${state(i)}`} transform={`translate(${x(i)} 0)`}>
          <rect className="week-art-panel" x="0.5" y="0.5" width="35" height="55" rx="7" />
          <text className="week-art-num" x="6" y="12">
            {i + 1}
          </text>
          {i === 0 && (
            <g className="week-art-fill">
              {[8, 16, 26, 18, 10].map((h, k) => (
                <rect key={k} x={6 + k * 5} y={48 - h} width="5" height={h} />
              ))}
            </g>
          )}
          {i === 1 && (
            <g className="week-art-line">
              <path d="M18 20V46M14 20H22M14 46H22" />
              <rect x="10" y="27" width="16" height="12" rx="1.5" />
              <path d="M10 33H26" />
            </g>
          )}
          {i === 2 && (
            <g className="week-art-line">
              <path d="M6 48H31" className="week-art-base" />
              <polyline points="6,44 13,36 20,40 27,26 31,22" />
            </g>
          )}
          {i === 3 && (
            <g className="week-art-fill">
              {[12, 24, 18].map((h, k) => (
                <rect key={k} x={7 + k * 10} y={48 - h} width="6" height={h} rx="1" />
              ))}
            </g>
          )}
          {i === 4 && (
            <g className="week-art-line week-art-decision">
              <circle cx="18" cy="34" r="11" />
              <path d="M12 34L16.5 38.5L24.5 29" />
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}
