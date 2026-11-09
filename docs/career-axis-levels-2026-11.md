# Уровни по осям «Пути к роли»: что значит 1, 2, 3 и где подтянуть

Дата: 2026-11-08. Писал Opus, вёрстка по этому документу делается Sonnet. Код не менялся.

Зачем: паутинка и полосы «имею / цель» на экране «Путь к роли» показывают «уровень 2», но человеку не сказано, что это значит и что сделать, чтобы дойти. Здесь по каждой из 8 осей: одна наблюдаемая строка на уровень, что засчитывается внутри Quaera и что только вне её, где подтянуть, как ось видна в вакансиях. В конце форма данных для вёрстки (раздел 11, источник правды для текста интерфейса), расхождения с кодом (раздел 9а) и с целями ролей (раздел 10).

Опора: правило подсчёта `src/career/readiness.ts`, оси и отметки `src/content/career.json`, самопроверка `src/career/quiz.ts`; доли вакансий из приватной сводки по Португалии (142 объявления: 83 с LinkedIn, 59 с досок; пересчитано 2026-11-08). Сюда перенесены только обобщённые доли, без компаний и цитат.

## 1. Общая шкала (одинакова для всех осей)

| Уровень | Подпись на экране | Что человек делает | Как Quaera засчитывает сейчас |
|---|---|---|---|
| 0 | Не начато | Ось не трогал | Меньше 70% навыков оси решены хотя бы раз |
| 1 | Знаком | Решает задачи этой оси на учебных данных, подглядывая в подсказку | 70% навыков оси решены хотя бы раз (с подсказкой тоже); на осях с потолком 1 ещё самопроверка 8 из 10 дважды с паузой от 3 дней |
| 2 | Уверенно | Решает те же задачи сам, без подсказки, и через неделю повторяет без ошибок | 70% навыков оси на «уверенно»: последняя оценка 4 (без ошибок и подсказок) и интервал повторения от 5 дней; на осях с потолком 1 только отметка-доказательство |
| 3 | Проверено делом | Сделал работу на незнакомых данных, которую можно показать или рассказать | Только отметка-доказательство; тренажёр тройку не ставит |

Две оговорки формулы, которые надо держать в голове при чтении осей:
- **Потолок тренажёра.** У SQL, модели, BI, Python и бизнеса `trainerMax = 2`: тренажёр сам доводит до 2, а отметка поднимает ось не больше чем на ступень выше замера (тройка за DataLemur при нуле в треке даёт 1). У статистики, инженерии и процессов `trainerMax = 1`: выше единицы ось поднимают только отметки, и им верят целиком.
- **Один навык в нескольких осях.** `sql-data-quality` стоит в трёх осях (SQL, инженерия, процессы), `sql-promo-lift`, `sql-forecast-accuracy`, `py-outliers`, `py-binning` в двух, `dom-chart-choice` и `sql-business-case` в двух, `model-power-query` и `model-incremental-refresh` в двух. Одно решение двигает обе оси; это намеренно, но подпись «N из M» у соседних осей поэтому растёт вместе.

Правило для строки «где подтянуть» на экране: показывать шаги **следующего** уровня (имею + 1), а не уровня цели. Тот, у кого инженерия 0 при цели 3, должен увидеть самопроверку и конвейер Lab, а не сразу dbt (сейчас код делает наоборот, см. раздел 9а, пункт 3).

## 2. SQL (`sql`, 20 навыков, потолок тренажёра 2)

| Ур. | Что человек делает | Засчитывается |
|---|---|---|
| 1 | Пишет SELECT с фильтром, группировкой и JOIN на учебных таблицах, подглядывая в подсказку | 14 из 20 навыков трека SQL решены хотя бы раз |
| 2 | Без подсказки пишет запрос с LEFT JOIN, GROUP BY, CTE и оконной функцией, замечает размножение строк и через неделю повторяет без ошибок | 14 из 20 навыков на «уверенно» |
| 3 | Решает незнакомые задачи на чужих таблицах: 10 задач medium на внешнем сайте задач без подсказок | отметка `sql-medium` (при тренажёрной 2) |

Внутри Quaera: трек SQL целиком (`sql-schema` … `sql-business-case`), ловушки «Найдите, что не так» sql-122…124. Практика Lab `#practice=sql` (лестница заданий T-SQL на Kaiyo, прогресс живёт в localStorage Lab) засчитывается отметкой `sql-lab-practice` (уровень 2, `source: 'labDone'`, ключ возврата `practice:sql`; Lab шлёт её, когда пройдено 70% разделов). Рядом, но **не засчитываются**: свободные запросы к учебным датасетам Lab.
Только вне: задачи medium на DataLemur или StrataScratch, запросы на работе.

Где подтянуть:
- до 1: трек SQL, ступени 1–2 (`sql-select`, `sql-where`, `sql-group-by`, `sql-join-inner`);
- до 2: повторы в треке без подсказки плюс те же темы руками в Lab: `https://lab.quaera.app/#practice=sql&at=left-join`, `&at=cte`, `&at=windows`;
- до 3: раздел свободных задач `https://lab.quaera.app/#practice=sql&at=free`, затем незнакомая схема `https://lab.quaera.app/#ds=northwind` (или `adventureworks`), затем 10 задач medium на внешнем сайте.

В вакансиях: SQL назван в 87 из 142 объявлений (61%), обязателен в 76; у DA 31 из 42, BI 22 из 29, DE 10 из 12, AE 8 из 12. Процедурный SQL (хранимые процедуры) редок, 6 из 142. Глубину SQL вакансии не меряют, поэтому цель 3 ни одной роли выборкой не подтверждается.

## 3. Модель данных (`modeling`, 9 навыков, потолок 2)

| Ур. | Что человек делает | Засчитывается |
|---|---|---|
| 1 | На готовой схеме называет зерно факта, отличает факт от справочника и проводит связи с кардинальностью, с подсказкой | 7 из 9 навыков решены хотя бы раз |
| 2 | Сам собирает звезду под вопрос: зерно, факт, измерения, роль даты, мост для многие-ко-многим, история справочника (SCD2); через неделю повторяет | 7 из 9 на «уверенно»; отметка `model-cdm-pdm` (модель от концептуальной до SQL) |
| 3 | Собрал звезду для чужого датасета в проекте и объясняет, почему зерно такое | отметка `model-star-project` |

