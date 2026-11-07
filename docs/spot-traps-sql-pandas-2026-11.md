# «Найдите, что не так» в SQL и pandas: ловушки аналитика (2026-11-07)

Решение хозяина (ROADMAP 2026-11-06, «Открыто», пункт 2): перенести вид `spot` из «Профессии» (dom-080…083) в треки SQL и pandas на три типовые ошибки: задвоение строк после JOIN, потеря строк в LEFT JOIN, неверное зерно группировки. Основание: `../research/learning-evidence-2026-11/NOTES.md` (генеративное действие «найти ошибку», задача привязана к месту в процессе). Сюжет только рамка: у каждого задания одна строка «кто ждёт отчёт», прозу кампании не трогаем.

Документ: решение по механике, шесть заданий готовыми для переноса в паки, список правок кода для сессии Sonnet. Все числа ниже посчитаны запросами к `.cache/quaera.sqlite` (sql.js, как гейты) и кодом pandas 3.0.3 по тем же таблицам; SQL-эквиваленты pandas-таблиц дали те же строки.

## 1. Механика: «отчёт плюс код», дефекты из разницы с исправленным кодом

### Чего не хватает в нынешнем `mutate`

`mutate` портит верную таблицу руками: `scale` умножает одну клетку, `dup` двоит одну строку, `drop` убирает одну, `total` сдвигает итог. Для «Профессии» это честно: там навык в проверке на здравый смысл, а откуда взялась порча, не важно. Для SQL и pandas не годится по трём причинам.

1. **Числа были бы выдуманными.** Настоящая ошибка портит таблицу узором, а не клеткой. Размножение через `dim_rep` по региону умножает Chiba на 2, Kanagawa и Saitama на 4, а Tokyo и Ibaraki не трогает. Фильтр по правой таблице в WHERE меняет целую колонку и одновременно выбрасывает строки. Лишняя колонка в GROUP BY делит одни бренды на две-три строки с разными числами, другие оставляет. Собрать такое из `scale`/`dup` можно только подгонкой множителей руками, и гейт не смог бы доказать, что это та таблица, которую дал бы реальный запрос.
2. **Навык трека в связи «код → последствие».** В «Профессии» человек не видит запроса. В SQL и pandas главный вопрос: какие строки задевает эта ошибка, а какие нет. Без кода задание сводится к dom-sanity-check.
3. **Два отчёта «до» и «после» отвергнуты.** Поставить рядом верную и испорченную таблицу значит превратить задание в поиск отличий: ответ виден сравнением, рассуждать не нужно.

### Что выбрано

Человек видит код, который собрал отчёт (SQL или pandas, только чтение), и результат этого кода. Отмечает клетки, которые нельзя отправлять. Таблица на экране это **настоящий результат ошибочного кода**, верная таблица это результат **исправленного кода**; дефекты движок выводит сравнением по ключу, руками не размечаются.

- **Ключ** (`key`, обычно одна колонка: регион, бренд, месяц). Строки обеих таблиц сопоставляются по ключу.
- **Дефект = ключ**, у которого показанные строки расходятся с верной строкой:
  - значения разошлись: дефектные клетки это разошедшиеся клетки этой строки (не вся строка: `staff` в sql-122 верен в задетой строке и служит приманкой);
  - ключ показан несколько раз (группа расщепилась): дефектные клетки это все клетки всех строк этого ключа;
  - ключа нет в верной таблице: вся строка.
- **Пропавшие ключи** (есть в верной, нет в показанной) дают один дефект: клетку «Строк: N» в подвале. Поэтому у заданий с потерей строк `footer.rows: true`.
- **Проверка прежняя, «всё или ничего»** (`gradeSpot` не меняется): у каждого дефекта отмечена хотя бы одна его клетка, нет отметок вне дефектов. Значит, в fan-out надо отметить каждый задетый регион, но не верные.
- **Приманки** обязательны и обязательно в незадетых клетках: в каждом из шести заданий часть строк верна. Это и есть суть навыка: ошибка задевает не всё, и отмечать верное тоже ошибка.
- **Разбор один на задание в четыре части**, как у `relate`: симптом в отчёте → причина в коде → как починить → последствие для бизнеса. После ответа показывается и исправленный код. Приманки разбираются отдельно, как сейчас (`decoys[].why`).
- Числа разбора, как сейчас, только плейсхолдерами: `{n}`/`{m}` считают `sql`/`sql2` к Kaiyo, `{rows}`/`{expected}` движок (показано строк / строк в верной таблице).

«Всё в порядке» в этом виде тоже возможно (код без ошибки, `bad === fix`), но в эту шестёрку не входит: контрольное задание стоит добавить по одному на трек следующей пачкой (кандидат: sql-122 с исправленным кодом, где приманка `COUNT(DISTINCT)`).

### Схема данных (предложение для Sonnet)

```ts
// src/content/types.ts, расширение SpotSpec
interface SpotSource {
  lang: 'sql' | 'python';
  bad: string;   // код на экране; его результат и есть показанная таблица
  fix: string;   // исправленный код; результат = верная таблица (spec.rows), показывается после ответа
}
interface SpotTrap {               // разбор в четыре части, как RelateTrap
  symptom: string; cause: string; fix: string; business: string;
  fmt?: 'int' | 'money' | 'num'; sql?: string; n?: number; sql2?: string; m?: number;
}
interface SpotSpec {
  sql: string;                     // для source.lang === 'sql' совпадает с source.fix; для python SQL-эквивалент верной таблицы
  head: string[]; rows: (string | number)[][];   // верная таблица
  footer?: { rows?: boolean; total?: string };
  labels?: Record<string, string>;
  mutate: SpotMutation[];          // в режиме source пустой
  decoys: SpotDecoy[];
  source?: SpotSource;             // новое
  key?: string[];                  // новое, обязательно при source
  badRows?: (string | number)[][]; // новое: результат source.bad, сверяется гейтом
  trap?: SpotTrap;                 // новое: разбор при source
}
// EN-пак: spotTrap?: { symptom, cause, fix, business } рядом со spotDecoys
```

Плейсхолдеры: в `trap` действуют `{n}`, `{m}`, `{rows}`, `{expected}`; `{value}`, `{factor}`, `{delta}` только у `mutate`, как сейчас.

## 2. Шесть заданий

Общее для всех шести: `mode: "spot"`, `goal` RU «Отметьте клетки, которые нельзя отправлять.», EN "Mark the cells that must not be sent."; `orderQuestion` RU «Какие клетки отчёта неверны?», EN "Which cells of the report are wrong?". `brief + goal` по-русски не длиннее 160 знаков (проверено: 148, 158, 140, 154, 157, 146), по-английски тоже. В текстах разборов, подсказок и `explain` нет чисел из двух цифр и больше (правило гейта), в EN нет тире. Id следующие свободные: sql-core кончается на sql-121, python-core на py-102.

