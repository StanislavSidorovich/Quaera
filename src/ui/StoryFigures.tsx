import type { ReactNode } from 'react';
import { useI18n } from '../i18n/context';
import type { Locale } from '../i18n/context';
import './storyFigures.css';

/*
 * Четыре схемы со строками данных в разговоре сюжета (аудит
 * shots/gemini/2026-11-17-b2/story-image-audit.md, пункты 1, 3, 5, 11).
 * Все числа настоящие, из public/data/quaera.dataset (проверено запросом к
 * .cache/quaera.sqlite) или посчитаны из этих чисел; не выдумывать, при
 * пересборке датасета сверить заново:
 *  - sql-010: суммы units по неделям марта 2025 (все товары) и месяц 2025-03;
 *  - sql-086: product_id 43 = Vitanor Forte x30, продажи только в аптеках (756);
 *    точек по каналам 12 / 8 / 42 / 38 / 44 (всего 144);
 *  - sql-118: Nettora 2024: 5 487 строк, 79 точек, ушедшие 42 (в среднем 388),
 *    оставшиеся 37 (598); точки 13, 14, 15 дали 288, 79, 191;
 *  - py-036: понедельные units первых недель 2024 (все товары).
 * Подписи живут здесь, а не в i18n: схемы привязаны к одному шагу. Английский
 * текст без тире, как в en.ts. Рамка и токены те же, что у DimFactFigure.
 */
type L<T> = Record<Locale, T>;

const fmt = (n: number, locale: Locale) => n.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');

function Frame({ aria, children }: { aria: string; children: ReactNode }) {
  return (
    <figure className="sfig" role="group" aria-label={aria}>
      {children}
    </figure>
  );
}

function Arrow({ text }: { text?: string }) {
  return (
    <div className="sfig-arrow" aria-hidden="true">
      <span className="sfig-arrow-mark">→</span>
      {text && <span className="sfig-arrow-text">{text}</span>}
    </div>
  );
}

/* ---------------------------------------------------------------- 1 */

const MONTH_TXT: L<{ aria: string; weeks: string; month: string; fold: string; note: string }> = {
  ru: {
    aria: 'Пять недельных строк марта 2025 сворачиваются в одну строку месяца 2025-03',
    weeks: 'fact_sellout: по неделям',
    month: 'результат',
    fold: 'substr(week_start, 1, 7) и GROUP BY 1',
    note: 'Семь первых символов одинаковы у пяти недель, поэтому они попадают в одну группу.',
  },
  en: {
    aria: 'Five weekly rows of March 2025 fold into one row for the month 2025-03',
    weeks: 'fact_sellout: by week',
    month: 'result',
    fold: 'substr(week_start, 1, 7) and GROUP BY 1',
    note: 'The first seven characters are the same in all five weeks, so they fall into one group.',
  },
};
const WEEKS: Array<[string, number]> = [
  ['2025-03-03', 8299],
  ['2025-03-10', 6708],
  ['2025-03-17', 6764],
  ['2025-03-24', 6691],
  ['2025-03-31', 8369],
];

