/**
 * Генератор учебного датасета Querium.
 *
 * Одна вымышленная компания «Kaiyo Trading»: дистрибуция FMCG + OTC-фарма.
 * Схема — классическая звезда, данные согласованы между собой:
 * sell-out агрегируется в sell-in, sell-in минус sell-out даёт остатки,
 * планы строятся от факта. Это принципиально: задания разных треков
 * (SQL / модель данных / pandas) решают одну и ту же бизнес-задачу
 * на одних и тех же цифрах, и ответы сходятся.
 *
 * В данные намеренно зашиты сюжеты для аналитических заданий:
 *  - сезонность (вода и соки — лето, простуда и витамины — зима);
 *  - падающий бренд «Nettora»: причина не в цене и не в спросе, а в потере дистрибуции;
 *  - затоваривание дистрибьютора «Setouchi Trading» в Q4 2025 (sell-in >> sell-out);
 *  - запуск SKU «Vitanor Forte» в сентябре 2025;
 *  - отсутствие строки = не было продаж (OOS), а не ноль — ловушка на LEFT JOIN;
 *  - staging_raw_sellout — грязный слой под задачи на очистку.
 *
 * Запуск: npm run gen:data
 */
import initSqlJs from 'sql.js';
import { gzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sqlDist = path.dirname(require.resolve('sql.js'));
const outDir = path.join(root, 'public', 'data');

// ---------------------------------------------------------------- утилиты

/** Детерминированный ГПСЧ — датасет обязан воспроизводиться байт в байт. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260801);

const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
const between = (lo, hi) => lo + rnd() * (hi - lo);
const intBetween = (lo, hi) => Math.floor(between(lo, hi + 1));
/** Приблизительно нормальное распределение (сумма двух равномерных). */
const jitter = (mean, spread) => mean * (1 + (rnd() + rnd() - 1) * spread);
const round2 = (x) => Math.round(x * 100) / 100;

const DAY = 86400000;
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const parseISO = (s) => new Date(`${s}T00:00:00Z`);
/** Понедельник недели, к которой относится дата. */
const weekStart = (d) => addDays(d, -((d.getUTCDay() + 6) % 7));
const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));

const START = parseISO('2024-01-01');
const END = parseISO('2026-06-30');

// ------------------------------------------------------------- измерения

/**
 * Значения в данных — латиницей на обе локали.
 *
 * Датасет один, эталоны считаются по нему же, поэтому `WHERE region_name =
 * 'Moscow'` обязано быть одним и тем же запросом в русском и английском
 * задании (см. шапку src/i18n/ru.ts). Кириллица в значениях делала английскую
 * локаль наполовину русской ровно там, где человек пишет код.
 *
 * Топонимы — настоящие, в общепринятой английской передаче: город и регион
 * не торговая марка, использовать их можно, а выдуманная география ломала бы
 * то, на чём держится проза заданий (макрорегионы, tier-регионы).
 * Всё остальное — торговые марки, сети, дистрибьюторы, ФИО — выдумано
 * целиком: реальная сеть в выдуманной истории про падение продаж это ровно
 * то, чего в учебном датасете быть не должно.
 *
 * География — японская (2026-08-11). Прежде тут была российская, и сама
 * по себе она ничему не мешала; сменена ради читателя, которому тренажёр
 * показывают как портфолио: датасет приписывает вымышленным компаниям
 * падение продаж и затоваривание, и делать это на фоне узнаваемой страны
 * — лишний повод для прочтения, которого в учебной задаче быть не должно.
 * Выбор Японии, а не любой другой страны, продиктован числами: полочные
 * цены (38–450) и пороги выручки в прозе заданий правдоподобны в иенах
 * и потребовали бы пересчёта всех ~380 сумм в любой валюте другого
 * масштаба. Структура сохранена нарочно — 16 регионов, 7 макрорегионов,
 * те же 4/8/4 по tier и те же количества городов в регионе: у ГПСЧ
 * детерминированный порядок, и совпадение длин оставляет распределения
 * прежними, а значит ломает минимум эталонов.
 */
const REGIONS = [
  ['Tokyo', 'Kanto', 14100000, 1],
  ['Kanagawa', 'Kanto', 9200000, 1],
  ['Osaka', 'Kansai', 8800000, 1],
  ['Ibaraki', 'Kanto', 2840000, 2],
  ['Aichi', 'Chubu', 7480000, 1],
  ['Saitama', 'Kanto', 7340000, 2],
  ['Kyoto', 'Kansai', 2550000, 3],
  ['Chiba', 'Kanto', 6280000, 2],
  ['Hyogo', 'Kansai', 5400000, 2],
  ['Niigata', 'Chubu', 2130000, 3],
  ['Fukuoka', 'Kyushu', 5100000, 2],
  ['Hokkaido', 'Hokkaido', 5090000, 3],
  ['Shizuoka', 'Chubu', 3560000, 2],
  ['Hiroshima', 'Chugoku', 2740000, 2],
  ['Miyagi', 'Tohoku', 2260000, 2],
  ['Okinawa', 'Kyushu', 1470000, 3],
].map(([region_name, macro_region, population, tier], i) => ({
  region_id: i + 1,
  region_name,
  macro_region,
  population,
  tier,
}));

const CITY_BY_REGION = {
  'Tokyo': ['Tokyo'],
  'Kanagawa': ['Yokohama', 'Kawasaki', 'Sagamihara', 'Fujisawa'],
  'Osaka': ['Osaka'],
  'Ibaraki': ['Mito', 'Tsukuba'],
  'Aichi': ['Nagoya', 'Toyota', 'Okazaki'],
  'Saitama': ['Saitama', 'Kawaguchi'],
  'Kyoto': ['Kyoto', 'Uji'],
  'Chiba': ['Chiba', 'Funabashi'],
  'Hyogo': ['Kobe', 'Himeji'],
  'Niigata': ['Niigata'],
  'Fukuoka': ['Fukuoka', 'Kitakyushu'],
  'Hokkaido': ['Sapporo', 'Asahikawa'],
  'Shizuoka': ['Shizuoka', 'Hamamatsu'],
  'Hiroshima': ['Hiroshima', 'Fukuyama'],
  'Miyagi': ['Sendai', 'Ishinomaki'],
  'Okinawa': ['Naha', 'Okinawa'],
};

// seasonality: множитель по номеру месяца (1..12)
const SEASON = {
  none: () => 1,
  summer: (m) => [0.78, 0.76, 0.85, 0.95, 1.12, 1.32, 1.45, 1.38, 1.08, 0.9, 0.8, 0.82][m - 1],
  winter: (m) => [1.42, 1.34, 1.12, 0.92, 0.76, 0.66, 0.62, 0.68, 0.9, 1.15, 1.32, 1.4][m - 1],
  spring: (m) => [0.85, 0.9, 1.15, 1.3, 1.22, 1.02, 0.92, 0.9, 1.0, 1.05, 0.95, 0.88][m - 1],
};