| id | навык (`skill`) | уровень | ловушка | кто ждёт отчёт |
|---|---|---|---|---|
| sql-122 | `sql-fanout`, также `sql-join-inner`, `sql-aggregate` | 3 | JOIN с dim_rep по региону: один-ко-многим | директор по продажам Kanto, планёрка |
| sql-123 | `sql-join-left`, также `sql-null` | 3 | условие по правой таблице в WHERE: LEFT стал INNER | директор аптечного канала |
| sql-124 | `sql-group-by`, также `sql-aggregate` | 2 | лишняя колонка в GROUP BY, которой нет в SELECT | категорийный менеджер Pharma |
| py-103 | `py-merge` | 3 | merge со снимками прогноза без выбора горизонта | директор по цепочке поставок |
| py-104 | `py-merge`, также `py-nan` | 3 | `how='left'` и фильтр по правой колонке после merge | трейд-маркетинг, бонус сетям |
| py-105 | `py-groupby` | 2 | среднее средних по регионам | директор по продажам, найм представителя |

Порядок внутри навыка: задание ставить последним в своём навыке (после того, как приём пройден в write/fill/predict), кроме sql-124 и py-105: их можно раньше, они уровня 2.

---

### sql-122 · Выручка Kanto и люди в регионах

`skill: sql-fanout`, `alsoTrains: [sql-join-inner, sql-aggregate]`, `level: 3`.

**RU.** title «Выручка Kanto и люди в регионах». brief «Директор по продажам Kanto ждёт к планёрке выручку 2025 по регионам и число сотрудников продаж в каждом.»
**EN.** title "Kanto revenue and sales staff". brief "The Kanto sales director wants 2025 revenue by region and the sales headcount in each for the planning meeting."

`source.lang: sql`, `key: ["region"]`, подвала нет.

`source.bad` (на экране):

```sql
SELECT r.region_name AS region,
       COUNT(DISTINCT p.rep_id) AS staff,
       ROUND(SUM(f.revenue) / 1000.0) AS revenue_k_yen
FROM fact_sellout f
JOIN dim_customer c ON c.customer_id = f.customer_id
JOIN dim_region r ON r.region_id = c.region_id
JOIN dim_rep p ON p.region_id = r.region_id
WHERE f.week_start LIKE '2025%'
  AND r.macro_region = 'Kanto'
GROUP BY r.region_name
ORDER BY r.region_name
```

`source.fix` (= `spot.sql`):

```sql
WITH rev AS (
  SELECT c.region_id, ROUND(SUM(f.revenue) / 1000.0) AS revenue_k_yen
  FROM fact_sellout f
  JOIN dim_customer c ON c.customer_id = f.customer_id
  WHERE f.week_start LIKE '2025%'
  GROUP BY c.region_id
),
staff AS (
  SELECT region_id, COUNT(*) AS staff FROM dim_rep GROUP BY region_id
)
SELECT r.region_name AS region, s.staff, v.revenue_k_yen
FROM dim_region r
JOIN rev v ON v.region_id = r.region_id
JOIN staff s ON s.region_id = r.region_id
WHERE r.macro_region = 'Kanto'
ORDER BY r.region_name
```

labels: `region` «Регион» / "Region"; `staff` «Сотрудников продаж» / "Sales staff"; `revenue_k_yen` «Выручка 2025, тыс. ¥» / "2025 revenue, ¥ thousand".

| region | staff | на экране (`badRows`) revenue_k_yen | верно (`rows`) | дефект |
|---|---|---|---|---|
| Chiba | 2 | 7402 | 3701 | revenue (×2) |
| Ibaraki | 1 | 1746 | 1746 | нет |
| Kanagawa | 4 | 15796 | 3949 | revenue (×4) |
| Saitama | 4 | 27137 | 6784 | revenue (×4) |
| Tokyo | 1 | 3719 | 3719 | нет |

`badRows`: `[["Chiba",2,7402],["Ibaraki",1,1746],["Kanagawa",4,15796],["Saitama",4,27137],["Tokyo",1,3719]]`
`rows`: `[["Chiba",2,3701],["Ibaraki",1,1746],["Kanagawa",4,3949],["Saitama",4,6784],["Tokyo",1,3719]]`
Дефектов 3: по ключам Chiba, Kanagawa, Saitama, клетка `revenue_k_yen`.

**Приманки.**
1. `where {region: "Kanagawa"}`, `column: staff`.
   RU: «Колонка сотрудников верна даже в задетых строках: COUNT(DISTINCT) схлопывает копии, которые наплодило соединение. Поэтому размножение и не видно по ней, а SUM копии складывает.»
   EN: "The staff column is right even in the affected rows: COUNT(DISTINCT) collapses the copies the join created. That is why the fan out does not show there, while SUM adds the copies up."
2. `where {region: "Tokyo"}`, `column: revenue_k_yen`, `fmt: int`, `sql: SELECT ROUND(SUM(f.revenue) / 1000.0) FROM fact_sellout f JOIN dim_customer c ON c.customer_id = f.customer_id JOIN dim_region r ON r.region_id = c.region_id WHERE f.week_start LIKE '2025%' AND r.region_name = 'Tokyo'`, `n: 3719`.
   RU: «В Tokyo один сотрудник, и каждая продажа соединилась с ним один раз. Выручка Tokyo без dim_rep та же: {n} тыс. ¥. Строка, где множитель равен единице, верна.»
   EN: "Tokyo has one staff member, so each sale joined to them once. Tokyo revenue without dim_rep is the same: {n} thousand yen. A row where the multiplier is one is correct."

**Разбор (`trap`).** `fmt: int`; `sql: SELECT SUM(revenue_k_yen) FROM (<source.bad без ORDER BY>)`, `n: 55800`; `sql2: SELECT ROUND(SUM(revenue) / 1000.0) FROM fact_sellout WHERE week_start LIKE '2025%'`, `m: 51534`.

| | RU | EN |
|---|---|---|
| Симптом | Пять регионов Kanto вместе дают {n} тыс. ¥, больше годовой выручки всей компании ({m} тыс. ¥). Выручка Chiba, Kanagawa и Saitama выросла во столько раз, сколько в регионе сотрудников, а у регионов с одним сотрудником осталась прежней. | The five Kanto regions add up to {n} thousand yen, more than the whole company made in the year ({m} thousand yen). Revenue for Chiba, Kanagawa and Saitama grew by the number of staff in the region, while regions with one staff member stayed the same. |
| Причина | dim_rep присоединён по региону, а сотрудников в регионе несколько. Каждая продажа повторилась столько раз, сколько их в регионе, и SUM сложил все копии. COUNT(DISTINCT) копии схлопнул, поэтому соседняя колонка выглядит верной и маскирует ошибку. | dim_rep is joined on region, and a region has several staff. Each sale repeated once per staff member, and SUM added all the copies. COUNT(DISTINCT) collapsed the copies, so the neighbouring column looks right and hides the error. |
| Как починить | Свести каждую сторону к зерну региона отдельно (выручку в одном CTE, сотрудников в другом) и только потом соединить: одна строка на регион с каждой стороны, множителю неоткуда взяться. | Bring each side to the region grain separately (revenue in one CTE, staff in another) and only then join: one row per region on each side, so there is nothing to multiply by. |
| Для бизнеса | Директор увидит, что в Saitama на сотрудника приходится вчетверо больше выручки, чем на деле, и поделит нагрузку и бонусы по цифрам, которых нет. | The director will see four times more revenue per person in Saitama than there really is, and will split workload and bonuses on figures that do not exist. |

