import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { STORY_STEP_SCENES } from '../storyScenes';
import './storyWeekScene.css';

/*
 * Сцена Gemini на шаге сюжета (манифест `storyScenes.ts`). Рамка и обрезка
 * те же, что у сцены недели (`.weekscene`). Нет записи или сбой загрузки
 * (офлайн без кеша): ничего не рисуем, текст шага на месте.
 */
export function StoryScenePhoto({ sceneKey }: { sceneKey: string }) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState(false);
  const s = STORY_STEP_SCENES[sceneKey];
  if (!s || failed) return null;
  return (
    <figure className="weekscene">
      <img
        src={`/story/${s.file}.webp`}
        alt={s.alt[locale]}
        width={1376}
        height={768}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </figure>
  );
}

export const hasStepScene = (sceneKey: string): boolean => sceneKey in STORY_STEP_SCENES;
