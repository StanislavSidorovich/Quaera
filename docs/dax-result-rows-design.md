# Таблица результата у DAX predict и fill (`result`): дизайн и бриф (2026-11-24)

Согласовано с хозяином в чате 2026-11-24 (сессия дизайна на Opus). Продолжает аудит `docs/answer-result-audit-2026-11.md`, пункты Q2 и Q3 (там поле называлось `resultSql`/`resultRows`; здесь это один объект `result`), и пункт 4 «Открыто» в ROADMAP от 2026-11-23 (вечер).

Задача: у DAX-заданий нет движка, «предсказал» и «собрал» проверяются текстом, и человек так и не видит, что вернёт мера. Нужно показать таблицу визуала, в котором живёт мера, с настоящими числами Kaiyo.

## 1. Что видит человек

После «Проверить» слева, на месте вставки «Что вернёт запрос» у SQL-предсказаний (часть B, `ui/PredictResult.tsx`):

```
Что покажет визуал · матрица по регионам, срезов на странице нет
 Регион      Nettora Revenue   Total Revenue
 Saitama         2 441 558 ¥     16 850 358 ¥
 Aichi           1 853 110 ¥     14 485 006 ¥
 …
▶Tokyo          1 691 942 ¥      8 876 489 ¥   ← строка вопроса, подсвечена
 Итог           16 165 815 ¥    126 911 191 ¥
 ещё 11 строк ▾
 Power BI в браузере нет: числа посчитаны заранее тем же расчётом на SQL по Kaiyo.
```

Три вида визуала (`visual`):

- `matrix`: разрез по одной колонке, одна или несколько мер, строка «Итог». Большинство заданий.
- `card`: одно значение (фильтр-контекст даёт одну клетку).
- `column`: первые строки таблицы с новой вычисляемой колонкой (mdl-022, 064, 066–068). Итога нет.

Задания с вариантами формулы (mdl-017, 023, 042) кладут варианты рядом колонками `A`, `B`: видно, как ведёт себя каждый.

## 2. Когда показывается

Только после проверки, никогда до (правило аудита §3 и части B): в mdl-020 верный вариант это и есть число из таблицы.

- `predict` (шаг `interpret`): после ответа, верного или нет.
- `fill`: после верной сборки или после «Покажи разбор» (сдался). При неверной сборке таблицы нет: она стала бы подсказкой.
- Симптом, который задание называет само (mdl-039: «100% в каждой строке»), уже стоит в брифе текстом; отдельной таблицы «до» нет.

## 3. Схема

В ru-паке у задания (верхний уровень, рядом с `predictSql` / `template`):

```json
"result": {
  "visual": "matrix",
  "sql": "SELECT r.region_name AS region, ... ORDER BY ...",
  "totalSql": "SELECT NULL AS region, ...",
  "head": ["region", "nettora", "total"],
  "rows": [["Saitama", 2441558, 16850358]],
  "rowCount": 16,
  "total": [null, 16165815, 126911191],
  "fmt": { "nettora": "money", "total": "money" },
  "focus": { "region": "Tokyo" },
  "labels": { "region": "Регион", "nettora": "Nettora Revenue", "total": "Total Revenue" },
  "caption": "Матрица по регионам, срезов на странице нет",
  "empty": false
}
```

| Поле | Обязательно | Смысл |
|---|---|---|
| `visual` | да | `matrix` / `card` / `column` |
| `sql` | у model да, у python нет | SQL-эквивалент меры в этом визуале; у python источник это сам `predictSql` |
| `totalSql` | при `total` | итог в своём контексте, одна строка, столько же колонок |
| `head`, `rows`, `rowCount`, `total` | да (кроме `total`) | пишет `npm run result:write`, руками не набирать; `rows` не больше 12 |
| `fmt` | нет | колонка → `money` / `int` / `num` / `pct`; без ключа число как есть |
| `focus` | нет | значения колонок строки, о которой вопрос; ровно одна строка (как `where` у spot) |
| `labels` | да | подписи колонок, ключи = `head` |
| `caption` | да | контекст визуала: разрез и срезы страницы |
| `empty` | нет | `true` только у задания про пустой визуал |

В `.en.json`: `resultLabels` (те же ключи) и `resultCaption`. Тип `TaskTranslation` расширить этими двумя полями.

Имена мер в `labels` (`Nettora Revenue`) идентификаторы, в обеих локалях одинаковы; переводится только разрез («Регион» / «Region»).