**Подсказки.** RU: «Сравните сумму отчёта с годовой выручкой всей компании.»; «У каких регионов выручка выросла, а у каких нет? Посмотрите на соседнюю колонку.» EN: "Compare the report total with the annual revenue of the whole company."; "Which regions grew and which did not? Look at the neighbouring column."

**explain.** RU: «Соединение со второй таблицей, у которой на ключе несколько строк, размножает строки факта. SUM складывает копии, COUNT(DISTINCT) их прячет, поэтому одна колонка отчёта врёт, а соседняя выглядит честной. Проверка до отправки: число строк факта до и после соединения должно совпасть. Правило: каждую сторону сначала свести к общему зерну, потом соединять.» EN: "Joining a second table that has several rows per key multiplies the fact rows. SUM adds the copies, COUNT(DISTINCT) hides them, so one column of the report lies while the next one looks honest. Check before sending: the fact row count must be the same before and after the join. Rule: bring each side to a common grain first, then join."

---

### sql-123 · Где новинка на полке

`skill: sql-join-left`, `alsoTrains: [sql-null]`, `level: 3`. Сосед по навыку sql-039 (predict, тот же приём на regions); здесь человек сам находит, какие строки задеты.

**RU.** title «Где новинка на полке». brief «Директор аптечного канала ждёт покрытие новинки Vitanor Forte в аптеках Kanto и Kansai с сентября по декабрь 2025.»
**EN.** title "Where the new product is on shelf". brief "The pharmacy channel director expects coverage of the new Vitanor Forte in Kanto and Kansai pharmacies, Sep to Dec 2025."

`source.lang: sql`, `key: ["region"]`, `footer: { rows: true }`.

`source.bad`:

```sql
SELECT r.region_name AS region,
       COUNT(DISTINCT c.customer_id) AS pharmacies,
       COUNT(DISTINCT f.customer_id) AS bought
FROM dim_region r
JOIN dim_customer c ON c.region_id = r.region_id AND c.channel = 'pharmacy'
LEFT JOIN fact_sellout f ON f.customer_id = c.customer_id
WHERE r.macro_region IN ('Kanto', 'Kansai')
  AND f.product_id = 43 -- Vitanor Forte x30
  AND f.week_start BETWEEN '2025-09-01' AND '2025-12-31'
GROUP BY r.region_name
ORDER BY r.region_name
```

`source.fix` (= `spot.sql`):

```sql
SELECT r.region_name AS region,
       COUNT(DISTINCT c.customer_id) AS pharmacies,
       COUNT(DISTINCT f.customer_id) AS bought
FROM dim_region r
JOIN dim_customer c ON c.region_id = r.region_id AND c.channel = 'pharmacy'
LEFT JOIN fact_sellout f ON f.customer_id = c.customer_id
                        AND f.product_id = 43 -- Vitanor Forte x30
                        AND f.week_start BETWEEN '2025-09-01' AND '2025-12-31'
WHERE r.macro_region IN ('Kanto', 'Kansai')
GROUP BY r.region_name
ORDER BY r.region_name
```

labels: `region` «Регион» / "Region"; `pharmacies` «Аптек в регионе» / "Pharmacies in region"; `bought` «Из них брали новинку» / "Of them took the new product".

| region | на экране pharmacies / bought | верно pharmacies / bought | дефект |
|---|---|---|---|
| Chiba | нет строки | 2 / 0 | пропал → «Строк: N» |
| Hyogo | нет строки | 3 / 0 | пропал → «Строк: N» |
| Ibaraki | 1 / 1 | 3 / 1 | pharmacies |
| Kanagawa | 2 / 2 | 2 / 2 | нет |
| Kyoto | 1 / 1 | 2 / 1 | pharmacies |
| Osaka | 1 / 1 | 2 / 1 | pharmacies |
| Saitama | 1 / 1 | 4 / 1 | pharmacies |
| Tokyo | 1 / 1 | 2 / 1 | pharmacies |

`badRows`: `[["Ibaraki",1,1],["Kanagawa",2,2],["Kyoto",1,1],["Osaka",1,1],["Saitama",1,1],["Tokyo",1,1]]`
`rows`: `[["Chiba",2,0],["Hyogo",3,0],["Ibaraki",3,1],["Kanagawa",2,2],["Kyoto",2,1],["Osaka",2,1],["Saitama",4,1],["Tokyo",2,1]]`
Дефектов 6: pharmacies у Ibaraki, Kyoto, Osaka, Saitama, Tokyo и «Строк: 6» (ждали 8).

**Приманки.**
1. `where {region: "Kanagawa"}`, `column: pharmacies`.
   RU: «В Kanagawa новинку и правда взяли обе аптеки региона: терять было некого, и строка верна. Совпадение «аптек» и «брали» само по себе не ошибка; ошибка, когда оно во всех строках.»
   EN: "In Kanagawa both pharmacies of the region really did take the new product: there was nobody to lose, so the row is right. Pharmacies equal to buyers is not an error by itself; it is one when it happens in every row."
2. `where {region: "Saitama"}`, `column: bought`.
   RU: «Купивших фильтр не трогает: у них условие истинно, строки остались. Число брали верно во всех показанных регионах, неверно то, с чем его сравнивают.»
   EN: "The filter does not touch the buyers: the condition is true for them, so their rows stay. The buyer count is right in every region shown; what is wrong is what it is compared with."

**Разбор.** `fmt: int`; `sql: SELECT COUNT(*) FROM dim_customer c JOIN dim_region r ON r.region_id = c.region_id WHERE c.channel = 'pharmacy' AND r.macro_region IN ('Kanto', 'Kansai')`, `n: 20`.

| | RU | EN |
|---|---|---|
| Симптом | Во всех строках «аптек» столько же, сколько «брали»: новинка будто стоит в каждой аптеке. Регионов показано {rows} из {expected}, а аптек в отчёте меньше, чем в справочнике: там их {n}. | In every row pharmacies equal buyers, as if the new product were in every pharmacy. The report shows {rows} regions out of {expected}, and fewer pharmacies than the reference table, which has {n}. |
| Причина | Условия по fact_sellout стоят в WHERE. У аптеки без продаж новинки колонки f пустые, сравнение NULL с числом не истинно, и WHERE выбрасывает такую строку. LEFT JOIN стал внутренним: остались только купившие, а регионы, где не купил никто, пропали целиком. | The fact_sellout conditions sit in WHERE. A pharmacy with no sales of the new product has empty f columns, comparing NULL with a number is not true, and WHERE drops that row. The LEFT JOIN turned into an inner one: only buyers remain, and regions where nobody bought vanished entirely. |
| Как починить | Перенести условия по fact_sellout в ON. Аптека без покупки останется строкой с NULL справа: COUNT(DISTINCT c.customer_id) посчитает все аптеки, COUNT(DISTINCT f.customer_id) только купивших, а регион без покупок покажет ноль. | Move the fact_sellout conditions into ON. A pharmacy without a purchase stays as a row with NULL on the right: COUNT(DISTINCT c.customer_id) counts all pharmacies, COUNT(DISTINCT f.customer_id) only the buyers, and a region with no purchases shows zero. |
| Для бизнеса | Директор увидит полное покрытие и не отправит представителей туда, где новинки нет: в Chiba и Hyogo её не взяла ни одна аптека, а их в отчёте нет вовсе. | The director will see full coverage and will not send reps where the product is missing: in Chiba and Hyogo no pharmacy took it, and they are not in the report at all. |

