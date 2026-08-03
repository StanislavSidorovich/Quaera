import { useMemo, useRef } from 'react';
import type { Track } from '../content/types';
import type { SchemaDoc } from '../engine/types';
import { ru } from '../i18n/ru';

/**
 * Редактор кода для телефона — общий для SQL и Python.
 *
 * Набор кода с экранной клавиатуры — то, на чём ломаются все мобильные
 * тренажёры: каждая скобка и кавычка требуют переключения раскладки.
 * Панель токенов снимает большую часть ввода: символы, ключевые слова
 * и имена таблиц/колонок вставляются одним касанием, фокус и позиция
 * курсора при этом сохраняются, поэтому клавиатура не закрывается
 * и мысль не теряется.
 *
 * Состав панели языковой: SQL и pandas почти не пересекаются по синтаксису
 * (`GROUP BY` против `.groupby(`), поэтому набор символов и ключевых слов
 * выбирается по track, а не сваливается в одну общую свалку токенов —
 * показывать SELECT/FROM в Python-задании не просто бесполезно, а прямо
 * подсказывает неверный синтаксис.
 *
 * Панель таблиц/колонок общая: она строится из той же схемы данных,
 * которой пользуется и SQL, и pandas — один датасет, одни имена.
 */

const SQL_SYMBOLS = ['(', ')', ',', "'", '.', '*', '=', '>', '<', '>=', '<=', '<>', '||', '_'];
const PYTHON_SYMBOLS = ['(', ')', '[', ']', ',', "'", '.', '==', '!=', '>', '<', '&', '|', '~', '_'];

/** Ключевые слова открываются по мере роста сложности заданий. */
const SQL_KEYWORDS_BY_LEVEL: { upTo: number; words: string[] }[] = [
  { upTo: 1, words: ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'AS', 'AND', 'OR', 'DISTINCT', 'LIMIT', 'DESC'] },
  {
    upTo: 2,
    words: ['GROUP BY', 'JOIN', 'ON', 'SUM(', 'COUNT(', 'AVG(', 'ROUND(', 'COALESCE(', 'IS NULL', 'IS NOT NULL', 'BETWEEN', 'IN ('],
  },
  { upTo: 3, words: ['LEFT JOIN', 'HAVING', 'WITH', 'CASE WHEN', 'THEN', 'ELSE', 'END'] },
  { upTo: 4, words: ['OVER (', 'PARTITION BY', 'ROWS BETWEEN', 'PRECEDING', 'CURRENT ROW'] },
];

const PYTHON_KEYWORDS_BY_LEVEL: { upTo: number; words: string[] }[] = [
  { upTo: 1, words: ['result =', '.loc[', '.isin([', '.str.contains(', '& ', '| '] },
  { upTo: 2, words: ['.groupby(', '.agg(', '.merge(', 'as_index=False', '.sum()', '.transform('] },
  { upTo: 3, words: ['.pivot_table(', '.melt(', '.sort_values(', 'pd.to_datetime(', '.resample(', '.rolling('] },
  { upTo: 4, words: ['.assign(', '.reset_index()', 'np.'] },
];

interface Props {
  value: string;
  onChange: (v: string) => void;
  schema: SchemaDoc | null;
  /** Уровень задания — определяет, какие конструкции показывать в панели. */
  level: number;
  /** Выбирает набор символов и ключевых слов: SQL и pandas синтаксически не пересекаются. */
  track: Track;
  disabled?: boolean;
  placeholder?: string;
}

export function CodeEditor({ value, onChange, schema, level, track, disabled, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const isSql = track === 'sql';

  const symbols = isSql ? SQL_SYMBOLS : PYTHON_SYMBOLS;
  const keywordGroups = isSql ? SQL_KEYWORDS_BY_LEVEL : PYTHON_KEYWORDS_BY_LEVEL;
  const keywords = useMemo(
    () => keywordGroups.filter((g) => g.upTo <= level).flatMap((g) => g.words),
    [keywordGroups, level]
  );

  /**
   * Колонки упомянутых таблиц идут первыми, следом — имена таблиц,
   * чтобы соединение оставалось в одно касание. Пока таблица не выбрана,
   * показываются только таблицы: колонки без контекста бесполезны.
   */
  const chips = useMemo(() => {
    if (!schema) return [];
    const tables = schema.tables.map((t) => t.table);
    const mentioned = schema.tables.filter((t) => new RegExp(`\\b${t.table}\\b`).test(value));
    if (!mentioned.length) return tables;
    const columns = [...new Set(mentioned.flatMap((t) => t.columns.map((c) => c.name)))];
    const rest = tables.filter((t) => !mentioned.some((m) => m.table === t));
    return [...columns, ...rest];
  }, [schema, value]);

  /** Вставка в позицию курсора без потери фокуса — иначе клавиатура схлопывается. */
  const insert = (text: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    // Пробел ставим между двумя «словами» — иначе имена колонок слипаются
    // (date_id + year давало date_idyear). Перед запятой и закрывающей скобкой
    // пробел не нужен, после открывающей — тоже.
    const needsSpace = /[\w)'"\]]$/.test(before) && /^[\w([]/.test(text);
    const chunk = (needsSpace ? ' ' : '') + text;
    const next = before + chunk + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + chunk.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div>
      <textarea
        ref={ref}
        className="sql"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        // Автозамена и заглавные буквы превращают ввод кода в борьбу с браузером.
        spellCheck={false}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="off"
        data-gramm="false"
      />
      <div className="accessory" role="toolbar" aria-label={ru.editor.symbolsAria(track)}>
        {symbols.map((s) => (
          <button key={s} type="button" className="dim" onClick={() => insert(s)} disabled={disabled}>
            {s}
          </button>
        ))}
      </div>
      <div className="accessory" role="toolbar" aria-label={ru.editor.keywordsAria(track)}>
        {keywords.map((k) => (
          <button key={k} type="button" onClick={() => insert(k)} disabled={disabled}>
            {k}
          </button>
        ))}
      </div>
      {chips.length > 0 && (
        <div className="accessory" role="toolbar" aria-label={ru.editor.chipsAria}>
          {chips.map((s) => (
            <button key={s} type="button" className="dim" onClick={() => insert(s)} disabled={disabled}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
