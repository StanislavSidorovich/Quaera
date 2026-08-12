import { useI18n } from '../i18n/context';

/**
 * Картинка рядом с заголовком главной: запрос → результат → сверка с эталоном.
 *
 * Иллюстрирует headline той же карточки, а не соседние proofPoints. Разница
 * тонкая, но она и есть повод рисовать: фраза «ответ сверяется с данными»
 * не показывает, ЧТО с чем сверяется, и её легко прочитать как «проверяется
 * текст запроса» — ровно то заблуждение, из-за которого тренажёры с проверкой
 * по шаблону и считаются бесполезными. Две одинаковые таблицы рядом
 * показывают это без слов.
 *
 * Значений в ячейках нет намеренно — только полоски. Любое число здесь стало
 * бы вторым источником правды о датасете: гейта на картинку нет, а датасет
 * пересобирается (`npm run gen:data`), и разошлись бы они молча. Тот же довод,
 * по которому в проекте нет словаря единиц измерения. Имена в коде при этом
 * настоящие: `fact_sellout`, `product_id` и `revenue` есть в schema.json,
 * и запрос как написан — рабочий.
 *
 * Показывается только на широком экране (см. .welcome-intro-figure
 * в styles.css): SVG с подписями в 9px не переживает масштабирование
 * до ширины телефона, а место, ради которого он рисуется, есть только
 * там, где абзац упёрся в свои 68ch и справа осталась пустота.
 */

/** Три строки таблицы: ключ одной ширины, значение — разной. Одни и те же в обеих таблицах. */
const ROWS = [
  { y: 44, value: 30 },
  { y: 66, value: 20 },
  { y: 88, value: 26 },
];

/** Одна из двух таблиц-результатов: рамка, подпись сверху, три строки полосок. */
function ResultTable({ x, label }: { x: number; label: string }) {
  return (
    <g>
      <text className="ql-label" x={x} y={20}>
        {label}
      </text>
      <rect className="ql-panel" x={x + 0.5} y={28.5} width={111} height={77} rx={9} />
      {ROWS.map((row) => (
        <g key={row.y}>
          <rect className="ql-cell-key" x={x + 12} y={row.y} width={34} height={9} rx={4.5} />
          <rect className="ql-cell" x={x + 56} y={row.y} width={row.value} height={9} rx={4.5} />
        </g>
      ))}
    </g>
  );
}

export function QueryLoop() {
  const { t } = useI18n();
  const l = t.welcome.loop;
  return (
    <svg
      className="query-loop"
      /* Поле в 2px слева: у английского «your query» левый вынос буквы y
         уходит за нуль (замер getBBox: x = -0.7), и на нулевой границе
         viewBox его срезало бы волоском. Тот же приём, что в SchemaMap. */
      viewBox="-2 0 450 114"
      role="img"
      aria-label={l.aria}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <marker id="ql-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path className="ql-arrow-head" d="M 0 1 L 7 4 L 0 7 z" />
        </marker>
      </defs>

      {/* Запрос. Строки набраны отдельными <text>: <tspan> с x/dy пришлось бы
          выравнивать вручную под каждый кегль, а строк всего четыре. */}
      <text className="ql-label" x={0} y={20}>
        {l.queryLabel}
      </text>
      <rect className="ql-panel" x={0.5} y={28.5} width={149} height={77} rx={9} />
      <text className="ql-code" x={12} y={48}>
        SELECT product_id,
      </text>
      <text className="ql-code" x={12} y={65}>
        {'       SUM(revenue)'}
      </text>
      <text className="ql-code" x={12} y={82}>
        FROM fact_sellout
      </text>
      <text className="ql-code" x={12} y={99}>
        GROUP BY 1
      </text>

      <line className="ql-arrow" x1={152} y1={67} x2={164} y2={67} markerEnd="url(#ql-arrow)" />

      <ResultTable x={168} label={l.resultLabel} />
      <ResultTable x={336} label={l.expectedLabel} />

      {/* Вердикт между таблицами: галочка и подпись. Стоит в зазоре, а не под
          картинкой, — сверяются именно эти две таблицы, и знак обязан быть
          между ними, иначе он читается как вердикт всей иллюстрации. */}
      <circle className="ql-ok" cx={308} cy={60} r={12} />
      <path className="ql-ok-mark" d="M 302 60 L 306.5 64.5 L 314 56" />
      <text className="ql-ok-label" x={308} y={88}>
        {l.matchLabel}
      </text>
    </svg>
  );
}
