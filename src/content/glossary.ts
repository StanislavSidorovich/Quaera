import type { LocalizedText } from '../engine/types';

/**
 * Глоссарий терминов предметной области — слова из прозы кампании, которые
 * человек без опыта в FMCG не обязан знать: «точка», «охват», «промо».
 *
 * Отдельная сущность от схемы данных (SchemaSheet/TableDoc): схема отвечает
 * «как называется колонка», глоссарий — «что значит слово в условии, прежде
 * чем оно вообще превратится в колонку». Замечание живого прохода было ровно
 * про разрыв между ними: «точка» в условии, `customer_id` в данных —
 * перемычки не было нигде (см. querium-next-steps.md, замечание 3).
 *
 * `id` — стабильный ключ для «уже показано сегодня» (см. GlossaryText.tsx),
 * не завязан на текст термина: текст в двух локалях разный, а ключ один.
 */
export interface GlossaryTerm {
  id: string;
  /** Слово, по которому ищем совпадение в прозе — точная словоформа, без учёта падежей. */
  term: LocalizedText;
  /** Смысл в FMCG — не словарное определение, а то, зачем слово здесь нужно. */
  meaning: LocalizedText;
  /** Где лежит в данных: таблица и колонка, либо как считается, если готовой колонки нет. */
  pointer: LocalizedText;
}

export const GLOSSARY: GlossaryTerm[] = [
  {
    id: 'units',
    term: { ru: 'штуки', en: 'units' },
    meaning: {
      ru: 'Физическое количество товара — сколько единиц продано или отгружено, не деньги.',
      en: 'The physical quantity of product sold or shipped, not money.',
    },
    pointer: { ru: 'units', en: 'units' },
  },
  {
    id: 'revenue',
    term: { ru: 'выручка', en: 'revenue' },
    meaning: {
      ru: 'Деньги, которые получены за проданные штуки — цена, умноженная на количество.',
      en: 'The money received for the units sold: price times quantity.',
    },
    pointer: { ru: 'revenue', en: 'revenue' },
  },
  {
    id: 'point',
    term: { ru: 'точка', en: 'point' },
    meaning: {
      ru: 'Конкретный магазин или аптека, куда дистрибьютор продаёт товар. В данных это то же самое, что «клиент».',
      en: 'A specific store or pharmacy the distributor sells into. In the data this is the same thing as a customer.',
    },
    pointer: { ru: 'строка dim_customer, customer_id', en: 'a row in dim_customer, customer_id' },
  },
  {
    id: 'reach',
    term: { ru: 'охват', en: 'reach' },
    meaning: {
      ru: 'Доля точек, где товар реально продавался за период, от всех точек, куда его вообще можно было продать.',
      en: 'The share of points where the product actually sold in the period, out of every point it could have sold in.',
    },
    pointer: {
      ru: 'считается запросом: точки из fact_sellout по product_id',
      en: 'computed by query: points from fact_sellout by product_id',
    },
  },
  {
    id: 'shelf',
    term: { ru: 'полка', en: 'shelf' },
    meaning: {
      ru: 'Присутствие товара на складе точки прямо сейчас — грубый способ сказать «товар там физически есть».',
      en: "The product being present in a point's stock right now, a rough way of saying it is physically there.",
    },
    pointer: { ru: 'fact_stock, units_on_hand', en: 'fact_stock, units_on_hand' },
  },
  {
    id: 'sku',
    term: { ru: 'SKU', en: 'SKU' },
    meaning: {
      ru: 'Один конкретный вариант товара — упаковка, вкус, объём. Строка каталога товаров.',
      en: 'One specific product variant: a pack, a flavor, a size. A row in the product catalog.',
    },
    pointer: { ru: 'строка dim_product, sku_code', en: 'a row in dim_product, sku_code' },
  },
  {
    id: 'channel',
    term: { ru: 'канал', en: 'channel' },
    meaning: {
      ru: 'Тип точки продаж — аптека, супермаркет, независимый магазин и так далее.',
      en: 'The type of point of sale: pharmacy, supermarket, independent store, and so on.',
    },
    pointer: { ru: 'dim_customer, channel', en: 'dim_customer, channel' },
  },
  {
    id: 'promo',
    term: { ru: 'промо', en: 'promo' },
    meaning: {
      ru: 'Временная скидка на бренд со своей механикой и периодом действия, отдельная от обычной цены.',
      en: 'A temporary discount on a brand, with its own mechanic and time window, separate from the regular price.',
    },
    pointer: { ru: 'строка dim_promo, promo_id', en: 'a row in dim_promo, promo_id' },
  },
];