const BRANDS = [
  {
    brand: 'Aqualis', division: 'FMCG', category: 'Beverages', subcategory: 'Water',
    season: 'summer', trend: 0.07, weight: 1.35,
    skus: [['Aqualis Still 0.5 L', 0.5, 'L', 38], ['Aqualis Still 1.5 L', 1.5, 'L', 62],
           ['Aqualis Sparkling 0.5 L', 0.5, 'L', 38], ['Aqualis Sparkling 1.5 L', 1.5, 'L', 62],
           ['Aqualis Still 5 L', 5, 'L', 128], ['Aqualis Sport 0.75 L', 0.75, 'L', 79]],
  },
  {
    brand: 'Fruvia', division: 'FMCG', category: 'Beverages', subcategory: 'Juices',
    season: 'summer', trend: 0.02, weight: 1.0,
    skus: [['Fruvia Orange 1 L', 1, 'L', 145], ['Fruvia Apple 1 L', 1, 'L', 132],
           ['Fruvia Multifruit 1 L', 1, 'L', 141], ['Fruvia Tomato 1 L', 1, 'L', 128],
           ['Fruvia Orange 0.2 L', 0.2, 'L', 42], ['Fruvia Cherry 1 L', 1, 'L', 149]],
  },
  {
    brand: 'Krosti', division: 'FMCG', category: 'Snacks', subcategory: 'Chips',
    season: 'none', trend: 0.05, weight: 0.95,
    skus: [['Krosti Salt 90 g', 90, 'g', 98], ['Krosti Sour Cream-Onion 90 g', 90, 'g', 98],
           ['Krosti Paprika 90 g', 90, 'g', 98], ['Krosti Salt 150 g', 150, 'g', 152],
           ['Krosti Crab 90 g', 90, 'g', 102], ['Krosti Mix 40 g', 40, 'g', 55]],
  },
  {
    // Сюжет: бренд падает. Спрос в точках держится, но точки перестают его брать.
    brand: 'Nettora', division: 'FMCG', category: 'Home care', subcategory: 'Household cleaning',
    season: 'spring', trend: -0.04, weight: 0.72, losingDistribution: true,
    skus: [['Nettora Universal 500 ml', 500, 'ml', 189], ['Nettora Glass 500 ml', 500, 'ml', 175],
           ['Nettora Degreaser 500 ml', 500, 'ml', 214], ['Nettora Floor 1 L', 1, 'L', 232],
           ['Nettora Bath 750 ml', 750, 'ml', 198]],
  },
  {
    brand: 'Milvara', division: 'FMCG', category: 'Dairy', subcategory: 'Yogurts',
    season: 'none', trend: 0.01, weight: 1.1,
    skus: [['Milvara Strawberry 290 g', 290, 'g', 74], ['Milvara Peach 290 g', 290, 'g', 74],
           ['Milvara Natural 290 g', 290, 'g', 68], ['Milvara Drinking 430 g', 430, 'g', 92],
           ['Milvara Kids 100 g', 100, 'g', 41], ['Milvara Greek 200 g', 200, 'g', 105]],
  },
  {
    brand: 'Pyrexan', division: 'Pharma', category: 'OTC', subcategory: 'Antipyretics',
    season: 'winter', trend: 0.03, weight: 1.2,
    skus: [['Pyrexan 500 mg x10', 10, 'tab', 218], ['Pyrexan 500 mg x20', 20, 'tab', 372],
           ['Pyrexan Forte x10', 10, 'tab', 298], ['Pyrexan Powder x5', 5, 'sachet', 264],
           ['Pyrexan Kids Syrup 100 ml', 100, 'ml', 341]],
  },
  {
    brand: 'Gastrivo', division: 'Pharma', category: 'OTC', subcategory: 'Digestive health',
    season: 'none', trend: 0.06, weight: 0.9,
    skus: [['Gastrivo x20', 20, 'tab', 412], ['Gastrivo x40', 40, 'tab', 705],
           ['Gastrivo Suspension 200 ml', 200, 'ml', 488], ['Gastrivo Express x10', 10, 'tab', 268]],
  },
  {
    brand: 'Vitanor', division: 'Pharma', category: 'OTC', subcategory: 'Vitamins',
    season: 'winter', trend: 0.09, weight: 1.05,
    skus: [['Vitanor Multi x30', 30, 'tab', 596], ['Vitanor D3 x60', 60, 'caps', 458],
           ['Vitanor Omega-3 x60', 60, 'caps', 812], ['Vitanor Magnesium B6 x50', 50, 'tab', 524],
           ['Vitanor Forte x30', 30, 'tab', 742, '2025-09-01']],
  },
  {
    brand: 'Rhinolar', division: 'Pharma', category: 'OTC', subcategory: 'Cold and flu',
    season: 'winter', trend: 0.02, weight: 0.85,
    skus: [['Rhinolar Spray 15 ml', 15, 'ml', 285], ['Rhinolar Drops 10 ml', 10, 'ml', 224],
           ['Rhinolar Kids Spray 10 ml', 10, 'ml', 262], ['Rhinolar Active Spray 15 ml', 15, 'ml', 348]],
  },
];

const products = [];
{
  let pid = 0;
  // Четыре первые буквы бренда — и потому имена брендов подобраны так, чтобы
  // эти четвёрки не совпадали: AQUA, FRUV, KROS, NETT, MILV, PYRE, GAST, VITA,
  // RHIN. Совпадение сделало бы sku_code неоднозначным, а он в заданиях
  // используется как человекочитаемый ключ.
  const codeOf = (brand, i) =>
    brand.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() + String(i + 1).padStart(3, '0');
  for (const b of BRANDS) {
    b.skus.forEach((sku, i) => {
      const [product_name, pack_size, unit, list_price, launch] = sku;
      products.push({
        product_id: ++pid,
        sku_code: codeOf(b.brand, i),
        product_name,
        brand: b.brand,
        category: b.category,
        subcategory: b.subcategory,
        division: b.division,
        pack_size,
        unit,
        list_price,
        launch_date: launch ?? iso(START),
        season: b.season,
        trend: b.trend,
        losingDistribution: !!b.losingDistribution,
        // популярность внутри бренда падает от первого SKU к последнему
        popularity: b.weight * (1.35 - i * 0.13) * between(0.85, 1.15),
      });
    });
  }
}
const productById = new Map(products.map((p) => [p.product_id, p]));

/**
 * Дистрибьюторы, сети, аптеки и маркетплейсы — выдуманы целиком.
 *
 * Раньше здесь стояли настоящие марки (пять федеральных сетей, три аптечных,
 * четыре маркетплейса), и датасет приписывал им выдуманные обороты, падения
 * и затоваривание — то есть сообщал о реальных компаниях то, чего не было.
 * Учебному датасету это не нужно ни для одного сюжета: роль сети в задании
 * играет её тип и канал, а не имя на вывеске.
 */
const DISTRIBUTOR_NAMES = [
  'Setouchi Trading Co.', 'Kanto Logistics Co.', 'Nangoku Trading Co.', 'Hokuriku Supply K.K.',
  'Sanyo Wholesale Co.', 'Capital Distribution Co.', 'Bayside Wholesale Co.', 'Kyushu Trading Co.',
  'Tokai Group K.K.', 'Hokusei Trading Co.', 'Midori Wholesale Co.', 'Asahi Line K.K.',
];
const CHAINS = ['Ichiba', 'Kaigan', 'Minori', 'Nagisa', 'Prima'];
const PHARMA_CHAINS = ['Farmalux', 'Kusuri 24', 'Vitalika'];
const ECOM = ['Marketo', 'Bazario', 'Sokuhai', 'Hakobu'];

const customers = [];
let cid = 0;
for (const name of DISTRIBUTOR_NAMES) {
  const region = pick(REGIONS);
  customers.push({
    customer_id: ++cid, customer_name: name, customer_type: 'distributor', channel: 'distributor',
    chain_name: null, region_id: region.region_id, city: pick(CITY_BY_REGION[region.region_name]),
    opened_date: iso(addDays(START, -intBetween(400, 2500))), is_active: 1, served_by: null, size: 1,
  });
}
const distributors = customers.slice();