export function MonthSliceFigure() {
  const { locale } = useI18n();
  const x = MONTH_TXT[locale];
  return (
    <Frame aria={x.aria}>
      <div className="sfig-row">
        <div className="sfig-side">
          <div className="sfig-scroll"><table className="sfig-table">
            <caption><code>{x.weeks}</code></caption>
            <thead><tr><th>week_start</th><th className="sfig-num">units</th></tr></thead>
            <tbody>
              {WEEKS.map(([d, u]) => (
                <tr key={d}>
                  <td><span className="sfig-key">{d.slice(0, 7)}</span><span className="sfig-dim">{d.slice(7)}</span></td>
                  <td className="sfig-num">{fmt(u, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
        <Arrow text={x.fold} />
        <div className="sfig-side">
          <div className="sfig-scroll"><table className="sfig-table">
            <caption><code>{x.month}</code></caption>
            <thead><tr><th>month</th><th className="sfig-num">units</th></tr></thead>
            <tbody>
              <tr><td><span className="sfig-key">2025-03</span></td><td className="sfig-num">{fmt(36831, locale)}</td></tr>
            </tbody>
          </table></div>
        </div>
      </div>
      <p className="sfig-note">{x.note}</p>
    </Frame>
  );
}

/* ---------------------------------------------------------------- 2 */

const JOIN_TXT: L<{ aria: string; sub: string; cap: string; note: string; outlets: string }> = {
  ru: {
    aria: 'LEFT JOIN оставляет все пять каналов: у четырёх нет продаж товара 43, там NULL, а COALESCE делает из него 0',
    sub: 'подзапрос возвращает одно число',
    cap: 'LEFT JOIN: каналы из dim_customer, продажи товара 43',
    note: 'Обычный JOIN оставил бы одну строку, pharmacy. LEFT JOIN сохраняет все пять каналов.',
    outlets: 'точек',
  },
  en: {
    aria: 'LEFT JOIN keeps all five channels: four have no sales of product 43, they get NULL, and COALESCE turns it into 0',
    sub: 'the subquery returns one number',
    cap: 'LEFT JOIN: channels from dim_customer, sales of product 43',
    note: 'A plain JOIN would keep one row, pharmacy. LEFT JOIN keeps all five channels.',
    outlets: 'outlets',
  },
};
const CHANNELS: Array<[string, number, number | null]> = [
  ['distributor', 12, null],
  ['ecom', 8, null],
  ['modern_trade', 42, null],
  ['pharmacy', 38, 756],
  ['traditional_trade', 44, null],
];

export function LeftJoinFigure() {
  const { locale } = useI18n();
  const x = JOIN_TXT[locale];
  return (
    <Frame aria={x.aria}>
      <div className="sfig-sub">
        <code>(SELECT product_id FROM dim_product WHERE product_name = 'Vitanor Forte x30')</code>
        <span className="sfig-sub-to" aria-hidden="true">→</span>
        <span className="sfig-key">43</span>
        <span className="sfig-sub-note">{x.sub}</span>
      </div>
      <div className="sfig-scroll"><table className="sfig-table">
        <caption><code>{x.cap}</code></caption>
        <thead>
          <tr>
            <th>channel</th>
            <th className="sfig-num">{x.outlets}</th>
            <th className="sfig-num">units</th>
            <th className="sfig-num">→ 0</th>
          </tr>
        </thead>
        <tbody>
          {CHANNELS.map(([c, n, u]) => (
            <tr key={c}>
              <td>{c}</td>
              <td className="sfig-num">{n}</td>
              <td className={`sfig-num${u === null ? ' sfig-null' : ''}`}>{u === null ? 'NULL' : u}</td>
              <td className="sfig-num sfig-key">{u === null ? 0 : u}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <p className="sfig-note">{x.note}</p>
    </Frame>
  );
}

/* ---------------------------------------------------------------- 3 */

const CTE_TXT: L<{ aria: string; s1: string; s1b: string; s2: string; s3: string; a1: string; a2: string; rows: string; outlets: string }> = {
  ru: {
    aria: 'Два хода: 5 487 строк продаж сворачиваются в сумму по каждой из 79 точек (per_outlet), затем по группам «ушла / осталась» берётся среднее',
    s1: 'fact_sellout',
    s1b: 'Nettora, 2024',
    s2: 'per_outlet: строка на точку',
    s3: 'среднее по группе',
    a1: 'SUM … GROUP BY customer_id',
    a2: 'AVG … GROUP BY stayed',
    rows: 'строк',
    outlets: 'точек',
  },
  en: {
    aria: 'Two steps: 5,487 sales rows fold into a sum per outlet for 79 outlets (per_outlet), then the average is taken per group, left or stayed',
    s1: 'fact_sellout',
    s1b: 'Nettora, 2024',
    s2: 'per_outlet: row per outlet',
    s3: 'average per group',
    a1: 'SUM … GROUP BY customer_id',
    a2: 'AVG … GROUP BY stayed',
    rows: 'rows',
    outlets: 'outlets',
  },
};

export function TwoStepFigure() {
  const { locale } = useI18n();
  const x = CTE_TXT[locale];
  return (
    <Frame aria={x.aria}>
      <div className="sfig-row">
        <div className="sfig-side sfig-narrow">
          <div className="sfig-box">
            <code>{x.s1}</code>
            <span>{x.s1b}</span>
            <strong>{fmt(5487, locale)} {x.rows}</strong>
          </div>
        </div>
        <Arrow text={x.a1} />
        <div className="sfig-side">
          <div className="sfig-scroll"><table className="sfig-table">
            <caption><code>{x.s2}</code></caption>
            <thead><tr><th>customer_id</th><th className="sfig-num">units</th></tr></thead>
            <tbody>
              <tr><td>13</td><td className="sfig-num">288</td></tr>
              <tr><td>14</td><td className="sfig-num">79</td></tr>
              <tr><td>15</td><td className="sfig-num">191</td></tr>
              <tr className="sfig-more"><td colSpan={2}>… 79 {x.rows}</td></tr>
            </tbody>
          </table></div>
        </div>
        <Arrow text={x.a2} />
        <div className="sfig-side">
          <div className="sfig-scroll"><table className="sfig-table">
            <caption><code>{x.s3}</code></caption>
            <thead><tr><th>stayed</th><th className="sfig-num">{x.outlets}</th><th className="sfig-num">avg_units</th></tr></thead>
            <tbody>
              <tr><td>0</td><td className="sfig-num">42</td><td className="sfig-num sfig-key">388</td></tr>
              <tr><td>1</td><td className="sfig-num">37</td><td className="sfig-num sfig-key">598</td></tr>
            </tbody>
          </table></div>
        </div>
      </div>
    </Frame>
  );
}

/* ---------------------------------------------------------------- 4 */

const ROLL_TXT: L<{ aria: string; sorted: string; shuffled: string; note1: string; note2: string }> = {
  ru: {
    aria: 'Скользящее среднее за 4 недели: у первых трёх строк NaN; если строки не по датам, среднее берётся по соседям в таблице, а не в календаре',
    sorted: 'ряд по датам',
    shuffled: 'строки не по датам, ошибки нет',
    note1: 'Полное окно из четырёх строк набирается только к четвёртой: первые три значения NaN.',
    note2: 'Четвёртое значение усреднило 01-15, 01-01, 01-29 и 01-08: соседей по таблице, не по календарю.',
  },
  en: {
    aria: 'Rolling mean over 4 weeks: the first three rows are NaN; if rows are not in date order, the mean takes neighbours in the table, not in the calendar',
    sorted: 'series in date order',
    shuffled: 'rows out of date order, no error',
    note1: 'A full window of four rows is reached only at the fourth: the first three values are NaN.',
    note2: 'The fourth value averaged 01-15, 01-01, 01-29 and 01-08: neighbours in the table, not in the calendar.',
  },
};
const SORTED: Array<[string, number, string]> = [
  ['2024-01-01', 5776, 'NaN'],
  ['2024-01-08', 5926, 'NaN'],
  ['2024-01-15', 6101, 'NaN'],
  ['2024-01-22', 6216, '6004.75'],
  ['2024-01-29', 6317, '6140.0'],
  ['2024-02-05', 6231, '6216.25'],
];
const SHUFFLED: Array<[string, number, string]> = [
  ['2024-01-15', 6101, 'NaN'],
  ['2024-01-01', 5776, 'NaN'],
  ['2024-01-29', 6317, 'NaN'],
  ['2024-01-08', 5926, '6030.0'],
];

function RollTable({ rows, caption, locale }: { rows: Array<[string, number, string]>; caption: string; locale: Locale }) {
  return (
    <div className="sfig-scroll"><table className="sfig-table">
      <caption><code>{caption}</code></caption>
      <thead><tr><th>week_start</th><th className="sfig-num">units</th><th className="sfig-num">rolling(4).mean()</th></tr></thead>
      <tbody>
        {rows.map(([d, u, m]) => (
          <tr key={d}>
            <td>{d}</td>
            <td className="sfig-num">{fmt(u, locale)}</td>
            <td className={`sfig-num ${m === 'NaN' ? 'sfig-nan' : 'sfig-key'}`}>{m}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

export function RollingEdgeFigure() {
  const { locale } = useI18n();
  const x = ROLL_TXT[locale];
  return (
    <Frame aria={x.aria}>
      <div className="sfig-row">
        <div className="sfig-side">
          <RollTable rows={SORTED} caption={x.sorted} locale={locale} />
          <p className="sfig-note">{x.note1}</p>
        </div>
        <div className="sfig-side">
          <RollTable rows={SHUFFLED} caption={x.shuffled} locale={locale} />
          <p className="sfig-note">{x.note2}</p>
        </div>
      </div>
    </Frame>
  );
}

/* ------------------------------------------------------- манифест */

/** Ключ: `<день>/intro/<шаг>`; `after`: после какого абзаца вступления стоит схема. */
export const STORY_FIGURES: Readonly<Record<string, { after: number; Figure: () => ReactNode }>> = {
  'day-3-shape-of-the-year/intro/1': { after: 0, Figure: MonthSliceFigure },
  'day-6-who-is-missing/intro/0': { after: 2, Figure: LeftJoinFigure },
  'day-8-two-steps/intro/0': { after: 1, Figure: TwoStepFigure },
  'day-22-background/intro/1': { after: 2, Figure: RollingEdgeFigure },
};