Внутри Quaera: навыки `model-oltp-olap`, `model-grain`, `model-star`, `model-relationships`, `model-ambiguity`, `model-role-playing`, `model-many-to-many`, `model-scd2`, `model-date-table`; «Проведите связи» mdl-093…097 (все на `model-relationships`). Quaera Model засчитывается только отметкой `model-cdm-pdm`, сам по себе Model ничего в тренажёр не присылает.
Только вне: PowerDesigner, представление модели в Power BI, Fabric.

Где подтянуть:
- до 1: трек «Модель и BI», ступень 1, и связи руками: `https://quaera.app/?task=mdl-093,mdl-094,mdl-095`;
- до 2: Quaera Model на звезде Kaiyo `https://model.quaera.app/#example=quaera`: довести CDM до PDM и SQL, запустить скрипт в Lab (переход Model → Lab), отметить `model-cdm-pdm`;
- до 3: чужой датасет в Lab (`https://lab.quaera.app/#ds=adventureworks` или свой CSV), схема в Model (переход Lab → Model), звезда и зерно своими словами.

В вакансиях: моделирование данных (звезда, семантическая модель) обязательно в 54 из 142 (38%); у BI 23 из 29, у AE 9 из 12, у DE 6 из 12, у DA 12 из 42, у gov 1 из 12. Явная «звезда» и DWH названы реже (12 и 16 из 142), это маркер глубины у senior BI и mid AE.

## 4. BI и DAX (`bi`, 11 навыков, потолок 2)

| Ур. | Что человек делает | Засчитывается |
|---|---|---|
| 1 | Отличает меру от вычисляемой колонки и предсказывает, что покажет мера под фильтром визуала, с подсказкой | 8 из 11 навыков решены хотя бы раз |
| 2 | Без подсказки пишет меру с CALCULATE и time intelligence, объясняет, почему итог не равен сумме строк, выбирает график под вопрос; через неделю повторяет | 8 из 11 на «уверенно»; отметка `pl300-practice` (80% и больше) |
| 3 | Сделал отчёт Power BI с мерами DAX на данных, которых не было в заданиях, и показывает его | отметка `bi-report` |

Внутри Quaera: `model-measure-vs-column`, `model-filter-context`, `model-row-context`, `model-additivity`, `model-calculate`, `model-context-transition`, `model-time-intelligence`, `model-power-query`, `model-performance`, `model-incremental-refresh`, `dom-chart-choice`. DAX проверяется сверкой текста, без движка.
Только вне: Power BI Desktop, Practice Assessment PL-300 на Microsoft Learn, Tableau.

Где подтянуть:
- до 1: трек «Модель и BI», ступень 2 (`model-measure-vs-column`, `model-filter-context`, `model-additivity`);
- до 2: ступень 3 (`model-calculate`, `model-context-transition`, `model-time-intelligence`) и Practice Assessment PL-300;
- до 3: разминка в Power BI Desktop на CSV Kaiyo (`/downloads/kaiyo-trading-csv.zip`), потом отчёт на открытом незнакомом датасете с тремя мерами и одним выводом.

В вакансиях: самая частая ось вместе с SQL. Какой-нибудь BI-инструмент назван в 82 из 142, Power BI в 73, DAX в 22. Обязателен у DA (32 из 42), BI (26 из 29), AE (7 из 12); у gov 3 из 12.

## 5. Python и pandas (`python`, 19 навыков, потолок 2)

| Ур. | Что человек делает | Засчитывается |
|---|---|---|
| 1 | Загружает таблицу в pandas, фильтрует, группирует и соединяет две таблицы, с подсказкой | 14 из 19 навыков решены хотя бы раз |
| 2 | Без подсказки чистит выгрузку (типы, пропуски, повторы), собирает groupby и merge без размножения строк; через неделю повторяет | 14 из 19 на «уверенно»; отметка `pandas-notebook` |
| 3 | Разобрал незнакомый датасет от загрузки до вывода и выложил тетрадь | отметка `pandas-own-data` |

Внутри Quaera: трек pandas целиком (`py-dataframe` … `py-rfm`), ловушки py-103…105; Quaera Pandas засчитывается только отметкой `pandas-notebook`. Практика Lab `#practice=python` засчитывается отметкой `py-lab-practice` (уровень 2, `source: 'labDone'`, ключ возврата `practice:python`; Lab шлёт её, когда пройдено 70% разделов).
Только вне: своя тетрадь на GitHub или Kaggle.

Где подтянуть:
- до 1: трек pandas, ступени 1–2 (`py-select-filter`, `py-groupby`, `py-merge`);
- до 2: руками в Lab `https://lab.quaera.app/#practice=python&at=clean-export`, `&at=merge`, `&at=groupby`, потом тетрадь `https://pandas.quaera.app` (137 заданий на другом датасете) и отметка `pandas-notebook`;
- до 3: из Python-вкладки Lab выгрузить `.ipynb` на другом учебном датасете или своём CSV, довести до вывода и выложить.

В вакансиях: Python назван в 53 из 142 (37%), обязателен в 39 (в ручной выборке LinkedIn 30 из 83, на досках 9 из 59); у DA обязателен примерно в 4 из 10 (16 из 42 по сводке), у DE в 11 из 12, у DS в 5 из 8, у BI в 3 из 29. R и SAS редки (7 и 4 из 142).

## 6. Статистика (`stats`, 6 навыков, потолок 1)

| Ур. | Что человек делает | Засчитывается |
|---|---|---|
| 1 | Отличает корреляцию от причины, сравнивает период с тем же периодом года назад, считает ошибку и смещение прогноза, помечает выбросы флагом | 5 из 6 навыков решены хотя бы раз; или самопроверка `stats-quiz` |
| 2 | Посчитал A/B-тест или доверительный интервал на данных вне заданий и письменно объяснил, что вывод значит для решения | отметка `stats-test` |
| 3 | Построил и проверил прогнозную модель: разбиение train/test и метрика ошибки | отметка `stats-model` |

