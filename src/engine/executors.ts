import type { Track } from '../content/types';
import type { Executor } from './types';
import { sqlExecutor } from './sqlClient';

/**
 * Заглушка для треков без реального исполнителя кода.
 *
 * У domain нет write/fill — там нечего исполнять, весь трек работает
 * в режиме predict, где ответ проверяется сравнением выбранного варианта,
 * а не запуском кода (см. TaskView.handleCheck). exec/grade здесь существуют
 * только чтобы удовлетворить интерфейс Executor и никогда не должны
 * вызываться реальным UI — LessonCard получает `runnable={false}` для этого
 * трека и не рисует кнопку «Выполнить».
 */
const noExecutor: Executor = {
  subscribeLoad(listener) {
    listener({ phase: 'ready', info: { tables: [], bytes: 0 } });
    return () => undefined;
  },
  async init() {
    return { tables: [], bytes: 0 };
  },
  async exec() {
    throw new Error('В этом треке нет исполнителя кода — все задания в режиме predict.');
  },
  async grade() {
    throw new Error('В этом треке нет исполнителя кода — все задания в режиме predict.');
  },
};

/**
 * Регистр исполнителей по треку.
 *
 * У model/python пока нет ни одного задания (черновые паки), поэтому до
 * исполнителя дело не доходит — сессию для них не запустить, и getExecutor
 * может честно вернуть null. У domain задания уже есть, а write/fill там
 * не будет никогда (см. noExecutor выше) — когда появится pandas-трек,
 * сюда добавится реальный Pyodide-исполнитель, а не заглушка.
 */
const registry: Partial<Record<Track, Executor>> = {
  sql: sqlExecutor,
  domain: noExecutor,
};

export const getExecutor = (track: Track): Executor | null => registry[track] ?? null;
