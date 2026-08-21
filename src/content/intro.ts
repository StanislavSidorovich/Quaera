import type { Locale } from '../i18n/context';

/**
 * «Что такое аналитика данных» — экскурс для человека, который попал сюда
 * случайно и профессии не знает вовсе.
 *
 * **Задача экрана — не научить, а объяснить.** Адресат назван прямо:
 * знакомый из другой области (управление проектами, продажи, инженер,
 * кто-то вне работы вообще), который открыл ссылку и не понимает, о чём
 * этот сайт. Успех — он уходит со знанием, что такая работа есть, чем
 * занимается и где востребована. Даже если не вернётся.
 *
 * **Отсюда три правила письма, которые здесь важнее обычных.**
 *
 * 1. **Никакого жаргона без расшифровки.** Слова «ключ», «джойн»,
 *    «гранулярность», «витрина» на этом экране не появляются ни разу:
 *    они ничего не объясняют тому, кто их слышит впервые. Соединение
 *    таблиц описано через номер товара, который стоит в одной таблице
 *    и расшифрован в другой.
 *
 * 2. **Общее раньше нашего.** Первые восемь блоков не упоминают ни Quaera,
 *    ни Kaiyo Trading, ни треки: человеку сначала нужна профессия, а потом
 *    уже место, где её пробуют. Наш датасет появляется один раз, в девятом
 *    блоке, как «а вот здесь это можно потрогать».
 *
 * 3. **Абсолютных чисел до девятого блока нет ни одного, только проценты.**
 *    Это не стиль, а защита: придуманное «820 активных точек» разошлось бы
 *    с настоящими 132 в датасете, и человек, нажавший «посмотреть данные»,
 *    поймал бы страницу на вранье. Проценты в блоке 3 иллюстрируют механику
 *    и ничего не обещают про конкретные данные. Числа девятого блока —
 *    настоящие, снятые запросом (12 таблиц, ~150 тыс. строк фактов,
 *    132 точки, 47 товаров, 12 оптовиков, 79 → 38 точек у марки).
 *
 * **Гейта у этой прозы нет и быть не может** — проверять тут нечего, кроме
 * смысла. Действует то же правило, что у прозы приватности: читать вслух
 * и вычёркивать всё, что не пережило. Единственное, что проверяется машиной, —
 * английские тире (файл добавлен в test:prose-en с бюджетом 0).
 *
 * **Числа в прозе — только запросом.** Проза кампании дважды называла
 * числа по памяти и дважды врала; здесь то же правило действует для
 * девятого блока.
 */

/**
 * Картинка блока. Все рисуются HTML-ом в IntroPage, а не SVG.
 *
 * Картинка есть не у каждого блока намеренно: на странице из десяти карточек
 * иллюстрация над каждой перестаёт что-либо значить — то же правило, что
 * вывели в режиме истории («картинка открывает момент, а не сопровождает
 * абзац»). Здесь их четыре на десять блоков, и каждая показывает механику,
 * которую прозой пришлось бы объяснять абзацем.
 */
export type IntroFigure =
  /** Стена записей: их слишком много, чтобы найти нужные глазами. */
  | 'scale'
  /** Четыре величины и размер падения у каждой: три просели, чек почти нет. */
  | 'decomposition'
  /** Две таблички, в которых один и тот же номер товара, — что значит «соединить». */
  | 'join'
  /** Воронка работы: из вороха записей к одной фразе для руководства. */
  | 'pipeline';

export interface IntroListItem {
  /** Полужирное начало строки: название отрасли, роли, шага. Может отсутствовать. */
  label?: string;
  text: string;
}

export interface IntroRow {
  label: string;
  value: string;
  /**
   * Доля полосы от 0 до 1. Полоса — вторая проекция того же числа,
   * а не новая величина: −18% рисуется как 0.18 от ширины дорожки.
   */
  share: number;
  /** Строка-исключение: та, ради которой таблица и показана. */
  accent?: boolean;
}