/** Точки продаж: сети, традиционная розница, аптеки, e-com. */
function addOutlet(kind) {
  const region = pick(REGIONS);
  const served = pick(distributors);
  const base = {
    customer_id: ++cid, region_id: region.region_id, city: pick(CITY_BY_REGION[region.region_name]),
    opened_date: iso(addDays(START, -intBetween(60, 3000))), is_active: 1, served_by: served.customer_id,
  };
  if (kind === 'chain') {
    const chain = pick(CHAINS);
    return { ...base, customer_name: `${chain} #${1000 + cid}`, customer_type: 'chain', channel: 'modern_trade', chain_name: chain, size: between(2.4, 4.6) };
  }
  if (kind === 'traditional') {
    return { ...base, customer_name: `${pick(['Izumi', 'Yasuragi', 'Konbini 24', 'Kaede', 'Akebono', 'Marusan', 'Hinode'])} Store #${1000 + cid}`, customer_type: 'traditional', channel: 'traditional_trade', chain_name: null, size: between(0.5, 1.3) };
  }
  if (kind === 'pharmacy') {
    const chain = rnd() < 0.62 ? pick(PHARMA_CHAINS) : null;
    return { ...base, customer_name: chain ? `${chain} #${1000 + cid}` : `${pick(['Kenko', 'Panacea', 'Wakaba', 'Salus'])} Pharmacy #${1000 + cid}`, customer_type: 'pharmacy', channel: 'pharmacy', chain_name: chain, size: between(1.0, 2.6) };
  }
  const shop = pick(ECOM);
  return { ...base, customer_name: `${shop} (warehouse ${base.city})`, customer_type: 'ecom', channel: 'ecom', chain_name: shop, size: between(3.0, 6.0) };
}
for (let i = 0; i < 42; i++) customers.push(addOutlet('chain'));
for (let i = 0; i < 44; i++) customers.push(addOutlet('traditional'));
for (let i = 0; i < 38; i++) customers.push(addOutlet('pharmacy'));
for (let i = 0; i < 8; i++) customers.push(addOutlet('ecom'));
const outlets = customers.filter((c) => c.customer_type !== 'distributor');

// Торговые представители: 5 руководителей + линейные, self-join по manager_id.
const FIRST = ['Haruka', 'Kenji', 'Yui', 'Takeshi', 'Aoi', 'Satoshi', 'Miyu', 'Ryo', 'Nanami', 'Daiki', 'Rina', 'Hiroshi', 'Sakura', 'Yuto', 'Emi', 'Kaito'];
const LAST = ['Tanaka', 'Suzuki', 'Sato', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi'];
const TEAMS = ['FMCG Kanto', 'FMCG Kansai', 'FMCG West', 'Pharma Kanto', 'Pharma Regions'];
const reps = [];
TEAMS.forEach((team, i) => {
  reps.push({ rep_id: i + 1, rep_name: `${pick(FIRST)} ${pick(LAST)}`, team, role: 'manager', region_id: REGIONS[i].region_id, hired_date: iso(addDays(START, -intBetween(900, 2600))), manager_id: null });
});
for (let i = 0; i < 26; i++) {
  const team = TEAMS[i % TEAMS.length];
  reps.push({ rep_id: reps.length + 1, rep_name: `${pick(FIRST)} ${pick(LAST)}`, team, role: 'rep', region_id: pick(REGIONS).region_id, hired_date: iso(addDays(START, -intBetween(30, 1800))), manager_id: TEAMS.indexOf(team) + 1 });
}
outlets.forEach((o) => {
  const pool = reps.filter((r) => r.role === 'rep' && (o.channel === 'pharmacy' ? r.team.startsWith('Pharma') : r.team.startsWith('FMCG')));
  o.rep_id = pool[Math.floor(rnd() * pool.length)].rep_id;
});

// Промо-акции: механика, период, глубина скидки.
const MECHANICS = ['Discount 20%', 'Discount 30%', '2+1', 'Yellow tag', 'Cross-category'];
const promos = [];
{
  let pmid = 0;
  for (const b of BRANDS) {
    let d = addDays(START, intBetween(14, 70));
    while (d < END) {
      const len = intBetween(14, 28);
      const mech = pick(MECHANICS);
      promos.push({
        promo_id: ++pmid,
        promo_name: `${b.brand}: ${mech}`,
        brand: b.brand,
        mechanic: mech,
        start_date: iso(d),
        end_date: iso(addDays(d, len)),
        discount_pct: mech === '2+1' ? 33 : mech === 'Discount 30%' ? 30 : mech === 'Discount 20%' ? 20 : intBetween(8, 15),
        channel: b.division === 'Pharma' ? 'pharmacy' : pick(['modern_trade', 'traditional_trade', 'all']),
      });
      d = addDays(d, len + intBetween(35, 110));
    }
  }
}
/** Промо, действующее для бренда на неделе (берём первое подходящее). */
function activePromo(brand, wStart, channel) {
  for (const p of promos) {
    if (p.brand !== brand) continue;
    if (p.channel !== 'all' && p.channel !== channel) continue;
    if (p.start_date <= wStart && p.end_date >= wStart) return p;
  }
  return null;
}

// --------------------------------------------------------------- календарь

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dates = [];
for (let d = new Date(START); d <= END; d = addDays(d, 1)) {
  const dow = (d.getUTCDay() + 6) % 7; // 0 = понедельник
  const ws = weekStart(d);
  const thursday = addDays(ws, 3);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  dates.push({
    date_id: iso(d),
    year: d.getUTCFullYear(),
    quarter: Math.floor(d.getUTCMonth() / 3) + 1,
    month: d.getUTCMonth() + 1,
    month_name: MONTH_NAMES[d.getUTCMonth()],
    month_start: iso(monthStart(d)),
    week_start: iso(ws),
    iso_week: Math.ceil(((thursday - yearStart) / DAY + 1) / 7),
    day_of_week: dow + 1,
    day_name: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][dow],
    is_weekend: dow >= 5 ? 1 : 0,
  });
}
const weeks = [...new Set(dates.map((d) => d.week_start))].sort();
const months = [...new Set(dates.map((d) => d.month_start))].sort();

// ------------------------------------------------------------- ассортимент

/** Какие товары точка в принципе может продавать. */
function eligible(outlet) {
  return products.filter((p) => (p.division === 'Pharma' ? outlet.channel === 'pharmacy' : outlet.channel !== 'pharmacy'));
}
for (const o of outlets) {
  const pool = eligible(o);
  const target = Math.round(Math.min(pool.length, o.size * (o.channel === 'ecom' ? 5.5 : 3.4) + intBetween(2, 5)));
  const shuffled = pool.slice().sort(() => rnd() - 0.5);
  o.assortment = shuffled.slice(0, Math.max(3, target)).map((p) => p.product_id);
  // Дата, с которой точка перестала брать падающий бренд (сюжет «Nettora»).
  o.dropsNettoraAfter = rnd() < 0.55 ? iso(addDays(parseISO('2025-01-01'), intBetween(0, 420))) : null;
  // Новинка приходит в точки не одномоментно: дистрибуция раскатывается волной.
  o.listedFrom = {};
  for (const pid of o.assortment) {
    const p = productById.get(pid);
    if (p.launch_date > iso(START)) {
      o.listedFrom[pid] = iso(addDays(parseISO(p.launch_date), intBetween(0, 24) * 7));
    }
  }
}

// ------------------------------------------------------------- факты

const sellout = [];
let soId = 0;
const monthsSinceStart = (ws) => (parseISO(ws) - START) / (365.25 * DAY);

