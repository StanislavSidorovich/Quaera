# Kaiyo Trading: three findings and what they cost

Kaiyo Trading is a fictional distributor of FMCG and OTC pharma. Its data is
built by a deterministic generator ([`scripts/build-dataset.mjs`](../../scripts/build-dataset.mjs),
seed `20260801`) and ships inside [Quaera](https://quaera.app), a trainer where
the same tables are used for exercises. The company is invented. The reasoning
is not, and neither are the numbers: each one comes from a query against the
12-table dataset, and anyone can rebuild the database and run them again.

Three questions, each of a kind that survives the move to real data. A metric
that fell for a reason nobody was tracking. A number that counted stock as
sales. A KPI that measures its own formula.

---

## 1. Nettora lost 57% of its volume and none of its demand

**The question.** Home care brand Nettora sold 10,101 units in Q1 2024 and
4,308 in Q1 2026. Two explanations were on the table, weak demand and the
price. The average selling price had indeed risen 10% over the same two years,
which made the second one sound settled.

**What the data shows.** The brand did not lose sales per outlet. It lost
outlets.

| Q1 2024 to Q1 2026 | Nettora | Other four FMCG brands |
| --- | --- | --- |
| Units | 10,101 to 4,308 (−57%) | +14% |
| Outlets buying the brand | 79 to 37 (−53%) | 94 to 94 |
| Units per outlet | 127.9 to 116.4 (−9%) | +14% |

Restricting the comparison to the 33 outlets that never dropped the brand
removes the ambiguity. In those outlets, first-half volume went from 282.9
units per outlet in 2024 to 285.0 in 2026, and the realised price went from
¥195.9 to ¥198.5. Demand and price are flat wherever the brand is still on the
shelf.

The 10% price rise is an artefact of the mix. List price moved 1.9% in two
years (¥202.6 to ¥206.5) and the promo price moved 0.8%. What changed is who
was left buying: the outlets that dropped the brand were the discount-heavy
ecommerce accounts, so the average price of what remained went up while no
price went up.

Two more checks close the obvious alternatives. All 42 outlets that stopped
buying Nettora are still trading and still buying other FMCG from the same
company, 76,571 units of it in the first half of 2026, so this is not store
closures. And they left in a steady trickle, 8 outlets in Q1 2025, then 11, 10,
13 and 4, spread across five retail chains, three ecommerce accounts and
independent trade, so this is not one account's decision either.

**What it means.** This is a distribution problem wearing the costume of a
demand problem. It ran for five quarters without triggering anything, because
the reported metric was volume, and volume falls slowly and plausibly when
outlets leave one at a time. Nobody was watching the number that was actually
moving.

**What to do.** Recovering the brand is a shelf conversation with 42 named
accounts, not a campaign. The list is one query away. The metric that would
have caught it in the first quarter is outlets billed per brand per month, and
it belongs in the weekly reporting next to volume, with an alert on the rate of
decline rather than on the level.

**What it costs.** Those 42 outlets bought 21,015 units for ¥4.02M in 2024,
54% of the brand's revenue. In the first half of 2026 they bought 454 units.
At their own 2024 rate, each recovered outlet is worth about ¥96,000 a year.

---

## 2. One distributor's stock quadrupled while nothing extra was sold

**The question.** Setouchi Trading, one of twelve distributors, held 4,217
units at the end of September 2025 and 20,846 at the end of December. Was this
a sales collapse or a shipping decision?

**What the data shows.** Neither the demand nor the discount changed. The
shipments did.

| Q4 2025 | Setouchi | Other 11 distributors |
| --- | --- | --- |
| Sell-in to sell-out ratio | 2.44 | 1.04 to 1.05 |
| Stock cover at 31 December | 5.4 months | 1.05 to 1.4 months |

Monthly, the ratio sat between 1.01 and 1.05 through September, jumped to 2.5
in October, and returned to 1.05 in January. Nothing on the demand side asked
for it: sell-out through Setouchi's nine outlets was 11,574 units in Q4 2025
against 12,673 a year earlier, a 9% dip in a year that was up 6% overall. The
purchase discount was unchanged at 8.0 to 8.9%, so the volume was not bought
with a promotion, and it was not one brand's launch push either: Aqualis went
from 3,041 to 7,311 units year on year, Milvara from 3,082 to 5,923, Fruvia
from 1,996 to 5,669. Everything moved at once.

The stock never came back down. In June 2026, six months later, Setouchi still
held 22,176 units, because shipments went straight back to tracking off-take
(ratio 1.03 to 1.08) instead of being cut below it.

**What it means.** For one quarter, sell-in stopped being a measure of demand
for this account and became a measure of how much inventory was moved across
the company's own boundary. Any revenue reading that used sell-in for Q4 2025
overstated the quarter, and because the stock is still sitting there, it
borrowed that overstatement from every quarter since.

**What to do.** Two changes, both cheap. Net the next orders for this account
against its stock cover rather than against its order history, which at 5.4
months means near-zero shipments for a quarter. And put the cover-months alarm
at distributor level: the company-wide average stayed inside its normal band
through the entire episode, so no aggregate would ever have shown it.

**What it costs.** 22,176 units at list price is ¥2.68M of working capital
sitting in someone else's warehouse. About 17,000 of those units are above the
1.2 months of cover its peers carry, which is ¥2.05M frozen for six months and
counting. Some of it is dairy: 1,488 units of Milvara Strawberry, on a shelf
life that will decide this question if nobody else does.

---

## 3. Only 5 of 25 reps hit target, and it says nothing about the reps

**The question.** In a typical month 3 to 7 of the 25 sales reps hit their
monthly target: median 5, and 24 of the 30 months fall in that range. Company
attainment over the same 30 months never left the 92.8 to 97.9% band. Is this a
weak team, or a weak target?

**What the data shows.** Targets are set as the same rep's own prior fact plus
about 5%: the mean target-to-actual ratio across 750 rep-months is 1.051, with
a spread from 0.92 to 1.18. The hit rate that follows is 19.5%.

The interesting part appears when the 750 rep-months are split by person rather
than by month:

| Measure | Value |
| --- | --- |
| Spread of attainment between reps (SD of rep means) | 0.88 pp |
| Spread of attainment within one rep, month to month | 4.96 pp |
| Share of variance explained by which rep it is (ICC) | about 0 |
| Months hit out of 30, best to worst rep | 9 to 3 |
| SD of those hit counts | 1.93, against 2.17 expected from coin flips |

Over two and a half years, the best and the worst rep in the company are 3.0
percentage points apart on attainment, and the month-to-month swing inside a
single rep is more than five times what separates one rep from another. The
count of months each rep hit target is distributed the way 25 people flipping a
biased coin thirty times would be distributed.

**What it means.** The target does not measure the rep. It measures the gap
between last period's fact and a 5% uplift applied on top of it, and that gap
is noise. Ranking people on it, paying on it, or discussing it in a monthly
review is ranking, paying and discussing luck. It also explains why the two
facts that look contradictory are not: the company hits 95% every month
precisely because the target is derived from what the company already did.

**What to do.** Separate the two jobs this number is currently doing. If the
target is a forecast, state the growth assumption in advance instead of
smuggling it in as a 5% multiplier on each rep's own history. If it is a
performance measure, measure something the rep controls: outlets billed,
assortment width per outlet, order regularity, all of which are already in
these tables. Whichever is chosen, publish the expected hit rate with it: at
×1.05 it is about 20%, at ×1.00 it is 49%.

**What it costs.** If any part of the bonus depends on hitting target, 80% of
the team misses it every month for a reason that has nothing to do with them,
and the 20% who make it were not the better performers. That is the cost of the
current design, and it is paid monthly.

---

## Method

The dataset is a star schema of 12 tables and about 156,000 rows covering
January 2024 to June 2026: sell-out weekly by outlet and SKU, sell-in monthly
by distributor, month-end stock, targets by rep and division, prices, promos, a
date dimension and a deliberately dirty staging table. Sell-out aggregates into
sell-in, sell-in minus sell-out gives stock, and targets are derived from fact,
which is what makes the third finding visible at all.

Every figure above is a query against that database. The one that decides the
first finding fits in twelve lines: it puts volume, outlet count, volume per
outlet and realised price side by side, so that a fall in the first with the
third holding steady can only be the second.

```sql
SELECT d.year || '-Q' || d.quarter                          AS period,
       SUM(f.units)                                         AS units,
       COUNT(DISTINCT f.customer_id)                        AS outlets,
       ROUND(1.0 * SUM(f.units) / COUNT(DISTINCT f.customer_id), 1)
                                                            AS per_outlet,
       ROUND(SUM(f.revenue) / SUM(f.units), 1)              AS avg_price
FROM fact_sellout f
JOIN dim_product p ON p.product_id = f.product_id
JOIN dim_date    d ON d.date_id    = f.week_start
WHERE p.brand = 'Nettora'
GROUP BY 1
ORDER BY 1;
```

Rebuild the database with
`npm run gen:data` and the same seed reproduces the same rows byte for byte;
the storylines are held in place by regression tests
([`scripts/verify-dataset.mjs`](../../scripts/verify-dataset.mjs)), so a change
to the generator that quietly drops one of them fails the build instead of
silently invalidating this page.
