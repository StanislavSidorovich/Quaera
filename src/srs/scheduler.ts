import type { Skill, Task } from '../content/types';

/**
 * Планировщик повторений.
 *
 * Интервал назначается не заданию, а навыку. Причина в переносе: человек,
 * решивший конкретную задачу про топ-3 SKU, запомнил не её, а приём
 * «оконная функция в CTE, фильтр снаружи». Повторять нужно приём — и лучше
 * на другой задаче, иначе тренируется память на текст условия, а не навык.
 *
 * Формула — упрощённый SM-2. Полноценный FSRS требует истории в сотни
 * повторений, чтобы обучить параметры; на старте он не даст выигрыша,
 * а сложность добавит. Структура состояния оставлена совместимой, чтобы
 * замена алгоритма позже не потребовала миграции данных.
 */

export type Grade = 1 | 2 | 3 | 4;

export interface SkillState {
  /** Множитель роста интервала. Растёт на лёгких ответах, падает на трудных. */
  ease: number;
  /** Текущий интервал в днях. */
  intervalDays: number;
  /** Когда навык снова стоит потренировать, ISO-дата со временем. */
  dueAt: string;
  reps: number;
  lapses: number;
  lastGrade: Grade | null;
  lastReviewedAt: string | null;
}

export const DAY_MS = 86400000;
const MIN_EASE = 1.3;
const MAX_EASE = 2.8;

export function initialSkillState(): SkillState {
  return {
    ease: 2.5,
    intervalDays: 0,
    dueAt: new Date(0).toISOString(),
    reps: 0,
    lapses: 0,
    lastGrade: null,
    lastReviewedAt: null,
  };
}

/**
 * Оценка выводится из того, как решалась задача, а не спрашивается у человека.
 * Самооценка («легко / трудно») систематически завышена и ломает планирование.
 */
export function gradeFromAttempt(opts: { correct: boolean; wrongAttempts: number; hintsUsed: number }): Grade {
  if (!opts.correct) return 1;
  if (opts.wrongAttempts > 0) return 2;
  if (opts.hintsUsed > 0) return 3;
  return 4;
}

export function review(state: SkillState, grade: Grade, now = new Date()): SkillState {
  const next: SkillState = { ...state };
  next.reps += 1;
  next.lastGrade = grade;
  next.lastReviewedAt = now.toISOString();

  if (grade === 1) {
    // Провал: интервал сбрасывается, но накопленная лёгкость снижается мягко —
    // одна неудача не должна отбрасывать навык в исходное состояние.
    next.lapses += 1;
    next.ease = Math.max(MIN_EASE, state.ease - 0.2);
    next.intervalDays = 0;
    next.dueAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // вернуть в этой же сессии
    return next;
  }

  const easeDelta = grade === 2 ? -0.15 : grade === 3 ? 0 : 0.1;
  next.ease = Math.min(MAX_EASE, Math.max(MIN_EASE, state.ease + easeDelta));

  if (state.intervalDays === 0) next.intervalDays = grade === 2 ? 1 : 2;
  else if (state.intervalDays <= 2) next.intervalDays = grade === 2 ? 2 : 5;
  else next.intervalDays = Math.round(state.intervalDays * next.ease * (grade === 2 ? 0.7 : 1));

  next.intervalDays = Math.min(next.intervalDays, 180);
  next.dueAt = new Date(now.getTime() + next.intervalDays * DAY_MS).toISOString();
  return next;
}

/** 0 — не начат, 1 — уверенно освоен. Для полосок прогресса и разблокировки. */
export function mastery(state: SkillState | undefined): number {
  if (!state || state.reps === 0) return 0;
  const byInterval = Math.min(1, state.intervalDays / 21);
  const byGrade = (state.lastGrade ?? 1) / 4;
  return Math.round(Math.min(1, 0.35 * byGrade + 0.65 * byInterval) * 100) / 100;
}

export const isDue = (state: SkillState | undefined, now = new Date()): boolean =>
  !state || new Date(state.dueAt) <= now;

/** Навык считается доступным, если все его предпосылки хотя бы раз пройдены успешно. */
export function isUnlocked(skill: Skill, states: Record<string, SkillState>): boolean {
  return skill.prereqs.every((p) => (states[p]?.reps ?? 0) > 0 && (states[p]?.lastGrade ?? 0) >= 2);
}

