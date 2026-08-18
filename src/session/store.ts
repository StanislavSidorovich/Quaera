import type { Track } from '../content/types';
import type { StepDraft, TaskDraft } from '../ui/TaskView';

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

const KEY = 'quaera.session.v1';

/** Шаг очереди в хранилище — тот же Step, но ссылкой, а не содержимым. */
export type StoredStep = { kind: 'lesson'; skill: string } | { kind: 'task'; id: string };

/**
 * Черновик шага задания без `preview`/`expected`.
 *
 * Обе таблицы — производные: их возвращает исполнитель, и один клик
 * «Выполнить» получает их заново. Платить за них местом в localStorage
 * пришлось бы заметно: превью режется по 200 строк на задание (PREVIEW_ROWS
 * в sql-worker.js), а очередь бывает до десяти шагов — при переполнении
 * квоты запись падает целиком, и вместе с таблицами потерялось бы всё
 * занятие. `feedback`/`solved`/`wasCorrect` при этом остаются: решённый
 * шаг обязан вернуться решённым, а вот таблица под ним честно пуста,
 * пока её не выполнили заново (оба блока в TaskView под `preview &&`).
 *
 * У шага интерпретации из-за этого есть своя работа при восстановлении:
 * интерпретировать нечего, пока таблицы нет, и экран выполняет эталон
 * предыдущего шага сам (см. TaskView).
 */
export type StoredStepDraft = Omit<StepDraft, 'preview' | 'expected'>;

/** Черновик задания целиком: где человек внутри задания и что сделано на каждом шаге. */
export interface StoredDraft {
  stepIndex: number;
  steps: StoredStepDraft[];
}

/**
 * Черновик формата первой версии — плоский, без шагов.
 *
 * Нужен ровно для одного: поднять незаконченное занятие, сохранённое до
 * появления многошаговых заданий. Выбрасывать его было бы легко (`version`
 * не совпал — занятия нет), но это ровно та потеря работы человека, ради
 * которой хранилище и заводилось.
 */
type LegacyDraft = StoredStepDraft & { stepIndex?: undefined; steps?: undefined };

export interface StoredSession {
  /** 2 — черновики по шагам; 1 — плоские, поднимаются при чтении (см. upgradeDraft). */
  version: 2;
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
    /*
     * Разбирается как «любая версия», а не как StoredSession: записи первой
     * версии по типу от нынешних отличаются, и приводить их к нынешнему типу
     * до проверки самой версии значило бы поверить хранилищу на слово.
     */
    const parsed = JSON.parse(raw) as Omit<StoredSession, 'version' | 'drafts'> & {
      version: number;
      drafts?: Record<string, StoredDraft | LegacyDraft>;
    };
    if (parsed.version !== 1 && parsed.version !== 2) return null;
    if (!Array.isArray(parsed.steps) || !parsed.steps.length) return null;
    return {
      ...parsed,
      version: 2,
      drafts: Object.fromEntries(Object.entries(parsed.drafts ?? {}).map(([id, d]) => [id, upgradeDraft(d)])),
    };
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

/** Плоский черновик первой версии — в шаг единственного расчёта или выбора. */
function upgradeDraft(d: StoredDraft | LegacyDraft): StoredDraft {
  if (Array.isArray(d.steps)) return d as StoredDraft;
  const { stepIndex: _i, steps: _s, ...flat } = d as LegacyDraft;
  return { stepIndex: 0, steps: [flat] };
}

/** Черновик без производных таблиц — то, что уходит в хранилище. */
export function toStoredDraft(d: TaskDraft): StoredDraft {
  return {
    stepIndex: d.stepIndex,
    steps: d.steps.map(({ preview: _preview, expected: _expected, ...rest }) => rest),
  };
}

/** Обратно в черновик: таблицы восстанавливаются пустыми, их вернёт «Выполнить». */
export function fromStoredDraft(d: StoredDraft): TaskDraft {
  return { stepIndex: d.stepIndex, steps: d.steps.map((s) => ({ ...s, preview: null, expected: null })) };
}