Внутри Quaera: `dom-causality`, `dom-seasonality`, `sql-forecast-accuracy`, `sql-promo-lift`, `py-outliers`, `py-binning`; самопроверка (15 вопросов в банке).
Только вне: всё, что выше единицы.

Где подтянуть:
- до 1: самопроверка на экране «Путь к роли» и навыки `dom-causality`, `dom-seasonality`;
- до 2: тетрадь `.ipynb` из Lab на parquet Kaiyo (переход Lab → Colab): доверительный интервал для лифта промо, затем то же на открытом A/B-датасете;
- до 3: прогноз продаж Kaiyo с train/test и MAPE в той же тетради, потом на незнакомом ряде.

В вакансиях: статистика или ML обязательны примерно у трети DA (14 из 42 по сводке), у BI почти нигде (2 из 29); ML обязателен у DS в 8 из 8. A/B-тесты названы в 4 из 142: в строке L2 их лучше подавать как один из вариантов, а не как суть оси.

## 7. Инженерия данных (`engineering`, 5 навыков, потолок 1)

| Ур. | Что человек делает | Засчитывается |
|---|---|---|
| 1 | Находит и описывает проблемы качества в сырой выгрузке, объясняет, как данные доезжают до модели и как обновляются | 4 из 5 навыков решены хотя бы раз; или `eng-quiz`; или `eng-git` |
| 2 | Загрузил данные пайплайном в lakehouse или хранилище, с расписанием и проверкой | отметка `eng-pipeline` |
| 3 | Сделал проект dbt с тестами данных в git | отметка `eng-dbt` |

Внутри Quaera: `sql-data-quality`, `model-incremental-refresh`, `model-power-query`, `model-data-loading`, `py-performance`; самопроверка (15 вопросов). Конвейер Lab засчитывается отметкой `eng-lab-pipeline` (уровень 1): её закрывает любой из ключей `pipeline:kaiyo-sellout` (по шагам, `#pipeline=`) или `build:kaiyo-sales` (руками от файла до дашборда, `#build=`).
Только вне: Fabric, ADF, Airflow, dbt, git, облако.

Где подтянуть:
- до 1: конвейер `https://lab.quaera.app/#pipeline=kaiyo-sellout` (bronze → silver → gold, три проверки) и самопроверка;
- до 2: пробная Fabric: пайплайн, который грузит CSV Kaiyo в lakehouse по расписанию;
- до 3: dbt Core с адаптером DuckDB на CSV Kaiyo: модели silver и gold, тесты unique, not_null, relationships, всё в git с README.

В вакансиях: качество данных обязательно в 71 из 142 (у DA 21 из 42, у AE 10 из 12, у DE 11 из 12), ETL/ELT в 45, облако названо в 47 (обязательно в 35); dbt и git как обязательные редки (8 и 10 из 142). У AE и DE ось почти везде.

## 8. Бизнес и коммуникация (`business`, 15 навыков, потолок 2)

| Ур. | Что человек делает | Засчитывается |
|---|---|---|
| 1 | Превращает просьбу «сделай дашборд» в постановку: кто решает, какое решение, какая метрика; с подсказкой | 11 из 15 навыков решены хотя бы раз |
| 2 | Без подсказки пишет определение метрики, проверяет число перед отправкой, раскладывает «почему упало» на причины и ставит вывод первой фразой; через неделю повторяет | 11 из 15 на «уверенно» |
| 3 | Разобрал бизнес-кейс с выводом первой фразой на пробном интервью или защите | отметка `biz-case` |

Внутри Quaera: трек «Профессия» (`dom-roles`, `dom-requirements`, `dom-metric-definition`, `dom-sanity-check`, `dom-sellin-sellout`, `dom-fmcg-*`, `dom-pharma-*`, `dom-decomposition`, `dom-abc-xyz`, `dom-storytelling`, `dom-chart-choice`) и `sql-business-case`; «Найдите, что не так» dom-080…083; режим истории.
Только вне: пробное интервью, защита, требования и user stories для живого заказчика, работа в Jira и Agile.

Где подтянуть:
- до 1: «Профессия», ступень 1 (`dom-roles`, `dom-requirements`, `dom-metric-definition`, `dom-sanity-check`) или режим истории `https://quaera.app/?story`;
- до 2: ступени 3–4 (`dom-decomposition`, `dom-storytelling`) и проверка числа `https://quaera.app/?task=dom-080,dom-081,dom-082,dom-083`;
- до 3: взять готовый разбор `sql-business-case` и рассказать его за три минуты другому человеку, вывод первой фразой, вопросы после.

В вакансиях: коммуникация обязательна в 114 из 142, требования и воркшопы в 74, KPI и отчётность в 70, документирование в 44, Agile/PM в 40. Ось нужна всем ролям, включая DE (коммуникация 12 из 12, требования 8 из 12). Тренажёр покрывает постановку и метрики, но не user stories, документацию и Agile.

## 9. Процессы и управление данными (`process`, 5 навыков, потолок 1)

| Ур. | Что человек делает | Засчитывается |
|---|---|---|
| 1 | Описывает путь заказа от заявки до оплаты, называет владельца данных и место в цепочке, где рождается ошибка в отчёте | 4 из 5 навыков решены хотя бы раз; или `process-quiz` |
| 2 | Записал метрику с определением, владельцем и проверками качества; или смоделировал процесс в BPMN по разговору с тем, кто его ведёт | отметка `gov-metric` или `process-bpmn` |
| 3 | Сделал process mining по журналу событий | отметка `process-mining` |

Внутри Quaera: `dom-value-chain`, `dom-order-to-cash`, `dom-planning`, `dom-governance`, `sql-data-quality`; самопроверка (15 вопросов). Quaera Flow засчитывается только отметкой `process-bpmn`.
Только вне: Bizagi, Celonis, pm4py, каталог данных.