export interface IntroBlock {
  id: string;
  title: string;
  /** Абзацы до списка и картинки. */
  body: string[];
  figure?: IntroFigure;
  rows?: IntroRow[];
  list?: IntroListItem[];
  /** Абзацы после списка и картинки. */
  after?: string[];
}

/**
 * Подписи внутри картинки «соединить таблицы»: две маленькие таблички,
 * в которых один и тот же номер товара. Текст лежит здесь, а не в компоненте,
 * ровно потому же, почему и вся остальная проза: иначе половина картинки
 * осталась бы непереведённой и никакой гейт этого бы не заметил.
 */
export interface IntroJoinFigure {
  left: { title: string; columns: string[]; row: string[] };
  right: { title: string; columns: string[]; row: string[] };
  /** Значение, которое стоит в обеих табличках и подсвечено в обеих. */
  match: string;
  note: string;
}

/**
 * Подписи к двум остальным картинкам. Лежат здесь по той же причине, что
 * и подписи таблиц: текст внутри картинки — такая же проза, и оставь его
 * в компоненте, английская половина осталась бы без перевода молча.
 */
export interface IntroFigureCaptions {
  /**
   * Карта области: центр и восемь узлов вокруг него. Стоит выше всей прозы
   * и служит оглавлением области, а не страницы: человек за пять секунд
   * видит, из чего работа состоит, и только потом читает подряд.
   *
   * Подписи узлов — здесь, а не в компоненте, по общей причине: текст
   * внутри картинки — такая же проза, и в компоненте английская половина
   * молча осталась бы русской.
   */
  map: { hub: string; nodes: { label: string; note: string }[]; caption: string };
  /** Стена записей. */
  scale: string;
  /** Воронка работы: подписи пяти ступеней и строка под ними. */
  pipeline: { stages: string[]; caption: string };
}

export interface IntroPageContent {
  /** Заголовок экрана и одна строка под ним. */
  title: string;
  lead: string;
  figures: IntroFigureCaptions;
  join: IntroJoinFigure;
  blocks: IntroBlock[];
  /** Хвост: запрос, вопрос читателю и две двери. */
  closing: {
    title: string;
    quote: string;
    question: string;
    storyLabel: string;
    storyNote: string;
    dataLabel: string;
    dataNote: string;
    foot: string;
  };
}

