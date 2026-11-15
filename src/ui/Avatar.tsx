import { useI18n } from '../i18n/context';
import { avatarUrl } from '../avatars';
import { speakerId, type SpeakerId } from '../speakers';
import './avatar.css';

/**
 * Кружок персонажа рядом с репликой: портрет, если он лежит в манифесте
 * (src/avatars.ts), иначе инициалы на цвете персонажа. Рассказчику кружок
 * не рисуется. Декоративный по смыслу (имя уже напечатано рядом), но `alt`
 * и `aria-label` держат имя на случай, когда картинка заменила инициалы.
 */
export function Avatar({ from, speaker }: { from: string; speaker?: SpeakerId }) {
  const { t } = useI18n();
  const id = speaker ?? speakerId(from);
  if (id === 'narrator') return null;
  const url = avatarUrl(id);
  const name = t.avatar.names[id];
  return url ? (
    <img className="avatar" src={url} alt={name} width={40} height={40} loading="lazy" decoding="async" />
  ) : (
    <span className={`avatar avatar--${id}`} role="img" aria-label={name}>
      {t.avatar.initials[id]}
    </span>
  );
}