Где подтянуть:
- до 1: самопроверка и навыки `dom-order-to-cash`, `dom-governance`;
- до 2: сначала карточка метрики (определение, владелец, проверки) для одной метрики Kaiyo, это ближе к вакансиям; затем процесс заказа в `https://flow.quaera.app/#example=kaiyo` и тот же процесс со слов живого участника;
- до 3: pm4py на открытом журнале событий (например, BPI Challenge), карта процесса и одно узкое место.

В вакансиях: ось держится на безопасности и governance (44 из 142; у gov 11 из 12), BPMN назван в 9 из 142 (в основном у BA, 8 из 19), master data редко (5). Поэтому в строке L2 карточка метрики стоит первой.

## 9а. Расхождения правила подсчёта с этими определениями

**Решено хабом и внесено в код 2026-11-08 (коммит «Путь к роли: цели по 142 вакансиям…»):** пункты 2, 3, 4, 6, 7, 8 и 9 сделаны; пункт 5 решён как «оставить 2, добавить условие про hint()»; пункт 1 (практики Lab) сделан на стороне тренажёра 2026-11-09, Lab шлёт отметки отдельной сессией.

1. **Практики Lab не засчитывались (сделано на стороне тренажёра 2026-11-09: `sql-lab-practice`, `py-lab-practice`, ключи `practice:sql` и `practice:python`; Lab шлёт после 70% разделов).** `#practice=sql` и `#practice=python` дают сотни заданий «без подсказки» (ровно определение уровня 2), но их прогресс живёт в localStorage Lab, и тренажёр о нём не знает. Предложение: вторая отметка возврата по образцу конвейера, `quaera.app/#lab-done=practice:sql` (и `practice:python`), когда пройдено N разделов, и отметка-доказательство уровня 2 на оси SQL и Python с `source: 'labDone'`. Это правка в двух репозиториях (Lab шлёт, тренажёр принимает; пушить первым тренажёр).
2. **Конвейер Lab записан, но не учтён (исправлено 2026-11-08: `eng-lab-pipeline`; с 2026-11-09 её закрывает и `build:kaiyo-sales`).** `pipeline:kaiyo-sellout` лежит в `quaera.labDone`, а `readiness.ts` его не читает. По смыслу это уровень 1 инженерии (сборка по шагам на знакомых данных), не 2: `eng-pipeline` требует настоящего пайплайна по расписанию. Предложение: отметка `eng-lab-pipeline` (axis `engineering`, level 1, `source: 'labDone'`, ключ `pipeline:kaiyo-sellout`), без галочки руками, как у самопроверки.
3. **«Где подтянуть» показывает шаги уровня цели, а не следующего.** В `roleReadiness` отметки разрыва отбираются `e.level >= r.target`. У DE инженерия 0 при цели 3: в разрыве только `eng-dbt`, без самопроверки, git и пайплайна. Надо `e.level === r.have + 1` (или `>= r.have + 1`, сортировка по уровню), тогда лестница видна по ступеням.
4. **Отметка выше потолка молча обрезается.** На осях с потолком 2 `model-cdm-pdm` при нуле в треке даёт 1, `pandas-notebook` даёт 1. Это по замыслу, но экран показывает «упёрлось в потолок» (`evidenceCapped`) без причины. В текст рядом нужна строка: «засчитается полностью, когда тренажёр по оси дойдёт до N−1».
5. **Уровень 2 у `pandas-notebook` мягче определения.** В тетради есть `hint()`, значит «без подсказки» она не доказывает. Перенос на другой датасет (TheLook) при этом настоящий. Оставить 2, но в строку отметки добавить «без hint() в последних двух частях»; решение хозяина.
6. **«Реальных данных» в `stats-test` и `bi-report`.** Человеку без работы взять их негде, и он не отметит честно. Предлагаю формулировку «на данных, которых не было в заданиях» (открытый датасет годится). Определение уровня 3 от этого не теряет смысла: незнакомые данные, а не реальная компания.
7. **Состав оси `business` расходится с вакансиями.** Четыре из 15 навыков отраслевые (`dom-pharma-rx`, `dom-pharma-data`, `dom-fmcg-*`), а вакансии про требования, KPI, документацию и Agile, которых в треке нет. Уровень 2 достижим и без фармы (нужно 11 из 15), так что код не ломается; но для BA с целью 3 нужна вторая отметка-тройка, ближе к вакансиям: `biz-requirements` «Записал требования к отчёту для живого заказчика: user stories и критерии приёмки, их приняли».
8. **Ось `process`: тройка не совпадает с рынком.** `process-mining` в вакансиях почти не встречается, ось держится на governance. Вторая отметка-тройка: `gov-catalog` «Вёл словарь данных или правила качества для чужого набора данных: определения, владельцы, проверки, и ими пользовались».
9. **Подпись источника устарела.** `vacancies.total = 43` в `career.json`, а сводка уже по 102. Обновляет хаб вместе с пересчётом, который идёт в параллельной сессии.

## 10. Расхождения с текущими целями ролей

**Решения хаба 2026-11-08 по 142 вакансиям (внесены в `career.json`):** DA python остаётся 2, DA stats 2 → 1; DE business 0 → 1; gov modeling 2 → 1 и bi 0 → 1; BA modeling 1 → 0; DS цели не тронуты, роль помечена «мало данных» (N = 8). Остальные строки таблицы ниже решения не получили и оставлены как были. Таблица ниже посчитана по 102 вакансиям и дана как история; свежие числа в разделе 7 сводки (ROLE-TARGETS, 12.4).

Цели в `career.json` на 2026-11-08 против сводки по 102 вакансиям (раздел 7.3 сводки) и определений выше. Решает хозяин; здесь только то, что видно.

