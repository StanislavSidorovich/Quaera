import { useMemo } from 'react';
import type { SchemaDoc } from '../engine/types';
import { useI18n } from '../i18n/context';
import { LAYOUT, buildSchemaLayout } from './schemaLayout';

/**
 * Схема данных картинкой — то, чего не давал ни один список.
 *
 * Группы «факты / справочники / сырой слой» на экране «Данные» уже названы
 * словами, и у каждой таблицы есть чипы связей. Но связь, написанная
 * текстом, отвечает на вопрос «куда ссылается эта таблица», а вопрос
 * у новичка другой: «как всё это устроено вместе». Двенадцать ответов
 * по отдельности его не составляют — форму видно только целиком.
 *
 * Рисование отделено от раскладки (см. schemaLayout.ts): здесь только SVG,
 * цвета и клики, ни одного решения о том, кто где стоит.
 *
 * Узлы — настоящие кнопки, а не картинка: <g role="button" tabIndex={0}>
 * с обработчиком Enter/Space. Клик открывает описание таблицы ниже
 * на этом же экране — иначе схема осталась бы украшением, из которого
 * некуда пойти.
 */
export function SchemaMap({
  doc,
  onOpenTable,
}: {
  doc: SchemaDoc;
  /** Раскрыть и показать таблицу в списке ниже. */
  onOpenTable: (table: string) => void;
}) {
  const { t } = useI18n();
  const map = useMemo(() => buildSchemaLayout(doc), [doc]);

  return (
    <>
      <p className="muted" style={{ margin: '0 0 12px', fontSize: 13, lineHeight: 1.55 }}>
        {t.data.mapIntro}
      </p>
      {/*
       * Своя горизонтальная прокрутка, а не вписывание по ширине: тот же
       * приём, что у примеров строк в TableDoc. Вписывание уменьшало бы
       * имена таблиц ровно на узком экране, где и так тесно, — а имя
       * таблицы здесь единственный текст, ради которого всё рисуется.
       */}
      <div className="schema-map-wrap">
        <svg
          className="schema-map"
          width={map.width + 4}
          height={map.height + 4}
          viewBox={`-2 -2 ${map.width + 4} ${map.height + 4}`}
          role="group"
          aria-label={t.data.mapAria}
        >
          <defs>
            {/*
             * Два наконечника вместо одного с currentColor: context-stroke
             * в маркерах поддержан не везде, а цвет связи — половина её
             * смысла (звезда одним, снежинка другим).
             */}
            <marker
              id="qm-arrow-star"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path className="schema-arrow star" d="M 0 1 L 7 4 L 0 7 z" />
            </marker>
            <marker
              id="qm-arrow-snow"
              viewBox="0 0 8 8"
              refX="7"
              refY="4"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path className="schema-arrow snowflake" d="M 0 1 L 7 4 L 0 7 z" />
            </marker>
          </defs>

          <text className="schema-map-caption" x={map.factLabelX} y={map.labelY}>
            {t.data.mapFactsLabel}
          </text>
          <text className="schema-map-caption" x={map.dimLabelX} y={map.labelY}>
            {t.data.mapDimsLabel}
          </text>

          {/* Связи под узлами: линия, проходящая поверх имени таблицы, читается как зачёркивание. */}
          {map.edges.map((e) => (
            <path
              key={`${e.from}->${e.to}`}
              className={`schema-edge ${e.kind}`}
              d={e.path}
              markerEnd={`url(#${e.kind === 'star' ? 'qm-arrow-star' : 'qm-arrow-snow'})`}
            />
          ))}

          {map.nodes.map((n) => (
            <g
              key={n.table}
              className={`schema-node group-${n.group}`}
              role="button"
              tabIndex={0}
              aria-label={t.data.mapOpenAria(n.table)}
              onClick={() => onOpenTable(n.table)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenTable(n.table);
                }
              }}
            >
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10} />
              <text x={n.x + LAYOUT.padX} y={n.y + n.h / 2} dominantBaseline="central">
                {n.table}
              </text>
              {n.selfRef && (
                <text
                  className="schema-node-self"
                  x={n.x + n.w - LAYOUT.padX}
                  y={n.y + n.h / 2}
                  dominantBaseline="central"
                  textAnchor="end"
                >
                  ↻
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/*
       * Легенда обязательна: три вида линии на картинке различимы, но
       * не самоочевидны, а каждый из них — утверждение о данных, которое
       * стоит уметь прочитать. Не подписи к цветам, а короткие фразы
       * о том, что связь означает.
       */}
      <dl className="schema-map-legend">
        {[
          ['star', t.data.mapLegendStar],
          ['snowflake', t.data.mapLegendSnowflake],
          ['self', t.data.mapLegendSelf],
          ['standalone', t.data.mapLegendStandalone],
        ].map(([kind, text]) => (
          <div key={kind}>
            <dt className={`schema-legend-mark ${kind}`} aria-hidden />
            <dd>{text}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}
