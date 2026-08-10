import type { Track } from '../content/types';
import type { TaskDraft } from '../ui/TaskView';

/**
 * Незаконченное занятие на устройстве.
 *
 * По образцу srs/store.ts и sandbox/store.ts: свой ключ, своя версия,
 * повреждённое хранилище заменяется пустым и не мешает заниматься.
 *
 * Зачем вообще: очередь занятия жила только в состоянии React, и любой выход
 * наружу стирал её целиком. Цену платил не выход как таковой, а самый
 * обычный сценарий — уйти на главную, чтобы взять практику по другой теме
 * (разбор навигации 2026-08-09, находка 3). Это же ограничение один раз уже
 * задало форму чужого решения: `backTarget` ведёт с задания на карточку
 * приёма внутри занятия именно потому, что наружу выходить было дорого.
 *
 * **Хранятся идентификаторы, а не сами задания и карточки.** Очередь в памяти
 * держит целые объекты Task и Lesson, но класть их сюда нельзя по трём
 * причинам разом: текст задания зависит от локали (переключение языка посреди
 * занятия вернуло бы прежний), контент правится вместе со сборкой (занятие
 * недельной давности воскресило бы формулировку, которой больше нет), и
 * удалённое задание вернулось бы к жизни. Сборка очереди из id по текущим
 * пакам решает все три: id навыков и заданий стабильны между локалями
 * и между сборками, а если id больше нет — занятие честно не восстановится.
 */

const KEY = 'querium.session.v1';

/** Шаг очереди в хранилище — тот же Step, но ссылкой, а не содержимым. */
export type StoredStep = { kind: 'lesson'; skill: string } | { kind: 'task'; id: string };

/**
 * Черновик задания без `preview`/`expected`.
 *
 * Обе таблицы — производные: их возвращает исполнитель, и один клик
 * «Выполнить» получает их заново. Платить за них местом в localStorage
 * пришлось бы заметно: превью режется по 200 строк на задание (PREVIEW_ROWS
 * в sql-worker.js), а очередь бывает до десяти шагов — при переполнении
 * квоты запись падает целиком, и вместе с таблицами потерялось бы всё
 * занятие. `feedback`/`solved`/`wasCorrect` при этом остаются: решённый
 * шаг обязан вернуться решённым, а вот таблица под ним честно пуста,
 * пока её не выполнили заново (оба блока в TaskView под `preview &&`).
 */
export type StoredDraft = Omit<TaskDraft, 'preview' | 'expected'>;

export interface StoredSession {
  version: 1;
  track: Track;
  steps: StoredStep[];
  index: number;
  maxIndex: number;
  /** Задания, попытка по которым уже ушла в SRS, — иначе возврат и «Дальше» сдвинули бы интервал дважды. */
  recorded: string[];
  drafts: Record<string, StoredDraft>;
  savedAt: string;
}

/** null — занятия нет, оно другой версии или хранилище повреждено. */
export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed.version !== 1 || !Array.isArray(parsed.steps) || !parsed.steps.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveSession(s: StoredSession): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // приватный режим или переполнение — занятие остаётся жить только в памяти вкладки
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // см. saveSession
  }
}

/** Черновик без производных таблиц — то, что уходит в хранилище. */
export function toStoredDraft(d: TaskDraft): StoredDraft {
  const { preview: _preview, expected: _expected, ...rest } = d;
  return rest;
}

/** Обратно в черновик: таблицы восстанавливаются пустыми, их вернёт «Выполнить». */
export function fromStoredDraft(d: StoredDraft): TaskDraft {
  return { ...d, preview: null, expected: null };
}