export interface SelectionInput {
  skills: Skill[];
  tasks: Task[];
  states: Record<string, SkillState>;
  solvedTaskIds: Set<string>;
  /** Сколько заданий в сессии. */
  size?: number;
  /**
   * Сколько новых навыков вводить за одно занятие.
   *
   * Ограничение не про длину сессии, а про усвоение: каждый новый навык — это
   * ещё и карточка теории перед задачей, и пять незнакомых тем подряд
   * превращают занятие в чтение. Лучше меньше тем с большей практикой:
   * повторение всё равно вернёт их в следующие дни.
   */
  maxNewSkills?: number;
  now?: Date;
}

/**
 * Подбор сессии.
 *
 * Приоритет: сначала просроченные повторения, потом новый материал.
 * Внутри — перемешивание навыков: два задания подряд на один приём дают
 * иллюзию усвоения, потому что второе решается по образцу первого.
 */
export function selectSession({
  skills,
  tasks,
  states,
  solvedTaskIds,
  size = 5,
  maxNewSkills = 3,
  now = new Date(),
}: SelectionInput): Task[] {
  const unlocked = skills.filter((s) => isUnlocked(s, states));
  const due = unlocked.filter((s) => (states[s.id]?.reps ?? 0) > 0 && isDue(states[s.id], now));

  const pickFor = (skillId: string): Task | null => {
    const pool = tasks.filter((t) => t.skill === skillId);
    if (!pool.length) return null;
    // Нерешённые вперёд, дальше — по возрастанию сложности.
    const unsolved = pool.filter((t) => !solvedTaskIds.has(t.id)).sort((a, b) => a.level - b.level);
    if (unsolved.length) return unsolved[0];
    // Всё решено — берём для повторения то, что даёт другой угол на тот же навык.
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const chosen: Task[] = [];
  const usedSkills: string[] = [];
  const take = (list: Skill[]) => {
    for (const s of list) {
      if (chosen.length >= size) return;
      const t = pickFor(s.id);
      if (t && !chosen.some((c) => c.id === t.id)) {
        chosen.push(t);
        usedSkills.push(s.id);
      }
    }
  };

  take(due);

  // Новый материал берём разворачивая границу графа прямо внутри сессии:
  // скилл, взятый пять минут назад, считается пройденным для следующего.
  // Иначе за занятие открывался бы ровно один новый навык — первая сессия
  // состояла бы из одного задания, и весь смысл интервального повторения
  // пропадал бы за отсутствием материала.
  const satisfied = new Set(
    skills.filter((s) => (states[s.id]?.reps ?? 0) > 0 && (states[s.id]?.lastGrade ?? 0) >= 2).map((s) => s.id)
  );
  const byTier = [...skills].sort((a, b) => a.tier - b.tier);
  let introduced = 0;
  while (chosen.length < size && introduced < maxNewSkills) {
    const next = byTier.find(
      (s) =>
        !usedSkills.includes(s.id) &&
        !satisfied.has(s.id) &&
        s.prereqs.every((p) => satisfied.has(p) || usedSkills.includes(p))
    );
    if (!next) break;
    usedSkills.push(next.id);
    introduced += 1;
    const t = pickFor(next.id);
    if (t && !chosen.some((c) => c.id === t.id)) chosen.push(t);
  }

  // Добираем практикой по уже затронутым навыкам, а не новыми темами:
  // добор не должен обходить ограничение на количество нового за занятие.
  if (chosen.length < size) {
    const allowed = new Set([...satisfied, ...usedSkills]);
    const rest = tasks
      .filter(
        (t) =>
          allowed.has(t.skill) &&
          unlocked.some((s) => s.id === t.skill) &&
          !chosen.some((c) => c.id === t.id)
      )
      .sort((a, b) => Number(solvedTaskIds.has(a.id)) - Number(solvedTaskIds.has(b.id)) || a.level - b.level);
    for (const t of rest) {
      if (chosen.length >= size) break;
      chosen.push(t);
    }
  }

  return interleave(chosen);
}

/** Разносим задания одного навыка, насколько это возможно при данном наборе. */
function interleave(list: Task[]): Task[] {
  const out: Task[] = [];
  const rest = [...list];
  while (rest.length) {
    const prev = out[out.length - 1];
    let idx = rest.findIndex((t) => !prev || t.skill !== prev.skill);
    if (idx === -1) idx = 0;
    out.push(rest.splice(idx, 1)[0]);
  }
  return out;
}
