import { useState } from 'react';
import { useI18n } from '../i18n/context';
import './storyWeekScene.css';

/*
 * Сцена первого дня недели 2-5 в истории: один раз над первой репликой
 * брифа, как рисунок в SellFigure. Файлы public/story/week-N.webp
 * (1376×768) лежат под /story/ и попадают в precache service worker
 * (postbuild-sw.mjs). Подписи нет, alt в t.storyMode.weekScene. У недели без
 * файла (w1, w1b, w2b) или при сбое загрузки (офлайн без кеша) рамка не
 * рисуется вовсе: пустая рамка с битой иконкой хуже, чем её отсутствие.
 */
const SCENE_WEEKS = new Set(['w2', 'w3', 'w4', 'w5']);

export const hasWeekScene = (week: string): boolean => SCENE_WEEKS.has(week);

export function StoryWeekScene({ week }: { week: string }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const alt = t.storyMode.weekScene[week];
  if (!SCENE_WEEKS.has(week) || !alt || failed) return null;
  return (
    <figure className="weekscene">
      <img
        src={`/story/week-${week.slice(1)}.webp`}
        alt={alt}
        width={1376}
        height={768}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </figure>
  );
}
