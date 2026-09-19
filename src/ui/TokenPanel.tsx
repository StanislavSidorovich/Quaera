import { useState } from 'react';
import { SQL_KEYWORDS_BY_LEVEL, PYTHON_KEYWORDS_BY_LEVEL } from '../content/panelKeywords';
import type { Track } from '../content/types';
import { useI18n } from '../i18n/context';

/**
 * Ряды символов/цифр/ключевых слов — общая часть панели ввода write
 * и fill (см. шапку CodeEditor.tsx про то, зачем панель вообще нужна
 * и по какому правилу собран её состав). Вынесена в отдельный компонент
 * 2026-09-16: до этого панель жила только в CodeEditor, и на fill
 * (см. FillTemplate в TaskView.tsx) вставить скобку/подчёркивание можно
 * было только из шторки схемы данных, хотя пропуски несут бо́льшую часть
 * первой недели — именно там телефон чаще всего застревает за `?123`.
 *
 * Панель таблиц/колонок (chips) сюда не входит: у write она строится
 * из текста редактора (CodeEditor сам знает, что уже написано), у fill —
 * отдельным механизмом плашек таблиц (см. querium-next-steps, п.4
 * двадцать девятого захода). Эти два источника разные, а ряды символов
 * и ключевых слов — нет, потому и вынесены.
 */

const SQL_SYMBOLS = ['(', ')', ',', "'", '.', '*', '-', '=', '>', '<', '>=', '<=', '<>', '||', '_'];
const PYTHON_SYMBOLS = ['(', ')', '[', ']', ',', "'", '.', '-', '==', '!=', '>', '<', '&', '|', '~', '_'];

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export function symbolsFor(track: Track): string[] {
  return track === 'sql' ? SQL_SYMBOLS : PYTHON_SYMBOLS;
}

/**
 * Порядок SQL-слов в панели — по частоте в запросах, один на все уровни.
 *
 * Ряд ограничен по высоте (.accessory в styles.css), и при порядке «по
 * уровням» тема задания уезжала за край: в `sql-098` (соединение) `JOIN`
 * и `ON` лежали в скрытом четвёртом ряду, а на виду стояли `LIMIT`
 * и `DISTINCT`. «Слова текущего уровня первыми» чинило четверг и ломало
 * субботу: капстоун недели 1 — уровень 3, и первым рядом вставали `HAVING`
 * и `CASE WHEN`, которые ему не нужны, а `SELECT` уходил вниз. Уровень
 * слова говорит, когда его учат, а не как часто оно нужно.
 *
 * Постоянный порядок заодно держит каждое слово на своём месте от задания
 * к заданию — рука запоминает, где `GROUP BY`. Уровень по-прежнему только
 * фильтрует (keywordsFor); слово вне списка встаёт в конец, не теряется.
 *
 * **Порядок теперь по замеру, а не по ощущению:** до 2026-09-19 он назывался
 * «по частоте», но OR (2 эталона из 67) и LIMIT (3) стояли на виду, а ROUND(
 * (42) и BETWEEN (30) уходили за прокрутку. Гейт `panel-order` в
 * verify-content.mjs держит правило: слово за видимой частью не просят чаще,
 * чем слово внутри неё. Добавил слово или задание — гейт скажет, если порядок
 * разошёлся с содержимым.
 */
const SQL_PANEL_ORDER = [
  'SELECT', 'FROM', 'WHERE', 'AS', 'GROUP BY', 'AND', 'ROUND(', 'JOIN', 'ON', 'SUM(',
  'ORDER BY', 'BETWEEN', 'COUNT(', 'WITH', 'DESC',
  'AVG(', 'CASE WHEN', 'THEN', 'ELSE', 'END', 'DISTINCT', 'IS NOT NULL', 'LEFT JOIN', 'OVER (',
  'IS NULL', 'COALESCE(', 'IN (', 'LIMIT', 'HAVING', 'PARTITION BY', 'ROWS BETWEEN', 'PRECEDING',
  'CURRENT ROW', 'OR',
];

/**
 * `seen` — словарь кампании к этому шагу (см. storyPanelWords в App.tsx).
 * Когда он есть, уровень не фильтрует вовсе: в кампании ступень задаёт день,
 * а уровень задания мерит сложность, не пройденные слова (суббота первой
 * части — уровень 3 и без `seen` показывала бы `WITH` и `CASE WHEN`).
 */
