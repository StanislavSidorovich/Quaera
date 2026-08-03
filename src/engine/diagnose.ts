import type { Comparison, Mismatch } from './types';

/**
 * Превращение расхождения с эталоном в адресную подсказку.
 *
 * Это главное отличие от обычного тренажёра. «Неверно» ничему не учит:
 * человек перечитывает свой запрос и не понимает, что искать. Здесь по форме
 * расхождения восстанавливается наиболее вероятная причина — размножение строк
 * джойном, потерянный фильтр, INNER вместо LEFT, забытый ORDER BY — и человек
 * сразу знает, куда смотреть, но не получает готовый ответ.
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

const plural = (n: number, one: string, few: string, many: string) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const rows = (n: number) => `${n.toLocaleString('ru-RU')} ${plural(n, 'строка', 'строки', 'строк')}`;

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

export function diagnoseSqlError(message: string, knownNames: string[] = []): Feedback {
  const m = message.toLowerCase();

  const noColumn = /no such column:\s*([\w.]+)/i.exec(message);
  if (noColumn) {
    const name = noColumn[1];
    const bare = name.includes('.') ? name.split('.').pop()! : name;
    const hint = closest(bare, knownNames);
    return {
      tone: 'error',
      title: `Нет колонки ${name}`,
      body: hint
        ? `Похоже на опечатку: в схеме есть ${hint}.`
        : 'Такой колонки нет ни в одной из таблиц запроса. Откройте схему и проверьте, в какой таблице она живёт.',
      nudges: [
        'Эта колонка точно в той таблице, которую вы присоединили?',
        'Если таблиц несколько и имена совпадают — нужен префикс алиаса, например f.units.',
      ],
    };
  }

  const noTable = /no such table:\s*(\w+)/i.exec(message);
  if (noTable) {
    const hint = closest(noTable[1], knownNames);
    return {
      tone: 'error',
      title: `Нет таблицы ${noTable[1]}`,
      body: hint ? `Возможно, имелась в виду ${hint}.` : 'Проверьте список таблиц в схеме данных.',
      nudges: ['Имена таблиц: dim_* — справочники, fact_* — факты, staging_* — сырой слой.'],
    };
  }

  const ambiguous = /ambiguous column name:\s*([\w.]+)/i.exec(message);
  if (ambiguous) {
    return {
      tone: 'error',
      title: `Неоднозначная колонка ${ambiguous[1]}`,
      body: 'Такая колонка есть больше чем в одной из соединённых таблиц, и SQLite не знает, какую вы имеете в виду.',
      nudges: ['Добавьте префикс: f.product_id или p.product_id.'],
    };
  }

  if (m.includes('misuse of aggregate')) {
    return {
      tone: 'error',
      title: 'Агрегат не на своём месте',
      body: 'SUM, COUNT, AVG нельзя использовать в WHERE: WHERE отбирает строки до группировки, когда агрегата ещё не существует.',
      nudges: [
        'Условие на агрегат переносится в HAVING — он работает уже после GROUP BY.',
        'WHERE — фильтр строк, HAVING — фильтр групп.',
      ],
    };
  }

  if (/order by term does not match/i.test(message)) {
    return {
      tone: 'error',
      title: 'ORDER BY ссылается в пустоту',
      body: 'Сортировка идёт по выражению, которого нет в результате.',
      nudges: ['Сортируйте по алиасу колонки или по её номеру: ORDER BY 2 DESC.'],
    };
  }

  const syntax = /near "([^"]+)":\s*syntax error/i.exec(message);
  if (syntax) {
    return {
      tone: 'error',
      title: `Синтаксис ломается рядом с «${syntax[1]}»`,
      body: 'Ошибка обычно не в самом этом слове, а прямо перед ним: пропущенная запятая, скобка или ключевое слово.',
      nudges: [
        'Проверьте порядок: SELECT → FROM → JOIN → WHERE → GROUP BY → HAVING → ORDER BY → LIMIT.',
        'Посчитайте открывающие и закрывающие скобки.',
      ],
    };
  }

  return {
    tone: 'error',
    title: 'Запрос не выполнился',
    body: message,
    nudges: [],
  };
}

/**
 * Разбор ошибок исполнителя Python — по образцу diagnoseSqlError, но проще:
 * python-bootstrap.py уже отдаёт сообщение вида «ТипОшибки: подробности»
 * и, отдельно, traceback, обрезанный до кода задания (без служебных кадров
 * Pyodide) — не нужно распознавать сырые сообщения движка по регуляркам,
 * как для SQLite. Единственный частый случай, где стоит помочь адресно —
 * опечатка в имени колонки (KeyError), тем же приёмом closest(), что и в SQL.
 */
