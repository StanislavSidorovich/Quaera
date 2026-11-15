import { useI18n } from '../i18n/context';
import './dimFactFigure.css';

/*
 * Рисунок первого дня: справочник против фактов. Строки настоящие, из
 * public/data/quaera.dataset: dim_product, product_id 1 к 3; fact_sellout,
 * точка 15, неделя 2024-01-01 (колонка week_start), те же три товара.
 * Не выдумывать значения: при пересборке датасета сверить.
 */
const DIM: Array<[number, string, string]> = [
  [1, 'Aqualis Still 0.5 L', 'Aqualis'],
  [2, 'Aqualis Still 1.5 L', 'Aqualis'],
  [3, 'Aqualis Sparkling 0.5 L', 'Aqualis'],
];
const FACT: Array<[string, number, number]> = [
  ['2024-01-01', 1, 8],
  ['2024-01-01', 2, 5],
  ['2024-01-01', 3, 10],
];

export function DimFactFigure() {
  const { t } = useI18n();
  const f = t.storyMode.dimFact;
  return (
    <figure className="dimfact" aria-label={f.aria}>
      <div className="dimfact-side">
        <table className="dimfact-table">
          <caption><code>dim_product</code> <span>{f.dimCap}</span></caption>
          <colgroup><col style={{ width: '36%' }} /><col style={{ width: '40%' }} /><col style={{ width: '24%' }} /></colgroup>
          <thead>
            <tr><th className="dimfact-key">product_id</th><th>product_name</th><th>brand</th></tr>
          </thead>
          <tbody>
            {DIM.map((r) => (
              <tr key={r[0]}><td className="dimfact-key">{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dimfact-link" aria-hidden="true">
        <span className="dimfact-arrow">↔</span>
        <span className="dimfact-link-text">product_id</span>
      </div>
      <div className="dimfact-side">
        <table className="dimfact-table">
          <caption><code>fact_sellout</code> <span>{f.factCap}</span></caption>
          <colgroup><col style={{ width: '36%' }} /><col style={{ width: '36%' }} /><col style={{ width: '26%' }} /></colgroup>
          <thead>
            <tr><th>week_start</th><th className="dimfact-key">product_id</th><th>units</th></tr>
          </thead>
          <tbody>
            {FACT.map((r, i) => (
              <tr key={i}><td>{r[0]}</td><td className="dimfact-key">{r[1]}</td><td>{r[2]}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