for (const o of outlets) {
  for (const pid of o.assortment) {
    const p = productById.get(pid);
    // индивидуальная «скорость» продажи товара в конкретной точке
    const base = o.size * p.popularity * between(0.6, 1.5) * (o.channel === 'ecom' ? 4 : 1);
    for (const ws of weeks) {
      if (ws < (o.listedFrom[pid] ?? p.launch_date)) continue;
      if (ws < o.opened_date) continue;
      if (p.losingDistribution && o.dropsNettoraAfter && ws >= o.dropsNettoraAfter) continue; // точка вывела бренд из матрицы
      const m = parseISO(ws).getUTCMonth() + 1;
      const promo = activePromo(p.brand, ws, o.channel);
      const seasonMul = SEASON[p.season](m);
      const trendMul = Math.pow(1 + p.trend, monthsSinceStart(ws));
      const promoMul = promo ? between(1.5, 2.9) : 1;
      // Раскатка применяется только к настоящим новинкам. Для базового ассортимента
      // launch_date равна началу периода, и без этой проверки весь первый квартал
      // датасета оказался бы искусственно занижен — сравнение год к году поехало бы.
      const listed = o.listedFrom[pid];
      const rampMul = listed && ws < iso(addDays(parseISO(listed), 63)) ? between(0.35, 0.8) : 1;
      const lambda = base * seasonMul * trendMul * promoMul * rampMul;
      if (rnd() > Math.min(0.92, 0.34 + lambda * 0.06)) continue; // нет строки = не было продаж (OOS/непоставка)
      const units = Math.max(1, Math.round(jitter(lambda, 0.45)));
      const priceIndex = Math.pow(1.011, monthsSinceStart(ws)); // инфляция ~1.1% в год к базе
      const price = p.list_price * priceIndex * (promo ? 1 - promo.discount_pct / 100 : 1) * jitter(1, 0.03);
      sellout.push({
        sellout_id: ++soId,
        week_start: ws,
        customer_id: o.customer_id,
        product_id: pid,
        units,
        revenue: round2(units * price),
        avg_price: round2(price),
        promo_id: promo ? promo.promo_id : null,
      });
    }
  }
}

// sell-in: агрегируем sell-out по дистрибьютору и месяцу, добавляем шум и закупочный цикл
const servedBy = new Map(outlets.map((o) => [o.customer_id, o.served_by]));
const sellinAgg = new Map();
for (const r of sellout) {
  const dist = servedBy.get(r.customer_id);
  const mth = r.week_start.slice(0, 7) + '-01';
  const key = `${dist}|${mth}|${r.product_id}`;
  sellinAgg.set(key, (sellinAgg.get(key) ?? 0) + r.units);
}
const OVERSTOCK_DIST = distributors[0].customer_id; // «Volga-Trade»

/**
 * Отдельный поток случайных чисел — только под задержку отгрузки.
 *
 * Все остальные выборки идут из общего `rnd`, и он детерминирован: любая
 * ЛИШНЯЯ выборка из него сдвигает весь поток дальше по генератору, а вместе
 * с ним — каждое число, закреплённое в verify-content.mjs (их больше двухсот).
 * Собственный генератор с собственным seed этого не делает: главный поток
 * не замечает, что рядом появился второй.
 */
const rndShip = mulberry32(20260802);

const sellin = [];
let siId = 0;
for (const [key, units] of sellinAgg) {
  const [dist, mth, pid] = key.split('|');
  const p = productById.get(Number(pid));
  // Q4 2025: дистрибьютор набирает склад под годовой бонус — классическое затоваривание
  const overstock = Number(dist) === OVERSTOCK_DIST && mth >= '2025-10-01' && mth <= '2025-12-01' ? between(1.9, 2.8) : 1;
  const qty = Math.max(1, Math.round(units * jitter(1.04, 0.18) * overstock));
  const listPrice = p.list_price * Math.pow(1.011, (parseISO(mth) - START) / (365.25 * DAY));
  const gross = qty * listPrice * 0.72; // дистрибьюторская цена = 72% от полки
  const discountPct = between(0.03, 0.14);
  const orderDate = addDays(parseISO(mth), intBetween(1, 26));
  /**
   * Отгрузка отстаёт от заказа на 2–11 дней, поэтому заказ конца месяца
   * уезжает отгрузкой в следующий. Ради этого расхождения колонка и заведена:
   * без неё «выручка по дате заказа» и «по дате отгрузки» — одно и то же
   * число, и роль второй даты в модели показать не на чем.
   */
  const shipDate = addDays(orderDate, 2 + Math.floor(rndShip() * 10));
  sellin.push({
    sellin_id: ++siId,
    order_date: iso(orderDate),
    ship_date: iso(shipDate),
    month_start: mth,
    distributor_id: Number(dist),
    product_id: Number(pid),
    units: qty,
    gross_amount: round2(gross),
    discount_amount: round2(gross * discountPct),
    net_amount: round2(gross * (1 - discountPct)),
  });
}

// остатки на конец месяца: приход минус расход, накопительно
const stock = [];
{
  let stId = 0;
  const inByKey = new Map();
  for (const r of sellin) inByKey.set(`${r.distributor_id}|${r.month_start}|${r.product_id}`, r.units);
  const outByKey = new Map();
  for (const r of sellout) {
    const key = `${servedBy.get(r.customer_id)}|${r.week_start.slice(0, 7)}-01|${r.product_id}`;
    outByKey.set(key, (outByKey.get(key) ?? 0) + r.units);
  }
  const running = new Map();
  for (const mth of months) {
    for (const d of distributors) {
      for (const p of products) {
        const key = `${d.customer_id}|${mth}|${p.product_id}`;
        const inc = inByKey.get(key) ?? 0;
        const dec = outByKey.get(key) ?? 0;
        const rkey = `${d.customer_id}|${p.product_id}`;
        const prev = running.get(rkey) ?? 0;
        const onHand = Math.max(0, prev + inc - dec);
        running.set(rkey, onHand);
        if (inc === 0 && dec === 0 && onHand === 0) continue; // не храним пустоту
        stock.push({
          stock_id: ++stId,
          // Последний день месяца mth = первый день следующего минус сутки.
          // Следующий месяц считаем из самой даты, а не из соседа по массиву months:
          // для последнего месяца соседа нет, и прежняя версия подставляла туда сам
          // mth — то есть month_end получался днём РАНЬШЕ month_start (2026-06-01 →
          // 2026-05-31) вопреки собственному описанию колонки «последний день месяца».
          month_end: iso(addDays(new Date(Date.UTC(parseISO(mth).getUTCFullYear(), parseISO(mth).getUTCMonth() + 1, 1)), -1)),
          month_start: mth,
          distributor_id: d.customer_id,
          product_id: p.product_id,
          units_on_hand: onHand,
          units_in_transit: Math.round(inc * between(0, 0.18)),
        });
      }
    }
  }
}

// планы продаж: строятся от факта прошлого года с амбицией +5%
const targets = [];
{
  let tId = 0;
  const actual = new Map();
  const repOf = new Map(outlets.map((o) => [o.customer_id, o.rep_id]));
  for (const r of sellout) {
    const p = productById.get(r.product_id);
    const key = `${repOf.get(r.customer_id)}|${r.week_start.slice(0, 7)}-01|${p.division}`;
    const cur = actual.get(key) ?? { units: 0, revenue: 0 };
    cur.units += r.units;
    cur.revenue += r.revenue;
    actual.set(key, cur);
  }
  for (const [key, v] of actual) {
    const [rep, mth, division] = key.split('|');
    targets.push({
      target_id: ++tId,
      month_start: mth,
      rep_id: Number(rep),
      division,
      target_units: Math.round(v.units * jitter(1.05, 0.13)),
      target_revenue: round2(v.revenue * jitter(1.05, 0.13)),
    });
  }
}

// прайс-лист по месяцам
const prices = [];
{
  let prId = 0;
  for (const mth of months) {
    const k = Math.pow(1.011, (parseISO(mth) - START) / (365.25 * DAY));
    for (const p of products) {
      if (mth < p.launch_date.slice(0, 7) + '-01') continue;
      const list = round2(p.list_price * k);
      prices.push({
        price_id: ++prId,
        month_start: mth,
        product_id: p.product_id,
        list_price: list,
        promo_price: round2(list * between(0.7, 0.93)),
      });
    }
  }
}

// ---------------------------------------------- грязный слой под очистку

