/**
 * Готовность к роли: навык → уровень → ось → роль.
 *
 * Экран «Путь к роли» отвечает на вопрос «насколько я готов к собеседованию
 * на BI-аналитика», и ответ обязан опираться на то, что человек сделал,
 * а не на то, что он о себе думает. Самооценка у начинающих систематически
 * завышена (та же причина, по которой `gradeFromAttempt` выводит оценку
 * из попытки, а не спрашивает). Поэтому уровень навыка читается из того же
 * SRS-состояния, которое уже ведёт планировщик, и ничего нового тренажёр
 * для этого не записывает.
 *
 * Модуль без импортов и без данных: оси, роли и доказательства приходят
 * аргументами (их держит `content/career.json`). Так формулу можно
 * проверить фикстурами в `test:career`, не поднимая паки и локали.
 */

export type Level = 0 | 1 | 2 | 3;

export type AxisId = 'sql' | 'modeling' | 'bi' | 'python' | 'stats' | 'engineering' | 'business' | 'process';

export const AXES: AxisId[] = ['sql', 'modeling', 'bi', 'python', 'stats', 'engineering', 'business', 'process'];

/** Ровно те поля SkillState, которые нужны формуле, — чтобы модуль не тянул планировщик. */
export interface SkillSignal {
  reps: number;
  lapses: number;
  lastGrade: 1 | 2 | 3 | 4 | null;
  intervalDays: number;
}

export interface AxisDef {
  id: AxisId;
  /** Навыки тренажёра, из которых считается ось. Один навык может стоять в двух осях. */
  skills: string[];
  /**
   * Выше какого уровня тренажёр эту ось поднять не может.
   *
   * Четыре задания на качество данных не делают человека инженером данных,
   * а разбор сезонности не равен A/B-тесту на собеседовании. Где тренажёр
   * покрывает ось краешком (статистика, инженерия, процессы), его вклад
   * ограничен единицей, а дальше ось поднимают только доказательства.
   */
  trainerMax: Level;
}

export interface EvidenceDef {
  id: string;
  axis: AxisId;
  /** Какой уровень оси засчитывает отметка. */
  level: 1 | 2 | 3;
}

export interface RoleDef {
  id: string;
  /** Целевой уровень junior по каждой из восьми осей; 0 — ось роли не нужна. */
  targets: Record<AxisId, Level>;
  /** Ядро роли: без единицы по этим осям человек ещё в «знакомстве», что бы ни было по остальным. */
  core: AxisId[];
}

/** Доля навыков оси, которая должна дойти до уровня, чтобы ось его получила. */
export const AXIS_SHARE = 0.7;

/**
 * С какого интервала навык считается «держится без подсказки».
 *
 * Интервал растёт только на успехе в другой присест (полсуток и больше,
 * см. SAME_SITTING_MS в планировщике): первый успех даёт 2 дня, успех
 * в следующий раз — 5. Значит, 5 дней = навык решён и потом ещё раз
 * решён после паузы. Вместе с последней оценкой 4 (без ошибок и без
 * подсказок) это и есть «решаю сам и помню».
 */
export const RETAINED_INTERVAL_DAYS = 5;

/**
 * Уровень навыка: 0 — не решён ни разу, 1 — решён хотя бы раз (с подсказкой
 * тоже), 2 — решён без подсказки и пережил повторение после паузы.
 *
 * Третьего уровня у навыка нет: «решаю незнакомое» тренажёр не меряет,
 * задания в нём знакомые по определению. Тройку даёт только доказательство.
 *
 * Успехи считаются как reps − lapses: каждая попытка увеличивает reps,
 * каждая неудача ещё и lapses. Провал после успеха сбрасывает интервал,
 * но не отменяет того, что навык однажды был решён, поэтому единица
 * остаётся, а двойка уходит до следующего успеха без подсказки.
 */
export function skillLevel(s: SkillSignal | undefined): 0 | 1 | 2 {
  if (!s || s.reps - s.lapses < 1) return 0;
  if (s.lastGrade === 4 && s.intervalDays >= RETAINED_INTERVAL_DAYS) return 2;
  return 1;
}

export interface AxisReading {
  axis: AxisId;
  level: Level;
  /** Уровень по одному тренажёру, уже с потолком `trainerMax`. */
  trainerLevel: Level;
  /** Сколько навыков оси дошли до 1 и до 2 — для подписи «14 из 20». */
  atLeast1: number;
  atLeast2: number;
  total: number;
  /** Отмеченные доказательства, которые засчитались, и те, что упёрлись в потолок. */
  evidenceCounted: string[];
  evidenceCapped: string[];
}

function trainerAxisLevel(def: AxisDef, signals: Record<string, SkillSignal | undefined>) {
  const levels = def.skills.map((id) => skillLevel(signals[id]));
  const total = levels.length;
  const atLeast1 = levels.filter((l) => l >= 1).length;
  const atLeast2 = levels.filter((l) => l >= 2).length;
  const need = Math.ceil(total * AXIS_SHARE);
  const raw: Level = total > 0 && atLeast2 >= need ? 2 : total > 0 && atLeast1 >= need ? 1 : 0;
  return { level: Math.min(raw, def.trainerMax) as Level, atLeast1, atLeast2, total };
}

