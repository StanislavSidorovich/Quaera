import { useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { Avatar } from './Avatar';
import { ClipButton } from './ClipButton';
import type { SpeakerId } from '../speakers';
import { activeClipKey, getClipVersion, subscribeClips } from '../voice';
import './storyMsg.css';

/**
 * Реплика брифа или разговора. Шапка: портрет, имя и роль, кнопка записи;
 * текст идёт под шапкой на всю ширину карточки (на телефоне колонка рядом с
 * портретом оставляла тексту узкую полосу). Рассказчик: шапка без портрета.
 * Звучащая реплика подсвечена; если она вне экрана, окно мягко подходит к ней
 * один раз на смену реплики (прокрутку пользователя во время реплики не
 * перебиваем: следующий скролл случится только на следующей реплике).
 */
export function StoryMsg({
  from,
  speaker,
  clipId,
  speaking: speakingExternal,
  children,
}: {
  from: string;
  speaker?: SpeakerId;
  clipId: string;
  speaking: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSyncExternalStore(subscribeClips, getClipVersion, getClipVersion);
  const speaking = speakingExternal || activeClipKey() === clipId;
  useEffect(() => {
    if (!speaking) return;
    const el = ref.current;
    if (!el || typeof el.scrollIntoView !== 'function') return;
    let reduce = false;
    try {
      reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      // без matchMedia скроллим плавно
    }
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [speaking]);
  return (
    <div ref={ref} className={'story-mode-msg story-msg' + (speaking ? ' story-mode-msg--speaking' : '')}>
      <div className="story-msg-head">
        <Avatar from={from} speaker={speaker} />
        <p className="story-mode-from story-msg-from">{from}</p>
        <ClipButton id={clipId} />
      </div>
      {children}
    </div>
  );
}
