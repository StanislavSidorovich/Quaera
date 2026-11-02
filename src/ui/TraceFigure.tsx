import { architecture } from '../content/architecture';
import { useI18n } from '../i18n/context';
import { Chart } from './Chart';
import type { ChartSpec } from './chartSpec';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * График под текстом шага маршрута. Данные лежат в architecture.json и
 * сверяются гейтом с запросом шага; рисует тот же Chart, что и результат
 * запроса в задании, без своих цветов.
 */
export function TraceFigure({ kind }: { kind: 'line' | 'split' }) {
  const { locale } = useI18n();
  const { months, outlets, units, names } = architecture.trace.figure;
  const fmt = (month: string, long: boolean) => {
    const [y, mo] = month.split('-').map(Number);
    const text = new Intl.DateTimeFormat(locale, { month: long ? 'long' : 'short', year: long ? undefined : 'numeric', timeZone: 'UTC' }).format(
      new Date(Date.UTC(y, mo - 1, 1))
    );
    return cap(text);
  };
  const last = months.length - 1;

  if (kind === 'line') {
    const spec: ChartSpec = {
      kind: 'line',
      labels: months.map((x) => fmt(x, false)),
      positions: months.map((_, i) => i / last),
      views: [{ series: [{ column: names.units[locale], values: units }], min: 0, max: 5000 }],
    };
    return (
      <div className="arch-figure">
        <Chart spec={spec} numberLocale={locale} />
      </div>
    );
  }

  const ends = [0, last];
  const perOutlet = ends.map((i) => Math.round((units[i] / outlets[i]) * 10) / 10);
  const bars = (column: string, values: number[], max: number): ChartSpec => ({
    kind: 'bar',
    labels: ends.map((i) => fmt(months[i], true)),
    views: [{ series: [{ column, values }], min: 0, max }],
  });
  return (
    <div className="arch-figure arch-figure-split">
      <Chart spec={bars(names.outlets[locale], ends.map((i) => outlets[i]), 80)} numberLocale={locale} />
      <Chart spec={bars(`× ${names.perOutlet[locale]}`, perOutlet, 50)} numberLocale={locale} />
      <Chart spec={bars(`= ${names.units[locale]}`, ends.map((i) => units[i]), 2500)} numberLocale={locale} />
    </div>
  );
}
