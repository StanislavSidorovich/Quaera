import type { Track } from '../content/types';
import type { Executor } from './types';
import { sqlExecutor } from './sqlClient';

/**
 * Регистр исполнителей по треку.
 *
 * Треков без исполнителя быть не должно бояться: у model/python/domain пока
 * нет ни одного задания (черновые паки), поэтому до исполнителя дело просто
 * не доходит — сессию для них не запустить. Когда появится pandas-трек,
 * сюда добавится вторая запись, и TaskView / LessonCard не заметят разницы.
 */
const registry: Partial<Record<Track, Executor>> = {
  sql: sqlExecutor,
};

export const getExecutor = (track: Track): Executor | null => registry[track] ?? null;