**Подсказки.** RU: «Может ли новинка за четыре месяца встать в каждую аптеку?»; «Где в запросе стоит условие по таблице продаж и что оно делает со строками, где продаж нет?» EN: "Can a new product reach every pharmacy in four months?"; "Where does the query put the condition on the sales table, and what does it do to rows with no sales?"

**explain.** RU: «LEFT JOIN обещает сохранить все строки слева, но условие по правой таблице в WHERE отменяет обещание: у строки без пары справа NULL, а NULL не проходит ни одно сравнение. Симптом узнаётся по отчёту: доля везде полная, а строк меньше, чем ждали. Условия на правую таблицу пишут в ON, в WHERE только условия на левую.» EN: "LEFT JOIN promises to keep every row on the left, but a condition on the right table in WHERE breaks the promise: a row with no match has NULL on the right, and NULL passes no comparison. The symptom shows in the report: the share is full everywhere and there are fewer rows than expected. Conditions on the right table go in ON, WHERE keeps only conditions on the left."

---

### sql-124 · Рейтинг брендов Pharma

`skill: sql-group-by`, `alsoTrains: [sql-aggregate]`, `level: 2`. Сосед sql-035 «Колонка мимо GROUP BY» (обратный случай: колонка в SELECT без группировки).

**RU.** title «Рейтинг брендов Pharma». brief «Категорийный менеджер Pharma делит бюджет полки по рейтингу брендов: проданные упаковки за 2025.»
**EN.** title "Pharma brand ranking". brief "The Pharma category manager splits the shelf budget by brand ranking: packs sold in 2025."

`source.lang: sql`, `key: ["brand"]`, подвала нет.

`source.bad`:

```sql
SELECT p.brand,
       SUM(f.units) AS units_sold
FROM fact_sellout f
JOIN dim_product p ON p.product_id = f.product_id
WHERE f.week_start LIKE '2025%'
  AND p.division = 'Pharma'
GROUP BY p.brand, p.unit
ORDER BY units_sold DESC
```

`source.fix` (= `spot.sql`): тот же запрос с `GROUP BY p.brand`.

labels: `brand` «Бренд» / "Brand"; `units_sold` «Продано упаковок, 2025» / "Packs sold, 2025".

| на экране brand | units_sold | верно | дефект |
|---|---|---|---|
| Pyrexan | 10008 | Pyrexan 13273 | ключ Pyrexan расщеплён на 3 строки |
| Rhinolar | 6083 | Rhinolar 6083 | нет |
| Vitanor | 5237 | Vitanor 9419 | ключ Vitanor на 2 строки |
| Gastrivo | 4787 | Gastrivo 5959 | ключ Gastrivo на 2 строки |
| Vitanor | 4182 | | |
| Pyrexan | 1875 | | |
| Pyrexan | 1390 | | |
| Gastrivo | 1172 | | |

`badRows`: `[["Pyrexan",10008],["Rhinolar",6083],["Vitanor",5237],["Gastrivo",4787],["Vitanor",4182],["Pyrexan",1875],["Pyrexan",1390],["Gastrivo",1172]]`
`rows`: `[["Pyrexan",13273],["Vitanor",9419],["Rhinolar",6083],["Gastrivo",5959]]`
Дефектов 3 (по ключу): Pyrexan, Vitanor, Gastrivo; любая клетка любой их строки. Rhinolar верен: все его товары в одной единице (ml). У Pyrexan таблетки, саше и сироп, у Vitanor таблетки и капсулы, у Gastrivo таблетки и суспензия.

**Приманка.** `where {brand: "Rhinolar"}`, `column: units_sold`.
RU: «Rhinolar не расщеплён: все его товары в миллилитрах, лишняя колонка группировки его не разделила. Число верно; неверно только его место: на экране он второй, а на деле третий.»
EN: "Rhinolar is not split: all its products are in millilitres, so the extra grouping column did not divide it. The figure is right; only its place is wrong: it shows second but is really third."

**Разбор.** `fmt: int`; `sql: SELECT SUM(f.units) FROM fact_sellout f JOIN dim_product p ON p.product_id = f.product_id WHERE f.week_start LIKE '2025%' AND p.brand = 'Pyrexan'`, `n: 13273`.

| | RU | EN |
|---|---|---|
| Симптом | Бренды повторяются: Pyrexan в трёх строках, Vitanor и Gastrivo в двух. Каждая строка меньше настоящей продажи бренда (у Pyrexan на деле {n} упаковок), и рейтинг сломан: Rhinolar выглядит вторым. | Brands repeat: Pyrexan in three rows, Vitanor and Gastrivo in two. Each row is smaller than the brand's real sales (Pyrexan actually sold {n} packs), and the ranking breaks: Rhinolar looks second. |
| Причина | В GROUP BY кроме бренда стоит p.unit, единица упаковки, которой нет в SELECT. Строка стала «бренд и единица», и бренд с таблетками, саше и сиропом разошёлся на три группы. Колонки не видно, поэтому повторы выглядят как сбой данных, а не как запрос. | GROUP BY has p.unit, the pack unit, next to the brand, and it is not in SELECT. A row became "brand and unit", so a brand with tablets, sachets and syrup split into three groups. The column is not visible, so the repeats look like a data glitch rather than the query. |
| Как починить | Группировать ровно по тому, на что в отчёте одна строка: GROUP BY p.brand. Каждая колонка в GROUP BY отвечает на вопрос «одна строка на что?»; если ответ не «на бренд», колонка лишняя. | Group by exactly what the report has one row for: GROUP BY p.brand. Each column in GROUP BY answers "one row per what?"; if the answer is not "per brand", the column is extra. |
| Для бизнеса | Бюджет полки уйдёт Rhinolar как второму бренду, а Vitanor, который на деле второй, получит меньше. | The shelf budget will go to Rhinolar as the second brand, and Vitanor, which is really second, will get less. |

**Подсказки.** RU: «Сколько строк должно быть в отчёте по брендам?»; «Найдите в GROUP BY колонку, которой нет в SELECT.» EN: "How many rows should a report by brand have?"; "Find the column in GROUP BY that is not in SELECT."

**explain.** RU: «Зерно отчёта задаёт GROUP BY, а не SELECT. Лишняя колонка в группировке тихо дробит строки: запрос работает, суммы правдоподобны, но ключ отчёта перестаёт быть уникальным. Проверка до отправки: ключ повторяется? Если да, ищите в GROUP BY то, чего нет в названии отчёта.» EN: "The report grain is set by GROUP BY, not SELECT. An extra grouping column quietly splits rows: the query runs, the sums look plausible, but the report key is no longer unique. Check before sending: does the key repeat? If so, look in GROUP BY for something the report title does not name."

