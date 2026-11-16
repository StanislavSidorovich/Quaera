import type { ReactNode } from 'react';
import { Avatar } from './Avatar';
import { ClipButton } from './ClipButton';
import type { SpeakerId } from '../speakers';
import './storyMsg.css';

/**
 * Реплика брифа или разговора. Шапка: портрет, имя и роль, кнопка записи;
 * текст идёт под шапкой на всю ширину карточки (на телефоне колонка рядом с
 * портретом оставляла тексту узкую полосу). Рассказчик: шапка без портрета.
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
  const speaking = speakingExternal;
  return (
    <div className={'story-mode-msg story-msg' + (speaking ? ' story-mode-msg--speaking' : '')}>
      <div className="story-msg-head">
        <Avatar from={from} speaker={speaker} />
        <p className="story-mode-from story-msg-from">{from}</p>
        <ClipButton id={clipId} />
      </div>
      {children}
    </div>
  );
}