| Роль | Ось | Цель | Выборка | Довод с учётом определений |
|---|---|---|---|---|
| DA | python | 2 | 1 | Python обязателен в 16 из 41 (39%). Уровень 2 «чищу и соединяю без подсказки» для DA всё равно полезен; если оставлять 2, то по решению, не по данным |
| DA | stats | 2 | 1 | Уровень 2 теперь значит «посчитал интервал или A/B вне заданий». Обязательна ось у 14 из 41; A/B в 3 из 102. Довод за 1 сильнее, чем был |
| BI | stats | 1 | 0 | 3 из 29. Единица (самопроверка) дешёвая, ставить 0 или 1 всё равно; данные за 0 |
| BI | engineering | 1 | 2 | 18 из 29 на всех грейдах, но у входных BI 2 из 6. Для junior 1 держится |
| AE | sql | 3 | 2 | Тройка = незнакомые задачи medium; вакансии глубину не меряют. Оставить 3 можно как решение «AE пишет SQL больше всех» |
| BA | process | 2 | 1 | BPMN 2 из 102. С определением L2 «карточка метрики или BPMN» цель 2 становится достижимой без BPMN, и расхождение мягче |
| BA | business | 3 | 2 | Тройка достижима только `biz-case`; см. 9а, пункт 7 (вторая отметка) |
| DE | business | 0 | 2 | Коммуникация 3 из 3, требования 2 из 3, N = 3. Хотя бы 1 |
| DE | engineering | 3 | 3 | Совпадает, но с правилом 9а, пункт 3 разрыв сейчас показывает только dbt |
| gov | modeling | 2 | 0 | N = 3, governance-вакансии не требуют моделирования; мало данных, не трогать до добора |

## 11. Форма данных для вёрстки

**Где:** новое поле `levels` у каждой оси в `src/content/career.json` (рядом с `note` и `short`), плюс поле `market`. Отдельный JSON не нужен: оси и так живут здесь, а `test:career` уже проверяет id навыков этого файла.

**Типы** (дописать в `src/content/career.ts`):

```ts
export interface AxisStep {
  /** Что сделать, одной строкой без тире. */
  text: Text;
  /**
   * skills: кнопки «потренировать» по этим навыкам (тот же путь, что у разрыва);
   * tasks: ссылка `?task=` на эти задания;
   * app: ссылка `href` в приложение семейства (`app` из FamilyApp);
   * quiz: кнопка самопроверки оси;
   * story: вход в режим истории (тем же обработчиком, что меню);
   * evidence: строка отметки по id, без ссылки;
   * outside: только текст.
   */
  kind: 'skills' | 'tasks' | 'app' | 'story' | 'quiz' | 'evidence' | 'outside';
  skills?: string[];
  tasks?: string[];
  app?: FamilyApp;
  href?: string;
  evidence?: string;
}

export interface AxisLevel {
  level: 1 | 2 | 3;
  /** Что человек делает на этом уровне, наблюдаемо. */
  does: Text;
  /** Шаги, чтобы дойти до этого уровня с предыдущего. 1–3 штуки. */
  steps: AxisStep[];
}

export interface CareerAxis extends AxisDef {
  // ... как сейчас
  levels: AxisLevel[]; // ровно три, level 1, 2, 3 по порядку
  /** Как ось видна в вакансиях, одной фразой с долей. Хаб обновляет вместе с `vacancies`. */
  market: Text;
}
```

**Что не хранить, а считать в UI:** строку «засчитывается». Для уровня ≤ `trainerMax`: «Тренажёр: {ceil(0.7 × total)} из {total} навыков оси {решены / на «уверенно»}» из `axisReading`. Для отметок: заголовки `careerEvidence` с этим `axis` и `level`. Так числа не разъедутся с формулой.

**Как показывать** (вёрстка на усмотрение Sonnet, логика такая): у полосы оси «имею / цель» раскрытие. В нём строка текущего уровня (`levels[have-1].does`, у нуля «Не начато»), строка следующего (`levels[have].does`), «засчитывается» по правилу выше и шаги `levels[have].steps`. На тройке шагов нет, только строка. `market` мелким текстом внизу.

**Гейт `test:career`, дописать:** у каждой оси три уровня 1, 2, 3; `skills` и `tasks` существуют в паках; `evidence` существует и стоит на этой оси; `href` начинается с адреса из `FAMILY` или `https://quaera.app/`; в `ru` и `en` нет «—» и «–» (бюджет тире `en.ts` ноль, тот же принцип).

**Данные целиком** (шаги ссылаются только на то, что уже существует; отметки `eng-lab-pipeline`, `biz-requirements`, `gov-catalog` внесены в `career.json` 2026-11-08, в блоке ниже их нет):