const RU: IntroPageContent = {
  title: 'Что такое аналитика данных',
  lead: 'Три минуты чтения. Ничего знать заранее не нужно.',
  figures: {
    map: {
      hub: 'Аналитика данных',
      nodes: [
        { label: 'Источники данных', note: 'чеки, склад, цены, план' },
        { label: 'Сбор и связывание', note: 'свести таблицы по общему номеру' },
        { label: 'Очистка', note: 'дубли, пропуски, опечатки' },
        { label: 'Модель данных', note: 'чтобы у всех считалось одинаково' },
        { label: 'Метрики и KPI', note: 'что именно считать успехом' },
        { label: 'Анализ и гипотезы', note: 'почему изменилось и что проверить' },
        { label: 'Дашборды и отчёты', note: 'чтобы ответ видели без аналитика' },
        { label: 'Решение', note: 'ради чего всё и делалось' },
      ],
      caption: 'Восемь частей одной работы. Дальше — каждая по порядку, на примере одной компании.',
    },
    scale: 'Каждая клетка — одна запись о продаже. Здесь их две сотни, в компании — миллионы. Три из них те самые, которые вы ищете.',
    pipeline: {
      stages: ['Записи', 'Чистые', 'Связанные', 'Метрика', 'Ответ'],
      caption: 'Работа сужает: из вороха записей получается одна фраза, по которой принимают решение. Всё, что отброшено по дороге, отброшено осознанно — в этом и риск профессии.',
    },
  },
  join: {
    left: {
      title: 'Продажи',
      columns: ['дата', 'товар', 'штук'],
      row: ['12 марта', '47', '120'],
    },
    right: {
      title: 'Товары',
      columns: ['товар', 'название'],
      row: ['47', 'средство для стёкол'],
    },
    match: '47',
    note: 'Номер 47 стоит и там, и там. По нему таблицы и соединяют — иначе в продажах так и останется число вместо названия.',
  },
  blocks: [
    {
      id: 'everyday',
      title: 'Что происходит в компании каждый день',
      body: [
        'В любой компании, где много клиентов и сделок, каждый день появляются записи. Кто что купил и когда. Сколько это стоило и что лежит на складе. Какая была цена и была ли скидка. Кто из сотрудников за это отвечал.',
        'Записей быстро становится столько, что просмотреть их глазами нельзя, — их сотни тысяч и миллионы. И лежат они не в одном месте: продажи в одной системе, склад в другой, цены в третьей.',
        'Каждая такая таблица по отдельности почти ничего не говорит. А вопросы у бизнеса всегда одни и те же, и они простые:',
      ],
      list: [
        { text: 'Что происходит?' },
        { text: 'Где проблема?' },
        { text: 'Почему так вышло?' },
        { text: 'Что теперь делать?' },
      ],
      figure: 'scale',
      after: [
        'Аналитик — тот, кто превращает разрозненные записи в ответ на такой вопрос.',
      ],
    },
    {
      id: 'request',
      title: 'Как звучит задача',
      body: [
        'Задачу почти никогда не ставят подробно. Её ставят так: «Продажи упали. Разберись».',
        'Здесь не сказано ничего. Упали где — во всей стране или в двух городах. За какой срок — за месяц или тихо весь год. В деньгах или в штуках: бывает, что денег столько же, а товара продано меньше. По сравнению с чем — с прошлым месяцем, с прошлым годом или с планом.',
        'Первая работа аналитика — не считать, а превратить эту фразу в вопрос, на который есть проверяемый ответ. Очень часто на этом шаге выясняется, что упало совсем не то, о чём спрашивали, — и половина ответа уже готова.',
      ],
    },
    {
      id: 'answer',
      title: 'Как выглядит ответ',
      body: [
        'Допустим, продажи за месяц действительно упали. Аналитик не отвечает «да, упали на 18%». Он раскладывает падение на части и смотрит, какая из них просела.',
      ],
      figure: 'decomposition',
      rows: [
        { label: 'Продажи', value: '−18%', share: 0.18 },
        { label: 'Точек, которые что-то купили', value: '−16%', share: 0.16 },
        { label: 'Количество заказов', value: '−14%', share: 0.14 },
        { label: 'Средний чек', value: '−3%', share: 0.03, accent: true },
      ],
      after: [
        'Три величины упали сильно, а средний чек — почти нет. Значит, покупать меньше не стали. Стало меньше тех, кто покупает.',
        'Это разные проблемы и совершенно разные решения. Если бы упал чек, надо было бы разбираться с ценой, скидками и ассортиментом. А раз ушли точки — надо выяснить, какие именно, и поговорить с ними. Список получается одним запросом к данным.',
        'В этом и состоит работа: не увидеть цифру, а понять, что за ней стоит.',
      ],
    },
    {
      id: 'sources',
      title: 'Почему одной таблицы мало',
      body: [
        'Чтобы получить даже такую простую табличку, данные надо собрать из нескольких мест. Обычно они выглядят примерно так:',
      ],
      list: [
        { label: 'Продажи', text: 'дата, товар, покупатель, количество, сумма' },
        { label: 'Покупатели', text: 'название, город, тип, работает или нет' },
        { label: 'Товары', text: 'название, категория, марка' },
        { label: 'Остатки', text: 'дата, товар, склад, сколько лежит' },
        { label: 'Акции', text: 'период, товар, вид скидки' },
      ],
      figure: 'join',
      after: [
        'Дальше начинается главное неудобство. В таблице продаж не написано название товара — там стоит его номер. Название лежит в справочнике товаров. Город покупателя лежит в третьей таблице. Чтобы увидеть продажи по маркам и по городам, эти таблицы надо соединить по общему номеру, и соединить правильно: ошибись — и числа удвоятся, а заметить это будет некому.',
        'Ответ на один живой вопрос обычно требует соединить три или четыре таблицы. И через неделю вопрос будет другой, а таблицы те же.',
        'И лежат эти данные всё реже в файлах на компьютере. Продажи торговой сети, платежи банка, заказы маркетплейса пишутся в облачные хранилища, которые пополняются непрерывно: пока вы читаете эту строку, туда добавились новые чеки. Такие хранилища называют именами сервисов — Google BigQuery, Snowflake, Amazon Redshift, Databricks; в банках и на производстве чаще встречаются Oracle и SAP. Аналитик их себе не скачивает: он подключается и задаёт вопрос, а считается ответ на стороне хранилища — данных там столько, что ни один ноутбук их не поднимет. Отсюда и выражение «большие данные»: дело не в том, что строк много, а в том, что работать с ними приходится иначе.',
        'Именно поэтому для такой работы есть отдельные инструменты. Не потому, что обычная таблица плоха, а потому, что вопросы меняются каждую неделю, данные лежат порознь и обновляются сами.',
      ],
    },
    {
      id: 'steps',
      title: 'Что делает аналитик',
      body: ['Пять шагов, и они повторяются от задачи к задаче:'],
      list: [
        { label: 'Собрать', text: 'взять данные из системы, а не из письма коллеги.' },
        {
          label: 'Почистить',
          text: 'одна и та же сеть магазинов записана тремя способами, где-то пропущена цена, где-то дата в другом формате. Пока это не приведено к одному виду, любая сумма неверна.',
        },
        { label: 'Связать', text: 'соединить таблицы, чтобы у чисел появились названия, даты и адреса.' },
        {
          label: 'Посчитать',
          text: 'не «продажи вообще», а ту величину, которая отвечает на заданный вопрос.',
        },
        {
          label: 'Объяснить',
          text: 'показать таблицей, графиком или дашбордом так, чтобы за минуту было видно, что делать.',
        },
      ],
      figure: 'pipeline',
      after: [
        'Недооценивают обычно второй шаг и четвёртый. Посчитать сумму умеет любой. Выбрать, что именно считать, и не соврать при этом — и есть профессия.',
      ],
    },
    {
      id: 'industries',
      title: 'Где так работают',
      body: ['Везде, где сделок слишком много, чтобы просмотреть их глазами.'],
      list: [
        {
          label: 'Товары повседневного спроса и дистрибуция',
          text: 'в скольких магазинах товар реально стоит на полке, сколько берёт каждый, что делают акции',
        },
        {
          label: 'Аптеки и фармацевтика',
          text: 'что продаётся в каких аптеках, где препарат выпал из ассортимента, что лежит на складах',
        },
        {
          label: 'Розница и интернет-магазины',
          text: 'средний чек, повторные покупки, что берут вместе, что возвращают',
        },
        {
          label: 'Связь и подписки',
          text: 'кто перестаёт пользоваться и за сколько дней до ухода это уже видно',
        },
        {
          label: 'Банки и страхование',
          text: 'кому давать деньги, по какой ставке, кто перестанет платить',
        },
        { label: 'Логистика', text: 'где стоит груз, из-за чего срывается срок, сколько это стоит' },
        {
          label: 'Производство и инжиниринг',
          text: 'сроки, затраты, ресурсы, закупки, отклонения от плана',
        },
      ],
      after: [
        'Данные и показатели везде разные, а порядок работы один: понять вопрос, найти данные, проверить их, посчитать, объяснить.',
        'Должности тоже называются по-разному: аналитик данных, коммерческий аналитик, BI-аналитик, аналитик спроса. Инструменты у них почти одни и те же.',
      ],
    },
    {
      id: 'not-my-job',
      title: 'Если это не ваша профессия',
      body: [
        'Возможно, аналитиком вы становиться не собираетесь. Но такие задачи приходят почти в любой роли, где есть отчётность:',
      ],
      list: [
        { label: 'Управление проектами', text: 'сроки, бюджеты, отклонения, показатели' },
        { label: 'Работа с клиентами', text: 'продажи по клиентам, ассортимент, динамика' },
        { label: 'Операции и производство', text: 'загрузка, эффективность, сроки' },
        { label: 'Финансы', text: 'выручка, затраты, план и факт' },
        { label: 'Продажи', text: 'территории, клиенты, воронка' },
        { label: 'Инженерные проекты', text: 'ресурсы, стоимость, сроки' },
        { label: 'Руководство', text: 'все показатели сразу и решения по ним' },
      ],
      after: [
        'Полноценным аналитиком тут быть не нужно. Полезно другое — понимать, что происходит с данными после того, как они покидают исходную систему и превращаются в цифры в отчёте, по которым кто-то принимает решение.',
        'Тогда становится видно, где числу можно доверять, а где стоит спросить, как оно посчитано.',
      ],
    },
    {
      id: 'tools',
      title: 'Что для этого нужно знать',
      body: [],
      list: [
        {
          label: 'SQL',
          text: 'язык, которым задают вопросы базе данных: выбрать нужное, соединить таблицы, посчитать итоги. Главный инструмент, с него начинают.',
        },
        {
          label: 'Python и pandas',
          text: 'когда вопрос сложнее одной таблицы: сравнить формы кривых, разложить изменение на части, собрать расчёт, который потом повторяется каждый месяц.',
        },
        {
          label: 'Модель данных и BI',
          text: 'как устроен отчёт, чтобы у финансов и у продаж числа сходились, а руководитель мог сам покрутить разрезы.',
        },
        {
          label: 'Статистика',
          text: 'чтобы не принять случайные качели за находку. Разница в 4% иногда разница, а иногда просто шум.',
        },
        {
          label: 'Сама профессия',
          text: 'какие бывают показатели, что чем меряют, как разговаривать с заказчиком.',
        },
      ],
      after: [
        'Первые три и последнее здесь есть — по ним можно заниматься.',
        'Чего здесь нет, а в работе встречается: Excel и сводные таблицы, Power BI и Tableau, инструменты подготовки данных, машинное обучение. Тренажёр про основание, а не про весь набор.',
      ],
    },
    {
      id: 'here',
      title: 'Где здесь Quaera',
      body: [
        'Quaera — это место, где такую работу можно попробовать руками. Не почитать про SQL, а получить рабочий вопрос и ответить на него так, как отвечают на работе.',
        'Внутри лежит Kaiyo Trading — выдуманная компания, которая возит бытовую химию, напитки и лекарства в магазины и аптеки. Компания выдумана, данные — нет: они устроены так же, как настоящие, и запросы к ним исполняются по-настоящему, прямо в браузере, без интернета.',
        'Двенадцать таблиц, больше ста пятидесяти тысяч строк за два с половиной года, 132 торговые точки, 47 товаров, двенадцать оптовиков.',
        'Один живой пример из них. У марки бытовой химии продажи за два года упали больше чем вдвое. Точек, которые её вообще брали, было 79 — стало 38. А сколько берёт одна точка из тех, что не бросили: было 128 штук, стало 122. Спрос не изменился. Марка просто исчезла с полок сорока магазинов, по одному, тихо, за полтора года. По общей сумме продаж заметить это невозможно.',
        'Товары повседневного спроса здесь — просто рабочая среда. Предмет практики — сама аналитическая работа, а она переносится и в аптеки, и в банк, и в логистику.',
      ],
    },
  ],
  closing: {
    title: 'Попробуйте',
    quote: 'Продажи снизились. Разберитесь, почему.',
    question: 'Представьте, что этот запрос пришёл вам. Что вы сделаете первым?',
    storyLabel: 'Пройти первый рабочий день',
    storyNote: 'Задача от заказчика, ваши ответы и встреча в пятницу',
    dataLabel: 'Просто посмотреть на данные',
    dataNote: 'Те самые двенадцать таблиц, без всякой учёбы',
    foot: 'Регистрации нет, вводить ничего не нужно.',
  },
};

