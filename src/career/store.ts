import { appStorage } from '../guestMode';
import { AXES, type AxisId, type Level } from './readiness';

/**
 * Временное хранилище экрана «Путь к роли»: выбранная роль, отметки-доказательства
 * и недельные снимки уровней осей.
 *
 * По образцу session/store.ts: свой ключ, своя версия, повреждённая запись
 * заменяется пустой. Лежит отдельно от прогресса и в слияние через Supabase
 * пока не входит (это фаза 3): отметки живут только на этом устройстве.
 */

const KEY = 'quaera.career.v1';

export const DEFAULT_ROLE = 'bi';

/** Снимок старше этого возраста заменяется новым при открытии экрана. */
export const SNAPSHOT_EVERY_DAYS = 7;
const SNAPSHOT_LIMIT = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AxisLevels = Record<AxisId, Level>;

export interface WeeklySnapshot {
  /** ISO-дата со временем: по ней считается возраст снимка. */
  date: string;
  levels: AxisLevels;
}

export interface CareerState {
  version: 1;
  role: string;
  checked: string[];
  weekly: WeeklySnapshot[];
}

export const emptyCareerState = (): CareerState => ({ version: 1, role: DEFAULT_ROLE, checked: [], weekly: [] });

function isLevels(v: unknown): v is AxisLevels {
  if (!v || typeof v !== 'object') return false;
  return AXES.every((a) => {
    const n = (v as Record<string, unknown>)[a];
    return typeof n === 'number' && n >= 0 && n <= 3;
  });
}

export function loadCareerState(): CareerState {
  try {
    const raw = appStorage().getItem(KEY);
    if (!raw) return emptyCareerState();
    const p = JSON.parse(raw) as Partial<CareerState>;
    if (p.version !== 1) return emptyCareerState();
    return {
      version: 1,
      role: typeof p.role === 'string' ? p.role : DEFAULT_ROLE,
      checked: Array.isArray(p.checked) ? p.checked.filter((x): x is string => typeof x === 'string') : [],
      weekly: Array.isArray(p.weekly)
        ? p.weekly.filter((w): w is WeeklySnapshot => !!w && typeof w.date === 'string' && isLevels(w.levels))
        : [],
    };
  } catch {
    return emptyCareerState();
  }
}

export function saveCareerState(s: CareerState): void {
  try {
    appStorage().setItem(KEY, JSON.stringify(s));
  } catch {
    // приватный режим или переполнение: отметки остаются жить только в памяти вкладки
  }
}

/**
 * Дописывает снимок, если последнего нет или ему не меньше семи дней.
 * Возвращает тот же массив, если писать нечего, — по ссылке видно, менялось ли что-то.
 */
export function withWeeklySnapshot(weekly: WeeklySnapshot[], levels: AxisLevels, now: Date): WeeklySnapshot[] {
  const last = weekly[weekly.length - 1];
  const age = last ? now.getTime() - new Date(last.date).getTime() : Infinity;
  if (last && !(age >= SNAPSHOT_EVERY_DAYS * DAY_MS)) return weekly;
  return [...weekly, { date: now.toISOString(), levels }].slice(-SNAPSHOT_LIMIT);
}

export interface AxisChange {
  axis: AxisId;
  from: Level;
  to: Level;
}

/**
 * Что изменилось с прошлого снимка. Сравнивается с предпоследним снимком:
 * последний только что записан (или записан на этой неделе) и отражает
 * сегодняшнее состояние. Первый снимок сравнивать не с чем, возвращается null.
 */
export function weeklyChanges(weekly: WeeklySnapshot[], now: AxisLevels): AxisChange[] | null {
  if (weekly.length < 2) return null;
  const base = weekly[weekly.length - 2].levels;
  return AXES.filter((a) => now[a] !== base[a]).map((a) => ({ axis: a, from: base[a], to: now[a] }));
}
