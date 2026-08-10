export type SqlValue = string | number | Uint8Array | null;

/**
 * Поле схемы, написанное человеческим языком, — сразу парой на обе локали.
 *
 * Именно парой на месте, а не отдельным файлом перевода рядом со схемой:
 * `schema.json` порождается генератором, и второй файл, ключёванный по
 * `таблица.колонка`, оставался бы синтаксически валидным после добавления
 * колонки в `build-dataset.mjs` — то есть расходился бы молча, как разошлись
 * бы список связей рядом со схемой или словарь единиц измерения рядом
 * с графиком. Здесь же слот второй локали физически стоит рядом с первой:
 * колонку нельзя описать, не увидев пустого места под перевод.
 *
 * Отсюда же отсутствие запасного варианта («нет en — показать ru»): такой
 * запасной вариант прячет непереведённое поле в рабочий экран, ровно как
 * `locale = 'ru'` по умолчанию прятал бы непереданную локаль в сигнатуру
 * diagnose (см. engine/diagnoseText.ts). Полноту сторожит гейт, а не показ.
 *
 * Локаль здесь не импортирована из i18n/context — намеренно, не забывчиво.
 * У этого файла нет доступа к локали (см. комментарий у SchemaDoc ниже),
 * а i18n/context.tsx несёт JSX; test-chart-spec.mjs компилирует chartSpec.ts
 * (он тянет types.ts) отдельным вызовом tsc без --jsx, и такой импорт валил
 * эту сборку с TS6142 — не по вине chartSpec.ts, а по цепочке отсюда.
 * Литерал здесь и есть контракт: i18n/context.tsx определяет свой `Locale`
 * тем же union'ом и не обязан на этот файл ссылаться.
 */
export type LocalizedText = Record<'ru' | 'en', string>;

export interface ExecResult {
  columns: string[];
  rows: SqlValue[][];
  totalRows: number;
  truncated: boolean;
  elapsedMs: number;
  /** Вывод print() — есть только у исполнителей кода, у SQL всегда пусто. */
  stdout?: string;
}

export interface Preview {
  columns: string[];
  rows: SqlValue[][];
  totalRows: number;
  truncated?: boolean;
  stdout?: string;
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

/**
 * Метка «воркер отвалился и не сказал почему».
 *
 * Клиенты воркеров (sqlClient, pythonClient) — синглтоны без доступа к локали,
 * и раньше на этом месте стояла русская фраза, которая доезжала до английского
 * экрана как есть. Прозу отсюда убрали вовсе: сообщение — не текст для чтения,
 * а признак, который переводится в месте показа (diagnoseText, loadError).
 * Читаемого текста человек при этом не теряет: и разбор ошибки, и экран
 * загрузки уже несут собственный локализованный заголовок.
 */
export const WORKER_FAILURE = '__worker_failure__';

/**
 * Разбор неудачи, показываемый человеку: почему не сошлось и куда смотреть.
 *
 * Живёт здесь, а не в diagnose.ts, потому что его строит diagnoseText.ts,
 * а выбирает diagnose.ts — тип общий для обоих, и импорт типа из модуля,
 * который сам импортирует текст, замкнул бы их друг на друга.
 */
export interface Feedback {
  tone: 'error' | 'warn';
  title: string;
  body: string;
  /** Конкретные вопросы к своему запросу — то, что нужно проверить. */
  nudges: string[];
  /** Замечание по оформлению: на правильность не влияет, но так делать не стоит. */
  style?: string;
}

export type GradeResult =
  | { status: 'sql_error'; message: string; elapsedMs: number }
  /**
   * Аналог sql_error для исполнителей кода (Python): ошибка в коде человека
   * до сравнения с эталоном. message — краткая причина, traceback — только
   * то, что относится к телу задания (без служебных фреймов Pyodide).
   */
  | { status: 'code_error'; message: string; traceback?: string; elapsedMs: number }
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
  /**
   * Только у исполнителей, которым init() может упереться в согласие
   * пользователя (см. LoadState 'consent') — у sql.js такого шага нет,
   * там 3.5 МБ грузятся молча. Optional, чтобы не раздувать интерфейс
   * ради одного трека.
   */
  confirmDownload?(): void;
}

/** Прогресс загрузки датасета — нужен, чтобы первый запуск не выглядел зависанием. */
export type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  /**
   * Исполнителю нужно скачать что-то тяжёлое (Pyodide+pandas, ~52 МБ), и он
   * ждёт явного согласия — в отличие от sql.js, здесь размер сопоставим
   * со скачиванием отдельного приложения, и включать это молча по заходу
   * на вкладку нельзя, особенно на мобильном интернете.
   */
  | { phase: 'consent'; bytes: number }
  | { phase: 'ready'; info: DatasetInfo }
  | { phase: 'error'; message: string };

/** Описание схемы для шторки «Схема данных» — генерируется вместе с датасетом. */
export interface SchemaDoc {
  dataset: string;
  version: number;
  generated_at: string;
  company: LocalizedText;
  period: { from: string; to: string };
  tables: {
    /**
     * Имя таблицы, тип колонки, цель внешнего ключа и сами строки примера
     * локали не имеют и парой не хранятся: это не язык, а то, что человек
     * набирает в запросе. Пара стоит ровно там, где текст написан словами.
     */
    table: string;
    title: LocalizedText;
    grain: LocalizedText;
    note: LocalizedText | null;
    row_count: number;
    columns: {
      name: string;
      description: LocalizedText;
      /** SQL-тип колонки (TEXT/INTEGER/REAL) — разобран из той же DDL, что создаёт таблицу. */
      type: string;
      /**
       * Куда ведёт колонка, если она внешний ключ. Заполняется генератором
       * разбором того же описания («FK → dim_region.region_id»), поэтому
       * второго источника правды нет — см. parseReference в build-dataset.mjs.
       */
      references?: { table: string; column: string };
    }[];
    /**
     * Несколько настоящих строк таблицы. Схема из одних имён отвечает,
     * что в таблице есть, но не отвечает, как это выглядит: формат даты,
     * порядок величин, бывает ли пусто. Значения — как их отдаёт SQLite,
     * в порядке колонок; null — настоящий NULL в данных.
     */
    sample: SqlValue[][];
  }[];
}
