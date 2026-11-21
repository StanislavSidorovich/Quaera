import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/context';
import { getClipVersion, loadVoiceManifest, localeClips, playAllActive, startPlayAll, stopClips, subscribeClips, type PlayAllItem, type SpokenLine } from '../voice';
import './clipButton.css';

/**
 * «Играть всё» над брифом: записи реплик экрана по очереди (public/voice/).
 * Видна всем без флага, в локалях с записями (en, ru) и только если у реплик
 * есть записи этой локали. Подсветку строки ведёт StoryMode через playAllIndex().
 * Уход с экрана или смена реплик обрывает игру.
 */
export function PlayAllButton({ lines }: { lines: SpokenLine[] }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState<PlayAllItem[]>([]);
  useSyncExternalStore(subscribeClips, getClipVersion, getClipVersion);
  const startedAt = useRef(0);
  const key = lines.map((l) => l.id ?? '').join('|');
  useEffect(() => {
    setItems([]);
    let live = true;
    void loadVoiceManifest().then((m) => {
      if (!live) return;
      const out: PlayAllItem[] = [];
      lines.forEach((l, i) => {
        const clip = l.id ? localeClips(m, locale)[l.id] : undefined;
        if (l.text.trim() && l.id && clip) out.push({ line: i, key: l.id, clip });
      });
      setItems(out);
    });
    return () => {
      live = false;
    };
  }, [key, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stopClips(), [key, locale]); /* смена языка обрывает игру */
  if (items.length === 0) return null;
  const playing = playAllActive();
  return (
    <button
      type="button"
      className="btn secondary play-all"
      aria-pressed={playing}
      onClick={() => {
        if (!playing) {
          startedAt.current = Date.now();
          startPlayAll(items);
        } else if (Date.now() - startedAt.current > 400) stopClips(); /* второй щелчок двойного не останавливает */
      }}
    >
      {playing ? t.storyMode.playAllStop : t.storyMode.playAll}
    </button>
  );
}
