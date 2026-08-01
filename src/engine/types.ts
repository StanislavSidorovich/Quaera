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