export function diagnosePythonError(message: string, knownNames: string[] = [], traceback = ''): Feedback {
  const keyError = /^KeyError:\s*'([^']+)'/.exec(message);
  if (keyError) {
    const name = keyError[1];
    const hint = closest(name, knownNames);
    return {
      tone: 'error',
      title: `Нет колонки «${name}»`,
      body: hint
        ? `Похоже на опечатку: в таблицах есть «${hint}».`
        : 'Такой колонки нет ни в одной из использованных таблиц — проверьте имя в схеме, включая регистр.',
      nudges: [],
    };
  }

  const [, kind, detail] = /^(\w+):\s*([\s\S]*)$/.exec(message) ?? [null, null, null];
  return {
    tone: 'error',
    title: kind ?? 'Код не выполнился',
    body: detail ?? message,
    nudges: traceback ? traceback.split('\n').filter(Boolean) : [],
  };
}

// -------------------------------------------------- расхождение с эталоном

/** Похоже ли число на целое с точностью до 3% — признак ровного размножения строк. */
function nearInteger(x: number): number | null {
  const r = Math.round(x);
  return r >= 2 && Math.abs(x - r) / r < 0.03 ? r : null;
}

function analyseRatios(mismatches: Mismatch[]): Feedback | null {
  const ratios = mismatches.map((m) => m.ratio).filter((r): r is number => r !== null && Number.isFinite(r));
  if (!ratios.length) return null;

  const min = Math.min(...ratios);
  const max = Math.max(...ratios);
  const consistent = min > 0 && max / min < 1.05;

  if (consistent) {
    const k = nearInteger(ratios[0]);
    if (k) {
      return {
        tone: 'warn',
        title: `Все цифры завышены ровно в ${k} ${plural(k, 'раз', 'раза', 'раз')}`,
        body: 'Ровный целый коэффициент — почти всегда следствие соединения: каждая строка факта совпала с несколькими строками справочника и посчиталась несколько раз.',
        nudges: [
          'Проверьте гранулярность таблиц: на одну строку факта должна приходиться ровно одна строка справочника.',
          'Условие соединения полное? Если ключ составной, в ON должны быть все его части.',
          'Быстрая проверка: сравните COUNT(*) до соединения и после — число строк меняться не должно.',
        ],
      };
    }
    if (ratios[0] > 1) {
      return {
        tone: 'warn',
        title: `Цифры завышены примерно в ${ratios[0].toFixed(2)} раза`,
        body: 'Разрезы совпали, а суммы больше эталонных — в расчёт попали строки, которых там быть не должно.',
        nudges: [
          'Все ли фильтры на месте: период, дивизион, канал, признак активности?',
          'Не попадают ли в сумму строки других категорий или другого типа клиента?',
        ],
      };
    }
    return {
      tone: 'warn',
      title: `Цифры занижены примерно в ${(1 / ratios[0]).toFixed(2)} раза`,
      body: 'Разрезы совпали, но суммы меньше эталонных — часть строк отсеялась.',
      nudges: [
        'Фильтр не слишком строгий? Границы периода включаются или отсекаются?',
        'Сравнение с NULL всегда даёт ложь: строки с пустым значением молча выпадают. Нужен IS NULL или COALESCE.',
      ],
    };
  }

  const sample = mismatches[0];

  // Коэффициенты разные, но однонаправленные. Ровного множителя нет, значит это
  // не размножение строк, а лишние или недостающие строки внутри групп —
  // чаще всего потерянный фильтр периода: он смещает каждую группу по-своему.
  if (min > 1.02) {
    return {
      tone: 'warn',
      title: 'Цифры завышены во всех строках, но по-разному',
      body: `Разрезы совпали, а суммы больше эталонных — от ${min.toFixed(2)} до ${max.toFixed(2)} раза. Множитель неодинаковый, поэтому дело не в размножении строк соединением, а в том, что в каждую группу попали лишние строки.`,
      nudges: [
        'Самая частая причина — не перенесённый в запрос фильтр периода. Сверьте даты в задании и в WHERE.',
        'Проверьте остальные условия из постановки: дивизион, канал, тип клиента, признак промо.',
        'Если фильтр стоит в ON внешнего соединения вместо WHERE, он тоже не сработает так, как ожидается.',
      ],
    };
  }
  if (max < 0.98) {
    return {
      tone: 'warn',
      title: 'Цифры занижены во всех строках, но по-разному',
      body: `Разрезы совпали, а суммы меньше эталонных — от ${min.toFixed(2)} до ${max.toFixed(2)} от ожидаемого. В каждой группе не хватает части строк.`,
      nudges: [
        'Период задан ýже, чем в задании? Проверьте обе границы: BETWEEN включает концы, > и < — нет.',
        'Лишнее условие в WHERE отсекает часть строк — сверьте список условий с постановкой.',
        'Строки со значением NULL в колонке фильтра выпадают молча. Нужен IS NULL или COALESCE.',
      ],
    };
  }

  return {
    tone: 'warn',
    title: 'Разрезы верные, цифры — нет',
    body: `Например, для «${sample.key}» в колонке ${sample.column} ожидалось ${fmt(sample.expected)}, а получилось ${fmt(sample.got)}. Где-то больше, где-то меньше — то есть считается не та величина, а не «слегка не тот набор строк».`,
    nudges: [
      'Проверьте, по какой колонке считается мера — units или revenue, до скидки или после.',
      'COUNT(*) считает строки, COUNT(DISTINCT ...) — уникальные значения. Это разные ответы.',
      'Если в задании есть округление, оно должно быть на том же шаге, что и в эталоне.',
    ],
  };
}

