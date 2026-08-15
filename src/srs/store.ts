import { initialSkillState, type Grade, type SkillState } from './scheduler';

/**
 * Локальное хранилище прогресса.
 *
 * Всё лежит на устройстве: аккаунт не нужен, приложение работает офлайн,
 * и никакие данные об обучении никуда не уходят. Версия схемы записана явно —
 * при изменении формата старый прогресс не должен молча ломать приложение.
 */

const KEY = 'quaera.progress.v1';

export interface TaskRecord {
  attempts: number;
  wrongAttempts: number;
  hintsUsed: number;
  solved: boolean;
  firstSolvedAt: string | null;
  lastAttemptAt: string;
}

export interface Progress {
  version: 1;
  skills: Record<string, SkillState>;
  taskRecords: Record<string, TaskRecord>;
  /** Даты сессий в формате YYYY-MM-DD — для серии дней подряд. */
  activeDays: string[];
  totalSolved: number;
  /**
   * Когда прогресс сбрасывали вручную; `null` — не сбрасывали ни разу.
   *
   * Одному устройству эта метка не нужна вовсе: сброс там и так стирает
   * всё. Она нужна слиянию копий (`sync/merge.ts`), у которого нет
   * операции удаления: без метки очищенное устройство получило бы весь
   * стёртый прогресс обратно с другого, и кнопка «Сбросить прогресс»
   * оказалась бы ложью. Поле добавлено без смены `version`: в старых
   * записях его просто нет, и `undefined` читается как «не сбрасывали»
   * — ровно то, что верно для прогресса, созданного до появления поля.
   */
  resetAt?: string | null;
}

export const emptyProgress = (): Progress => ({
  version: 1,
  skills: {},
  taskRecords: {},
  activeDays: [],
  totalSolved: 0,
  resetAt: null,
});

/**
 * Прогресс после ручного сброса: тот же пустой, но с меткой времени.
 * Отдельной функцией, а не параметром у `emptyProgress`, чтобы место
 * вызова читалось: «здесь сброс», а не «здесь пустой прогресс, но с датой».
 */
export const clearedProgress = (now = new Date()): Progress => ({
  ...emptyProgress(),
  resetAt: now.toISOString(),
});

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw) as Progress;
    if (parsed.version !== 1) return emptyProgress();
    return { ...emptyProgress(), ...parsed };
  } catch {
    // Повреждённое хранилище не должно мешать заниматься.
    return emptyProgress();
  }
}

export function saveProgress(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* приватный режим или переполнение — молча продолжаем в памяти */
  }
}

/**
 * Экспорт/импорт прогресса файлом — единственная страховка от потери данных
 * в приложении без бэкенда: `localStorage` живёт до первой очистки данных
 * сайта или переустановки PWA, и тогда несколько месяцев SRS-истории исчезают
 * без возможности восстановить. Формат — тот же JSON, что лежит в
 * localStorage, никакого отдельного файла-схемы не заводим: `version`
 * в самом объекте уже отличает валидный прогресс от чего угодно другого.
 */
export function exportProgress(p: Progress): string {
  return JSON.stringify(p, null, 2);
}

/** null — файл не похож на экспорт прогресса Querium (не тот JSON или version). */
export function parseImportedProgress(raw: string): Progress | null {
  try {
    const parsed = JSON.parse(raw) as Partial<Progress>;
    if (parsed.version !== 1 || typeof parsed !== 'object' || parsed === null) return null;
    return { ...emptyProgress(), ...parsed };
  } catch {
    return null;
  }
}

export const skillState = (p: Progress, id: string): SkillState => p.skills[id] ?? initialSkillState();

export const today = (d = new Date()): string => d.toISOString().slice(0, 10);

/** Серия: сколько дней подряд, заканчивая сегодняшним или вчерашним, были занятия. */
export function streak(activeDays: string[], now = new Date()): number {
  if (!activeDays.length) return 0;
  const set = new Set(activeDays);
  const cursor = new Date(now);
  if (!set.has(today(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(today(cursor))) return 0;
  }
  let n = 0;
  while (set.has(today(cursor))) {
    n += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return n;
}

export interface AttemptOutcome {
  taskId: string;
  skills: string[];
  correct: boolean;
  wrongAttempts: number;
  hintsUsed: number;
  grade: Grade;
}

/** Чистое обновление: новый объект прогресса, состояние навыков пересчитано планировщиком. */
export function applyAttempt(
  p: Progress,
  outcome: AttemptOutcome,
  reviewFn: (s: SkillState, g: Grade, now?: Date) => SkillState,
  now = new Date()
): Progress {
  const prevRecord = p.taskRecords[outcome.taskId];
  const record: TaskRecord = {
    attempts: (prevRecord?.attempts ?? 0) + 1,
    wrongAttempts: (prevRecord?.wrongAttempts ?? 0) + outcome.wrongAttempts,
    hintsUsed: (prevRecord?.hintsUsed ?? 0) + outcome.hintsUsed,
    solved: prevRecord?.solved || outcome.correct,
    firstSolvedAt: prevRecord?.firstSolvedAt ?? (outcome.correct ? now.toISOString() : null),
    lastAttemptAt: now.toISOString(),
  };

  const skills = { ...p.skills };
  for (const id of outcome.skills) {
    skills[id] = reviewFn(skillState(p, id), outcome.grade, now);
  }

  const day = today(now);
  const activeDays = p.activeDays.includes(day) ? p.activeDays : [...p.activeDays, day].slice(-400);

  return {
    ...p,
    skills,
    taskRecords: { ...p.taskRecords, [outcome.taskId]: record },
    activeDays,
    totalSolved: p.totalSolved + (outcome.correct && !prevRecord?.solved ? 1 : 0),
  };
}
