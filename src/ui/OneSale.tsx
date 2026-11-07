import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import './oneSale.css';
import sale from '../content/oneSale.json';

/**
 * «Одна продажа насквозь»: строка недельного отчёта точки и её след в четырёх
 * таблицах звезды. Схема ниже показывает, как таблицы связаны вообще; здесь
 * один путь через главный факт, пройденный руками.
 *
 * Значения лежат в oneSale.json и сверяются с датасетом гейтом
 * (scripts/test-one-sale.mjs). Действие ничего не пишет в прогресс: это
 * объяснение, а не задание.
 *
 * Линии между ключами рисуются только на широком экране, где карточки стоят
 * в ряд; на узком они идут столбцом, и связь несут цвет ключа и подпись.
 */

type Hint = 'fact' | 'product' | 'city' | 'outlet' | 'regionKey' | 'regionKeyHere' | 'macro';
type KeyName = 'product' | 'customer' | 'region';
type Cell = { col: string; value: string | number; key?: KeyName; hint?: Hint; answer?: boolean; ref?: string };
type Card = { table: string; cells: Cell[] };

const LINKS: { key: KeyName; from: string; fromCol: string; to: string; toCol: string }[] = [
  { key: 'product', from: 'dim_product', fromCol: 'product_id', to: 'fact_sellout', toCol: 'product_id' },
  { key: 'customer', from: 'fact_sellout', fromCol: 'customer_id', to: 'dim_customer', toCol: 'customer_id' },
  { key: 'region', from: 'dim_customer', fromCol: 'region_id', to: 'dim_region', toCol: 'region_id' },
];

const WIDE = 760;
const id = (table: string, col: string) => `${table}.${col}`;