const dirty = [];
{
  const fmts = [
    (d) => d,
    (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`,
    (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`,
    (d) => `${d.slice(0, 4)}-${Number(d.slice(5, 7))}-${Number(d.slice(8, 10))}`,
  ];
  const custName = new Map(customers.map((c) => [c.customer_id, c.customer_name]));
  const sample = sellout.filter(() => rnd() < 0.055).slice(0, 3000);
  let rid = 0;
  for (const r of sample) {
    const p = productById.get(r.product_id);
    let name = custName.get(r.customer_id);
    /*
     * Одна сеть записана в двух вариантах — классическая ловушка на GROUP BY.
     *
     * Различие держится на системе романизации (Хепбёрн «Ichiba» против
     * кунрэй-сики «Itiba»), а не на опечатке: несогласованная романизация —
     * это системная беда выгрузок из разных источников, а опечатка была бы
     * случайностью одной строки. Прежние варианты урока стояли сперва
     * на русской «ё», потом на паре ya/ia, и оба раза буква уезжала вместе
     * с датасетом; японские данные дают ту же ловушку без привязки к языку
     * интерфейса — обе записи латиница, обе законны, свести их всё равно надо.
     */
    if (name.startsWith('Ichiba') && rnd() < 0.45) name = name.replace('Ichiba', 'Itiba');
    if (rnd() < 0.3) name = `  ${name} `;
    const unitsRaw =
      rnd() < 0.03 ? null : rnd() < 0.04 ? String(-r.units) : rnd() < 0.05 ? `${r.units},0` : String(r.units);
    const row = {
      raw_id: ++rid,
      sale_date: pick(fmts)(r.week_start),
      customer_name: name,
      sku_code: rnd() < 0.35 ? p.sku_code.toLowerCase() : p.sku_code,
      units: unitsRaw,
      revenue: rnd() < 0.06 ? null : String(r.revenue).replace('.', rnd() < 0.5 ? ',' : '.'),
      source_file: `export_${r.week_start.slice(0, 7)}.csv`,
    };
    dirty.push(row);
    if (rnd() < 0.04) dirty.push({ ...row, raw_id: ++rid }); // полный дубль строки
  }
}

// ------------------------------------------------------------- запись в БД

/**
 * Связь колонки со справочником — разбором той же прозы, которой она уже
 * описана («FK → dim_region.region_id»), а не отдельным списком рядом.
 *
 * Список рядом пришлось бы держать в согласии с описаниями руками, и
 * разъехались бы они молча: оба места остались бы синтаксически валидными.
 * Здесь источник один, а проверка того, что связь настоящая (ключи реально
 * сходятся, сирот нет), живёт в verify-dataset.mjs.
 *
 * Целевая колонка указывается явно там, где она не совпадает с именем самой
 * колонки: `manager_id → dim_rep.rep_id`, `distributor_id →
 * dim_customer.customer_id`. Где совпадает — можно короче, подставится сама.
 */
const parseReference = (columnName, description) => {
  const m = /FK\s*→\s*([a-z_]+)(?:\.([a-z_]+))?/i.exec(description ?? '');
  if (!m) return null;
  return { table: m[1], column: m[2] ?? columnName };
};

/**
 * Убирает «FK → таблица.колонка» из текста, который уходит в шторку схемы.
 *
 * Связь и так рисуется отдельной строкой со стрелкой (см. SchemaSheet) —
 * из того же references, что строит parseReference выше. Раньше описание
 * показывалось рядом целиком, и «FK → dim_region» читалось дважды подряд.
 * Здесь не второй источник правды: та же строка cols остаётся тем, что
 * разбирает parseReference, — просто хвост про FK не дублируется на экране.
 * Поэтому все описания с явной связью написаны так, что «FK → …» стоит
 * в конце предложения — этот вырез просто отрезает готовый хвост.
 *
 * Тире перед хвостом берётся классом, а не одним символом: в английском
 * описании на его месте естественно оказывается дефис, и без класса
 * от него на экране оставался бы висящий хвостик пунктуации.
 */
const stripFkNote = (description) =>
  (description ?? '').replace(/\s*[—–-]?\s*FK\s*→\s*[a-z_]+(?:\.[a-z_]+)?\s*/i, ' ').trim();

/** Кто эти данные «собрал» — единственное человеческое поле схемы вне таблиц. */
const COMPANY = {
  ru: 'Kaiyo Trading — дистрибуция FMCG и OTC-фармы',
  en: 'Kaiyo Trading: FMCG and OTC pharma distribution',
};

/**
 * Схема датасета. Всё, что написано человеческим языком (`title`, `grain`,
 * `note`, описания колонок), хранится **парой `{ ru, en }` на месте**, а не
 * отдельным файлом перевода рядом.
 *
 * Правило на все будущие правки этого файла: добавляя колонку или таблицу,
 * заполняешь обе локали здесь же. Отдельный `schema.en.json`, ключёванный по
 * `таблица.колонка`, остался бы синтаксически валидным после появления новой
 * колонки — то есть разошёлся бы с генератором молча, как разошёлся бы список
 * связей рядом со схемой или словарь единиц измерения рядом с графиком.
 * Пара на месте не позволяет описать колонку, не увидев пустого слота
 * под перевод; проверка ниже (checkLocalized) не даёт этот слот забыть.
 *
 * Локали не имеют и парой не хранятся: имя таблицы, имя и тип колонки, цель
 * внешнего ключа и сами строки примера. Это не язык, а то, что человек
 * набирает в запросе; значения в строках примера одни на обе локали
 * по построению — датасет один, и эталоны считаются по нему же.
 */
const SCHEMA = [
  {
    table: 'dim_date',
    title: { ru: 'Календарь', en: 'Calendar' },
    grain: { ru: 'один день', en: 'one day' },
    ddl: `CREATE TABLE dim_date (
      date_id TEXT PRIMARY KEY, year INTEGER, quarter INTEGER, month INTEGER, month_name TEXT,
      month_start TEXT, week_start TEXT, iso_week INTEGER, day_of_week INTEGER, day_name TEXT, is_weekend INTEGER)`,
    cols: {
      date_id: { ru: 'Дата в формате YYYY-MM-DD, первичный ключ', en: 'Date in YYYY-MM-DD format, primary key' },
      year: { ru: 'Год', en: 'Year' },
      quarter: { ru: 'Квартал 1–4', en: 'Quarter 1–4' },
      month: { ru: 'Номер месяца 1–12', en: 'Month number 1–12' },
      month_name: { ru: 'Название месяца', en: 'Month name' },
      month_start: { ru: 'Первое число месяца — удобно для группировки', en: 'First day of the month — handy for grouping' },
      week_start: { ru: 'Понедельник недели', en: 'Monday of the week' },
      iso_week: { ru: 'Номер недели по ISO', en: 'ISO week number' },
      day_of_week: { ru: 'День недели, 1 = понедельник', en: 'Day of week, 1 = Monday' },
      day_name: { ru: 'Сокращение дня недели', en: 'Day-of-week abbreviation' },
      is_weekend: { ru: 'Флаг выходного дня (0/1)', en: 'Weekend flag (0/1)' },
    },
    rows: dates,
  },
  {
    table: 'dim_product',
    title: { ru: 'Товары', en: 'Products' },
    grain: { ru: 'один SKU', en: 'one SKU' },
    ddl: `CREATE TABLE dim_product (
      product_id INTEGER PRIMARY KEY, sku_code TEXT, product_name TEXT, brand TEXT, category TEXT,
      subcategory TEXT, division TEXT, pack_size REAL, unit TEXT, list_price REAL, launch_date TEXT)`,
    cols: {
      product_id: { ru: 'Ключ товара', en: 'Product key' },
      sku_code: { ru: 'Артикул', en: 'SKU code' },
      product_name: { ru: 'Наименование', en: 'Product name' },
      brand: { ru: 'Бренд', en: 'Brand' },
      category: { ru: 'Категория', en: 'Category' },
      subcategory: { ru: 'Подкатегория', en: 'Subcategory' },
      division: { ru: 'Дивизион: FMCG или Pharma', en: 'Division: FMCG or Pharma' },
      pack_size: { ru: 'Размер упаковки', en: 'Pack size' },
      unit: { ru: 'Единица измерения', en: 'Unit of measure' },
      list_price: { ru: 'Базовая полочная цена, ¥', en: 'Base shelf price, ¥' },
      launch_date: { ru: 'Дата запуска SKU — до неё продаж быть не может', en: 'SKU launch date — no sales can exist before it' },
    },
    rows: products.map((p) => ({
      product_id: p.product_id, sku_code: p.sku_code, product_name: p.product_name, brand: p.brand,
      category: p.category, subcategory: p.subcategory, division: p.division, pack_size: p.pack_size,
      unit: p.unit, list_price: p.list_price, launch_date: p.launch_date,
    })),
  },
  {
    table: 'dim_region',
    title: { ru: 'География', en: 'Geography' },
    grain: { ru: 'один регион', en: 'one region' },
    ddl: `CREATE TABLE dim_region (
      region_id INTEGER PRIMARY KEY, region_name TEXT, macro_region TEXT, population INTEGER, tier INTEGER)`,
    cols: {
      region_id: { ru: 'Ключ региона', en: 'Region key' },
      region_name: { ru: 'Префектура', en: 'Prefecture' },
      macro_region: { ru: 'Макрорегион', en: 'Macro-region' },
      population: { ru: 'Население', en: 'Population' },
      tier: { ru: 'Приоритет региона: 1 — ключевой, 3 — периферия', en: 'Region priority: 1 — key, 3 — periphery' },
    },
    rows: REGIONS,
  },
  {
    table: 'dim_customer',
    title: { ru: 'Клиенты и точки продаж', en: 'Customers and outlets' },
    grain: { ru: 'один клиент', en: 'one customer' },
    ddl: `CREATE TABLE dim_customer (
      customer_id INTEGER PRIMARY KEY, customer_name TEXT, customer_type TEXT, channel TEXT,
      chain_name TEXT, region_id INTEGER, city TEXT, opened_date TEXT, is_active INTEGER,
      served_by_distributor_id INTEGER, rep_id INTEGER)`,
    cols: {
      customer_id: { ru: 'Ключ клиента', en: 'Customer key' },
      customer_name: { ru: 'Название', en: 'Name' },
      customer_type: { ru: 'Тип: distributor, chain, traditional, pharmacy, ecom', en: 'Type: distributor, chain, traditional, pharmacy, ecom' },
      channel: { ru: 'Канал: distributor, modern_trade, traditional_trade, pharmacy, ecom', en: 'Channel: distributor, modern_trade, traditional_trade, pharmacy, ecom' },
      chain_name: { ru: 'Сеть, если точка сетевая (иначе NULL)', en: 'Chain name, if the outlet belongs to one (NULL otherwise)' },
      region_id: { ru: 'FK → dim_region', en: 'FK → dim_region' },
      city: { ru: 'Город', en: 'City' },
      opened_date: { ru: 'Дата открытия', en: 'Opening date' },
      is_active: { ru: 'Активность (0/1)', en: 'Active flag (0/1)' },
      served_by_distributor_id: {
        ru: 'Дистрибьютор, обслуживающий точку (self-join) — FK → dim_customer.customer_id',
        en: 'Distributor serving the outlet (self-join) — FK → dim_customer.customer_id',
      },
      rep_id: { ru: 'Закреплённый торговый представитель — FK → dim_rep', en: 'Assigned sales rep — FK → dim_rep' },
    },
    rows: customers.map((c) => ({
      customer_id: c.customer_id, customer_name: c.customer_name, customer_type: c.customer_type,
      channel: c.channel, chain_name: c.chain_name, region_id: c.region_id, city: c.city,
      opened_date: c.opened_date, is_active: c.is_active, served_by_distributor_id: c.served_by ?? null,
      rep_id: c.rep_id ?? null,
    })),
  },
  {
    table: 'dim_rep',
    title: { ru: 'Торговые представители', en: 'Sales reps' },
    grain: { ru: 'один сотрудник', en: 'one employee' },
    ddl: `CREATE TABLE dim_rep (
      rep_id INTEGER PRIMARY KEY, rep_name TEXT, team TEXT, role TEXT, region_id INTEGER,
      hired_date TEXT, manager_id INTEGER)`,
    cols: {
      rep_id: { ru: 'Ключ сотрудника', en: 'Employee key' },
      rep_name: { ru: 'ФИО', en: 'Full name' },
      team: { ru: 'Команда', en: 'Team' },
      role: { ru: 'manager или rep', en: 'manager or rep' },
      region_id: { ru: 'FK → dim_region', en: 'FK → dim_region' },
      hired_date: { ru: 'Дата найма', en: 'Hire date' },
      manager_id: { ru: 'Руководитель, у руководителей NULL (self-join) — FK → dim_rep.rep_id', en: 'Manager, NULL for managers themselves (self-join) — FK → dim_rep.rep_id' },
    },
    rows: reps,
  },
  {
    table: 'dim_promo',
    title: { ru: 'Промо-акции', en: 'Promotions' },
    grain: { ru: 'одна акция', en: 'one promotion' },
    ddl: `CREATE TABLE dim_promo (
      promo_id INTEGER PRIMARY KEY, promo_name TEXT, brand TEXT, mechanic TEXT,
      start_date TEXT, end_date TEXT, discount_pct REAL, channel TEXT)`,
    cols: {
      promo_id: { ru: 'Ключ акции', en: 'Promotion key' },
      promo_name: { ru: 'Название', en: 'Name' },
      brand: { ru: 'Бренд', en: 'Brand' },
      mechanic: { ru: 'Механика', en: 'Mechanic' },
      start_date: { ru: 'Начало', en: 'Start date' },
      end_date: { ru: 'Конец', en: 'End date' },
      discount_pct: { ru: 'Глубина скидки, %', en: 'Discount depth, %' },
      channel: { ru: 'Канал проведения, all — все каналы', en: 'Channel it runs in, all — every channel' },
    },
    rows: promos,
  },
  {
    table: 'fact_sellout',
    title: { ru: 'Продажи в точках (sell-out)', en: 'Sales at outlets (sell-out)' },
    grain: { ru: 'неделя × точка × SKU', en: 'week × outlet × SKU' },
    ddl: `CREATE TABLE fact_sellout (
      sellout_id INTEGER PRIMARY KEY, week_start TEXT, customer_id INTEGER, product_id INTEGER,
      units INTEGER, revenue REAL, avg_price REAL, promo_id INTEGER)`,
    cols: {
      sellout_id: { ru: 'Ключ строки', en: 'Row key' },
      week_start: { ru: 'Понедельник недели — FK → dim_date.week_start', en: 'Monday of the week — FK → dim_date.week_start' },
      customer_id: { ru: 'FK → dim_customer', en: 'FK → dim_customer' },
      product_id: { ru: 'FK → dim_product', en: 'FK → dim_product' },
      units: { ru: 'Продано штук', en: 'Units sold' },
      revenue: { ru: 'Выручка, ¥', en: 'Revenue, ¥' },
      avg_price: { ru: 'Средняя цена продажи, ¥', en: 'Average selling price, ¥' },
      promo_id: { ru: 'NULL, если продажа вне акции — FK → dim_promo', en: 'NULL if the sale was outside a promotion — FK → dim_promo' },
    },
    rows: sellout,
    note: {
      ru: 'Отсутствие строки означает, что продаж не было (нет товара на полке), а не ноль. Это ловушка: обычный INNER JOIN такие недели просто не покажет.',
      en: 'A missing row means there were no sales (the product was not on the shelf), not a zero. That is the trap: a plain INNER JOIN will not show such weeks at all.',
    },
  },
  {
    table: 'fact_sellin',
    title: { ru: 'Отгрузки дистрибьюторам (sell-in)', en: 'Shipments to distributors (sell-in)' },
    grain: { ru: 'месяц × дистрибьютор × SKU', en: 'month × distributor × SKU' },
    ddl: `CREATE TABLE fact_sellin (
      sellin_id INTEGER PRIMARY KEY, order_date TEXT, ship_date TEXT, month_start TEXT, distributor_id INTEGER,
      product_id INTEGER, units INTEGER, gross_amount REAL, discount_amount REAL, net_amount REAL)`,
    cols: {
      sellin_id: { ru: 'Ключ строки', en: 'Row key' },
      order_date: { ru: 'Дата заказа', en: 'Order date' },
      ship_date: {
        ru: 'Дата отгрузки — на 2–11 дней позже заказа, поэтому заказ конца месяца отгружается уже в следующем',
        en: 'Shipment date — 2–11 days after the order, so an order placed at month-end ships in the next month',
      },
      month_start: { ru: 'Месяц заказа (по order_date)', en: 'Order month (based on order_date)' },
      distributor_id: {
        ru: 'Только продажи дистрибьюторам (customer_type = distributor) — FK → dim_customer.customer_id',
        en: 'Sales to distributors only (customer_type = distributor) — FK → dim_customer.customer_id',
      },
      product_id: { ru: 'FK → dim_product', en: 'FK → dim_product' },
      units: { ru: 'Отгружено штук', en: 'Units shipped' },
      gross_amount: { ru: 'Сумма до скидок, ¥', en: 'Amount before discounts, ¥' },
      discount_amount: { ru: 'Скидки, ¥', en: 'Discounts, ¥' },
      net_amount: { ru: 'Сумма к оплате, ¥', en: 'Amount payable, ¥' },
    },
    rows: sellin,
  },
  {
    table: 'fact_stock',
    title: { ru: 'Остатки у дистрибьюторов', en: 'Distributor stock' },
    grain: { ru: 'месяц × дистрибьютор × SKU', en: 'month × distributor × SKU' },
    ddl: `CREATE TABLE fact_stock (
      stock_id INTEGER PRIMARY KEY, month_start TEXT, month_end TEXT, distributor_id INTEGER,
      product_id INTEGER, units_on_hand INTEGER, units_in_transit INTEGER)`,
    cols: {
      stock_id: { ru: 'Ключ строки', en: 'Row key' },
      month_start: { ru: 'Месяц', en: 'Month' },
      month_end: { ru: 'Последний день месяца', en: 'Last day of the month' },
      distributor_id: { ru: 'FK → dim_customer.customer_id', en: 'FK → dim_customer.customer_id' },
      product_id: { ru: 'FK → dim_product', en: 'FK → dim_product' },
      units_on_hand: { ru: 'Остаток на складе, шт', en: 'Units on hand' },
      units_in_transit: { ru: 'В пути, шт', en: 'Units in transit' },
    },
    rows: stock,
  },
  {
    table: 'fact_target',
    title: { ru: 'Планы продаж', en: 'Sales targets' },
    grain: { ru: 'месяц × представитель × дивизион', en: 'month × rep × division' },
    ddl: `CREATE TABLE fact_target (
      target_id INTEGER PRIMARY KEY, month_start TEXT, rep_id INTEGER, division TEXT,
      target_units INTEGER, target_revenue REAL)`,
    cols: {
      target_id: { ru: 'Ключ строки', en: 'Row key' },
      month_start: { ru: 'Месяц', en: 'Month' },
      rep_id: { ru: 'FK → dim_rep', en: 'FK → dim_rep' },
      division: { ru: 'FMCG или Pharma', en: 'FMCG or Pharma' },
      target_units: { ru: 'План, шт', en: 'Target, units' },
      target_revenue: { ru: 'План, ¥', en: 'Target, ¥' },
    },
    rows: targets,
  },
  {
    table: 'fact_price',
    title: { ru: 'Прайс-лист', en: 'Price list' },
    grain: { ru: 'месяц × SKU', en: 'month × SKU' },
    ddl: `CREATE TABLE fact_price (
      price_id INTEGER PRIMARY KEY, month_start TEXT, product_id INTEGER,
      list_price REAL, promo_price REAL)`,
    cols: {
      price_id: { ru: 'Ключ строки', en: 'Row key' },
      month_start: { ru: 'Месяц', en: 'Month' },
      product_id: { ru: 'FK → dim_product', en: 'FK → dim_product' },
      list_price: { ru: 'Рекомендованная полочная цена, ¥', en: 'Recommended shelf price, ¥' },
      promo_price: { ru: 'Средняя промо-цена, ¥', en: 'Average promo price, ¥' },
    },
    rows: prices,
  },
  {
    table: 'staging_raw_sellout',
    title: { ru: 'Сырой выгруз продаж (грязный)', en: 'Raw sales export (dirty)' },
    grain: { ru: 'строка выгрузки', en: 'one export row' },
    ddl: `CREATE TABLE staging_raw_sellout (
      raw_id INTEGER PRIMARY KEY, sale_date TEXT, customer_name TEXT, sku_code TEXT,
      units TEXT, revenue TEXT, source_file TEXT)`,
    cols: {
      raw_id: { ru: 'Номер строки в выгрузке', en: 'Row number in the export' },
      sale_date: { ru: 'Дата текстом в разных форматах', en: 'Date as text, in mixed formats' },
      customer_name: { ru: 'Название клиента: пробелы по краям, разное написание одной сети', en: 'Customer name: padded with spaces, one chain spelled two ways' },
      sku_code: { ru: 'Артикул в разном регистре', en: 'SKU code in mixed case' },
      units: { ru: 'Количество текстом: бывает NULL, отрицательное, с запятой', en: 'Quantity as text: sometimes NULL, negative, or comma-separated' },
      revenue: { ru: 'Выручка текстом: разделитель то точка, то запятая', en: 'Revenue as text: decimal separator is sometimes a dot, sometimes a comma' },
      source_file: { ru: 'Файл-источник', en: 'Source file' },
    },
    rows: dirty,
    note: {
      ru: 'Слой как есть, до очистки. Все поля текстовые. Здесь тренируется приведение типов, дедупликация и нормализация справочников.',
      en: 'The layer as it arrives, before any cleaning. Every field is text. This is where you practice type casting, deduplication and normalizing reference data.',
    },
  },
];

/**
 * Проверка полноты пар — до первой записи на диск, а не после.
 *
 * Место выбрано намеренно: если бы проверка стояла рядом со сборкой
 * schema.json в конце файла, падение оставляло бы на диске новый датасет
 * и **прошлый** schema.json, а `npm run verify` прогонялся бы по этой паре
 * и вполне мог бы позеленеть. Тогда «перевод забыт» выглядело бы как
 * «всё в порядке» — ровно тот случай, ради которого гейты и заводятся.
 *
 * Сообщение перечисляет все пустые слоты разом, а не первый попавшийся:
 * заполнение переводов — работа одним заходом, и список нужен целиком.
 */
const missingText = [];
const checkLocalized = (where, pair) => {
  for (const locale of ['ru', 'en']) {
    if (typeof pair?.[locale] !== 'string' || !pair[locale].trim()) missingText.push(`${where} → ${locale}`);
  }
};
const brokenRefs = [];
/**
 * Хвост «FK → …» обязан стоять в обоих описаниях и вести в одно место.
 *
 * Сам по себе он записан латиницей и переводу не подлежит — его переносят
 * копированием. Требование от этого не формальное: связи строятся по русскому
 * описанию, английское на них не влияет, поэтому расхождение здесь ничего
 * не сломает на экране и не всплывёт никогда. А означать оно будет то, что
 * переводивший принял колонку за другую, — то есть ошибку не в буквах,
 * а в понимании данных, и рядом с ней наверняка неверно и само описание.
 * Два независимых признака обязаны говорить одно — тот же приём, что
 * у сверки звезды по связям с префиксом имени в verify-dataset.mjs.
 */
const sameRef = (a, b) => a?.table === b?.table && a?.column === b?.column;
for (const t of SCHEMA) {
  checkLocalized(`${t.table}.title`, t.title);
  checkLocalized(`${t.table}.grain`, t.grain);
  if (t.note) checkLocalized(`${t.table}.note`, t.note);
  for (const [name, description] of Object.entries(t.cols)) {
    checkLocalized(`${t.table}.${name}`, description);
    const ru = parseReference(name, description.ru);
    const en = parseReference(name, description.en);
    // Пустой английский слот здесь молчит: о нём уже сказано выше, и второе
    // сообщение про ту же колонку только удлинило бы список для заполнения.
    if (description.en?.trim() && !sameRef(ru, en)) {
      const show = (r) => (r ? `${r.table}.${r.column}` : 'нет связи');
      brokenRefs.push(`${t.table}.${name}: ru → ${show(ru)}, en → ${show(en)}`);
    }
  }
}
checkLocalized('company', COMPANY);
if (missingText.length || brokenRefs.length) {
  if (missingText.length) {
    console.error(`\nНе заполнен текст схемы (${missingText.length}):`);
    for (const item of missingText) console.error(`  ${item}`);
  }
  if (brokenRefs.length) {
    console.error(`\nСвязь FK разошлась между локалями (${brokenRefs.length}):`);
    for (const item of brokenRefs) console.error(`  ${item}`);
  }
  throw new Error('schema: текст не готов — см. список выше');
}

const SQL = await initSqlJs({ locateFile: (f) => path.join(sqlDist, f) });
const db = new SQL.Database();
db.run('PRAGMA journal_mode = OFF; PRAGMA synchronous = OFF;');

let total = 0;
for (const t of SCHEMA) {
  db.run(t.ddl);
  const cols = Object.keys(t.cols);
  const stmt = db.prepare(
    `INSERT INTO ${t.table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`
  );
  db.run('BEGIN');
  for (const row of t.rows) {
    stmt.run(cols.map((c) => (row[c] === undefined ? null : row[c])));
  }
  db.run('COMMIT');
  stmt.free();
  total += t.rows.length;
  console.log(`  ${t.table.padEnd(22)} ${String(t.rows.length).padStart(7)} строк`);
}

// Индексы под типовые джойны — чтобы на телефоне запросы отвечали мгновенно.
for (const idx of [
  'CREATE INDEX ix_sellout_week ON fact_sellout(week_start)',
  'CREATE INDEX ix_sellout_cust ON fact_sellout(customer_id)',
  'CREATE INDEX ix_sellout_prod ON fact_sellout(product_id)',
  'CREATE INDEX ix_sellin_month ON fact_sellin(month_start)',
  'CREATE INDEX ix_sellin_dist ON fact_sellin(distributor_id)',
  'CREATE INDEX ix_stock_month ON fact_stock(month_start)',
  'CREATE INDEX ix_price_month ON fact_price(month_start)',
  'CREATE INDEX ix_customer_region ON dim_customer(region_id)',
]) db.run(idx);
db.run('VACUUM');

await mkdir(outDir, { recursive: true });
await mkdir(path.join(root, '.cache'), { recursive: true });
const raw = Buffer.from(db.export());
// Сырой файл кладём в .cache — он нужен только для локальной проверки запросов из Node.
// В сборку уходит только gzip: так вес по сети не зависит от того, умеет ли хостинг
// сжимать неизвестный ему MIME-тип. Распаковываем на клиенте через DecompressionStream.
//
// Расширение намеренно нейтральное, а не .gz. Менеджеры загрузок (IDM, FDM и прочие)
// вешают перехватчик на известные архивные расширения и утаскивают файл к себе,
// а странице достаётся пустой ответ. Клиент всё равно определяет сжатие
// по сигнатуре первых байт, так что имя файла ни на что не влияет.
const dbFile = path.join(root, '.cache', 'quaera.sqlite');
await writeFile(dbFile, raw);
const gz = gzipSync(raw, { level: 9 });
await writeFile(path.join(outDir, 'quaera.dataset'), gz);

/**
 * Тип колонки — не отдельно поддерживаемый список, а разбор той же DDL,
 * которой уже создаётся таблица (см. SCHEMA[].ddl выше). Формат простой
 * («имя ТИП [PRIMARY KEY]», без вложенных скобок), парсинг таким и остаётся.
 */
const parseColumnTypes = (ddl) => {
  const body = ddl.slice(ddl.indexOf('(') + 1, ddl.lastIndexOf(')'));
  const map = {};
  for (const part of body.split(',')) {
    const [name, type] = part.trim().split(/\s+/);
    if (name && type) map[name] = type;
  }
  return map;
};

/**
 * Несколько настоящих строк на таблицу.
 *
 * Схема из одних имён колонок отвечает на вопрос «что есть», но не на вопрос
 * «как это выглядит»: в каком формате лежит дата, размах ли у цены в рублях
 * или в копейках, бывает ли колонка пустой. Всё это человек иначе выясняет
 * пробным запросом, а на треках без исполнителя (domain, model) не выясняет
 * вовсе — там запускать нечего.
 *
 * Строки берутся с трёх разных концов таблицы, а не первые подряд: у фактов
 * первые строки — это один и тот же день и один и тот же клиент, и по такой
 * выборке не видно ни разброса дат, ни того, что колонка вообще меняется.
 */
const SAMPLE_ROWS = 3;
const sampleFor = (table, rowCount) => {
  if (!rowCount) return [];
  const offsets = [...new Set([0, Math.floor(rowCount / 2), rowCount - 1])].slice(0, SAMPLE_ROWS);
  return offsets.map((offset) => {
    const [res] = db.exec(`SELECT * FROM ${table} LIMIT 1 OFFSET ${offset}`);
    return res.values[0];
  });
};

const schemaJson = {
  dataset: 'quaera',
  // 2 — текст схемы стал парами { ru, en }. Клиент отличает старый документ
  // по форме, а не по числу (см. useSchema), но версия обязана не врать.
  version: 2,
  generated_at: new Date().toISOString().slice(0, 10),
  company: COMPANY,
  period: { from: iso(START), to: iso(END) },
  tables: SCHEMA.map((t) => {
    const types = parseColumnTypes(t.ddl);
    return {
      table: t.table,
      title: t.title,
      grain: t.grain,
      note: t.note ?? null,
      row_count: t.rows.length,
      columns: Object.entries(t.cols).map(([name, description]) => {
        // Связь берётся из русского описания — оно здесь канон, а совпадение
        // с английским уже проверено выше и потому переспрашивать нечего.
        const references = parseReference(name, description.ru);
        const clean = {
          name,
          description: { ru: stripFkNote(description.ru), en: stripFkNote(description.en) },
          type: types[name] ?? 'TEXT',
        };
        return references ? { ...clean, references } : clean;
      }),
      sample: sampleFor(t.table, t.rows.length),
    };
  }),
};
await writeFile(path.join(outDir, 'schema.json'), JSON.stringify(schemaJson, null, 2), 'utf8');

const { size } = await stat(dbFile);
console.log(`\nВсего строк: ${total.toLocaleString('ru-RU')}`);
console.log(`База: ${(size / 1024 / 1024).toFixed(2)} МБ → по сети ${(gz.length / 1024 / 1024).toFixed(2)} МБ (gzip)`);
