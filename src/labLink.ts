/**
 * Ссылка «Открыть в Lab»: код человека из задания уходит в свободную песочницу
 * lab.quaera.app на тех же данных Kaiyo Trading.
 *
 * Формат принимает Lab (v0.12.0, `src/core/shareLink.ts` в StrataLab):
 * `https://lab.quaera.app/#s=<data>`, где data — base64url без паддинга от
 * deflate-raw UTF-8 JSON `{"v":1,"d":["quaera"],"t":[{"n","q","l"?}]}`.
 * `d` — датасеты Lab для загрузки (Kaiyo Trading там зовётся `quaera`), `l`
 * опускается для DuckDB-SQL и равен `"python"` для вкладки Python с ячейками
 * `# %%`. Фрагмент `#` до сервера не доходит: код не покидает браузер иначе,
 * чем в адресной строке самого человека.
 *
 * Модуль без импортов намеренно: гейт `test-lab-link.mjs` компилирует его
 * одним файлом и проверяет roundtrip без браузера.
 */

export const LAB_URL = 'https://lab.quaera.app/';
/** Имя окна Lab — то же, что ставит себе приложение и ищет переключатель семьи (family/switcher.js). */
export const LAB_WINDOW = 'quaera-lab';
/** Id датасета Kaiyo Trading в каталоге Lab и имя схемы, в которой лежат его таблицы. */
export const LAB_DATASET = 'quaera';

export interface LabTab {
  n: string;
  q: string;
  l?: 'python';
}

export interface LabShare {
  v: 1;
  d: string[];
  t: LabTab[];
}

/**
 * SQL тренажёра → SQL для Lab: каждое имя таблицы датасета становится
 * `quaera.<таблица>`.
 *
 * Почему переписывать, а не ставить `SET search_path`: у Lab таблицы датасета
 * живут в схеме `quaera`, без схемы имя не находится, а пути поиска Lab не
 * выставляет; его же стартовые запросы пишут имя со схемой. Явное имя видно
 * человеку в коде и не зависит от того, как Lab гонит инструкции вкладки.
 *
 * Не трогаются строки ('…'), идентификаторы в кавычках ("…"), комментарии,
 * уже квалифицированные имена (`quaera.dim_product`) и имя таблицы как
 * квалификатор колонки (`dim_product.brand`): в DuckDB оно и так связывается
 * с таблицей из FROM. Регистр имени SQLite не важен, поэтому сравнение без него.
 */
export function labSql(code: string, tables: readonly string[]): string {
  const known = new Set(tables.map((t) => t.toLowerCase()));
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const c = code[i];
    if (c === '-' && code[i + 1] === '-') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      out += code.slice(i, stop);
      i = stop;
    } else if (c === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      out += code.slice(i, stop);
      i = stop;
    } else if (c === "'" || c === '"') {
      // Закрывающая кавычка; удвоенная ('' или "") — экранированная, литерал продолжается.
      let j = i + 1;
      while (j < n) {
        if (code[j] === c) {
          if (code[j + 1] === c) j += 2;
          else break;
        } else j++;
      }
      const stop = Math.min(j + 1, n);
      out += code.slice(i, stop);
      i = stop;
    } else if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_$]/.test(code[j])) j++;
      const word = code.slice(i, j);
      if (known.has(word.toLowerCase()) && !qualified(code, i, j)) out += `${LAB_DATASET}.${word}`;
      else out += word;
      i = j;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Слово стоит после точки или перед ней — часть составного имени, не голое имя таблицы. */
function qualified(code: string, start: number, end: number): boolean {
  let a = start - 1;
  while (a >= 0 && /\s/.test(code[a])) a--;
  if (a >= 0 && code[a] === '.') return true;
  let b = end;
  while (b < code.length && /\s/.test(code[b])) b++;
  return b < code.length && code[b] === '.';
}

/**
 * Код pandas тренажёра → текст вкладки Python в Lab: две ячейки `# %%`.
 *
 * Первая готовит то, что тренажёр даёт заданию само (python-bootstrap.py,
 * `_make_ns`): `pd`, `np` и таблицы-DataFrame под своими именами. У Lab
 * ни `pd`, ни таблиц в пространстве имён нет, таблицы приходят из
 * `lab.table("quaera.<таблица>")`. Вторая ячейка — код человека как есть.
 *
 * Ответ тренажёр берёт из переменной `result`, а Lab показывает последнее
 * выражение ячейки. Поэтому, если код заводит `result`, в конец ячейки
 * дописывается строка `result` — иначе ячейка выполнится и ничего не покажет.
 */