## 4. Откуда числа

Мера не исполняется нигде: ни в браузере, ни в гейте (ROADMAP §6, симулятор фильтр-контекста запрещён).

- Автор (Opus) пишет SQL-эквивалент меры в данном визуале. Равносильность «мера = запрос» проверяет человек: это зона «не проверяет ничто».
- `npm run result:write [id…]` исполняет `sql`/`totalSql` на `.cache/quaera.sqlite` (sql.js, как verify-content) и записывает `head`, первые 12 строк в `rows`, `rowCount`, `total`. Для python исполняет `predictSql` в Pyodide (`scripts/lib/pyodide.mjs`, `runCell`).
- Гейт `test:result` (в `npm run verify`) сверяет всё записанное с тем, что даёт запрос. Список проверок в брифе ниже.

### Правила SQL-эквивалента (для автора)

- Округление в самом SQL: `money` через `ROUND(x,0)`, `pct` через `ROUND(x,4)` (доля 0..1), `num` через `ROUND(x,2)`, `int` целое. Гейт валит хвосты float.
- BLANK в DAX = `NULL` в SQL. `SUM` по пустому набору уже `NULL`. `COUNTROWS`/`DISTINCTCOUNT` по пустому в DAX дают BLANK, а `COUNT` в SQL даёт 0: писать `NULLIF(COUNT(...),0)`. `DIVIDE` на 0 даёт BLANK: `x / NULLIF(y,0)`.
- Строки, где все меры `NULL`, из матрицы убирать (`HAVING`): Power BI их скрывает.
- Итог отдельным `totalSql` по всей таблице в контексте итога, никогда не суммой строк: у доли бренда итог 100%, у средней цены итог это выручка/штуки по всем, у distinct count итог не равен сумме.
- Порядок строк детерминированный (`ORDER BY` до уникальности): по убыванию главной меры, как Power BI по умолчанию сортирует визуал по мере, либо по разрезу для дат.
- Месяцы как `'2025-03'` (текст ISO) прямо в SQL; названий месяцев нет.
- Регион у продажи: `fact_sellout → dim_customer (customer_id) → dim_region (region_id)`.

## 5. Пограничные случаи

| Случай | Поведение |
|---|---|
| Пустота | `matrix`/`column` с 0 строк гейт валит, кроме `empty: true`; тогда словами «Визуал пуст: ни одной строки с данными». `card` с `null` рисует «(пусто)». |
| BLANK и 0 | `null` в треке model рисуется «(пусто)» / «(Blank)», не NULL; 0 остаётся 0. В треке python `null` это `NaN`/`None`, рисуется как сейчас в `ResultTable` (`NULL`). |
| Одна строка или много | решает `visual`; `card` строго 1×1, `matrix` не меньше 2 строк, `column` не меньше 2. |
| Строка вопроса далеко | `focus` всегда видна: если она не в первых 5, показываются первые 4, «…», строка `focus`. Подсвечена как в `AfterReply`. |
| Много строк | хранится ≤ 12; видно 5 (с учётом `focus`), под таблицей «ещё N ▾» раскрывает сохранённые; если `rowCount` > 12, внизу «Всего строк: N». Широкая таблица скроллится в `.table-wrap`. |
| Формат | через `numberLocale`: ru `12,50`, `1 691 942 ¥`, `20,07 %`; en `12.50`, `¥1,691,942`... знак и место ¥ взять из того, как варианты ответа пишут деньги в каждой локали (сверить по паку перед вёрсткой). `pct` хранит долю, показывает проценты с 1–2 знаками. |
| Итог | строка «Итог» / «Total» последней, жирная; первая клетка подписью, остальные из `total`. Интерфейс ничего не суммирует. |
| Сбои | строки статичные: ни воркера, ни сети, ни Pyodide в браузере. Нет `result` → нет вставки (пустая рамка хуже её отсутствия). |
| Повторы | повторная проверка или возврат к заданию рисуют то же; состояние не пишется. |

## 6. Pandas predict

Тот же объект `result` и та же вставка. Источник правды: сам `predictSql` задания, гейт и `result:write` исполняют его в Pyodide. В браузере строки сохранённые, рантайм на 52 МБ не нужен (снимает условие аудита Q1). Приведение: DataFrame → колонки и строки, индекс первой колонкой (если не RangeIndex); Series → две колонки (индекс, имя серии); скаляр → `card`. Отдельный заход после того, как механизм для model стоит.

## 7. Покрытие

