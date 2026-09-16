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
