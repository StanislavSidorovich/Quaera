import { useEffect, useState, useSyncExternalStore } from 'react';
import { useI18n } from '../i18n/context';
import { activeClipKey, clipFailed, getClipVersion, loadVoiceManifest, stopClips, subscribeClips, toggleClip, type VoiceClip } from '../voice';
import './clipButton.css';

/**
 * Кнопка записанной реплики (public/voice/, манифест по id «день/слот»).
 * Видна всем без флага, только в английской локали и только если у реплики
 * есть запись в манифесте. Запись грузится по нажатию, не раньше; играет одна
 * за раз; при уходе с экрана обрывается. Нет файла, нет сети или манифеста:
 * кнопка тихо не рисуется (ошибок в консоль не пишем).
 */
export function ClipButton({ id }: { id: string }) {
  const { t, locale } = useI18n();
  const [clip, setClip] = useState<VoiceClip | null>(null);
  useSyncExternalStore(subscribeClips, getClipVersion, getClipVersion);
  useEffect(() => {
    if (locale !== 'en') {
      setClip(null);
      return;
    }
    let live = true;
    void loadVoiceManifest().then((m) => {
      if (live) setClip(m.clips[id] ?? null);
    });
    return () => {
      live = false;
    };
  }, [id, locale]);
  useEffect(
    () => () => {
      if (activeClipKey() === id) stopClips();
    },
    [id],
  );
  if (locale !== 'en' || !clip || clipFailed(id)) return null;
  const playing = activeClipKey() === id;
  const dur = clip.duration ? ` ${Math.floor(clip.duration / 60)}:${String(Math.round(clip.duration % 60)).padStart(2, '0')}` : '';
  return (
    <button type="button" className="clip-btn" aria-pressed={playing} aria-label={playing ? t.storyMode.clipStop : t.storyMode.clipPlay} onClick={() => toggleClip(id, clip)}>
      <span aria-hidden="true">{playing ? '■' : '▶'}</span>
      <span aria-hidden="true">{playing ? t.storyMode.clipStop : dur.trim()}</span>
    </button>
  );
}
