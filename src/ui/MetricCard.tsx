import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import { useSchema } from './SchemaSheet';

const { metricCard: m, gold } = architecture.artifacts;

/**
 * Карточка метрики из словаря данных. Статичная: формула и источник записаны
 * в architecture.json, зерно берётся из schema.json, число строк из запроса gold,
 * который сверяет `test:architecture`. Владельца в датасете Kaiyo нет, пример подписан.
 */
export function MetricCard() {
  const { locale } = useI18n();
  const schema = useSchema();
  const grainRaw = schema?.tables.find((tb) => tb.table === gold.table)?.grain;
  const grain = grainRaw ? (typeof grainRaw === 'string' ? grainRaw : grainRaw[locale]) : null;
  const rows = (gold.expect[0][0] as number).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');
  const L = m.labels;
  return (
    <div className="arch-art-row arch-metric">
      <p className="arch-art-tag">{m.title[locale]}</p>
      <dl>
        <dt>{L.metric[locale]}</dt>
        <dd><strong>{m.metric[locale]}</strong></dd>
        <dt>{L.definition[locale]}</dt>
        <dd>{m.definition[locale]}</dd>
        <dt>{L.formula[locale]}</dt>
        <dd><code>{m.formula}</code></dd>
        {grain && (
          <>
            <dt>{L.grain[locale]}</dt>
            <dd>{grain}</dd>
          </>
        )}
        <dt>{L.source[locale]}</dt>
        <dd><code>{m.source}</code></dd>
        <dt>{L.quality[locale]}</dt>
        <dd>{m.quality[locale].split('{rows}').join(rows)}</dd>
        <dt>{L.owner[locale]}</dt>
        <dd>
          {m.owner[locale]}
          <span className="muted arch-metric-note">{m.ownerNote[locale]}</span>
        </dd>
      </dl>
    </div>
  );
}
