import { WORKER_FAILURE } from './types';
import type { Comparison, Feedback, Mismatch } from './types';
import type { Locale } from '../i18n/context';
import { diagnoseText } from './diagnoseText';

/**
 * Превращение расхождения с эталоном в адресную подсказку.
 *
 * Это главное отличие от обычного тренажёра. «Неверно» ничему не учит:
 * человек перечитывает свой запрос и не понимает, что искать. Здесь по форме
 * расхождения восстанавливается наиболее вероятная причина — размножение строк
 * джойном, потерянный фильтр, INNER вместо LEFT, забытый ORDER BY — и человек
 * сразу знает, куда смотреть, но не получает готовый ответ.
 *
 * Здесь только выбор диагноза; сами формулировки — в diagnoseText.ts, по одному
 * набору на локаль (там же объяснено, почему разделены и почему не в i18n/ru.ts).
 * Локаль приходит параметром, а не берётся из контекста: модуль чистый, его
 * зовут из двух экранов и в будущем захотят звать из гейта.
 */

export type { Feedback };

// ---------------------------------------------------- ошибки синтаксиса

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Ищем ближайшее реальное имя — опечатки в именах колонок самая частая причина
 * ступора. Экспортирован: тот же приём переиспользует diagnosePythonError
 * для KeyError на несуществующей колонке — опечатка есть опечатка независимо
 * от языка.
 */
export function closest(name: string, candidates: string[]): string | null {
  const target = name.toLowerCase();
  let best: string | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const d = editDistance(target, c.toLowerCase());
    if (d < bestScore) {
      bestScore = d;
      best = c;
    }
  }
  return best && bestScore <= Math.max(2, Math.floor(target.length / 3)) ? best : null;
}

/**
 * Локаль обязательна во всех трёх функциях — намеренно, без значения
 * по умолчанию. Дефолт `'ru'` был бы удобнее на вызове и молча вернул бы
 * русский разбор англоязычному человеку у первого же забывшего его места:
 * ровно тот класс дефекта, из-за которого весь этот модуль и оставался
 * русским, только спрятанный ещё лучше — не в комментарии, а в сигнатуре.
 */
export function diagnoseSqlError(message: string, knownNames: string[], locale: Locale): Feedback {
  const T = diagnoseText[locale];
  if (message === WORKER_FAILURE) return T.workerFailure();
  const m = message.toLowerCase();

  const noColumn = /no such column:\s*([\w.]+)/i.exec(message);
  if (noColumn) {
    const name = noColumn[1];
    const bare = name.includes('.') ? name.split('.').pop()! : name;
    const hint = closest(bare, knownNames);
    // Ближайшее имя совпало с искомым — значит колонка написана верно и
    // существует, просто не в тех таблицах, что стоят в запросе. Подсказка
    // про опечатку здесь читалась как издевательство: «нет колонки unit —
    // а в схеме есть unit» (unit лежит в dim_product, а запрос шёл
    // к fact_sellout). Найдено ревью глазами; замер бы не увидел —
    // сообщение формально верное и без единого сбоя.
    if (hint && hint.toLowerCase() === bare.toLowerCase()) return T.columnElsewhere(bare);
    return T.noColumn(name, hint);
  }

  const noTable = /no such table:\s*(\w+)/i.exec(message);
  if (noTable) return T.noTable(noTable[1], closest(noTable[1], knownNames));

  const ambiguous = /ambiguous column name:\s*([\w.]+)/i.exec(message);
  if (ambiguous) return T.ambiguousColumn(ambiguous[1]);

  if (m.includes('misuse of aggregate')) return T.misuseOfAggregate();

  if (/order by term does not match/i.test(message)) return T.orderByMismatch();

  const syntax = /near "([^"]+)":\s*syntax error/i.exec(message);
  if (syntax) return T.syntaxNear(syntax[1]);

  return T.sqlFallback(message);
}

