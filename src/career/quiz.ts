/**
 * Самопроверка «Пути к роли»: вопросы с вариантами по осям, которые
 * тренажёр почти не меряет (статистика, инженерия, процессы).
 *
 * Зачёт — это отметка-доказательство уровня 1, но ставит её не человек,
 * а история подходов. Поэтому в `checks` она не пишется: галочку там можно
 * поставить руками, а тест существует ровно затем, чтобы заменить
 * самооценку. Источник правды один — список подходов в `career.quiz`,
 * и формула получает засчитанные отметки функцией `passedQuizEvidence`.
 *
 * Правило зачёта повторяет уровень 2 навыка: одного удачного раза мало,
 * знание должно пережить паузу. Сданный подход — 8 из 10; засчитан тест
 * после второго сданного подхода не раньше чем через три дня после первого.
 * Подход на ось один в календарный день, сдан он или нет: иначе разборы
 * после ответов превращают тест в перебор.
 *
 * Модуль без импортов в рантайме: его проверяют `test:career` и `test:merge`.
 */
import type { AxisId } from './readiness';

/** Вопросов в подходе. */
export const QUIZ_SIZE = 10;
/** Сколько верных ответов нужно, чтобы подход считался сданным. */
export const QUIZ_PASS = 8;
/** Минимальная пауза между первым и вторым сданным подходом. */
export const QUIZ_GAP_DAYS = 3;
/** Сколько последних подходов на ось хранится и едет на второе устройство. */
export const QUIZ_KEEP = 20;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface QuizAttempt {
  axis: AxisId;
  /** ISO-дата конца подхода; вместе с осью это ключ подхода при слиянии. */
  at: string;
  /** id заданных вопросов в порядке показа. */
  asked: string[];
  /** id вопросов, на которые ответил неверно. */
  wrong: string[];
}

export const attemptScore = (a: QuizAttempt) => a.asked.length - a.wrong.length;

/**
 * Сданный подход: полный (не короче QUIZ_SIZE) и с порогом. Неполный
 * подход бывает, пока банк оси меньше десяти вопросов, и зачётным быть
 * не должен: 5 из 5 проще, чем 8 из 10.
 */
export const isPassingAttempt = (a: QuizAttempt) => a.asked.length >= QUIZ_SIZE && attemptScore(a) >= QUIZ_PASS;

/** Календарный день по локальному времени: «один подход в день» значит день человека, а не UTC. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface QuizStatus {
  /** Засчитанных сданных подходов: 0, 1 или 2 (второй — только после паузы). */
  passes: 0 | 1 | 2;
  passed: boolean;
  /** С какого момента сданный подход станет вторым зачётным; null, если не ждём. */
  secondFrom: Date | null;
  /** Можно ли начать подход сейчас (сегодня ещё не было). */
  canStart: boolean;
  /** Когда можно следующий подход, если сегодня уже был. */
  nextAt: Date | null;
}

export function quizStatus(attempts: QuizAttempt[], axis: AxisId, now: Date): QuizStatus {
  const mine = attempts.filter((a) => a.axis === axis).sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  const passing = mine.filter(isPassingAttempt);
  const first = passing[0];
  const from = first ? new Date(new Date(first.at).getTime() + QUIZ_GAP_DAYS * DAY_MS) : null;
  const second = from ? passing.find((a) => new Date(a.at).getTime() >= from.getTime()) : undefined;
  const passes: 0 | 1 | 2 = second ? 2 : first ? 1 : 0;

  const last = mine[mine.length - 1];
  const today = localDay(now);
  const canStart = !last || localDay(new Date(last.at)) !== today;
  let nextAt: Date | null = null;
  if (!canStart) {
    nextAt = new Date(now);
    nextAt.setHours(24, 0, 0, 0);
  }
  return { passes, passed: passes === 2, secondFrom: passes === 1 ? from : null, canStart, nextAt };
}

/** Отметки-тесты, которые засчитаны историей подходов. */
export function passedQuizEvidence(
  evidence: { id: string; axis: AxisId; source?: string }[],
  attempts: QuizAttempt[],
  now: Date
): string[] {
  return evidence.filter((e) => e.source === 'quiz' && quizStatus(attempts, e.axis, now).passed).map((e) => e.id);
}

/**
 * Какие вопросы задать в следующем подходе.
 *
 * Сначала те, на которых ошибся в прошлый раз (разбор прочитан, проверить
 * стоит именно их), потом ни разу не заданные, потом заданные давно.
 * Внутри группы порядок случайный, `rand` передаётся, чтобы гейт мог
 * проверить отбор детерминированно. Второй подход поэтому почти целиком
 * из новых вопросов: зачёт не сводится к запоминанию первой десятки.
 */
export function drawQuiz(bankIds: string[], attempts: QuizAttempt[], axis: AxisId, rand: () => number): string[] {
  const mine = attempts.filter((a) => a.axis === axis).sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : 0));
  const last = mine[mine.length - 1];
  const lastWrong = new Set(last?.wrong ?? []);
  const lastAskedAt = new Map<string, string>();
  for (const a of mine) for (const id of a.asked) lastAskedAt.set(id, a.at);

  const keyed = shuffled(bankIds, rand).map((id) => ({
    id,
    group: lastWrong.has(id) ? 0 : lastAskedAt.has(id) ? 2 : 1,
    at: lastAskedAt.get(id) ?? '',
  }));
  keyed.sort((x, y) => x.group - y.group || (x.group === 2 ? (x.at < y.at ? -1 : x.at > y.at ? 1 : 0) : 0));
  return keyed.slice(0, QUIZ_SIZE).map((k) => k.id);
}

/** Перемешивание Фишера–Йетса; для вопросов подхода и для вариантов ответа. */
export function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

export function isQuizAttempt(v: unknown): v is QuizAttempt {
  if (!v || typeof v !== 'object') return false;
  const a = v as QuizAttempt;
  return typeof a.axis === 'string' && typeof a.at === 'string' && isStrings(a.asked) && isStrings(a.wrong);
}

/**
 * Слияние и каноническая форма списка подходов.
 *
 * Список только дописывается, поэтому слияние — объединение по ключу
 * (ось, время). Два разных подхода с одним ключом в жизни не встречаются
 * (время с миллисекундами), но ответ и тогда не зависит от порядка:
 * остаётся подход с бóльшей строкой. На ось хранятся QUIZ_KEEP последних;
 * обрезка оставляет самые новые и поэтому ассоциативна.
 */
export function normalizeQuiz(attempts: QuizAttempt[]): QuizAttempt[] {
  const byKey = new Map<string, QuizAttempt>();
  for (const a of attempts) {
    const k = `${a.axis} ${a.at}`;
    const prev = byKey.get(k);
    if (!prev || JSON.stringify(a) > JSON.stringify(prev)) byKey.set(k, a);
  }
  const sorted = [...byKey.values()].sort((x, y) =>
    x.at < y.at ? -1 : x.at > y.at ? 1 : x.axis < y.axis ? -1 : x.axis > y.axis ? 1 : 0
  );
  const kept: QuizAttempt[] = [];
  const count = new Map<string, number>();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const n = count.get(sorted[i].axis) ?? 0;
    if (n >= QUIZ_KEEP) continue;
    count.set(sorted[i].axis, n + 1);
    kept.push(sorted[i]);
  }
  return kept.reverse();
}