const fmt = (v: unknown) =>
  typeof v === 'number' ? v.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) : String(v);

export function diagnoseComparison(cmp: Comparison): Feedback {
  const style = cmp.columnNamesDiffer
    ? `Имена колонок отличаются от ожидаемых (${cmp.expectedCols.join(', ')}). На правильность это не влияет, но отчёт с колонкой вида SUM(units) в работу не отдают — давайте колонкам осмысленные алиасы.`
    : undefined;

  const withStyle = (f: Feedback): Feedback => ({ ...f, style: f.style ?? style });

  if (cmp.reason === 'columns_count') {
    return withStyle({
      tone: 'error',
      title: `Ожидается ${cmp.expectedCols.length} ${plural(cmp.expectedCols.length, 'колонка', 'колонки', 'колонок')}, вернулось ${cmp.userCols.length}`,
      body: `Эталон возвращает: ${cmp.expectedCols.join(', ')}.`,
      nudges: ['Лишние колонки в SELECT так же плохи, как недостающие: результат должен точно соответствовать постановке.'],
    });
  }

  if (cmp.reason === 'order') {
    return withStyle({
      tone: 'warn',
      title: 'Данные верные, порядок — нет',
      body: 'Все строки совпали с эталоном, но идут в другой последовательности. В этом задании порядок важен: без явной сортировки СУБД вправе вернуть строки в любом порядке.',
      nudges: [
        'Добавьте ORDER BY по той колонке, о которой говорится в задании.',
        'Для рейтингов почти всегда нужен DESC, и разумно добавить второй ключ сортировки для устойчивости при равных значениях.',
      ],
    });
  }

  if (cmp.reason === 'values' && cmp.sampleMismatch.length) {
    const f = analyseRatios(cmp.sampleMismatch);
    if (f) return withStyle(f);
  }

  if (cmp.reason === 'missing') {
    const f: Feedback = {
      tone: 'warn',
      title: `Не хватает ${rows(cmp.missingRows)}`,
      body: 'Все возвращённые строки правильные, но часть результата потерялась.',
      nudges: [
        'Фильтр не отсекает лишнего? Проверьте границы периода и точность написания значений в кавычках.',
        'INNER JOIN выбрасывает строки без пары. Если нужны все периоды или все клиенты, включая те, где продаж не было, нужен LEFT JOIN.',
        'В этом датасете отсутствие строки в fact_sellout означает «не продавалось», а не ноль. Недели без продаж сами не появятся — их надо взять из календаря.',
      ],
    };
    return withStyle(f);
  }

  if (cmp.reason === 'extra') {
    const ratio = cmp.expectedRows ? cmp.userRows / cmp.expectedRows : 0;
    const k = nearInteger(ratio);
    return withStyle({
      tone: 'warn',
      title: `Лишних строк: ${rows(cmp.extraRows)}`,
      body: k
        ? `Строк ровно в ${k} ${plural(k, 'раз', 'раза', 'раз')} больше эталона — типичный признак того, что соединение размножило факты.`
        : 'Все ожидаемые строки на месте, но к ним добавились лишние.',
      nudges: k
        ? [
            'Проверьте, не соединяете ли факт со справочником по неуникальному ключу.',
            'Если справочник содержит историю (несколько строк на один объект), нужно взять актуальную версию, а не все.',
          ]
        : [
            'Какой фильтр из постановки не перенесён в запрос: период, канал, дивизион, тип клиента?',
            'Если нужны только уникальные значения — GROUP BY или DISTINCT.',
          ],
    });
  }

  if (cmp.reason === 'both') {
    return withStyle({
      tone: 'warn',
      title: 'Набор строк не совпадает',
      body: `Вернулось ${rows(cmp.userRows)}, ожидается ${rows(cmp.expectedRows)}: часть строк лишняя, часть отсутствует. Скорее всего, группировка идёт не по тем колонкам.`,
      nudges: [
        'В GROUP BY должны быть ровно те неагрегированные колонки, что стоят в SELECT.',
        'Сверьте гранулярность: задание про месяцы, а группировка по неделям — или наоборот.',
      ],
    });
  }

  return withStyle({
    tone: 'warn',
    title: 'Результат не совпал с эталоном',
    body: `Вернулось ${rows(cmp.userRows)}, ожидается ${rows(cmp.expectedRows)}.`,
    nudges: ['Сравните свой результат с образцом первых строк эталона ниже.'],
  });
}
