import { appStorage } from './guestMode';

/**
 * Контраст текста: «Обычный», «Темнее», «Максимум». Три уровня вместо ползунка
 * (просьба хозяина 2026-11-19): токены --text и --text-dim переопределяет
 * contrast.css по атрибуту data-contrast на <html>. Выбор лежит в localStorage
 * `quaera.contrast`. Пока человек не выбрал, при системном `prefers-contrast: more`
 * включается «Темнее»; явный выбор «Обычный» побеждает системную настройку.
 */
export type Contrast = 'standard' | 'darker' | 'max';
export const CONTRASTS: readonly Contrast[] = ['standard', 'darker', 'max'];
export const CONTRAST_STORAGE_KEY = 'quaera.contrast';

const isContrast = (v: unknown): v is Contrast => v === 'standard' || v === 'darker' || v === 'max';

/** Что включено, пока выбора нет. Без matchMedia (старый браузер, тест) это «Обычный». */
export function defaultContrast(): Contrast {
  try {
    return window.matchMedia('(prefers-contrast: more)').matches ? 'darker' : 'standard';
  } catch {
    return 'standard';
  }
}

export function initialContrast(): Contrast {
  try {
    const stored = appStorage().getItem(CONTRAST_STORAGE_KEY);
    if (isContrast(stored)) return stored;
  } catch {
    // localStorage недоступен: выбор не запоминается, действует умолчание
  }
  return defaultContrast();
}

export function applyContrast(value: Contrast): void {
  document.documentElement.setAttribute('data-contrast', value);
}

export function storeContrast(value: Contrast | null): void {
  try {
    if (value === null) appStorage().removeItem(CONTRAST_STORAGE_KEY);
    else appStorage().setItem(CONTRAST_STORAGE_KEY, value);
  } catch {
    // см. initialContrast
  }
}