Кандидаты: 13 predict с `predictSql` (mdl-017, 020, 022, 023, 024, 037…044) и 16 fill (mdl-058…073). Поле необязательное; кому таблица ничего не добавит (mdl-023: строки уже в коде), тому не ставим. Гейт печатает покрытие «result: N из 29».

Фаза 2 (по желанию, отдельно): числа с ¥ в верном варианте и брифе задания с `result` обязаны найтись в его клетках. Тогда ручные SQL-блоки в verify-content, закрепляющие эти цифры, можно снять.

## 8. Пилоты (SQL сверен с Kaiyo 2026-11-24)

### mdl-020, predict, matrix по регионам

Числа сходятся с текстом вариантов: Tokyo 1 691 942 и 8 876 489, всего 16 регионов, Токио восьмой.

```sql
-- sql
SELECT r.region_name AS region,
       ROUND(SUM(CASE WHEN p.brand = 'Nettora' THEN f.revenue END), 0) AS nettora,
       ROUND(SUM(f.revenue), 0) AS total
FROM fact_sellout f
JOIN dim_customer c ON c.customer_id = f.customer_id
JOIN dim_region r ON r.region_id = c.region_id
JOIN dim_product p ON p.product_id = f.product_id
GROUP BY r.region_name
ORDER BY total DESC, region

-- totalSql (16 165 815 и 126 911 191)
SELECT NULL AS region,
       ROUND(SUM(CASE WHEN p.brand = 'Nettora' THEN f.revenue END), 0) AS nettora,
       ROUND(SUM(f.revenue), 0) AS total
FROM fact_sellout f
JOIN dim_product p ON p.product_id = f.product_id
```

`fmt`: обе меры `money`. `focus`: `{ "region": "Tokyo" }`. `labels` ru: `Регион`, `Nettora Revenue`, `Total Revenue`; en: `Region`, те же. `caption` ru: «Матрица по регионам, срезов на странице нет»; en: «Matrix by region, no slicers on the page». Колонка `total` здесь нужна: это неверный вариант Б, видно, откуда он взялся.

### mdl-071, fill, matrix по регионам: итог в своём контексте

Неверная мера (среднее цен строк) рядом с верной: в итоге 159,25 против 117,92, и в каждом регионе расхождение своё.

```sql
-- sql
SELECT r.region_name AS region,
       ROUND(AVG(f.avg_price), 2) AS avg_of_prices,
       ROUND(SUM(f.revenue) / NULLIF(SUM(f.units), 0), 2) AS avg_price
FROM fact_sellout f
JOIN dim_customer c ON c.customer_id = f.customer_id
JOIN dim_region r ON r.region_id = c.region_id
GROUP BY r.region_name
ORDER BY SUM(f.revenue) DESC, region

-- totalSql (159.25 и 117.92)
SELECT NULL AS region,
       ROUND(AVG(f.avg_price), 2) AS avg_of_prices,
       ROUND(SUM(f.revenue) / NULLIF(SUM(f.units), 0), 2) AS avg_price
FROM fact_sellout f
```

`fmt`: обе `num`. Без `focus`. `labels` ru: `Регион`, `AVERAGE(avg_price)`, `Avg Price`; en: `Region`, те же. `caption` ru: «Матрица по регионам: было и стало»; en: «Matrix by region: before and after».

Перед вставкой в пак сверить с `explain` и `brief` mdl-071, что они не называют других чисел.

---

## Бриф для Sonnet: механизм `result`, гейт, два пилота

**Первым пунктом: не используй Agent/Task tool, не делегируй, делай всё сам последовательно.**

Работа в `quaera/` (тренажёр). Прочитать `quaera/CLAUDE.md` (особенно про загрузчик `validate()` и белый экран) и этот документ целиком. Перед правками `git -C quaera fetch origin && git -C quaera status`; отстаёт → `git pull --ff-only`. В дереве могут быть чужие незакоммиченные правки (другая сессия правит `src/ui/home/*.css`): их не трогать и не коммитить.

### Шаги