export function labPython(code: string, tables: readonly string[]): string {
  const loads = tables.map((t) => `${t} = lab.table("${LAB_DATASET}.${t}")`);
  const setup = ['# %%', 'import pandas as pd', 'import numpy as np', ...loads].join('\n');
  const body = code.replace(/\s+$/, '');
  const lines = body.split('\n');
  const showsResult = /^\s*result\s*$/.test(lines[lines.length - 1] ?? '');
  const assignsResult = /(^|\n)\s*result\s*(\[[^\]]*\]\s*)?=(?!=)/.test(body);
  const tail = assignsResult && !showsResult ? '\nresult' : '';
  return `${setup}\n\n# %%\n${body}${tail}\n`;
}

/**
 * Таблицы, которые код называет: границей слова, без учёта регистра.
 * Нужна pandas-ячейке загрузки: таблицы задания (taskTables) плюс те, что
 * человек взял сам сверх эталона.
 */
export function tablesInCode(code: string, tables: readonly string[]): string[] {
  return tables.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(code));
}

/**
 * Строки, которые ставятся перед SQL, если код работает с датой как с текстом.
 *
 * В тренажёре (SQLite) даты лежат текстом YYYY-MM-DD, и курс этому учит:
 * `substr(week_start, 1, 7)` — месяц. В Lab те же колонки имеют тип DATE,
 * а DuckDB с 0.10 сам не приводит DATE к тексту: `substr(DATE, …)` падает
 * ошибкой Binder (22 эталона из 82 на 2026-10-19). `old_implicit_casting`
 * возвращает это приведение, и все эталоны проходят. Строка видна в коде
 * вкладки, а не ставится в Lab молча: разница диалектов — тоже урок.
 * Настройка действует до конца визита в Lab, во всех вкладках.
 */
export const LAB_DATE_PRELUDE =
  "-- quaera.app keeps dates as text, Lab keeps them as DATE.\n" +
  '-- This line lets substr(date, …) and LIKE work on dates as in the trainer:\n' +
  'SET old_implicit_casting = true;\n\n';

/** Код обращается с датой как с текстом: функции строк и LIKE. */
export function needsDatePrelude(code: string): boolean {
  return /\b(substr|substring|instr|like|glob)\b/i.test(code);
}

/** JSON ссылки: одна вкладка с кодом задания. */
export function labShare(title: string, code: string, language: 'sql' | 'python', tables: readonly string[]): LabShare {
  const tab: LabTab =
    language === 'python'
      ? { n: title, q: labPython(code, tables), l: 'python' }
      : { n: title, q: (needsDatePrelude(code) ? LAB_DATE_PRELUDE : '') + labSql(code, tables) };
  return { v: 1, d: [LAB_DATASET], t: [tab] };
}

async function deflateRaw(text: string): Promise<Uint8Array> {
  const stream = new Blob([new TextEncoder().encode(text)]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function base64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Адрес Lab с упакованной ссылкой в `#s=`. */
export async function labUrl(share: LabShare): Promise<string> {
  return `${LAB_URL}#s=${base64Url(await deflateRaw(JSON.stringify(share)))}`;
}

/**
 * Открыть ссылку в окне `quaera-lab`. Схема та же, что у переключателя семьи
 * (family/switcher.js, window.quaeraOpenApp), с одной разницей: уже открытое
 * окно Lab не только получает фокус, но и переходит на новый адрес. Меняется
 * лишь фрагмент `#s=`, страница не перезагружается: Lab ловит hashchange
 * и добавляет вкладку рядом с открытыми, ничего не теряя.
 *
 * true — клик обработан (preventDefault вызван); false — пусть сработает
 * обычная ссылка с target=_blank (модификаторы, средняя кнопка, окно не дали).
 */
export function openLab(
  url: string,
  event?: Pick<MouseEvent, 'button' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'preventDefault'>
): boolean {
  if (event && (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return false;
  let w: Window | null = null;
  try {
    w = window.open('', LAB_WINDOW);
  } catch {
    w = null;
  }
  if (!w) return false;
  let fresh = false;
  try {
    fresh = w.location.href === 'about:blank';
  } catch {
    fresh = false;
  }
  try {
    if (fresh) w.opener = null;
    w.location.href = url;
  } catch {
    return false;
  }
  try {
    w.focus();
  } catch {
    /* iOS и подобные: окно остаётся, где было */
  }
  event?.preventDefault();
  return true;
}