export function OneSale() {
  const { t, locale } = useI18n();
  const s = t.data.oneSale;
  const [picked, setPicked] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef(new Map<string, HTMLElement>());
  const [wide, setWide] = useState(false);
  const cardRefs = useRef(new Map<string, HTMLElement>());
  const [paths, setPaths] = useState<{ key: KeyName; d: string; x1: number; y1: number; x2: number; y2: number }[]>([]);

  const cards: Card[] = [
    {
      table: 'fact_sellout',
      cells: [
        { col: 'customer_id', value: sale.customer.customer_id, key: 'customer', hint: 'fact', ref: 'dim_customer' },
        { col: 'product_id', value: sale.product.product_id, key: 'product', hint: 'fact', ref: 'dim_product' },
        { col: 'units', value: sale.units, hint: 'fact' },
        { col: 'revenue', value: sale.revenue, hint: 'fact' },
      ],
    },
    {
      table: 'dim_product',
      cells: [
        { col: 'product_id', value: sale.product.product_id, key: 'product', hint: 'product' },
        { col: 'product_name', value: sale.product.product_name, hint: 'product' },
        { col: 'category', value: sale.product.category, hint: 'product' },
      ],
    },
    {
      table: 'dim_customer',
      cells: [
        { col: 'customer_id', value: sale.customer.customer_id, key: 'customer', hint: 'outlet' },
        { col: 'customer_name', value: sale.customer.customer_name, hint: 'outlet' },
        { col: 'city', value: sale.customer.city, hint: 'city' },
        { col: 'region_id', value: sale.customer.region_id, key: 'region', hint: 'regionKey', ref: 'dim_region' },
      ],
    },
    {
      table: 'dim_region',
      cells: [
        { col: 'region_id', value: sale.region.region_id, key: 'region', hint: 'regionKeyHere' },
        { col: 'region_name', value: sale.region.region_name, answer: true },
        { col: 'macro_region', value: sale.region.macro_region, hint: 'macro' },
      ],
    },
  ];

  const solved = picked === id('dim_region', 'region_name');
  const pickedCell = picked
    ? cards.flatMap((c) => c.cells.map((cell) => ({ ...cell, id: id(c.table, cell.col) }))).find((c) => c.id === picked)
    : undefined;

  const measure = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    // Крупный шрифт в приложении сделан через CSS zoom: getBoundingClientRect отдаёт
    // увеличенные координаты, а SVG рисует в неувеличенных. Отношение видимой ширины
    // контейнера к layout-ширине (offsetWidth) сводит их к одной шкале; без zoom k = 1.
    const k = root.offsetWidth ? box.width / root.offsetWidth : 1;
    const isWide = root.offsetWidth >= WIDE;
    setWide(isWide);
    if (!isWide) {
      setPaths([]);
      return;
    }
    const next: { key: KeyName; d: string; x1: number; y1: number; x2: number; y2: number }[] = [];
    for (const l of LINKS) {
      const a = cellRefs.current.get(id(l.from, l.fromCol));
      const b = cellRefs.current.get(id(l.to, l.toCol));
      const ca = cardRefs.current.get(l.from);
      const cb = cardRefs.current.get(l.to);
      if (!a || !b || !ca || !cb) continue;
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const qa = ca.getBoundingClientRect();
      const qb = cb.getBoundingClientRect();
      // Линия выходит из края таблицы на уровне клетки ключа и входит в край второй таблицы
      // на уровне её клетки: поверх содержимого она не идёт, поворот стоит в промежутке.
      const aLeft = qa.left < qb.left;
      const x1 = ((aLeft ? qa.right : qa.left) - box.left) / k;
      const x2 = ((aLeft ? qb.left : qb.right) - box.left) / k;
      const y1 = (ra.top + ra.height / 2 - box.top) / k;
      const y2 = (rb.top + rb.height / 2 - box.top) / k;
      const mx = (x1 + x2) / 2;
      next.push({ key: l.key, d: `M${x1},${y1} H${mx} V${y2} H${x2}`, x1, y1, x2, y2 });
    }
    setPaths(next);
  }, []);

  useLayoutEffect(() => {
    measure();
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    cardRefs.current.forEach((el) => ro.observe(el));
    document.fonts?.ready.then(measure).catch(() => {});
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, locale, wide]);

  const week = (() => {
    const d = new Date(`${sale.week_start}T00:00:00Z`);
    const day = d.toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' });
    return `${day} ${d.getUTCFullYear()}`;
  })();
  const revenue = sale.revenue.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');

  // Путь к ответу идёт через ключи точки и региона; ключ товара в него не входит.
  const onPath = (key?: KeyName) => solved && (key === 'customer' || key === 'region');

  return (
    <div className="card one-sale">
      <h2>{s.title}</h2>
      <p className="muted one-sale-lead">{s.lead}</p>
      <p className="one-sale-report" aria-label={s.reportLabel}>
        {s.report(sale.customer.customer_name, sale.customer.city, week, sale.units, sale.product.product_name, revenue)}
      </p>

      <p className="one-sale-q">
        <strong>{s.question}</strong> <span className="muted">{s.tapHint}</span>
      </p>

      <div className={`one-sale-cards${wide ? ' wide' : ''}${solved ? ' solved' : ''}`} ref={rootRef}>
        {wide && (
          <svg className="one-sale-lines" aria-hidden="true">
            {paths.map((p) => (
              <g key={p.key} className={`k-${p.key}${onPath(p.key) ? ' on' : ''}`}>
                <path d={p.d} />
                <circle cx={p.x1} cy={p.y1} r="3.5" />
                <circle cx={p.x2} cy={p.y2} r="3.5" />
              </g>
            ))}
          </svg>
        )}
        {cards.map((card) => (
          <div
            className={`one-sale-card os-${card.table}`}
            key={card.table}
            ref={(el) => {
              if (el) cardRefs.current.set(card.table, el);
              else cardRefs.current.delete(card.table);
            }}
          >
            <div className="one-sale-name">
              <code>{card.table}</code>
            </div>
            {card.cells.map((cell) => {
              const cid = id(card.table, cell.col);
              const state = picked === cid ? (cell.answer ? 'right' : 'wrong') : '';
              return (
                <div
                  className={`one-sale-row${cell.key ? ` key k-${cell.key}` : ''}${onPath(cell.key) ? ' on' : ''}`}
                  key={cid}
                  ref={(el) => {
                    if (el) cellRefs.current.set(cid, el);
                    else cellRefs.current.delete(cid);
                  }}
                >
                  <span className="one-sale-col">{cell.col}</span>
                  <button type="button" className={`one-sale-val ${state}`} disabled={solved} onClick={() => setPicked(cid)}>
                    {cell.value}
                  </button>
                  {cell.ref && <span className="one-sale-ref">{s.refTo(cell.ref)}</span>}
                </div>
              );
            })}
            <div className="one-sale-more" aria-label={s.more}>
              …
            </div>
          </div>
        ))}
      </div>

      <div className="one-sale-feedback" role="status" aria-live="polite">
        {solved ? (
          <>
            <p className="one-sale-ok">{s.right(sale.region.region_name)}</p>
            <p className="one-sale-path">
              <span className="muted">{s.pathLabel}: </span>
              <code>fact_sellout.customer_id</code> → <code>dim_customer.customer_id</code>
              {' · '}
              <code>dim_customer.region_id</code> → <code>dim_region.region_id</code>
              {' → '}
              <code>region_name</code>
            </p>
            <button type="button" className="one-sale-reset" onClick={() => setPicked(null)}>
              {s.reset}
            </button>
          </>
        ) : pickedCell?.hint ? (
          <p className="one-sale-bad">{s.hints[pickedCell.hint]}</p>
        ) : null}
      </div>
    </div>
  );
}
