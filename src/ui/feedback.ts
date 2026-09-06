import type { Comparison, Feedback } from '../engine/types';
import { diagnoseComparison, diagnosePythonError, diagnoseSqlError } from '../engine/diagnose';
import type { Locale, Strings } from '../i18n/context';

/**
 * Повод для разбора — то, из чего разбор получается, вместо самого разбора.
 *
 * Ровно тот же приём, что и в session/store.ts (см. шапку там): **хранятся
 * идентификаторы, а не собранный по локали текст.** Черновик шага держал
 * готовый `Feedback` — семь строк, собранных `diagnoseSqlError(..., locale)`
 * в момент проверки, — и переключение языка их не трогало: заголовок экрана
 * и обвязка переезжали мгновенно, а разбор под ними оставался на прежнем.
 * Хуже того, `toStoredDraft` выкидывает из черновика только производные
 * таблицы, так что готовые строки уезжали в localStorage, и перезагрузка
 * этот кусок не чинила вовсе — она его закрепляла.
 *
 * Почему тип, а не эффект-пересборка при смене локали (как у очереди занятия
 * в App.tsx): эффект пришлось бы держать в двух экранах сразу и он всё равно
 * не лечит уже сохранённое. Смена типа поля делает дефект **невозможным** —
 * положить в `feedback` готовую строку теперь не компилируется. Тот же довод,
 * что у неслучайной перестановки в shuffledOrder: дефект дешевле сделать
 * невозможным, чем ловить гейтом.
 *
 * Поводов семь, потому что записей в `feedback` ровно семь. Три из них
 * (`execError`, `comparison`) идут в engine/diagnose и несут его входные
 * данные; остальные четыре — интерфейсные вердикты, у них своего текста нет
 * вообще, только имя случая.
 */
export type FeedbackSource =
  /** Зачёт. `expectedCols` — имена колонок эталона, если свои названы иначе. */
  | { kind: 'correct'; expectedCols?: string[] }
  | { kind: 'orderWrong' }
  | { kind: 'wrongOption' }
  | { kind: 'blanksWrong'; wrongIndexes: number[] }
  | { kind: 'giveUp' }
  /** Отказ исполнителя: сообщение движка и, у Python, относящийся к заданию traceback. */
  | { kind: 'execError'; message: string; traceback?: string }
  /** Расхождение с эталоном — вход diagnoseComparison, чистые данные без прозы. */
  | { kind: 'comparison'; comparison: Comparison };

export interface FeedbackContext {
  t: Strings;
  locale: Locale;
  /** Чей это движок: SQLite и Python описывают одну и ту же беду разными словами. */
  runtime: 'sql' | 'python';
  /** Имена таблиц и колонок — из них diagnose подбирает ближайшее при опечатке. */
  suggestions: string[];
}

/**
 * Повод → текст на языке текущего рендера.
 *
 * Зовётся при показе, а не при проверке, — в этом вся суть перестановки.
 * Дешёвая: разбор ошибки это десяток регулярок по короткой строке, а сравнение
 * с эталоном уже посчитано воркером и сюда приходит готовым.
 */
export function renderFeedback(src: FeedbackSource, ctx: FeedbackContext): Feedback {
  const { t, locale } = ctx;
  switch (src.kind) {
    case 'correct':
      return {
        tone: 'warn',
        title: t.task.correctTitle,
        body: '',
        nudges: [],
        style: src.expectedCols ? t.task.columnNameNote(src.expectedCols.join(', ')) : undefined,
      };
    case 'orderWrong':
      return { tone: 'warn', title: t.task.orderWrongTitle, body: t.task.orderWrongBody, nudges: [] };
    case 'wrongOption':
      return { tone: 'warn', title: t.task.wrongOptionTitle, body: t.task.wrongOptionBody, nudges: [] };
    case 'blanksWrong':
      return {
        tone: 'warn',
        title: t.task.blanksWrongTitle(src.wrongIndexes.length),
        body: t.task.blanksWrongBody(src.wrongIndexes.map((i) => i + 1)),
        nudges: [],
      };
    case 'giveUp':
      return { tone: 'warn', title: t.task.giveUpTitle, body: t.task.giveUpBody, nudges: [] };
    case 'execError':
      return ctx.runtime === 'python'
        ? diagnosePythonError(src.message, ctx.suggestions, src.traceback ?? '', locale)
        : diagnoseSqlError(src.message, ctx.suggestions, locale);
    case 'comparison':
      return diagnoseComparison(src.comparison, locale);
  }
}