```json
{
  "sql": {
    "market": {
      "ru": "SQL назван примерно в 3 из 4 вакансий выборки и обязателен у DA, BI, AE и DE.",
      "en": "SQL appears in about 3 of 4 ads in the sample and is required for DA, BI, AE and DE."
    },
    "levels": [
      {
        "level": 1,
        "does": {
          "ru": "Пишете SELECT с фильтром, группировкой и JOIN на учебных таблицах, подглядывая в подсказку.",
          "en": "You write SELECT with filters, grouping and JOIN on training tables, peeking at hints."
        },
        "steps": [
          { "kind": "skills", "skills": ["sql-select", "sql-where", "sql-group-by", "sql-join-inner"],
            "text": { "ru": "Трек SQL, первые две ступени.", "en": "SQL track, the first two tiers." } }
        ]
      },
      {
        "level": 2,
        "does": {
          "ru": "Без подсказки пишете запрос с LEFT JOIN, GROUP BY, CTE и оконной функцией, замечаете размножение строк и через неделю повторяете без ошибок.",
          "en": "Without hints you write a query with LEFT JOIN, GROUP BY, a CTE and a window function, spot duplicated rows, and a week later do it again without mistakes."
        },
        "steps": [
          { "kind": "skills", "skills": ["sql-join-left", "sql-fanout", "sql-cte", "sql-window-rank"],
            "text": { "ru": "Повторы в треке без подсказки.", "en": "Repeat in the track without hints." } },
          { "kind": "app", "app": "lab", "href": "https://lab.quaera.app/#practice=sql&at=left-join",
            "text": { "ru": "Те же темы руками в Lab: LEFT JOIN, CTE, окна.", "en": "The same topics by hand in Lab: LEFT JOIN, CTE, windows." } }
        ]
      },
      {
        "level": 3,
        "does": {
          "ru": "Решаете незнакомые задачи на чужих таблицах без подсказок.",
          "en": "You solve unfamiliar problems on someone else's tables without hints."
        },
        "steps": [
          { "kind": "app", "app": "lab", "href": "https://lab.quaera.app/#practice=sql&at=free",
            "text": { "ru": "Свободные задачи в Lab.", "en": "Free tasks in Lab." } },
          { "kind": "app", "app": "lab", "href": "https://lab.quaera.app/#ds=northwind",
            "text": { "ru": "Своими вопросами к незнакомой схеме Northwind.", "en": "Your own questions to the unfamiliar Northwind schema." } },
          { "kind": "evidence", "evidence": "sql-medium",
            "text": { "ru": "10 задач medium на внешнем сайте задач.", "en": "10 medium problems on an outside practice site." } }
        ]
      }
    ]
  },
  "modeling": {
    "market": {
      "ru": "Моделирование данных обязательно примерно в половине вакансий, у BI и AE почти во всех.",
      "en": "Data modelling is required in about half of the ads, and in almost all BI and AE ads."
    },
    "levels": [
      {
        "level": 1,
        "does": {
          "ru": "На готовой схеме называете зерно факта, отличаете факт от справочника и проводите связи, с подсказкой.",
          "en": "On a given schema you name the fact grain, tell facts from dimensions and draw the relationships, with hints."
        },
        "steps": [
          { "kind": "skills", "skills": ["model-grain", "model-star", "model-relationships"],
            "text": { "ru": "Трек «Модель и BI», первая ступень.", "en": "Model and BI track, the first tier." } },
          { "kind": "tasks", "tasks": ["mdl-093", "mdl-094", "mdl-095"],
            "text": { "ru": "Проведите связи руками.", "en": "Draw the relationships by hand." } }
        ]
      },
      {
        "level": 2,
        "does": {
          "ru": "Сами собираете звезду под вопрос: зерно, факт, измерения, роль даты, мост для многие-ко-многим; через неделю повторяете.",
          "en": "You build a star schema for a question yourself: grain, fact, dimensions, date roles, a bridge for many-to-many; a week later you do it again."
        },
        "steps": [
          { "kind": "skills", "skills": ["model-role-playing", "model-many-to-many", "model-scd2"],
            "text": { "ru": "Третья и четвёртая ступени трека без подсказки.", "en": "Tiers three and four of the track without hints." } },
          { "kind": "app", "app": "model", "href": "https://model.quaera.app/#example=quaera",
            "text": { "ru": "Звезда Kaiyo в Quaera Model: от концептуальной модели до SQL.", "en": "The Kaiyo star in Quaera Model: from conceptual model to SQL." } }
        ]
      },
      {
        "level": 3,
        "does": {
          "ru": "Собрали звезду для чужого датасета и объясняете, почему зерно такое.",
          "en": "You built a star schema for someone else's dataset and can explain why the grain is what it is."
        },
        "steps": [
          { "kind": "app", "app": "lab", "href": "https://lab.quaera.app/#ds=adventureworks",
            "text": { "ru": "Незнакомый датасет в Lab, схема в Quaera Model.", "en": "An unfamiliar dataset in Lab, the schema in Quaera Model." } },
          { "kind": "evidence", "evidence": "model-star-project",
            "text": { "ru": "Звезда в проекте, которую можно показать.", "en": "A star schema in a project you can show." } }
        ]
      }
    ]
  },
  "bi": {
    "market": {
      "ru": "Самая частая ось вместе с SQL: BI-инструмент назван примерно в 3 из 4 вакансий, DAX в каждой пятой.",
      "en": "The most common axis alongside SQL: a BI tool appears in about 3 of 4 ads, DAX in one in five."
    },
    "levels": [
      {
        "level": 1,
        "does": {
          "ru": "Отличаете меру от вычисляемой колонки и предсказываете, что покажет мера под фильтром, с подсказкой.",
          "en": "You tell a measure from a calculated column and predict what a measure shows under a filter, with hints."
        },
        "steps": [
          { "kind": "skills", "skills": ["model-measure-vs-column", "model-filter-context", "model-additivity"],
            "text": { "ru": "Трек «Модель и BI», вторая ступень.", "en": "Model and BI track, the second tier." } }
        ]
      },
      {
        "level": 2,
        "does": {
          "ru": "Без подсказки пишете меру с CALCULATE и сравнением периодов, объясняете, почему итог не равен сумме строк; через неделю повторяете.",
          "en": "Without hints you write a measure with CALCULATE and period comparison and explain why a total is not the sum of rows; a week later you do it again."
        },
        "steps": [
          { "kind": "skills", "skills": ["model-calculate", "model-context-transition", "model-time-intelligence"],
            "text": { "ru": "Третья ступень трека.", "en": "The third tier of the track." } },
          { "kind": "evidence", "evidence": "pl300-practice",
            "text": { "ru": "Practice Assessment PL-300 на Microsoft Learn.", "en": "PL-300 Practice Assessment on Microsoft Learn." } }
        ]
      },
      {
        "level": 3,
        "does": {
          "ru": "Сделали отчёт Power BI с мерами DAX на данных, которых не было в заданиях, и показываете его.",
          "en": "You built a Power BI report with DAX measures on data that was not in the tasks, and you can show it."
        },
        "steps": [
          { "kind": "outside",
            "text": { "ru": "Разминка в Power BI Desktop на CSV Kaiyo, затем отчёт на открытом датасете: три меры и один вывод.", "en": "Warm up in Power BI Desktop on the Kaiyo CSV, then a report on an open dataset: three measures and one conclusion." } },
          { "kind": "evidence", "evidence": "bi-report",
            "text": { "ru": "Отчёт, который можно показать.", "en": "A report you can show." } }
        ]
      }
    ]
  },
  "python": {
    "market": {
      "ru": "Python назван примерно в трети вакансий; у DA обязателен в 4 из 10, у DE почти всегда.",
      "en": "Python appears in about a third of the ads; required in 4 of 10 DA ads and in almost every DE ad."
    },
    "levels": [
      {
        "level": 1,
        "does": {
          "ru": "Загружаете таблицу в pandas, фильтруете, группируете и соединяете две таблицы, с подсказкой.",
          "en": "You load a table into pandas, filter, group and merge two tables, with hints."
        },
        "steps": [
          { "kind": "skills", "skills": ["py-select-filter", "py-groupby", "py-merge"],
            "text": { "ru": "Трек pandas, первые две ступени.", "en": "pandas track, the first two tiers." } }
        ]
      },
      {
        "level": 2,
        "does": {
          "ru": "Без подсказки чистите выгрузку: типы, пропуски, повторы; собираете groupby и merge без размножения строк; через неделю повторяете.",
          "en": "Without hints you clean an export: types, missing values, duplicates; you build groupby and merge without duplicated rows; a week later you do it again."
        },
        "steps": [
          { "kind": "app", "app": "lab", "href": "https://lab.quaera.app/#practice=python&at=clean-export",
            "text": { "ru": "Руками в Lab: чистка выгрузки, merge, группировка.", "en": "By hand in Lab: cleaning an export, merge, grouping." } },
          { "kind": "app", "app": "pandas", "href": "https://pandas.quaera.app",
            "text": { "ru": "Тетрадь Quaera Pandas на другом датасете.", "en": "The Quaera Pandas notebook on another dataset." } }
        ]
      },
      {
        "level": 3,
        "does": {
          "ru": "Разобрали незнакомый датасет от загрузки до вывода и выложили тетрадь.",
          "en": "You analysed an unfamiliar dataset from loading to conclusion and published the notebook."
        },
        "steps": [
          { "kind": "app", "app": "lab", "href": "https://lab.quaera.app/#ds=chinook",
            "text": { "ru": "Тетрадь .ipynb из Python-вкладки Lab на незнакомом датасете или своём CSV.", "en": "An .ipynb notebook from the Lab Python tab on an unfamiliar dataset or your own CSV." } },
          { "kind": "evidence", "evidence": "pandas-own-data",
            "text": { "ru": "Тетрадь с выводом, выложенная на GitHub или Kaggle.", "en": "A notebook with a conclusion, published on GitHub or Kaggle." } }
        ]
      }
    ]
  },
  "stats": {
    "market": {
      "ru": "Статистику или ML обязательной называют примерно треть вакансий DA, у BI почти никто; A/B-тесты редки.",
      "en": "About a third of DA ads require statistics or ML, almost no BI ads do; A/B tests are rare."
    },
    "levels": [
      {
        "level": 1,
        "does": {
          "ru": "Отличаете корреляцию от причины, сравниваете период с тем же периодом года назад, считаете ошибку прогноза и помечаете выбросы.",
          "en": "You tell correlation from cause, compare a period with the same period a year earlier, measure forecast error and flag outliers."
        },
        "steps": [
          { "kind": "quiz", "text": { "ru": "Самопроверка по статистике.", "en": "Statistics self-check." } },
          { "kind": "skills", "skills": ["dom-causality", "dom-seasonality", "sql-forecast-accuracy"],
            "text": { "ru": "Навыки оси в треках.", "en": "The axis skills in the tracks." } }
        ]
      },
      {
        "level": 2,
        "does": {
          "ru": "Посчитали A/B-тест или доверительный интервал на данных вне заданий и письменно объяснили, что вывод значит для решения.",
          "en": "You ran an A/B test or a confidence interval on data outside the tasks and explained in writing what the result means for the decision."
        },
        "steps": [
          { "kind": "app", "app": "lab", "href": "https://lab.quaera.app/#practice=python",
            "text": { "ru": "Тетрадь .ipynb из Lab на данных Kaiyo: интервал для лифта промо.", "en": "An .ipynb notebook from Lab on Kaiyo data: a confidence interval for promo lift." } },
          { "kind": "evidence", "evidence": "stats-test",
            "text": { "ru": "То же на открытом A/B-датасете, с выводом.", "en": "The same on an open A/B dataset, with a conclusion." } }
        ]
      },
      {
        "level": 3,
        "does": {
          "ru": "Построили и проверили прогнозную модель: разбиение train/test и метрика ошибки.",
          "en": "You built and validated a predictive model: a train/test split and an error metric."
        },
        "steps": [
          { "kind": "evidence", "evidence": "stats-model",
            "text": { "ru": "Прогноз продаж Kaiyo с train/test и MAPE, затем незнакомый ряд.", "en": "A Kaiyo sales forecast with train/test and MAPE, then an unfamiliar series." } }
        ]
      }
    ]
  },
  "engineering": {
    "market": {
      "ru": "Качество данных обязательно примерно в 6 из 10 вакансий DA; пайплайны и облако чаще у AE и DE, dbt и git как обязательные редки.",
      "en": "Data quality is required in about 6 of 10 DA ads; pipelines and cloud are more common for AE and DE, dbt and git are rarely required."
    },
    "levels": [
      {
        "level": 1,
        "does": {
          "ru": "Находите проблемы качества в сырой выгрузке и объясняете, как данные доезжают до модели и как обновляются.",
          "en": "You find quality problems in a raw export and explain how data reaches the model and how it is refreshed."
        },
        "steps": [
          { "kind": "app", "app": "lab", "href": "https://lab.quaera.app/#pipeline=kaiyo-sellout",
            "text": { "ru": "Конвейер в Lab: bronze, silver, gold и три проверки.", "en": "The pipeline in Lab: bronze, silver, gold and three checks." } },
          { "kind": "quiz", "text": { "ru": "Самопроверка по инженерии данных.", "en": "Data engineering self-check." } },
          { "kind": "skills", "skills": ["sql-data-quality", "model-data-loading"],
            "text": { "ru": "Навыки оси в треках.", "en": "The axis skills in the tracks." } }
        ]
      },
      {
        "level": 2,
        "does": {
          "ru": "Загрузили данные пайплайном в lakehouse или хранилище, с расписанием и проверкой.",
          "en": "You loaded data with a pipeline into a lakehouse or warehouse, on a schedule and with a check."
        },
        "steps": [
          { "kind": "evidence", "evidence": "eng-pipeline",
            "text": { "ru": "Пробная Fabric: пайплайн грузит CSV Kaiyo в lakehouse по расписанию.", "en": "A Fabric trial: a pipeline loads the Kaiyo CSV into a lakehouse on a schedule." } }
        ]
      },
      {
        "level": 3,
        "does": {
          "ru": "Сделали проект dbt с тестами данных в git.",
          "en": "You built a dbt project with data tests, kept in git."
        },
        "steps": [
          { "kind": "evidence", "evidence": "eng-dbt",
            "text": { "ru": "dbt Core на DuckDB с CSV Kaiyo: модели silver и gold, тесты unique, not_null, relationships, README.", "en": "dbt Core on DuckDB with the Kaiyo CSV: silver and gold models, unique, not_null and relationships tests, a README." } }
        ]
      }
    ]
  },
  "business": {
    "market": {
      "ru": "Коммуникацию называют 8 из 10 вакансий, требования и KPI примерно половина; ось нужна почти всем ролям.",
      "en": "8 of 10 ads name communication, about half name requirements and KPIs; almost every role needs this axis."
    },
    "levels": [
      {
        "level": 1,
        "does": {
          "ru": "Превращаете просьбу «сделай дашборд» в постановку: кто решает, какое решение, какая метрика; с подсказкой.",
          "en": "You turn \"make a dashboard\" into a brief: who decides, what decision, which metric; with hints."
        },
        "steps": [
          { "kind": "skills", "skills": ["dom-roles", "dom-requirements", "dom-metric-definition", "dom-sanity-check"],
            "text": { "ru": "Трек «Профессия», первая ступень.", "en": "Profession track, the first tier." } },
          { "kind": "story",
            "text": { "ru": "Или режим истории: пять недель в роли аналитика.", "en": "Or story mode: five weeks as an analyst." } }
        ]
      },
      {
        "level": 2,
        "does": {
          "ru": "Без подсказки пишете определение метрики, проверяете число перед отправкой, раскладываете «почему упало» на причины и ставите вывод первой фразой.",
          "en": "Without hints you define a metric, check a number before sending it, break \"why did it drop\" into causes and put the conclusion first."
        },
        "steps": [
          { "kind": "skills", "skills": ["dom-decomposition", "dom-storytelling", "sql-business-case"],
            "text": { "ru": "Третья и четвёртая ступени трека.", "en": "Tiers three and four of the track." } },
          { "kind": "tasks", "tasks": ["dom-080", "dom-081", "dom-082", "dom-083"],
            "text": { "ru": "Найдите, что не так в отчёте.", "en": "Spot what is wrong in the report." } }
        ]
      },
      {
        "level": 3,
        "does": {
          "ru": "Разобрали бизнес-кейс перед живым человеком: вывод первой фразой, ответы на вопросы.",
          "en": "You walked a live person through a business case: conclusion first, then their questions."
        },
        "steps": [
          { "kind": "evidence", "evidence": "biz-case",
            "text": { "ru": "Взять готовый разбор из трека и рассказать за три минуты на пробном интервью.", "en": "Take a finished case from the track and present it in three minutes in a mock interview." } }
        ]
      }
    ]
  },
  "process": {
    "market": {
      "ru": "В вакансиях ось держится на управлении данными и безопасности; BPMN называют единицы.",
      "en": "In the ads this axis is mostly data governance and security; very few name BPMN."
    },
    "levels": [
      {
        "level": 1,
        "does": {
          "ru": "Описываете путь заказа от заявки до оплаты, называете владельца данных и место, где рождается ошибка в отчёте.",
          "en": "You describe an order from request to payment, name the data owner and the step where a report error is born."
        },
        "steps": [
          { "kind": "quiz", "text": { "ru": "Самопроверка по процессам и управлению данными.", "en": "Processes and data governance self-check." } },
          { "kind": "skills", "skills": ["dom-order-to-cash", "dom-governance", "dom-value-chain"],
            "text": { "ru": "Навыки оси в треке «Профессия».", "en": "The axis skills in the Profession track." } }
        ]
      },
      {
        "level": 2,
        "does": {
          "ru": "Записали метрику с определением, владельцем и проверками качества; или смоделировали процесс в BPMN со слов того, кто его ведёт.",
          "en": "You documented a metric with a definition, owner and quality checks; or modelled a process in BPMN from talking to the person who runs it."
        },
        "steps": [
          { "kind": "evidence", "evidence": "gov-metric",
            "text": { "ru": "Карточка одной метрики Kaiyo: определение, владелец, проверки.", "en": "A card for one Kaiyo metric: definition, owner, checks." } },
          { "kind": "app", "app": "flow", "href": "https://flow.quaera.app/#example=kaiyo",
            "text": { "ru": "Процесс заказа в Quaera Flow, затем тот же процесс со слов живого участника.", "en": "The order process in Quaera Flow, then the same process from a real participant." } }
        ]
      },
      {
        "level": 3,
        "does": {
          "ru": "Сделали process mining по журналу событий и нашли узкое место.",
          "en": "You did process mining on an event log and found a bottleneck."
        },
        "steps": [
          { "kind": "evidence", "evidence": "process-mining",
            "text": { "ru": "pm4py на открытом журнале событий: карта процесса и одно узкое место.", "en": "pm4py on an open event log: a process map and one bottleneck." } }
        ]
      }
    ]
  }
}
```

Заметки к данным:
- Ключ верхнего уровня в блоке выше (`sql`, `modeling` …) только для чтения: в `career.json` поля `market` и `levels` кладутся внутрь соответствующей записи `axes[]`.
- Режим истории идёт шагом `kind: "story"` без `href`: это сам тренажёр, ссылка не нужна.
- Строки `does` написаны во втором лице («Пишете…»), потому что экран обращается к человеку; в разделах 2–9 они в третьем лице для чтения хозяином. Источник правды для интерфейса с 2026-11-08: `src/content/career.json` (поля `levels` и `market`); блок выше остаётся снимком, строки `market` в нём написаны по 102 вакансиям и в файле уже обновлены.
- Доли в `market` словами («примерно 3 из 4»), а не точными числами: пересчёт по новым вакансиям DE и governance идёт параллельно, а словесная доля от него почти не меняется. Если хаб захочет точные числа, держать их рядом с `vacancies` и обновлять одним заходом.
