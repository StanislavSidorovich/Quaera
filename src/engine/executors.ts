import type { Track } from '../content/types';
import type { Executor } from './types';
import { sqlExecutor } from './sqlClient';
import { pythonExecutor } from './pythonClient';

/**
 * Заглушка для треков без реального исполнителя кода.
 *
 * У domain здесь нечего исполнять вовсе: задания — бизнес-ситуации, режим
 * только `predict`, ответ проверяется сравнением выбранного варианта.
 *
 * У model исполнителя тоже нет и не будет (ROADMAP §6: собственный симулятор
 * фильтр-контекста DAX хуже, чем его отсутствие — ошибка симулятора
 * неотличима от ошибки задания). Но это больше не значит «только predict»:
 * задание в режиме `fill` проверяется сверкой вписанных фрагментов с эталоном
 * как текста (engine/textGrade.ts), и исполнитель для этого не нужен вовсе.
 * Отсюда `runsCode: false` — флаг, по которому TaskView выбирает путь проверки
 * и не рисует кнопку «Выполнить». exec/grade по-прежнему не должны
 * вызываться: они существуют, чтобы удовлетворить интерфейс.
 */
const noExecutor: Executor = {
  runsCode: false,
  subscribeLoad(listener) {
    listener({ phase: 'ready', info: { tables: [], bytes: 0 } });
    return () => undefined;
  },
  async init() {
    return { tables: [], bytes: 0 };
  },
  async exec() {
    throw new Error('В этом треке нет исполнителя кода — задания проверяются выбором варианта или сверкой текста.');
  },
  async grade() {
    throw new Error('В этом треке нет исполнителя кода — задания проверяются выбором варианта или сверкой текста.');
  },
};

/**
 * Регистр исполнителей по треку.
 *
 * У domain и model задания есть, а write/fill там не будет никогда
 * (см. noExecutor выше). Раньше model отсутствовал в реестре: пак был
 * черновым, сессию было не запустить, и null выглядел честным ответом.
 * С появлением заданий это допущение сломалось молча и сразу в двух местах —
 * кнопка занятия навсегда осталась в состоянии «Загружаю данные…» (без
 * исполнителя LoadState не уходит из 'idle'), а TaskView вообще не
 * отрисовался бы: App рендерит его только при непустом executor.
 * Гейт контента такое не ловит — это проводка приложения, а не пак.
 *
 * У python исполнитель реальный (Pyodide+pandas,
 * см. pythonClient.ts) — но init() безопасен сам по себе: тяжёлый рантайм
 * (~52 МБ) не начинает грузиться молча, а ждёт явного согласия
 * (LoadState 'consent' в engine/types.ts), даже если App вызывает init()
 * сразу при переключении на трек, как и для остальных исполнителей.
 */
const registry: Partial<Record<Track, Executor>> = {
  sql: sqlExecutor,
  domain: noExecutor,
  model: noExecutor,
  python: pythonExecutor,
};

export const getExecutor = (track: Track): Executor | null => registry[track] ?? null;
