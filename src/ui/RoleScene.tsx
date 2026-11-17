import { useState } from 'react';
import { useI18n } from '../i18n/context';
import { ROLE_SCENES, roleSceneUrl } from '../roleScenes';
import './roleScene.css';

/*
 * Сцена роли: шапка страницы роли (`variant="hero"`) или миниатюра в плитке
 * обзора (`variant="thumb"`). Роль без файла (ds, пока нет) или сбой загрузки
 * (офлайн без кеша): ничего не рисуем, раскладка как до картинок.
 */
export function RoleScene({ id, variant }: { id: string; variant: 'hero' | 'thumb' }) {
  const { locale } = useI18n();
  const [failed, setFailed] = useState(false);
  const scene = ROLE_SCENES[id];
  const src = roleSceneUrl(id);
  if (!scene || !src || failed) return null;
  const thumb = variant === 'thumb';
  return (
    <figure className={`rolescene rolescene-${variant}`}>
      <img
        src={src}
        alt={thumb ? '' : scene.alt[locale]}
        width={thumb ? 72 : 1200}
        height={thumb ? 72 : 670}
        loading="lazy"
        decoding="async"
        style={thumb ? { objectPosition: `${scene.x}% 50%` } : undefined}
        onError={() => setFailed(true)}
      />
    </figure>
  );
}
