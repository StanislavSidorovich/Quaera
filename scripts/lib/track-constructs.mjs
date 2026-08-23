/**
 * Конструкции треков — список того, что в задании считается приёмом,
 * который нельзя встретить необъяснённым.
 *
 * Список лежит отдельным модулем, потому что читателей у него два, и они
 * задают об одном и том же наборе разные вопросы. verify-content спрашивает
 * «объяснена ли конструкция в теории на пути к заданию», гейт лестницы
 * (test-story-ladder) — «показана ли она в кампании прежде, чем человек
 * печатает её рукой». Оба ответа обязаны говорить об одном наборе приёмов:
 * пока список был приватным для verify-content, лексикон лестницы жил
 * своей жизнью и знал только SQL, поэтому неделя на pandas прошла бы
 * проверку вхолостую.
 *
 * Список свой на трек — синтаксис разный, и то, что нужно объяснить, тоже
 * разное. sql проверен и починен первым (ROADMAP §6, п. A); python дописан
 * следом тем же способом: замер, разбор причины у каждой находки, починка —
 * либо в карточке, либо в графе, если конструкция не введена потому, что
 * путь предпосылок обходит скилл, который её учит.
 *
 * В python-списке нет .head()/.tail()/.copy(): это не пробел в объяснении,
 * а операции, самоочевидные по названию, — они не создают того риска, ради
 * которого существуют обе проверки (сравнение с SQL: сам SELECT тоже
 * не входит в SQL_CONSTRUCTS). По тому же правилу отклонён `pd.DataFrame(`:
 * замер 2026-08-13 дал на нём ровно одну находку — py-031, где литеральный
 * датафрейм стоит лесами в шаблоне `fill`, а спрашивают в задании melt.
 */
export const SQL_CONSTRUCTS = [
  'like', 'offset', 'coalesce', 'ifnull', 'nullif', 'distinct', 'between',
  'in (', 'union', 'exists', 'substr', 'replace', 'trim', 'upper', 'lower',
  'cast', 'round', 'strftime', 'date(', 'julianday', 'printf', 'case',
  'over (', 'partition by', 'row_number', 'rank(', 'dense_rank', 'lag(',
  'lead(', 'ntile', 'sum(', 'avg(', 'count(', 'min(', 'max(', 'having',
  'left join', 'inner join', 'group by', 'order by', 'limit', 'with ',
  'as (', 'abs(', 'length(', 'first_value(', 'last_value(', 'nth_value(',
];

export const PYTHON_CONSTRUCTS = [
  '.loc[', '.isin(', '.str.', '.astype(', '.assign(', '.fillna(', '.rank(',
  '.apply(', 'axis=1', 'lambda', '.groupby(', '.merge(', 'dropna=',
  '.transform(', '.agg(', '.pivot(', '.pivot_table(', '.melt(', '.resample(',
  '.rolling(', 'np.where(', '.value_counts(', '.nunique(', 'pd.to_datetime(',
  '.dt.', '.isna(', '.reset_index(', '.set_index(', '.sort_index(',
  '.sort_values(', 'validate=', '.describe(', '.duplicated(',
  '.drop_duplicates(', '.shift(', '.diff(', '.cumsum(', '.clip(',
  '.replace(', '.map(', '.query(', '.to_period(',
];

/**
 * DAX-функции трека model. Список полный по замеру: собран не из головы,
 * а перечислением всего, что вообще встречается в `template`/`predictSql`
 * заданий пака, — иначе он повторил бы прежнюю ошибку sql-списка, где
 * FIRST_VALUE не проверялась потому, что о ней не вспомнили.
 *
 * Предикат здесь другой, чем у sql и python, и это не поблажка,
 * а следствие устройства трека: **в model нет исполнителя, и кода,
 * который «видно целиком и можно выполнить кнопкой», не существует
 * нигде** — `form` карточки объясняет функцию предложением
 * («TOTALYTD заменяет текущий период на „с начала года по текущую дату“»),
 * а не показывает вызов со скобками. Требовать `NAME(` значило бы завалить
 * весь трек за его честный жанр. Защита от «упомянули в самопроверке»
 * при этом остаётся: корпус тот же, form/example/wrong, а не вся карточка.
 */
export const MODEL_CONSTRUCTS = [
  'calculate', 'divide', 'sum(', 'sumx', 'averagex', 'countrows', 'values(',
  'related', 'filter(', 'keepfilters', 'allexcept', 'all(', 'totalytd',
  'datesytd', 'sameperiodlastyear', 'datesinperiod',
];

export const TRACK_CONSTRUCTS = { sql: SQL_CONSTRUCTS, python: PYTHON_CONSTRUCTS, model: MODEL_CONSTRUCTS };