/**
 * Уровень оси: больший из тренажёрного и доказательств.
 *
 * Доказательство — это галочка, которую человек ставит сам, то есть та же
 * самооценка в другой форме. Там, где тренажёр ось меряет (`trainerMax` ≥ 2),
 * галочка поднимает ось не больше чем на ступень выше замера: отметка
 * «решил 10 задач medium» при нуле в SQL-треке даёт единицу, а не тройку.
 * Где тренажёр ось почти не видит, галочке верим целиком: проверить её
 * всё равно нечем, а без неё ось навсегда осталась бы пустой.
 */
export function axisReading(
  def: AxisDef,
  signals: Record<string, SkillSignal | undefined>,
  evidence: EvidenceDef[],
  checked: ReadonlySet<string>
): AxisReading {
  const t = trainerAxisLevel(def, signals);
  const cap: Level = def.trainerMax >= 2 ? (Math.min(3, t.level + 1) as Level) : 3;
  let level: Level = t.level;
  const evidenceCounted: string[] = [];
  const evidenceCapped: string[] = [];
  for (const e of evidence) {
    if (e.axis !== def.id || !checked.has(e.id)) continue;
    if (e.level > cap) evidenceCapped.push(e.id);
    else evidenceCounted.push(e.id);
    level = Math.max(level, Math.min(e.level, cap)) as Level;
  }
  return { axis: def.id, level, trainerLevel: t.level, atLeast1: t.atLeast1, atLeast2: t.atLeast2, total: t.total, evidenceCounted, evidenceCapped };
}

/**
 * Полоса готовности. Не процент: «67% готов» звучит точнее, чем формула
 * способна обещать, а полоса прямо говорит, что это ступень.
 *
 * - start — знакомство: по ядру роли ещё не везде единица;
 * - prejunior — ядро везде хотя бы на единице и закрыта половина целей;
 * - nearly — цели ядра закрыты целиком (и половина всех целей);
 * - ready — закрыты все цели и хотя бы одна ось на тройке, то есть
 *   есть сделанная своими руками работа, о которой можно рассказать.
 */
export type Band = 'start' | 'prejunior' | 'nearly' | 'ready';

export interface Gap {
  axis: AxisId;
  have: Level;
  need: Level;
  /**
   * Навыки оси ниже нужного уровня, по порядку выдачи (tier, затем порядок оси),
   * не больше трёх: экран показывает их кнопками «потренировать».
   * Пусто, если нужный уровень выше того, что тренажёр способен засчитать.
   */
  skills: string[];
  /** Неотмеченные доказательства этой оси, которые закрыли бы разрыв. */
  evidence: string[];
}

export interface RoleReadiness {
  role: string;
  axes: (AxisReading & { target: Level; met: boolean })[];
  met: number;
  /** Сколько осей у роли вообще с целью (target > 0). */
  total: number;
  band: Band;
  gaps: Gap[];
}

export function roleReadiness(
  role: RoleDef,
  axes: AxisDef[],
  signals: Record<string, SkillSignal | undefined>,
  evidence: EvidenceDef[],
  checked: ReadonlySet<string>,
  skillTier: (id: string) => number = () => 1
): RoleReadiness {
  const readings = axes.map((def) => {
    const r = axisReading(def, signals, evidence, checked);
    const target = role.targets[def.id];
    return { ...r, target, met: r.level >= target };
  });
  const withTarget = readings.filter((r) => r.target > 0);
  const met = withTarget.filter((r) => r.met).length;
  const total = withTarget.length;
  const byAxis = new Map(readings.map((r) => [r.axis, r]));
  const coreReadings = role.core.map((a) => byAxis.get(a)!);

  let band: Band = 'start';
  if (coreReadings.every((r) => r.level >= 1) && met * 2 >= total) band = 'prejunior';
  if (band === 'prejunior' && coreReadings.every((r) => r.met)) band = 'nearly';
  if (met === total && readings.some((r) => r.level === 3)) band = 'ready';

  const gaps: Gap[] = [];
  for (const r of readings) {
    if (r.met) continue;
    const def = axes.find((a) => a.id === r.axis)!;
    const trainerNeed = Math.min(r.target, def.trainerMax);
    const skills =
      r.trainerLevel < trainerNeed
        ? def.skills
            .map((id, i) => ({ id, i, tier: skillTier(id) }))
            .filter((s) => skillLevel(signals[s.id]) < trainerNeed)
            .sort((a, b) => a.tier - b.tier || a.i - b.i)
            .slice(0, 3)
            .map((s) => s.id)
        : [];
    const ev = evidence.filter((e) => e.axis === r.axis && !checked.has(e.id) && e.level >= r.target).map((e) => e.id);
    gaps.push({ axis: r.axis, have: r.level, need: r.target, skills, evidence: ev });
  }
  // Сначала ядро роли, потом остальное; внутри — по величине разрыва.
  const isCore = (a: AxisId) => (role.core.includes(a) ? 0 : 1);
  gaps.sort((a, b) => isCore(a.axis) - isCore(b.axis) || b.need - b.have - (a.need - a.have));

  return { role: role.id, axes: readings, met, total, band, gaps };
}
