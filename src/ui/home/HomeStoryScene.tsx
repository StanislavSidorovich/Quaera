import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/context';
import './homeStoryScene.css';

/*
 * Картинка текущей недели на рамке режима истории: заполняет пустое место под кнопкой,
 * когда блок «Где вы сейчас» рядом выше рамки. Файлы public/story читаем, не меняем.
 * Недели 1 и 1b: desk-morning, 2 и 2b: week-2, 3-5: week-N, прочие недели: без картинки.
 * Подписи нет, alt из i18n. Не загрузилась: место схлопывается, без битой иконки.
 * Тонкая щель (меньше THIN_PX) картинкой не заполняется: полоска из картинки хуже пустоты.
 */
const THIN_PX = 72;

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
  const [thin, setThin] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const file = weekId ? SCENE_FILE[weekId] : undefined;

  useEffect(() => {
    setFailed(false);
  }, [file]);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setThin(el.clientHeight < THIN_PX));
    ro.observe(el);
    return () => ro.disconnect();
  }, [file, failed]);

  if (!weekId || !file || failed) return null;
  const alt = file === 'desk-morning' ? t.home.spine.sceneDesk : (t.storyMode.weekScene[weekId.slice(0, 2)] ?? '');
  return (
    <div className={`hs-scene${thin ? ' thin' : ''}`} ref={ref}>
      <img
        src={`/story/${file}.webp`}
        alt={thin ? '' : alt}
        width={1376}
        height={768}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