---

### py-103 · Прогноз против факта: первые полгода

`skill: py-merge`, `level: 3`. Соседи py-023…025 (размножение через dim_promo по бренду); здесь ключ составной и размножение неравномерное.

**RU.** title «Прогноз против факта: первые полгода». brief «Планировщик спроса показывает директору по поставкам факт и прогноз на месяц вперёд за первые полгода снимков.»
**EN.** title "Forecast vs actuals: the first half year". brief "The demand planner shows the supply director actuals vs the forecast made a month ahead, first half year of snapshots."

`source.lang: python`, `key: ["month_start"]`, подвала нет.

`source.bad`:

```python
actual = (
    fact_sellout.assign(month_start=fact_sellout['week_start'].str[:7] + '-01')
    .groupby(['month_start', 'product_id'], as_index=False)
    .agg(units=('units', 'sum'))
)
pairs = actual.merge(
    fact_forecast_snapshot[['month_start', 'product_id', 'forecast_units']],
    on=['month_start', 'product_id'],
)
result = (
    pairs[pairs['month_start'].between('2024-02-01', '2024-07-01')]
    .groupby('month_start', as_index=False)
    .agg(actual=('units', 'sum'), forecast=('forecast_units', 'sum'))
)
```

`source.fix`:

```python
actual = (
    fact_sellout.assign(month_start=fact_sellout['week_start'].str[:7] + '-01')
    .groupby(['month_start', 'product_id'], as_index=False)
    .agg(units=('units', 'sum'))
)
pairs = actual.merge(
    fact_forecast_snapshot.loc[
        fact_forecast_snapshot['lag_months'] == 1,
        ['month_start', 'product_id', 'forecast_units'],
    ],
    on=['month_start', 'product_id'],
    validate='one_to_one',
)
result = (
    pairs[pairs['month_start'].between('2024-02-01', '2024-07-01')]
    .groupby('month_start', as_index=False)
    .agg(actual=('units', 'sum'), forecast=('forecast_units', 'sum'))
)
```

`spot.sql` (SQL-эквивалент верной таблицы, дал те же строки):

```sql
WITH a AS (
  SELECT substr(week_start, 1, 7) || '-01' AS month_start, product_id, SUM(units) AS units
  FROM fact_sellout GROUP BY 1, 2
)
SELECT a.month_start, SUM(a.units) AS actual, SUM(f.forecast_units) AS forecast
FROM a
JOIN fact_forecast_snapshot f ON f.product_id = a.product_id AND f.month_start = a.month_start AND f.lag_months = 1
WHERE a.month_start BETWEEN '2024-02-01' AND '2024-07-01'
GROUP BY a.month_start ORDER BY a.month_start
```

labels: `month_start` «Месяц» / "Month"; `actual` «Факт, упаковок» / "Actual, packs"; `forecast` «Прогноз на месяц вперёд, упаковок» / "Forecast a month ahead, packs".

| month_start | на экране actual / forecast | верно actual / forecast | снимков на месяц | дефект |
|---|---|---|---|---|
| 2024-02-01 | 26808 / 27598 | 26808 / 27598 | 1 | нет |
| 2024-03-01 | 79730 / 65888 | 39865 / 41621 | 2 | обе клетки |
| 2024-04-01 | 107892 / 92375 | 35964 / 37329 | 3 | обе клетки |
| 2024-05-01 | 89604 / 66763 | 29868 / 29801 | 3 | обе клетки |
| 2024-06-01 | 106287 / 81320 | 35429 / 36839 | 3 | обе клетки |
| 2024-07-01 | 136908 / 110319 | 45636 / 46843 | 3 | обе клетки |

`badRows`: `[["2024-02-01",26808,27598],["2024-03-01",79730,65888],["2024-04-01",107892,92375],["2024-05-01",89604,66763],["2024-06-01",106287,81320],["2024-07-01",136908,110319]]`
`rows`: `[["2024-02-01",26808,27598],["2024-03-01",39865,41621],["2024-04-01",35964,37329],["2024-05-01",29868,29801],["2024-06-01",35429,36839],["2024-07-01",45636,46843]]`
Дефектов 5 (март…июль), любая из двух клеток строки. Снимки прогноза начинаются в январе 2024, поэтому на февраль есть только горизонт 1, на март 1 и 2, с апреля все три.

**Приманка** (одна).
`where {month_start: "2024-02-01"}`, `column: actual`.
   RU: «Февраль верен: это первый месяц истории прогнозов, и снимок на него один, сделанный за месяц. Копировать было нечего. Именно эта строка сбивает с толку: начало таблицы выглядит правильным.»
   EN: "February is right: it is the first month of forecast history, and there is only one snapshot for it, made a month ahead. There was nothing to copy. This is exactly the row that misleads: the top of the table looks correct."

**Разбор.** `fmt: int`; `sql: SELECT SUM(units) FROM fact_sellout WHERE week_start LIKE '2024-03%'`, `n: 39865`.

| | RU | EN |
|---|---|---|
| Симптом | С марта факт скачет: в марте он вдвое больше настоящего (на деле продано {n} упаковок), с апреля втрое, а прогноз отстаёт от него на десятки тысяч. Февраль при этом верен. | From March the actuals jump: March is double the real figure ({n} packs were actually sold), from April it is triple, and the forecast trails far behind. February is right. |
| Причина | В fact_forecast_snapshot на один месяц и товар лежит несколько снимков: за месяц, за два и за три (lag_months). merge по месяцу и товару без выбора снимка нашёл каждой строке факта пару на каждый горизонт, и sum сложил копии факта и сложил прогнозы разных горизонтов. В феврале снимок был один, поэтому февраль цел. | fact_forecast_snapshot holds several snapshots per month and product: made one, two and three months ahead (lag_months). The merge on month and product without picking a snapshot matched each actual row once per horizon, and sum added up the copies of the actuals and the forecasts of different horizons. February had one snapshot, so it survived. |
| Как починить | До merge оставить один горизонт, lag_months == 1, и добавить validate='one_to_one': если ключ справа повторится, pandas остановит соединение ошибкой, а не размножит строки молча. | Keep one horizon before the merge, lag_months == 1, and add validate='one_to_one': if the key repeats on the right, pandas stops the merge with an error instead of multiplying rows silently. |
| Для бизнеса | Директор увидит, что факт вдвое-втрое выше прогноза, и решит, что планирование систематически занижает спрос: план производства поднимут, склад заполнится товаром, которого никто не ждал. | The director will see actuals two or three times above the forecast and conclude that planning keeps understating demand: production plans go up and the warehouse fills with stock nobody asked for. |

**Подсказки.** RU: «Во сколько раз мартовский факт больше февральского, а апрельский?»; «Сколько строк лежит в fact_forecast_snapshot на один товар и один месяц?» EN: "How many times larger is the March actual than February, and April?"; "How many rows does fact_forecast_snapshot hold for one product and one month?"