const EN: IntroPageContent = {
  title: 'What data analytics is',
  lead: 'A three minute read. No prior knowledge needed.',
  figures: {
    map: {
      hub: 'Data analytics',
      nodes: [
        { label: 'Data sources', note: 'receipts, stock, prices, the plan' },
        { label: 'Collect and join', note: 'match tables on a shared number' },
        { label: 'Clean up', note: 'duplicates, gaps, typos' },
        { label: 'The data model', note: 'so everyone counts the same way' },
        { label: 'Metrics and KPIs', note: 'what exactly counts as success' },
        { label: 'Analysis and hypotheses', note: 'why it changed and what to check' },
        { label: 'Dashboards and reports', note: 'so the answer is visible without an analyst' },
        { label: 'The decision', note: 'the reason all of this was done' },
      ],
      caption: 'Eight parts of one job. Below you will find each of them in turn, on the example of a single company.',
    },
    scale: 'Every cell is one sales record. There are two hundred here; a company has millions. Three of them are the ones you are looking for.',
    pipeline: {
      stages: ['Records', 'Cleaned', 'Joined', 'Measure', 'Answer'],
      caption: 'The work narrows: a heap of records becomes one sentence somebody acts on. Everything dropped along the way was dropped on purpose, and that is where the risk of the profession lives.',
    },
  },
  join: {
    left: {
      title: 'Sales',
      columns: ['date', 'product', 'units'],
      row: ['12 March', '47', '120'],
    },
    right: {
      title: 'Products',
      columns: ['product', 'name'],
      row: ['47', 'glass cleaner'],
    },
    match: '47',
    note: 'Number 47 appears in both. That is what the tables are matched on; without it the sales table keeps a number where the name should be.',
  },
  blocks: [
    {
      id: 'everyday',
      title: 'What happens in a company every day',
      body: [
        'In any company with many customers and many transactions, records pile up daily. Who bought what and when. What it cost. What sits in the warehouse. What the price was and whether there was a discount. Which employee was responsible.',
        'Very quickly there are too many records to read: hundreds of thousands of them, then millions. And they do not sit in one place. Sales live in one system, stock in another, prices in a third.',
        'On its own each of those tables says almost nothing. The questions the business asks, meanwhile, are always the same, and they are simple:',
      ],
      list: [
        { text: 'What is happening?' },
        { text: 'Where is the problem?' },
        { text: 'Why did it happen?' },
        { text: 'What should we do about it?' },
      ],
      figure: 'scale',
      after: [
        'An analyst is the person who turns scattered records into an answer to a question like that.',
      ],
    },
    {
      id: 'request',
      title: 'How the task actually sounds',
      body: [
        'The task is almost never stated in detail. It is stated like this: "Sales are down. Find out why."',
        'That sentence contains nothing. Down where, across the country or in two cities. Over what period, one month or quietly all year. In money or in units, because revenue can hold while volume falls. Compared to what, to last month, to last year or to the plan.',
        'The first job is not to calculate. It is to turn that sentence into a question that has a checkable answer. Very often this step alone reveals that the thing which fell is not the thing anyone asked about, and half the answer is already there.',
      ],
    },
    {
      id: 'answer',
      title: 'What an answer looks like',
      body: [
        'Suppose sales really did fall this month. An analyst does not reply "yes, down 18%". They break the fall into parts and look at which part moved.',
      ],
      figure: 'decomposition',
      rows: [
        { label: 'Sales', value: '−18%', share: 0.18 },
        { label: 'Outlets that bought anything', value: '−16%', share: 0.16 },
        { label: 'Number of orders', value: '−14%', share: 0.14 },
        { label: 'Average order value', value: '−3%', share: 0.03, accent: true },
      ],
      after: [
        'Three of them fell a long way and the average order barely moved. So nobody started buying less. There are fewer people buying.',
        'That is a different problem with a completely different fix. Had the average order fallen, the conversation would be about price, discounts and assortment. Since outlets left, the job is to find out which ones and go talk to them. That list is one query away.',
        'This is the work: not seeing the number, but understanding what sits behind it.',
      ],
    },
    {
      id: 'sources',
      title: 'Why one table is not enough',
      body: [
        'Even that small summary has to be assembled from several places. Usually they look roughly like this:',
      ],
      list: [
        { label: 'Sales', text: 'date, product, customer, quantity, amount' },
        { label: 'Customers', text: 'name, city, type, active or not' },
        { label: 'Products', text: 'name, category, brand' },
        { label: 'Stock', text: 'date, product, warehouse, quantity on hand' },
        { label: 'Promotions', text: 'period, product, kind of discount' },
      ],
      figure: 'join',
      after: [
        'And here comes the awkward part. The sales table does not carry the product name. It carries the product number. The name lives in the product list. The customer city lives in a third table. To see sales by brand and by city those tables have to be matched on the shared number, and matched correctly: get it wrong and the figures double, with nobody around to notice.',
        'Answering one real question usually means matching three or four tables. Next week the question will be different and the tables will be the same.',
        'These days the data is less and less likely to sit in a file on somebody’s computer. Retail sales, bank payments and marketplace orders are written into cloud warehouses that keep filling continuously: while you read this line, new receipts landed in one. Such warehouses go by service names, Google BigQuery, Snowflake, Amazon Redshift, Databricks; banks and manufacturers more often run Oracle or SAP. An analyst does not download them. They connect and ask a question, and the answer is computed on the warehouse side, because no laptop could hold that much. That is where the phrase "big data" comes from: not simply many rows, but so many that the work has to be done differently.',
        'This is why the job has tools of its own. Not because an ordinary spreadsheet is bad, but because the questions change every week, the data sits in separate places and it updates by itself.',
      ],
    },
    {
      id: 'steps',
      title: 'What an analyst does',
      body: ['Five steps, and they repeat from task to task:'],
      list: [
        { label: 'Collect', text: 'take the data from the system, not from a colleague’s email.' },
        {
          label: 'Clean',
          text: 'the same retail chain is spelled three ways, a price is missing here, a date is in another format there. Until that is reconciled, every total is wrong.',
        },
        { label: 'Connect', text: 'match the tables so the numbers acquire names, dates and addresses.' },
        {
          label: 'Calculate',
          text: 'not "sales in general", but the one quantity that answers the question asked.',
        },
        {
          label: 'Explain',
          text: 'present it as a table, a chart or a dashboard so that a minute is enough to see what to do.',
        },
      ],
      figure: 'pipeline',
      after: [
        'The underrated steps are the second and the fourth. Anyone can add up a column. Choosing what exactly to add up, and not lying in the process, is the profession.',
      ],
    },
    {
      id: 'industries',
      title: 'Where people work this way',
      body: ['Anywhere there are too many transactions to read by eye.'],
      list: [
        {
          label: 'Consumer goods and distribution',
          text: 'how many shops actually stock the product, how much each one takes, what promotions do',
        },
        {
          label: 'Pharmacies and pharma',
          text: 'what sells in which pharmacies, where a product dropped out of the range, what sits in stock',
        },
        {
          label: 'Retail and online shops',
          text: 'average order, repeat purchases, what gets bought together, what comes back',
        },
        {
          label: 'Telecom and subscriptions',
          text: 'who is drifting away, and how many days before they leave it becomes visible',
        },
        {
          label: 'Banking and insurance',
          text: 'who to lend to, at what rate, who will stop paying',
        },
        { label: 'Logistics', text: 'where the shipment is stuck, what breaks the deadline, what it costs' },
        {
          label: 'Manufacturing and engineering',
          text: 'schedules, costs, resources, procurement, variance against plan',
        },
      ],
      after: [
        'The data and the measures differ everywhere; the order of work does not. Understand the question, find the data, check it, calculate, explain.',
        'The job titles differ too: data analyst, commercial analyst, BI analyst, demand analyst. The tools are very nearly the same.',
      ],
    },
    {
      id: 'not-my-job',
      title: 'If this is not your profession',
      body: [
        'You may have no intention of becoming an analyst. Tasks like these still arrive in almost any role that reports numbers:',
      ],
      list: [
        { label: 'Project management', text: 'schedules, budgets, variance, indicators' },
        { label: 'Account management', text: 'sales by customer, assortment, trend' },
        { label: 'Operations', text: 'utilisation, efficiency, lead times' },
        { label: 'Finance', text: 'revenue, cost, plan against actual' },
        { label: 'Sales', text: 'territories, customers, pipeline' },
        { label: 'Engineering projects', text: 'resources, cost, deadlines' },
        { label: 'Management', text: 'every measure at once, and the decisions behind them' },
      ],
      after: [
        'None of this requires being a full time analyst. What helps is something else: understanding what happens to data after it leaves the system it was born in and becomes a figure in a report that somebody acts on.',
        'Once you see that, you can also see where a number can be trusted and where it is worth asking how it was calculated.',
      ],
    },
    {
      id: 'tools',
      title: 'What you need to know',
      body: [],
      list: [
        {
          label: 'SQL',
          text: 'the language for asking a database questions: pick what you need, match tables, compute totals. The main tool, and the usual starting point.',
        },
        {
          label: 'Python and pandas',
          text: 'for questions bigger than one table: compare the shapes of curves, split a change into parts, build a calculation that then repeats every month.',
        },
        {
          label: 'Data model and BI',
          text: 'how a report is built so that finance and sales arrive at the same figure, and a manager can slice it without asking anyone.',
        },
        {
          label: 'Statistics',
          text: 'so that random wobble is not mistaken for a finding. A difference of 4% is sometimes a difference and sometimes noise.',
        },
        {
          label: 'The craft itself',
          text: 'which measures exist, what each one measures, how to talk to the person who asked.',
        },
      ],
      after: [
        'The first three and the last one are here, with material to practise on.',
        'What is not here, though it turns up at work: Excel and pivot tables, Power BI and Tableau, data preparation tools, machine learning. This trainer is about the foundation, not the whole toolbox.',
      ],
    },
    {
      id: 'here',
      title: 'Where Quaera fits',
      body: [
        'Quaera is a place to try that work with your own hands. Not to read about SQL, but to receive a real question and answer it the way it gets answered at work.',
        'Inside it sits Kaiyo Trading, an invented company that delivers home care products, drinks and medicines to shops and pharmacies. The company is invented; the data is not. It is built the way real data is built, and queries against it really execute, right in the browser, with no internet needed.',
        'Twelve tables, more than a hundred and fifty thousand rows over two and a half years, 132 outlets, 47 products, twelve wholesalers.',
        'One live example from them. A home care brand lost more than half its sales in two years. The number of outlets that stocked it went from 79 to 38. Meanwhile the outlets that kept it went from 128 units each to 122. Demand did not change. The brand simply disappeared from the shelves of forty shops, one at a time, quietly, over eighteen months. Watching the sales total, you could not possibly see it.',
        'Consumer goods here are just the working environment. The subject of practice is the analytical work itself, and that carries over to pharmacies, to a bank, to logistics.',
      ],
    },
  ],
  closing: {
    title: 'Try it',
    quote: 'Sales are down. Find out why.',
    question: 'Imagine that request landed on your desk. What would you do first?',
    storyLabel: 'Work through the first day',
    storyNote: 'A request from a client, your answers, and the meeting on Friday',
    dataLabel: 'Just look at the data',
    dataNote: 'Those twelve tables, with no lesson attached',
    foot: 'There is no sign up and nothing to fill in.',
  },
};

export function introPage(locale: Locale): IntroPageContent {
  return locale === 'en' ? EN : RU;
}
