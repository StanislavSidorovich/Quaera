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

  /*
   * Оценка 2 (верно, но не с первого раза) обязана двигать интервал вперёд.
   * Раньше вторая ветка возвращала 2 при входе <= 2, а третья умножала
   * на ease * 0.7 — то есть при ease 1.3 давала 0.91 и после округления
   * тот же день. Навык, который человек стабильно решает верно со второй
   * попытки, не отпускал никогда: интервал вечно стоял на двух днях,
   * навык каждое занятие снова был просрочен и вытеснял новый материал.
   * Замер на симуляции: при занятиях раз в три дня человек застревал
   * на пяти навыках из девятнадцати и с четвёртого занятия ходил по кругу.
   *
   * Нижняя граница «+1 день» держит рост при любой лёгкости. Для оценок
   * 3 и 4 она недостижима (множитель там от 1.3), то есть ничего не меняет.
   */
  if (state.intervalDays === 0) next.intervalDays = grade === 2 ? 1 : 2;
  else if (state.intervalDays <= 2) next.intervalDays = grade === 2 ? 3 : 5;
  else
    next.intervalDays = Math.max(
      state.intervalDays + 1,
      Math.round(state.intervalDays * next.ease * (grade === 2 ? 0.7 : 1))
    );

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
 * У занятия состав, а не приоритет. Раньше здесь стояла приоритетная
 * очередь: сначала все просроченные повторения, потом что останется. При
 * пяти заданиях в занятии это означало, что человеку, набравшему пять
 * просроченных навыков, новый материал не показывался больше никогда.
 * Замер на симуляции (одинаково во всех четырёх треках): отвечающий верно,
 * но со второй попытки, проходил за пятнадцать занятий 5 навыков из 19
 * при занятиях раз в три дня и 9 из 19 через день — дальше круг из одних
 * повторений. Это выглядит как «бросил», а на деле продукт кончился.
 *
 * Поэтому два слота занятия зарезервированы: один под новый материал,
 * один под передышку. Повторения берут остальное — потолок, а не приоритет.
 *
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
  const take = (list: Skill[], limit: number) => {
    for (const s of list) {
      if (chosen.length >= limit) return;
      const t = pickFor(s.id);
      if (t && !chosen.some((c) => c.id === t.id)) {
        chosen.push(t);
        usedSkills.push(s.id);
      }
    }
  };

  /*
   * Передышка — задание, которое человек уже решал успешно, на навыке
   * с самым дальним сроком, то есть на самом уверенно освоенном из доступных.
   *
   * Определение выбрано замером, а не на слух. Напрашивавшееся «навык тронут,
   * а срок ещё впереди» не работает для того, ради кого передышка и заводится:
   * при интервалах в один-два дня и занятиях раз в три дня просрочено всегда
   * всё, таких навыков ноль во всех замеренных занятиях. Условие «и оценка
   * не ниже 3» отсекало бы его вторично: у отвечающего со второй попытки
   * оценка 2 — потолок. Уже решённое задание доступно всегда со второго
   * занятия и даёт то самое «я это умею», ради чего шаг и нужен.
   */
  const solvedFor = (skillId: string) => tasks.filter((t) => t.skill === skillId && solvedTaskIds.has(t.id));
  /*
   * Кандидаты в передышку — навыки, у которых срок ещё впереди и есть уже
   * решённое задание. Оценка в отбор не входит намеренно: условие «и не ниже
   * трёх» отсекало бы ровно того, ради кого шаг заводится, — у отвечающего
   * верно, но со второй попытки, оценка 2 потолок.
   *
   * Порядок — кого дольше не было. Ключ выбран после двух неудачных: и «самый
   * дальний срок», и «самая высокая освоенность» самоусиливаются, потому что
   * побывавший передышкой получает повторение и по обоим ключам уходит вперёд.
   * В замере это давало один и тот же навык восемь занятий подряд. По давности
   * всё наоборот: свежее касание отправляет навык в конец очереди, и передышка
   * идёт по кругу сама.
   *
   * Само наличие таких навыков у слабого обеспечено правкой интервала выше:
   * пока оценка 2 держала интервал на двух днях, просрочено было всегда всё,
   * и кандидатов не находилось ни в одном из двенадцати замеренных занятий.
   */
  const tomorrow = new Date(now.getTime() + DAY_MS);
  const restSkills = unlocked
    .filter(
      (s) =>
        (states[s.id]?.reps ?? 0) > 0 &&
        // Именно с запасом в сутки, а не просто `!isDue`. На интервале в один
        // день срок истекает прямо посреди занятия: в замере такой шаг вставал
        // последним и оказывался повторением впритык, а не отдыхом.
        !isDue(states[s.id], tomorrow) &&
        solvedFor(s.id).length > 0
    )
    .sort((a, b) => Date.parse(states[a.id].lastReviewedAt ?? '') - Date.parse(states[b.id].lastReviewedAt ?? ''));

  // Тело занятия — всё, кроме передышки: она приставляется последним шагом.
  const bodySize = restSkills.length ? size - 1 : size;

  // Потолок повторений. Ровно он оставляет место новому материалу; без него
  // цикл ниже не выполнялся бы ни разу, как только просроченных набирается
  // на целое занятие.
  take(due, Math.min(bodySize, Math.max(1, size - 2)));

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
  while (chosen.length < bodySize && introduced < maxNewSkills) {
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
  const topUp = (limit: number) => {
    if (chosen.length >= limit) return;
    const allowed = new Set([...satisfied, ...usedSkills]);
    const rest = tasks
      .filter(
        (t) =>
          allowed.has(t.skill) &&
          unlocked.some((s) => s.id === t.skill) &&
          !chosen.some((c) => c.id === t.id)
      )
      // Просроченные навыки в самом конце: потолок выше ограничивает отбор
      // по навыкам, но добор шёл мимо него и мог набрать то же самое ещё раз.
      .sort(
        (a, b) =>
          Number(isDue(states[a.skill], now)) - Number(isDue(states[b.skill], now)) ||
          Number(solvedTaskIds.has(a.id)) - Number(solvedTaskIds.has(b.id)) ||
          a.level - b.level
      );
    for (const t of rest) {
      if (chosen.length >= limit) break;
      chosen.push(t);
    }
  };
  topUp(bodySize);

  // Перебором, а не первым подходящим: у кандидата во главе очереди все
  // решённые задания могут уже стоять в занятии, и тогда передышка потерялась
  // бы при живых следующих кандидатах.
  let restStep: Task | undefined;
  for (const s of restSkills) {
    if (usedSkills.includes(s.id) || chosen.some((c) => c.skill === s.id)) continue;
    const free = solvedFor(s.id).filter((t) => !chosen.some((c) => c.id === t.id));
    if (!free.length) continue;
    restStep = free[Math.floor(Math.random() * free.length)];
    break;
  }
  if (!restStep) {
    // Все освоенные навыки заняты самим занятием — материал на исходе.
    // Тогда занятие обычной длины лучше короткого.
    topUp(size);
    return interleave(chosen);
  }
  // Последний шаг, а не средний: на нём человек решает, вернётся ли завтра.
  return [...interleave(chosen), restStep];
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