**explain.** RU: «Таблица снимков хранит один и тот же месяц несколько раз, по разу на горизонт. Соединение по месяцу и товару без выбора горизонта размножает факт ровно во столько раз, сколько снимков, и поэтому ошибка неравномерна: там, где история короткая, строка верна. Проверка до отправки: validate в merge и число строк до и после.» EN: "A snapshot table stores the same month several times, once per horizon. Joining on month and product without picking a horizon multiplies the actuals by the number of snapshots, so the error is uneven: where history is short, the row is right. Check before sending: validate in merge and the row count before and after."

---

### py-104 · Охват акции Nettora 2+1

`skill: py-merge`, `alsoTrains: [py-nan]`, `level: 3`.

**RU.** title «Охват акции Nettora 2+1». brief «Трейд-маркетинг считает бонус сетям за акцию Nettora 2+1: магазины и продажи по акции в пяти регионах вне центра.»
**EN.** title "Nettora 2+1 promo coverage". brief "Trade marketing computes the Nettora 2+1 chain bonus: stores and promo sales in five regions outside the core."

`source.lang: python`, `key: ["region_name"]`, `footer: { rows: true }`. Акция `promo_id = 38`, «Nettora: 2+1», modern_trade, 2025-09-23…2025-10-13. Регионы: Fukuoka, Okinawa (Kyushu), Hiroshima (Chugoku), Miyagi (Tohoku), Hokkaido.

`source.bad`:

```python
outlets = dim_customer[dim_customer['channel'] == 'modern_trade'].merge(
    dim_region[['region_id', 'region_name', 'macro_region']], on='region_id'
)
outlets = outlets[outlets['macro_region'].isin(['Kyushu', 'Chugoku', 'Tohoku', 'Hokkaido'])]
sales = outlets.merge(
    fact_sellout[['customer_id', 'promo_id', 'units']], on='customer_id', how='left'
)
sales = sales[sales['promo_id'] == 38]  # Nettora: 2+1
result = sales.groupby('region_name', as_index=False).agg(
    outlets=('customer_id', 'nunique'), promo_units=('units', 'sum')
)
```

`source.fix`:

```python
outlets = dim_customer[dim_customer['channel'] == 'modern_trade'].merge(
    dim_region[['region_id', 'region_name', 'macro_region']], on='region_id'
)
outlets = outlets[outlets['macro_region'].isin(['Kyushu', 'Chugoku', 'Tohoku', 'Hokkaido'])]
promo = fact_sellout.loc[fact_sellout['promo_id'] == 38, ['customer_id', 'units']]  # Nettora: 2+1
sales = outlets.merge(promo, on='customer_id', how='left')
result = sales.groupby('region_name', as_index=False).agg(
    outlets=('customer_id', 'nunique'), promo_units=('units', 'sum')
)
result['promo_units'] = result['promo_units'].astype(int)
```

`spot.sql`:

```sql
SELECT r.region_name, COUNT(DISTINCT c.customer_id) AS outlets, COALESCE(SUM(f.units), 0) AS promo_units
FROM dim_customer c
JOIN dim_region r ON r.region_id = c.region_id
LEFT JOIN fact_sellout f ON f.customer_id = c.customer_id AND f.promo_id = 38
WHERE c.channel = 'modern_trade' AND r.macro_region IN ('Kyushu', 'Chugoku', 'Tohoku', 'Hokkaido')
GROUP BY r.region_name ORDER BY r.region_name
```

labels: `region_name` «Регион» / "Region"; `outlets` «Сетевых магазинов» / "Chain stores"; `promo_units` «Продано по акции, упаковок» / "Sold on promo, packs".

| region_name | на экране outlets / promo_units | верно | дефект |
|---|---|---|---|
| Fukuoka | 1 / 63 | 3 / 63 | outlets |
| Hiroshima | 1 / 43 | 2 / 43 | outlets |
| Hokkaido | 2 / 75 | 2 / 75 | нет |
| Miyagi | нет строки | 3 / 0 | пропал → «Строк: N» |
| Okinawa | 3 / 101 | 5 / 101 | outlets |

`badRows`: `[["Fukuoka",1,63],["Hiroshima",1,43],["Hokkaido",2,75],["Okinawa",3,101]]`
`rows`: `[["Fukuoka",3,63],["Hiroshima",2,43],["Hokkaido",2,75],["Miyagi",3,0],["Okinawa",5,101]]`
Дефектов 4: outlets у Fukuoka, Hiroshima, Okinawa и «Строк: 4» (ждали 5). Гейт: `res.values.length >= 4` у верной таблицы выполнен (5).

**Приманки.**
1. `where {region_name: "Hokkaido"}`, `column: outlets`.
   RU: «В Hokkaido по акции продали оба сетевых магазина: терять было некого, и строка верна.»
   EN: "In Hokkaido both chain stores sold on the promo: there was nobody to lose, so the row is right."
2. `where {region_name: "Okinawa"}`, `column: promo_units`, `fmt: int`, `sql: SELECT SUM(f.units) FROM fact_sellout f JOIN dim_customer c ON c.customer_id = f.customer_id JOIN dim_region r ON r.region_id = c.region_id WHERE f.promo_id = 38 AND r.region_name = 'Okinawa'`, `n: 101`.
   RU: «Продажи по акции верны во всех показанных строках: фильтр выбросил магазины без продаж, а у них и так ноль. В Okinawa по акции продано {n} упаковок, столько и показано.»
   EN: "Promo sales are right in every row shown: the filter dropped stores with no sales, and they had zero anyway. Okinawa sold {n} packs on the promo, exactly what is shown."

**Разбор.** `fmt: int`; `sql: SELECT COUNT(*) FROM dim_customer c JOIN dim_region r ON r.region_id = c.region_id WHERE c.channel = 'modern_trade' AND r.macro_region IN ('Kyushu', 'Chugoku', 'Tohoku', 'Hokkaido')`, `n: 15`; `sql2: SELECT COUNT(DISTINCT f.customer_id) FROM fact_sellout f JOIN dim_customer c ON c.customer_id = f.customer_id JOIN dim_region r ON r.region_id = c.region_id WHERE f.promo_id = 38 AND c.channel = 'modern_trade' AND r.macro_region IN ('Kyushu', 'Chugoku', 'Tohoku', 'Hokkaido')`, `m: 7`.

| | RU | EN |
|---|---|---|
| Симптом | Регионов {rows} из {expected}, а магазинов в отчёте {m} из {n}: остались только те, что продали по акции. Miyagi, где сетевые магазины есть, пропал целиком. | The report has {rows} regions out of {expected} and {m} stores out of {n}: only those that sold on the promo are left. Miyagi, which has chain stores, vanished entirely. |
| Причина | how='left' сохранил все магазины, у не продававших по акции promo_id стал NaN. Следующая строка оставляет только promo_id == 38, NaN под условие не подходит, и магазины без акционных продаж выпали: левое соединение стало внутренним. | how='left' kept every store, and stores with no promo sales got NaN in promo_id. The next line keeps only promo_id == 38, NaN does not match, and stores without promo sales dropped out: the left join became an inner one. |
| Как починить | Отфильтровать продажи по акции до merge и только потом соединить с магазинами how='left'. Магазин без продаж останется строкой с NaN: nunique посчитает все магазины, а сумма пустых продаж даст ноль. | Filter the promo sales before the merge and only then join to the stores with how='left'. A store with no sales stays as a row with NaN: nunique counts every store, and the sum of empty sales gives zero. |
| Для бизнеса | Охват акции выйдет полным, бонус сетям посчитают от магазинов, которые и так продавали, а Miyagi, где акция не сработала нигде, не попадёт в разговор с сетью. | Promo coverage will look complete, the chain bonus will be based on stores that sold anyway, and Miyagi, where the promo worked nowhere, will not come up with the chain. |

