import { WORKER_FAILURE } from './types';
import type { DatasetInfo, Executor, ExecResult, GradeOptions, GradeResult, LoadState } from './types';

/**
 * Тонкий типизированный клиент к воркеру Pyodide+pandas — по образцу sqlClient.ts.
 *
 * Главное отличие от SQL: рантайм весит ~52 МБ (см. DOWNLOAD_BYTES), и первая
 * загрузка не должна начинаться молча. init() доходит до воркера только после
 * явного согласия — либо от пользователя в эту сессию (confirmDownload),
 * либо от прошлой сессии на этом устройстве (localStorage).
 */

/** Сумма проверенных по sha256 файлов в public/pyodide/ — ядро + pandas + sqlite3, версия зафиксирована в scripts/sync-pyodide.mjs. */
export const DOWNLOAD_BYTES = 52_500_000;

const CONSENT_KEY = 'quaera.pyodide-consent.v1';

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
let readyPromise: Promise<DatasetInfo> | null = null;
let resolveConsent: (() => void) | null = null;

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

function hasStoredConsent(): boolean {
  try {
    return localStorage.getItem(CONSENT_KEY) === 'true';
  } catch {
    return false;
  }
}

function storeConsent(): void {
  try {
    localStorage.setItem(CONSENT_KEY, 'true');
  } catch {
    // приватный режим — переспросим в следующий раз, не критично
  }
}

/** Разрешает ожидание в initRuntime(), если оно шло. Вызывается из UI по кнопке согласия. */
export function confirmDownload(): void {
  storeConsent();
  resolveConsent?.();
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker('/python-worker.js');
  worker.onmessage = (e: MessageEvent) => {
    const { id, ok, data, error, traceback } = e.data as {
      id: number;
      ok: boolean;
      data?: unknown;
      error?: string;
      traceback?: string;
    };
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    if (ok) p.resolve(data);
    else {
      const err = new Error(error ?? WORKER_FAILURE) as Error & { traceback?: string };
      if (traceback) err.traceback = traceback;
      p.reject(err);
    }
  };
  worker.onerror = (e) => {
    const err = new Error(e.message || WORKER_FAILURE);
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

/** Идемпотентно, как initDatabase в sqlClient.ts — но с шагом согласия перед первой реальной загрузкой. */
export function initRuntime(): Promise<DatasetInfo> {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    if (!hasStoredConsent()) {
      setState({ phase: 'consent', bytes: DOWNLOAD_BYTES });
      await new Promise<void>((resolve) => {
        resolveConsent = resolve;
      });
      resolveConsent = null;
    }
    setState({ phase: 'loading' });
    try {
      const info = await call<DatasetInfo>('init', { url: '/data/quaera.dataset' });
      setState({ phase: 'ready', info });
      return info;
    } catch (err) {
      setState({ phase: 'error', message: (err as Error).message });
      readyPromise = null;
      throw err;
    }
  })();
  return readyPromise;
}

export async function execPython(code: string): Promise<ExecResult> {
  await initRuntime();
  return call<ExecResult>('exec', { code });
}

export async function gradePython(
  userCode: string,
  solutionCode: string,
  options: GradeOptions = {}
): Promise<GradeResult> {
  await initRuntime();
  return call<GradeResult>('grade', { userCode, solutionCode, options });
}

/** Реализация Executor поверх Pyodide+pandas — см. пояснение к интерфейсу в engine/types.ts. */
export const pythonExecutor: Executor = {
  subscribeLoad,
  init: initRuntime,
  exec: execPython,
  grade: gradePython,
  confirmDownload,
};