export function keywordsFor(track: Track, level: number, seen?: string[]): string[] {
  const groups = track === 'sql' ? SQL_KEYWORDS_BY_LEVEL : PYTHON_KEYWORDS_BY_LEVEL;
  const words = seen
    ? groups.flatMap((g) => g.words).filter((w) => seen.includes(w))
    : groups.filter((g) => g.upTo <= level).flatMap((g) => g.words);
  if (track !== 'sql') return words;
  const rank = (w: string) => {
    const i = SQL_PANEL_ORDER.indexOf(w);
    return i < 0 ? SQL_PANEL_ORDER.length : i;
  };
  return [...words].sort((a, b) => rank(a) - rank(b));
}

const TOKENS_STORAGE_KEY = 'quaera-tokens';

function initialTokensOpen(): boolean {
  try {
    return localStorage.getItem(TOKENS_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Показ панели — общее состояние между write и fill: кто один раз включил
 * панель в задании, видит её и в пропусках того же экрана, без повторного
 * переключения. Оба места монтируют собственный экземпляр редактора, поэтому
 * состояние не React-контекст, а localStorage за общим ключом — тот же приём,
 * что был у initialTokensOn в CodeEditor до выноса.
 */
export function useTokensOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(initialTokensOpen);
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(TOKENS_STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        // localStorage недоступен — просто не запоминаем выбор между заданиями
      }
      return next;
    });
  };
  return [open, toggle];
}

const KEYBOARD_STORAGE_KEY = 'quaera-keyboard';

function initialKeyboardOpen(): boolean {
  try {
    return localStorage.getItem(KEYBOARD_STORAGE_KEY) === 'on';
  } catch {
    return false;
  }
}

/**
 * Показ системной клавиатуры — тот же общий приём, что и у useTokensOpen
 * выше, и по той же причине: `CodeEditor` (write) и `FillTemplate` (fill,
 * см. TaskView.tsx) вставки — свои экземпляры полей ввода, и без общего
 * ключа localStorage тумблер, выключенный в write, снова включался бы
 * у пропусков той же задачи.
 *
 * Вынесен из CodeEditor.tsx 2026-09-17: до этого клавиатуру мог скрыть
 * только write, а у пропусков системная клавиатура всплывала при касании
 * любого поля и не убиралась ничем, кроме кнопки «Назад» на самой
 * клавиатуре, — тогда как ровно это же самое уже было решено для write.
 */
export function useKeyboardOpen(): [boolean, () => void] {
  const [open, setOpen] = useState(initialKeyboardOpen);
  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(KEYBOARD_STORAGE_KEY, next ? 'on' : 'off');
      } catch {
        // localStorage недоступен — просто не запоминаем выбор между заданиями
      }
      return next;
    });
  };
  return [open, toggle];
}

interface Props {
  level: number;
  track: Track;
  /** Словарь кампании к этому шагу; нет — фильтр по уровню (см. keywordsFor). */
  seen?: string[];
  open: boolean;
  onInsert: (text: string) => void;
  disabled?: boolean;
  /** Только у write: своя textarea и есть что стирать посимвольно. У fill — обычный input с системной клавиатурой, ⌫ там уже под рукой. */
  onBackspace?: () => void;
}

export function TokenPanel({ level, track, seen, open, onInsert, disabled, onBackspace }: Props) {
  const { t } = useI18n();
  const symbols = symbolsFor(track);
  const keywords = keywordsFor(track, level, seen);

  return (
    <div className="accessory-stack" data-open={open}>
      <div className="accessory symbols" role="toolbar" aria-label={t.editor.symbolsAria(track)}>
        {symbols.map((s) => (
          <button key={s} type="button" className="dim" onClick={() => onInsert(s)} disabled={disabled}>
            {s}
          </button>
        ))}
        {onBackspace && (
          <button
            type="button"
            className="erase"
            aria-label={t.editor.backspaceAria}
            onClick={onBackspace}
            disabled={disabled}
          >
            ⌫
          </button>
        )}
      </div>
      <div className="accessory digits" role="toolbar" aria-label={t.editor.digitsAria}>
        {DIGITS.map((d) => (
          <button key={d} type="button" className="dim" onClick={() => onInsert(d)} disabled={disabled}>
            {d}
          </button>
        ))}
      </div>
      <div className="accessory" role="toolbar" aria-label={t.editor.keywordsAria(track)}>
        {keywords.map((k) => (
          <button key={k} type="button" onClick={() => onInsert(k)} disabled={disabled}>
            {k}
          </button>
        ))}
      </div>
    </div>
  );
}