1. **Типы** (`src/content/types.ts`): `TaskResult` по §3; поле `result?: TaskResult` у задания; `resultLabels?`, `resultCaption?` в `TaskTranslation`. `fmt` переиспользует набор из spot (`int`/`money`/`num`) плюс `pct`.
2. **Загрузчик** (`src/content/index.ts`, `validate()`): принять поле, проверить форму (иначе белый экран). Перевод подмешивать как у `labels` relate.
3. **`npm run result:write`** (`scripts/result-write.mjs`): для заданий с `result` (или перечисленных id) исполнить `sql`/`totalSql` на `.cache/quaera.sqlite` через sql.js, записать `head`, `rows` (≤12), `rowCount`, `total` в `model-core.json`, сохранив форматирование файла (2 пробела, порядок ключей задания). Python-ветку оставить заглушкой с ошибкой «ещё не сделано» (pandas отдельным заходом).
4. **Гейт** `scripts/test-result.mjs`, `test:result` в `package.json` и в цепочку `verify`. Проверки на каждое задание с `result`:
   - трек `model` (или `python`), `visual` из трёх;
   - у model есть `sql`; запрос исполняется; `head` = колонки результата;
   - `rows` = первые `min(12, n)` строк результата, `rowCount` = n;
   - `total` есть ⇔ есть `totalSql`; `totalSql` даёт ровно одну строку той же ширины, равную `total`;
   - `card`: 1×1 и без `total`; `matrix`/`column`: ≥2 строк, если не `empty: true`; `empty: true` ⇔ 0 строк;
   - ключи `fmt` ⊂ `head`; `money`/`int` целые, `num` ≤2 знаков, `pct` ≤4 знаков (хвосты float валят);
   - `focus`: ключи ⊂ `head`, совпадает ровно с одной строкой из `rows`;
   - `labels` (ru) и `resultLabels` (en): ключи = `head`, не пустые; en без кириллицы и тире (`—–`); `caption` и `resultCaption` не пустые, en без кириллицы и тире;
   - в конце строка покрытия «result: N из 29 кандидатов» (кандидаты: model с `predictSql` или `mode: "fill"`).
   Образец кода гейта: `scripts/test-relate.mjs` (около строки 246).
5. **Вставка** (`src/ui/`): разделить `PredictResult` на источник и вид. Новый `ResultInset` рисует заголовок, `caption`, `ResultTable` (5 строк с правилом `focus` из §5, подсветка `focus`, «ещё N ▾», строка «Итог», «Всего строк: N» при `rowCount` > 12), строку-сноску про «посчитано заранее». `PredictResult` (исполнение SQL) рисует через тот же вид, поведение части B не меняется. `StoredResult` берёт `task.result`. `null` в треке model показывать «(пусто)» / «(Blank)»; форматы через `numberLocale`. Тексты в `i18n` (ru и en), в en без тире (бюджет `prose-en` ноль).
6. **Места в `TaskView.tsx`**: у `interpret` рядом с условием `draft.solved && step.predictSql && task.track === 'sql' && runsCode` (около строки 1284) добавить ветку `task.result` для `!runsCode`; заголовок «Что покажет визуал» / «What the visual shows». У `fill` без исполнителя (`!runsCode && step.mode === 'fill'`) показывать после верной сборки и после «Покажи разбор», при неверной нет; заголовок «Что вернёт мера» / «What the measure returns».
7. **Пилоты**: mdl-020 и mdl-071 по §8 (SQL как есть, `rows` только через `result:write`), en-поля в `model-core.en.json`.
8. **Проверка**: шаги `npm run verify` зелёные, прогонять по одному в foreground (одной командой однажды висло 10+ минут), плюс `npx tsc --noEmit`; в браузере (`quaera-dev`, порт 5173, сервер из корня семейства) оба пилота на ru и en, ширина 375 и 1440: строка Tokyo видна и подсвечена, итог последней строкой, «ещё N» раскрывает, при неверной сборке mdl-071 таблицы нет, после «Покажи разбор» есть. Скриншоты в отчёт. Скилл `quaera-screen-review` перед коммитом.

### Пограничные случаи, которые надо увидеть руками

Пустота (временно `empty: true` на копии в тесте гейта, не в паке), `card` с `null`, `focus` на 8-й строке, en-формат денег, длинная подпись колонки на 375.

### Коммиты

Русские сообщения с телом «почему», подпись `Co-Authored-By: Claude Sonnet <версия> <noreply@anthropic.com>`. Два коммита: (1) механизм, гейт, `result:write`, вставка; (2) пилоты mdl-020, mdl-071. **Только локально, не пушить**: пушит хаб. В отчёте: хеши, вывод гейта, скриншоты, что не проверено.

### Не делать

Python-ветку, остальные 27 заданий (их SQL пишет Opus), фазу 2 (числа из вариантов в клетках), правки ROADMAP и памяти (это хаб).
