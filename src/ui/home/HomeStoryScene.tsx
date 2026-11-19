import { useEffect, useState } from 'react';
import { useI18n } from '../../i18n/context';
import './homeStoryScene.css';

/*
 * Картинка текущей недели рядом с текстом рамки режима истории (две колонки от 1180px,
 * если рамке хватает ширины; иначе полоса 120px, на телефоне её нет). Файлы public/story читаем, не меняем.
 * Недели 1 и 1b: desk-morning, 2 и 2b: week-2, 3-5: week-N, прочие недели: без картинки.
 * Подписи нет, alt из i18n. Нет файла у недели или не загрузилась: компонент ничего не рисует,
 * текстовая колонка занимает всю рамку (серой плашки не бывает).
 */
const SCENE_FILE: Record<string, string> = {
  w1: 'desk-morning',
  w1b: 'desk-morning',
  w2: 'week-2',
  w2b: 'week-2',
  w3: 'week-3',
  w4: 'week-4',
  w5: 'week-5',
};

export function HomeStoryScene({ weekId }: { weekId: string | undefined }) {
  const { t } = useI18n();
  const [failed, setFailed] = useState(false);
  const file = weekId ? SCENE_FILE[weekId] : undefined;

  useEffect(() => {
    setFailed(false);
  }, [file]);

  if (!weekId || !file || failed) return null;
  const alt = file === 'desk-morning' ? t.home.spine.sceneDesk : (t.storyMode.weekScene[weekId.slice(0, 2)] ?? '');
  return (
    <div className="hs-scene">
      <img
        src={`/story/${file}.webp`}
        alt={alt}
        width={1376}
        height={768}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
