import type { SpeakerId } from './speakers';

/**
 * Портреты персонажей режима истории.
 *
 * Манифест в коде, а не проба сети: офлайн-PWA не должна дёргать 404 на
 * каждую реплику. Файл лежит в `public/avatars/<id>.webp` (256×256). Положили
 * файл: добавьте id сюда, и он показывается вместо кружка с инициалами.
 * Рассказчик без лица: для него кружка нет.
 */
export const AVATAR_IMAGES: ReadonlySet<SpeakerId> = new Set<SpeakerId>([]);

export const avatarUrl = (id: SpeakerId): string | null =>
  AVATAR_IMAGES.has(id) ? `${import.meta.env.BASE_URL}avatars/${id}.webp` : null;
