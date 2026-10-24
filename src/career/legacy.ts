import { appStorage } from '../guestMode';
import { saveProgress, type Progress } from '../srs/store';
import { DEFAULT_ROLE, parseCareer, type CareerState } from './store';

/**
 * Одноразовый перенос состояния экрана «Путь к роли» из `quaera.career.v1`
 * (фаза 2: роль, список отметок, снимки, только на этом устройстве)
 * в поле `career` прогресса.
 *
 * У старого формата нет меток времени, поэтому отметки получают момент
 * переноса: для слияния это «поставлено сейчас», и снять их потом
 * на другом устройстве можно обычным порядком. Роль получает метку,
 * только если её выбирали (отличается от роли по умолчанию): иначе
 * неизменённая роль по умолчанию на одном устройстве перебила бы
 * выбранную руками на другом.
 */

const LEGACY_KEY = 'quaera.career.v1';

interface LegacyCareerState {
  version: 1;
  role?: unknown;
  checked?: unknown;
  weekly?: unknown;
}

/** Старое состояние в новом формате или `null`, если переносить нечего. */
function readLegacyCareer(now: Date): CareerState | null {
  try {
    const raw = appStorage().getItem(LEGACY_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LegacyCareerState;
    if (!p || p.version !== 1) return null;
    const at = now.toISOString();
    const role = typeof p.role === 'string' ? p.role : DEFAULT_ROLE;
    const checked = Array.isArray(p.checked) ? p.checked.filter((x): x is string => typeof x === 'string') : [];
    return (
      parseCareer({
        role,
        roleAt: role !== DEFAULT_ROLE ? at : null,
        checks: Object.fromEntries(checked.map((id) => [id, { on: true, at }])),
        weekly: p.weekly,
      }) ?? null
    );
  } catch {
    return null;
  }
}

/**
 * Старый ключ удаляется после переноса, а не остаётся «на всякий случай»:
 * сброс прогресса стирает поле `career`, и оставленный ключ при следующей
 * загрузке перенёсся бы заново, вернув стёртые отметки.
 */
function dropLegacyCareer(): void {
  try {
    appStorage().removeItem(LEGACY_KEY);
  } catch {
    // хранилище не даёт писать: тогда и прогресс не сохранился, перенос повторится в следующий раз
  }
}

/**
 * Прогресс с перенесённым состоянием экрана. Вызывается один раз при загрузке
 * прогресса. Перенос пишется сразу, до удаления старого ключа: удалить ключ
 * раньше, чем новое состояние легло на диск, значит рискнуть потерять отметки.
 */
export function withLegacyCareer(p: Progress, now = new Date()): Progress {
  if (p.career) return p;
  const career = readLegacyCareer(now);
  if (!career) return p;
  const next = { ...p, career };
  saveProgress(next);
  dropLegacyCareer();
  return next;
}
