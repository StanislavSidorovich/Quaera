import { useRef } from 'react';

/**
 * Редактор SQL для телефона.
 *
 * Набор кода с экранной клавиатуры — то, на чём ломаются все мобильные
 * тренажёры: каждая скобка и кавычка требуют переключения раскладки.
 * Панель токенов снимает большую часть ввода: ключевые слова и имена колонок
 * вставляются одним касанием, фокус и позиция курсора при этом сохраняются,
 * поэтому клавиатура не закрывается и мысль не теряется.
 */

const KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'GROUP BY',
  'ORDER BY',
  'HAVING',
  'JOIN',
  'LEFT JOIN',
  'ON',
  'AND',
  'OR',
  'AS',
  'WITH',
  'CASE WHEN',
  'THEN',
  'ELSE',
  'END',
  'SUM(',
  'COUNT(',
  'AVG(',
  'ROUND(',
  'COALESCE(',
  'DISTINCT',
  'IS NULL',
  'IS NOT NULL',
  'BETWEEN',
  'IN (',
  'LIMIT',
  'DESC',
  'OVER (',
  'PARTITION BY',
];

const SYMBOLS = ['(', ')', ',', "'", '.', '*', '=', '>', '<', '>=', '<=', '<>', '||', '_'];

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** Имена таблиц и колонок задания — вставляются одним касанием. */
  suggestions: string[];
  disabled?: boolean;
  placeholder?: string;
}

export function SqlEditor({ value, onChange, suggestions, disabled, placeholder }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  /** Вставка в позицию курсора без потери фокуса — иначе клавиатура схлопывается. */
  const insert = (text: string) => {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const before = value.slice(0, start);
    // Пробел перед словом ставим сами, но не удваиваем и не лепим к открытой скобке.
    const needsSpace = /[\w)]$/.test(before) && /^[A-Z(]/.test(text);
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        {...({ autoCapitalize: 'none', 'data-gramm': 'false' } as any)}
      />
      <div className="accessory" role="toolbar" aria-label="Символы SQL">
        {SYMBOLS.map((s) => (
          <button key={s} type="button" className="dim" onClick={() => insert(s)} disabled={disabled}>
            {s}
          </button>
        ))}
      </div>
      <div className="accessory" role="toolbar" aria-label="Ключевые слова SQL">
        {KEYWORDS.map((k) => (
          <button key={k} type="button" onClick={() => insert(k)} disabled={disabled}>
            {k}
          </button>
        ))}
      </div>
      {suggestions.length > 0 && (
        <div className="accessory" role="toolbar" aria-label="Таблицы и колонки">
          {suggestions.map((s) => (
            <button key={s} type="button" className="dim" onClick={() => insert(s)} disabled={disabled}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
