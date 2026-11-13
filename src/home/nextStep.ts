/**
 * Что человеку делать дальше: одна кнопка «Продолжить» на главной.
 *
 * Чистый модуль без импортов: текст, карту и прогресс приносит вызывающий,
 * поэтому правила проверяются фикстурами в `npm run test:next-step`, не поднимая
 * паки и локали. Правила идут по порядку, первое подходящее
 * (docs/home-spine-design-2026-11.md, «Правило „Продолжить“»):
 *
 * 1. Есть начатое и не законченное занятие в треке: вернуться в него.
 * 2. Начатая сборка в Lab без Answer: «Продолжить сборку в Lab». НЕ РЕАЛИЗОВАНО:
 *    у тренажёра есть только отметки готового (`Progress.career.labDone`), признака
 *    «начата, но не закончена» нет, а новых каналов из Lab не заводим. Правило
 *    встанет вторым, когда Lab начнёт сообщать о начале сборки.
 * 3. Новичок без прогресса: день 1 рабочей недели.
 * 4. Иначе: первый слой карты, который ещё не пройден, и его первое действие.
 *
 * Подпись шага всегда называет шаг: результат несёт `stepName`, а не пустую
 * команду «Продолжить».
 */

/** Слой карты данных: id и навыки тренажёра, которыми он тренируется (`architecture.json`, `practice.skills`). */
export interface LayerInput {
  id: string;
  skills: string[];
}

export type LayerState = 'done' | 'next' | 'ahead';

export interface LayerStatus {
  id: string;
  state: LayerState;
  /** Навыки слоя, которых человек ещё не начинал, в порядке слоя. */
  unstarted: string[];
}

/**
 * Состояние слоёв: пройден, когда начаты все его навыки; «следующий» один, первый
 * непройденный слой, у которого есть навыки; остальные «впереди». Слой без навыков
 * в тренажёре не пройти: он остаётся «впереди» и следующим не бывает.
 * Когда пройдено всё, «следующего» нет и текущим считается последний слой.
 */
export function layerStatuses(layers: LayerInput[], isStarted: (skillId: string) => boolean): LayerStatus[] {
  const base = layers.map((l) => {
    const unstarted = l.skills.filter((s) => !isStarted(s));
    return { id: l.id, unstarted, done: l.skills.length > 0 && unstarted.length === 0 };
  });
  const firstOpen = base.findIndex((l, i) => !l.done && layers[i].skills.length > 0);
  return base.map((l, i) => ({
    id: l.id,
    unstarted: l.unstarted,
    state: l.done ? 'done' : i === firstOpen ? 'next' : 'ahead',
  }));
}

export interface NextStepInput {
  /** Подпись шага незаконченного занятия этого трека («Задача 2 из 5»), null: продолжать нечего. */
  resume: string | null;
  /** Ни одного навыка и ни одного решённого задания. */
  isNewUser: boolean;
  /** Подпись первого дня рабочей недели («бриф заказчика»); null: кампания недоступна, правило 3 пропускается. */
  dayOne: { title: string; tasks: number } | null;
  layers: LayerInput[];
  isStarted: (skillId: string) => boolean;
}

export type NextStep =
  | { rule: 1; kind: 'resume'; stepName: string }
  | { rule: 3; kind: 'day-one'; stepName: string; tasks: number }
  /** `skillId` — первое действие слоя; null, когда в слое не осталось неначатых навыков тренажёра. */
  | { rule: 4; kind: 'layer'; stepName: string; layerId: string; skillId: string | null };

export function nextStep(input: NextStepInput): NextStep {
  if (input.resume) return { rule: 1, kind: 'resume', stepName: input.resume };
  if (input.isNewUser && input.dayOne) {
    return { rule: 3, kind: 'day-one', stepName: input.dayOne.title, tasks: input.dayOne.tasks };
  }
  const states = layerStatuses(input.layers, input.isStarted);
  const cur = states.find((l) => l.state === 'next') ?? states[states.length - 1];
  return { rule: 4, kind: 'layer', stepName: cur.id, layerId: cur.id, skillId: cur.unstarted[0] ?? null };
}

/**
 * Минуты на занятие из числа заданий. Опора одна, строка главной «До 5 заданий,
 * 7–10 минут»: полторы–две минуты на задание. Возвращает середину, целым;
 * null, когда заданий нет (честно посчитать нечего).
 */
export function estimateMinutes(tasks: number): number | null {
  if (!(tasks > 0)) return null;
  return Math.max(1, Math.round(tasks * 1.7));
}

/** Неделя рабочего сюжета по достигнутому дню: сколько дней в неделе, сколько пройдено. */
export function weekDots(total: number, reachedIndex: number | null): { total: number; done: number } {
  const done = reachedIndex === null ? 0 : Math.max(0, Math.min(total, reachedIndex));
  return { total, done };
}
