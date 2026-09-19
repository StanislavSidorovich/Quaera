/**
 * Ключевые слова панели вставки по уровню задания — источник для
 * TokenPanel.tsx (React) и для гейта в scripts/verify-content.mjs
 * («каждый токен эталона уровня N обязан быть в панели уровня N»,
 * см. querium-next-steps, тридцатый заход).
 *
 * Файл нарочно без JSX и без TS-конструкций внутри самих массивов
 * (только литералы): verify-content.mjs — голый node без TS-раннера,
 * и читает эти два массива не импортом, а вырезкой текста между
 * `export const ИМЯ ... = [` и завершающим `\n];` с последующим eval —
 * тот же приём, что уже применяется к таблицам README (test:readme-numbers),
 * только источник здесь код, а не markdown. Менять форматирование крайних
 * строк (`= [` / `];` каждый на своей строке) не стоит без правки регулярки
 * в verify-content.mjs.
 */
export interface KeywordLevel {
  upTo: number;
  words: string[];
}

export const SQL_KEYWORDS_BY_LEVEL: KeywordLevel[] = [
  { upTo: 1, words: ['SELECT', 'FROM', 'WHERE', 'ORDER BY', 'AS', 'AND', 'OR', 'DISTINCT', 'LIMIT', 'DESC', 'IN (', 'ROUND('] },
  { upTo: 2, words: ['GROUP BY', 'JOIN', 'LEFT JOIN', 'ON', 'SUM(', 'COUNT(', 'AVG(', 'COALESCE(', 'IS NULL', 'IS NOT NULL', 'BETWEEN'] },
  { upTo: 3, words: ['HAVING', 'WITH', 'CASE WHEN', 'THEN', 'ELSE', 'END'] },
  { upTo: 4, words: ['OVER (', 'PARTITION BY', 'ROWS BETWEEN', 'PRECEDING', 'CURRENT ROW'] },
];

export const PYTHON_KEYWORDS_BY_LEVEL: KeywordLevel[] = [
  { upTo: 1, words: ['result =', '.loc[', '.isin([', '.str.contains(', '& ', '| '] },
  { upTo: 2, words: ['.groupby(', '.agg(', '.merge(', 'as_index=False', '.sum()', '.transform('] },
  { upTo: 3, words: ['.pivot_table(', '.melt(', '.sort_values(', 'pd.to_datetime(', '.resample(', '.rolling('] },
  { upTo: 4, words: ['.assign(', '.reset_index()', 'np.'] },
];

/**
 * Слова панели, которые встречаются в коде: у sql без учёта регистра
 * и пробелов перед скобкой (`over(` = `OVER (`), у python буквально.
 * Длинные слова ищутся первыми и вырезаются из текста, чтобы `LEFT JOIN`
 * не засчитал заодно `JOIN`, а `IS NOT NULL` — `IS NULL` не засчитал вовсе.
 *
 * Нужна кампании (см. storyPanelWords в App.tsx): панель дня показывает
 * только слова, встреченные к этому шагу. Уровень задания для этого не
 * годится — он мерит сложность, а не словарь: суббота первой части стоит
 * на уровне 3 как итог недели, и панель по уровню открывала ей `WITH`
 * и `CASE WHEN`, которые проходят только во второй и третьей частях.
 */
export function panelWordsIn(code: string, track: 'sql' | 'python'): string[] {
  const groups = track === 'sql' ? SQL_KEYWORDS_BY_LEVEL : PYTHON_KEYWORDS_BY_LEVEL;
  const words = groups.flatMap((g) => g.words).sort((a, b) => b.length - a.length);
  let rest = code;
  const found: string[] = [];
  for (const w of words) {
    let src = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (track === 'sql') {
      src = src.replace(/ (?=\\\()/g, '\\s*').replace(/ /g, '\\s+').replace(/(\w)\\\(/g, '$1\\s*\\(');
      // Границы слова с обеих сторон: без правой `AS` находился бы в `ASC`, `ON` — в `ONLY`.
      if (/^[A-Za-z]/.test(w)) src = `\\b${src}`;
      if (/[A-Za-z]$/.test(w)) src = `${src}\\b`;
    }
    const re = new RegExp(src, track === 'sql' ? 'gi' : 'g');
    if (re.test(rest)) {
      found.push(w);
      rest = rest.replace(re, ' ');
    }
  }
  return found;
}