**Подсказки.** RU: «Что делает фильтр по promo_id с магазинами, у которых после merge в promo_id пусто?»; «Сколько строк должно быть в отчёте по пяти регионам?» EN: "What does the promo_id filter do to stores whose promo_id is empty after the merge?"; "How many rows should a report on five regions have?"

**explain.** RU: «how='left' сохраняет строки слева только до первого фильтра по колонке справа: у строки без пары там NaN, и сравнение её выбрасывает. Это тот же приём, что условие на правую таблицу в WHERE в SQL. Фильтр правой таблицы ставят до merge, а пропуски после merge заполняют осознанно.» EN: "how='left' keeps the left rows only until the first filter on a right column: a row with no match has NaN there, and the comparison drops it. It is the same trap as a right table condition in WHERE in SQL. Filter the right table before the merge, and fill the gaps after the merge on purpose."

---

### py-105 · Выручка на точку по макрорегионам

`skill: py-groupby`, `level: 2`. Можно `alsoTrains: [py-transform]`, если там учат вес групп; по паку не проверено.

**RU.** title «Выручка на точку по макрорегионам». brief «Директор по продажам решает, куда добавить представителя: выручка 2025 на одну точку по макрорегионам.»
**EN.** title "Revenue per outlet by macro region". brief "The sales director decides where to add a rep: 2025 revenue per outlet by macro region."

`source.lang: python`, `key: ["macro_region"]`, подвала нет.

`source.bad`:

```python
outlets = dim_customer[dim_customer['channel'] != 'distributor'].merge(
    dim_region[['region_id', 'region_name', 'macro_region']], on='region_id'
)
year = fact_sellout[fact_sellout['week_start'].str.startswith('2025')]
outlets = outlets.merge(
    year.groupby('customer_id', as_index=False).agg(revenue=('revenue', 'sum')),
    on='customer_id', how='left',
)
by_region = outlets.groupby(['macro_region', 'region_name'], as_index=False).agg(
    outlets=('customer_id', 'count'), revenue=('revenue', 'sum')
)
by_region['per_outlet'] = by_region['revenue'] / by_region['outlets']
result = by_region.groupby('macro_region', as_index=False).agg(
    regions=('region_name', 'count'),
    outlets=('outlets', 'sum'),
    per_outlet_k=('per_outlet', 'mean'),
)
result['per_outlet_k'] = (result['per_outlet_k'] / 1000).round().astype(int)
```

`source.fix`: первые строки те же до `by_region = …agg(…)`, дальше:

```python
result = by_region.groupby('macro_region', as_index=False).agg(
    regions=('region_name', 'count'),
    outlets=('outlets', 'sum'),
    revenue=('revenue', 'sum'),
)
result['per_outlet_k'] = (result['revenue'] / result['outlets'] / 1000).round().astype(int)
result = result.drop(columns='revenue')
```

`spot.sql`:

```sql
SELECT r.macro_region, COUNT(DISTINCT r.region_id) AS regions, COUNT(DISTINCT c.customer_id) AS outlets,
       ROUND(SUM(f.revenue) / COUNT(DISTINCT c.customer_id) / 1000.0) AS per_outlet_k
FROM dim_customer c
JOIN dim_region r ON r.region_id = c.region_id
LEFT JOIN fact_sellout f ON f.customer_id = c.customer_id AND f.week_start LIKE '2025%'
WHERE c.channel <> 'distributor'
GROUP BY r.macro_region ORDER BY r.macro_region
```

(Все 132 точки продавали в 2025, NaN после merge нет. Округление: pandas `round()` банковское, SQL `ROUND` от нуля; на этих числах половинок нет, результаты совпали.)

labels: `macro_region` «Макрорегион» / "Macro region"; `regions` «Регионов» / "Regions"; `outlets` «Точек» / "Outlets"; `per_outlet_k` «Выручка на точку, тыс. ¥» / "Revenue per outlet, ¥ thousand".

| macro_region | regions | outlets | на экране per_outlet_k | верно | дефект |
|---|---|---|---|---|---|
| Chubu | 3 | 29 | 275 | 292 | per_outlet_k |
| Chugoku | 1 | 8 | 566 | 566 | нет |
| Hokkaido | 1 | 7 | 612 | 612 | нет |
| Kansai | 3 | 26 | 212 | 213 | per_outlet_k |
| Kanto | 5 | 32 | 623 | 622 | per_outlet_k |
| Kyushu | 2 | 17 | 193 | 192 | per_outlet_k |
| Tohoku | 1 | 13 | 428 | 428 | нет |

`badRows`: `[["Chubu",3,29,275],["Chugoku",1,8,566],["Hokkaido",1,7,612],["Kansai",3,26,212],["Kanto",5,32,623],["Kyushu",2,17,193],["Tohoku",1,13,428]]`
`rows`: `[["Chubu",3,29,292],["Chugoku",1,8,566],["Hokkaido",1,7,612],["Kansai",3,26,213],["Kanto",5,32,622],["Kyushu",2,17,192],["Tohoku",1,13,428]]`
Дефектов 4: Chubu, Kansai, Kanto, Kyushu. Три из них отличаются на одну тысячу: это сознательно, навык в том, чтобы найти строки по формуле, а не по величине расхождения. Если хозяин сочтёт это придиркой, вариант: оставить в отчёте только Chubu из многорегиональных (тогда строк 4: Chubu, Chugoku, Hokkaido, Tohoku), но тогда задание проверяет меньше.

**Приманки.**
1. `where {macro_region: "Hokkaido"}`, `column: per_outlet_k`.
   RU: «Hokkaido верен: регион в нём один, а среднее одного числа равно самому числу. Самая высокая выручка на точку здесь настоящая.»
   EN: "Hokkaido is right: it has one region, and the mean of one number is the number itself. The highest revenue per outlet here is real."
2. `where {macro_region: "Kanto"}`, `column: outlets`.
   RU: «Точки сложены верно: сумма по регионам и есть число точек макрорегиона. Ошибка не в том, что складывали, а в том, что усредняли.»
   EN: "The outlets are added correctly: the sum over regions is the macro region's outlet count. The error is not in what was added but in what was averaged."