/**
 * Разбор ошибок исполнителя Python — по образцу diagnoseSqlError, но проще:
 * python-bootstrap.py уже отдаёт сообщение вида «ТипОшибки: подробности»
 * и, отдельно, traceback, обрезанный до кода задания (без служебных кадров
 * Pyodide) — не нужно распознавать сырые сообщения движка по регуляркам,
 * как для SQLite. Единственный частый случай, где стоит помочь адресно —
 * опечатка в имени колонки (KeyError), тем же приёмом closest(), что и в SQL.
 */
export function diagnosePythonError(
  message: string,
  knownNames: string[],
  traceback: string,
  locale: Locale
): Feedback {
  const T = diagnoseText[locale];
  if (message === WORKER_FAILURE) return T.workerFailure();

  const keyError = /^KeyError:\s*'([^']+)'/.exec(message);
  if (keyError) {
    const name = keyError[1];
    const hint = closest(name, knownNames);
    // См. ту же развилку в diagnoseSqlError: имя написано верно, колонка
    // не в том датафрейме.
    if (hint && hint.toLowerCase() === name.toLowerCase()) return T.columnElsewhere(name);
    return T.pythonKeyError(name, hint);
  }

  const [, kind, detail] = /^(\w+):\s*([\s\S]*)$/.exec(message) ?? [null, null, null];
  return T.pythonFallback(kind, detail ?? message, traceback);
}

// -------------------------------------------------- расхождение с эталоном

/** Похоже ли число на целое с точностью до 3% — признак ровного размножения строк. */
function nearInteger(x: number): number | null {
  const r = Math.round(x);
  return r >= 2 && Math.abs(x - r) / r < 0.03 ? r : null;
}

function analyseRatios(mismatches: Mismatch[], locale: Locale): Feedback | null {
  const T = diagnoseText[locale];
  const ratios = mismatches.map((m) => m.ratio).filter((r): r is number => r !== null && Number.isFinite(r));
  if (!ratios.length) return null;

  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const consistent = min > 0 && max / min < 1.05;

  if (consistent) {
    const k = nearInteger(ratios[0]);
    if (k) return T.ratioExact(k);
    if (ratios[0] > 1) return T.ratioOver(ratios[0]);
    return T.ratioUnder(ratios[0]);
  }

  // Коэффициенты разные, но однонаправленные. Ровного множителя нет, значит это
  // не размножение строк, а лишние или недостающие строки внутри групп —
  // чаще всего потерянный фильтр периода: он смещает каждую группу по-своему.
  if (min > 1.02) return T.inflatedVaried(min, max);
  if (max < 0.98) return T.deflatedVaried(min, max);

  const sample = mismatches[0];
  return T.wrongValues(sample.key, sample.column, sample.expected, sample.got);
}

export function diagnoseComparison(cmp: Comparison, locale: Locale): Feedback {
  const T = diagnoseText[locale];
  const style = cmp.columnNamesDiffer ? T.columnNamesStyle(cmp.expectedCols) : undefined;
  const withStyle = (f: Feedback): Feedback => ({ ...f, style: f.style ?? style });

  if (cmp.reason === 'columns_count') return withStyle(T.columnsCount(cmp.expectedCols, cmp.userCols.length));

  if (cmp.reason === 'order') return withStyle(T.wrongOrder());

  if (cmp.reason === 'values' && cmp.sampleMismatch.length) {
    const f = analyseRatios(cmp.sampleMismatch, locale);
    if (f) return withStyle(f);
  }

  if (cmp.reason === 'missing') return withStyle(T.missingRows(cmp.missingRows));

  if (cmp.reason === 'extra') {
    const ratio = cmp.expectedRows ? cmp.userRows / cmp.expectedRows : 0;
    return withStyle(T.extraRows(cmp.extraRows, nearInteger(ratio)));
  }

  if (cmp.reason === 'both') return withStyle(T.bothWays(cmp.userRows, cmp.expectedRows));

  return withStyle(T.mismatchFallback(cmp.userRows, cmp.expectedRows));
}
