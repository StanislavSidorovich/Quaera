/**
 * Сохранённые скрипты песочницы.
 *
 * По образцу srs/store.ts: всё лежит на устройстве, версия схемы записана
 * явно — если формат когда-нибудь изменится, старое хранилище не должно
 * молча уронить экран, а должно быть заменено пустым. Отдельный файл,
 * а не часть Progress: это не учебный прогресс и не участвует в SRS,
 * у него свой ключ и своя версия, которая может меняться независимо.
 */

const KEY = 'querium.sandbox.v1';

export interface SavedScript {
  id: string;
  name: string;
  env: 'sql' | 'python';
  code: string;
  savedAt: string;
}

export interface SandboxStore {
  version: 1;
  scripts: SavedScript[];
}

const empty = (): SandboxStore => ({ version: 1, scripts: [] });

export function loadSandboxStore(): SandboxStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as SandboxStore;
    if (parsed.version !== 1) return empty();
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

function persist(s: SandboxStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // приватный режим или переполнение — сохранённое остаётся жить только в памяти вкладки
  }
}

/** Тот же приём id, что buildId в scripts/postbuild-sw.mjs — время плюс случайный хвост, без внешней зависимости. */
const nextId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Новый скрипт встаёт первым — последнее сохранённое находят не листая список. */
export function saveScript(store: SandboxStore, name: string, env: 'sql' | 'python', code: string): SandboxStore {
  const script: SavedScript = { id: nextId(), name, env, code, savedAt: new Date().toISOString() };
  const next: SandboxStore = { ...store, scripts: [script, ...store.scripts] };
  persist(next);
  return next;
}

export function deleteScript(store: SandboxStore, id: string): SandboxStore {
  const next: SandboxStore = { ...store, scripts: store.scripts.filter((s) => s.id !== id) };
  persist(next);
  return next;
}