**Разбор.** `fmt: int`; `sql: SELECT ROUND(SUM(f.revenue) / COUNT(DISTINCT c.customer_id) / 1000.0) FROM dim_customer c JOIN dim_region r ON r.region_id = c.region_id JOIN fact_sellout f ON f.customer_id = c.customer_id AND f.week_start LIKE '2025%' WHERE c.channel <> 'distributor' AND r.macro_region = 'Chubu'`, `n: 292`; `sql2: WITH reg AS (SELECT r.region_id, SUM(f.revenue) AS rev, COUNT(DISTINCT c.customer_id) AS n FROM dim_customer c JOIN dim_region r ON r.region_id = c.region_id JOIN fact_sellout f ON f.customer_id = c.customer_id AND f.week_start LIKE '2025%' WHERE c.channel <> 'distributor' AND r.macro_region = 'Chubu' GROUP BY r.region_id) SELECT ROUND(SUM(rev) / SUM(n) / 1000.0) - ROUND(AVG(rev / n) / 1000.0) FROM reg`, `m: 17`.

| | RU | EN |
|---|---|---|
| Симптом | Там, где в макрорегионе несколько регионов, выручка на точку не равна выручке, делённой на точки. Сильнее всего в Chubu: на деле там {n} тыс. ¥ на точку, отчёт занизил на {m} тыс. ¥. В Kanto, Kansai и Kyushu расхождение меньше, но формула неверна и там. | Where a macro region has several regions, revenue per outlet does not equal revenue divided by outlets. Chubu is hit hardest: it really makes {n} thousand yen per outlet, and the report understates it by {m} thousand yen. Kanto, Kansai and Kyushu are off by less, but the formula is wrong there too. |
| Причина | Сначала посчитано среднее по каждому региону, потом среднее этих средних. У всех регионов вес стал одинаковым, хотя в Aichi одиннадцать точек, а в Niigata семь, и маленький регион с низкой выручкой на точку тянет Chubu вниз. Где регион один, усреднять нечего, и строка верна. | The mean was taken per region first, then the mean of those means. Every region got the same weight, although Aichi has eleven outlets and Niigata seven, so a small region with low revenue per outlet drags Chubu down. Where there is one region there is nothing to average, so the row is right. |
| Как починить | Сложить выручку и точки до макрорегиона и разделить сумму на сумму. Среднее из средних годится, только если группы одного размера. | Add up revenue and outlets to the macro region and divide sum by sum. A mean of means works only when the groups are the same size. |
| Для бизнеса | Директор сравнивает макрорегионы по этой цифре: Chubu выглядит слабее на {m} тыс. ¥ с каждой точки, и решение, куда добавить представителя, примут по числу, которого нет в данных. | The director compares macro regions on this figure: Chubu looks {m} thousand yen weaker per outlet, and the decision on where to add a rep will rest on a number that is not in the data. |

**Подсказки.** RU: «В каких строках среднее собирается из нескольких регионов?»; «Одинаковый ли вес у региона с одиннадцатью точками и у региона с семью?» EN: "In which rows is the average built from several regions?"; "Does a region with eleven outlets weigh the same as one with seven?"

**explain.** RU: «Среднее из средних даёт каждой группе одинаковый вес, сколько бы в ней ни было строк. Ошибка тихая: числа правдоподобны, а где группа одна, результат вообще верен. Проверка до отправки: метрика «на одну точку» должна совпадать с суммой, делённой на сумму. Отношение считают из сумм, а не из готовых отношений.» EN: "A mean of means gives every group the same weight, however many rows it has. The error is quiet: the figures look plausible, and where there is one group the result is even right. Check before sending: a per outlet metric must equal the sum divided by the sum. Build a ratio from sums, not from ratios."

## 3. Правки кода для сессии Sonnet

Оценка: **M**. Движок ветвится, экрану добавляется блок кода и разбор из четырёх частей, гейт учится запускать pandas.

1. **`src/content/types.ts`**: `SpotSource`, `SpotTrap`, поля `source`, `key`, `badRows`, `trap` у `SpotSpec`; в переводе `spotTrap?: { symptom?, cause?, fix?, business? }`. `mutate` при `source` пустой массив.
2. **`src/engine/spot.ts`**: в `buildSpot` ветка `source`: показываются `badRows`; дефекты по ключу как в разделе 1 (разошедшиеся клетки; все клетки расщеплённого ключа; вся строка лишнего ключа; пропавшие ключи → `f:rows`); приманки адресуются по `where` в `badRows`. `gradeSpot` и `cellStates` не меняются. `fillWhy` получает `trap` (тот же набор `{n}`, `{m}`, `{rows}`, `{expected}`).
3. **`src/ui/SpotStep.tsx`**: над таблицей код `source.bad` через общий `CodeBlock` (только чтение, подпись «Запрос, который собрал отчёт» / «Код, который собрал отчёт»; EN "The query behind the report" / "The code behind the report"); после проверки разбор четырьмя абзацами (подписи как у `relate`: симптом, причина, как починить, для бизнеса) и под ним `source.fix`. На 375 код сворачиваемый, таблица остаётся в первом экране. Подписи в i18n RU/EN.
4. **`src/content/index.ts`**: слияние `spotTrap` из EN-пака и проверка, что `trap` есть у задания с `source`.
5. **`scripts/test-spot.mjs`**: читать задания `spot` из всех паков (`domain-core`, `sql-core`, `python-core`). Для `source`:
   - SQL: выполнить `bad` и `fix` в sql.js, сверить с `badRows` и `rows`, `fix` равен `spot.sql`;
   - Python: выполнить `bad` и `fix` в Pyodide тем же путём, что `verify-content` (`public/python-bootstrap.py`, контракт `result=`); подъём Pyodide вынести в общий модуль (`scripts/lib/pyodide.mjs`), чтобы не дублировать; `spot.sql` сверить с результатом `fix`;
   - ключ уникален в `rows`; хотя бы один дефект; хотя бы одна незадетая строка (иначе задание не учит отличать задетое); приманки вне дефектов и показывают верное значение; пропавшие ключи только при `footer.rows`;
   - `trap`: четыре части не короче 60 знаков, плейсхолдеры известны, чисел из двух цифр нет, `{n}`/`{m}` сверены запросами; EN с теми же плейсхолдерами, без тире;
   - проверка «набор: есть отчёт без дефектов» остаётся для `domain-core`; для новых паков пока не требовать (контрольное задание следующей пачкой).
6. **`scripts/verify-content.mjs`** (блок `mode === 'spot'`, строка ~883): разрешить `spot` в `sql-core` и `python-core`; сообщение «ответ выводится из mutate» поправить на «из mutate или source»; убедиться, что для `python`-трека правила write/fill (обязательный `solution`, ключевые слова уровня) не применяются к `spot`.
7. **Контент**: шесть заданий из раздела 2 в `sql-core.json`/`sql-core.en.json` и `python-core.json`/`python-core.en.json`; `test:readme-numbers` (число заданий в README и на лендинге), панель «Все задания» уже знает вид «Найти ошибку».
8. **Проверка глазами** (`quaera-screen-review`): sql-123 и py-105 на 1280 и 375, RU и EN, тёмная тема; длинный код py-103 не выталкивает таблицу за первый экран на ноутбуке.

Чего не делать: не переписывать dom-080…083 на `source` (там навык другой, `mutate` честен), не трогать прозу кампании.
