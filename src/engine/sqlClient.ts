import type { DatasetInfo, ExecResult, GradeOptions, GradeResult } from './types';

/**
 * Тонкий типизированный клиент к воркеру SQLite.
 * Одна инстанция на приложение: база весит ~12 МБ в памяти, второй копии не нужно.
 */

/**
 * Файл сжат gzip, но расширение нейтральное: имена вида *.gz перехватывают
 * менеджеры загрузок, и вместо данных страница получает пустой ответ.
 * Сжатие определяется по сигнатуре байт, а не по имени.
 */
const DATASET_URL = '/data/querium.dataset';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
let readyPromise: Promise<DatasetInfo> | null = null;

/** Прогресс загрузки датасета — нужен, чтобы первый запуск не выглядел зависанием. */
export type LoadState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'ready'; info: DatasetInfo }
  | { phase: 'error'; message: string };

const listeners = new Set<(s: LoadState) => void>();
let state: LoadState = { phase: 'idle' };

function setState(next: LoadState) {
  state = next;
  listeners.forEach((l) => l(next));
}

export function subscribeLoad(listener: (s: LoadState) => void): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker('/sql-worker.js');
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, data, error } = e.data as { id: number; ok: boolean; data?: unknown; error?: string };
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(data);
    else p.reject(new Error(error ?? 'Ошибка воркера'));
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || 'Воркер SQLite упал');
    pending.forEach((p) => p.reject(err));
    pending.clear();
    setState({ phase: 'error', message: err.message });
  };
  return worker;
}

function call<T>(type: string, payload?: unknown): Promise<T> {
  const w = ensureWorker();
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, type, payload });
  });
}

/** Идемпотентно: сколько бы компонентов ни позвало, загрузка происходит один раз. */
export function initDatabase(): Promise<DatasetInfo> {
  if (readyPromise) return readyPromise;
  setState({ phase: 'loading' });
  readyPromise = call<DatasetInfo>('init', { url: DATASET_URL })
    .then((info) => {
      setState({ phase: 'ready', info });
      return info;
    })
    .catch((err: Error) => {
      setState({ phase: 'error', message: err.message });
      readyPromise = null;
      throw err;
    });
  return readyPromise;
}

export async function execSql(sql: string): Promise<ExecResult> {
  await initDatabase();
  return call<ExecResult>('exec', { sql });
}

export async function gradeSql(
  userSql: string,
  solutionSql: string,
  options: GradeOptions = {}
): Promise<GradeResult> {
  await initDatabase();
  return call<GradeResult>('grade', { userSql, solutionSql, options });
}
