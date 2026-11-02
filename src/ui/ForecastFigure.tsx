import { Fragment } from 'react';
import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import { Chart } from './Chart';
import type { ChartSpec } from './chartSpec';

const f = architecture.artifacts.forecastAccuracy;
/** Строки [lag_months, wmape, bias] запроса станции «прогноз»: числа не дублируются в JSON, `test:architecture` сверяет их с датасетом. */
const rows = architecture.project.stations
  .find((s) => s.id === 'forecast')!
  .queries!.find((q) => q.id === 'forecast')!.expect as number[][];

/**
 * Ошибка прогноза по горизонтам: столбики того же Chart, что у результата запроса в задании.
 * Статичная врезка на экране роли специалиста по данным, без своей модели прогноза.
 */
export function ForecastFigure() {
  const { locale } = useI18n();
  const spec: ChartSpec = {
    kind: 'bar',
    labels: rows.map((r) => f.horizon[locale].replace('{n}', String(r[0]))),
    views: [{ series: [{ column: f.chart[locale], values: rows.map((r) => r[1]) }], min: 0, max: 40 }],
  };
  return (
    <figure className="arch-figure">
      <h3 className="career-h3">{f.title[locale]}</h3>
      <Chart spec={spec} numberLocale={locale} />
      <p className="muted arch-art-caption">
        {f.caption[locale].split('`').map((p, i) => (i % 2 ? <code key={i}>{p}</code> : <Fragment key={i}>{p}</Fragment>))}
      </p>
    </figure>
  );
}
