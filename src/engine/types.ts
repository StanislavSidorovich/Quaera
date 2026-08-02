export type SqlValue = string | number | Uint8Array | null;

export interface ExecResult {
  columns: string[];
  rows: SqlValue[][];
  totalRows: number;
  truncated: boolean;
  elapsedMs: number;
}

export interface Preview {
  columns: string[];
  rows: SqlValue[][];
  totalRows: number;
  truncated?: boolean;
}

export interface Mismatch {
  key: string;
  column: string;
  expected: SqlValue;
  got: SqlValue;
  /** Во сколько раз ответ отличается от эталона — главный сигнал для диагностики. */
  ratio: number | null;
}

export type CompareReason = 'columns_count' | 'order' | 'values' | 'extra' | 'missing' | 'both' | null;

export interface Comparison {
  ok: boolean;
  reason: CompareReason;
  userRows: number;
  expectedRows: number;
  userCols: string[];
  expectedCols: string[];
  extraRows: number;
  missingRows: number;
  sameSetWrongOrder: boolean;
  keysMatchValuesDiffer: boolean;
  columnNamesDiffer: boolean;
  sampleExtra: SqlValue[][];
  sampleMissing: SqlValue[][];
  sampleMismatch: Mismatch[];
}

export type GradeResult =
  | { status: 'sql_error'; message: string; elapsedMs: number }
  | {
      status: 'correct' | 'incorrect';
      comparison: Comparison;
      preview: Preview;
      expectedPreview: Preview;
      elapsedMs: number;
    };

export interface GradeOptions {
  orderMatters?: boolean;
}

export interface DatasetInfo {
  tables: string[];
  bytes: number;
}

/**
 * Интерфейс исполнителя кода — то, что запускает и оценивает решение человека.
 *
 * Сегодня единственная реализация — sql.js в воркере (см. sqlClient.ts).
 * Абстракция здесь ради того, что появится позже: pandas-трек будет выполнять
 * Python через Pyodide, но UI задания — ввод, подсказки, сравнение с эталоном,
 * разбор — устроен одинаково для любого языка, если тот умеет вернуть
 * табличный результат. TaskView и LessonCard получают Executor как проп
 * и не знают, что конкретно исполняет код.
 */
export interface Executor {
  subscribeLoad(listener: (s: LoadState) => void): () => void;
  init(): Promise<DatasetInfo>;
  exec(code: string): Promise<ExecResult>;
  grade(userCode: string, solutionCode: string, options?: GradeOptions): Promise<GradeResult>;
}

/** Прогресс загрузки датасета — нужен, чтобы первый запуск не выглядел зависанием. */
export type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; info: DatasetInfo }
  | { phase: 'error'; message: string };

/** Описание схемы для шторки «Схема данных» — генерируется вместе с датасетом. */
export interface SchemaDoc {
  dataset: string;
  version: number;
  generated_at: string;
  company: string;
  period: { from: string; to: string };
  tables: {
    table: string;
    title: string;
    grain: string;
    note: string | null;
    row_count: number;
    columns: { name: string; description: string }[];
  }[];
}
