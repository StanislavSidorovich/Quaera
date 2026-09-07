import type { Locale } from '../i18n/context';

/**
 * «Quaera in four pages» — брошюра о тренажёре для того, кто решает,
 * стоит ли на него тратить вечер или отдавать ему группу.
 *
 * **Адресат назван прямо, и он не занимающийся.** Первый конкретный —
 * преподаватель восьмичасового крэш-курса по SQL, которому надо за три
 * минуты понять, что это, чем проверяется ответ, на каких данных и чего
 * здесь нет. Второй и третий — любой другой преподаватель и человек,
 * читающий проект как портфолио. Все трое читают подряд и один раз.
 *
 * **Имени школы и названия курса здесь нет намеренно.** Публичная
 * страница с названием университета читается как заявка на одобрение,
 * которого никто не давал; привязку к конкретному курсу делает личное
 * письмо, а страница остаётся годной для всех троих.
 *
 * **Четыре правила письма, из которых собран текст.**
 *
 * 1. **Границы стоят отдельным блоком и не смягчены.** Блок «What is here,
 *    and what is not» — не оговорка внизу, а пятый разворот. Довод не
 *    в скромности: преподаватель, увидевший лендинг без границ, дальше
 *    не читает, а отказ по причине, названной нами самими, дешевле отказа
 *    по причине, найденной им.
 *
 * 2. **Числа только снятые запросом.** 287 заданий и 72 навыка посчитаны
 *    по пакам, 13 таблиц и 159 740 строк — `npm run count:rows`, падение
 *    Nettora (74 точки в январе, 40 в декабре) снято запросом к тому самому
 *    файлу, который уезжает в браузер. Ни одного числа по памяти:
 *    на этом проза проекта врала уже дважды.
 *
 * 3. **Ни одного прилагательного, которое работает вместо факта.** «Мощный»,
 *    «современный», «интуитивный» не появляются: у брошюры, которую читает
 *    практикующий преподаватель, они снимают доверие, а не добавляют.
 *
 * 4. **Тире в английском тексте ноль.** Файл добавлен в `test:prose-en`
 *    с бюджетом 0, как `intro.ts` и `en.ts`.
 *
 * **Картинки рисуются разметкой, а не картинками.** Та же причина, что
 * на `?intro`: текст внутри SVG не растёт вместе с A+/A++, а снимок экрана
 * протухает молча (снимки в `docs/screenshots/` на момент написания были
 * русские и с числами месячной давности). Схема данных берётся живая,
 * тем же компонентом, что на экране «Данные»: она всегда сегодняшняя
 * и ничего не весит.
 *
 * **Русской половины пока нет, и это решение, а не недоделка.** Первый
 * адресат англоязычный, срок письма к нему реальный. Модуль устроен как
 * `intro.ts` (`RU` рядом с `EN`), поэтому русская версия встанет позже
 * без перестановки; до тех пор `overviewPage` отдаёт английский текст
 * на обеих локалях.
 */

/** Картинка блока. Все, кроме схемы, рисуются разметкой в OverviewPage. */
export type OverviewFigure =
  /** Полоса дней: занятие, пустая неделя, момент, когда навык понадобился. */
  | 'gap'
  /** Четыре трека карточками. */
  | 'tracks'
  /** Задание целиком: условие, запрос, результат, зачёт. */
  | 'task'
  /** Живая схема датасета тем же компонентом, что на экране «Данные». */
  | 'schema';

export interface OverviewStat {
  value: string;
  label: string;
}

export interface OverviewListItem {
  /** Полужирное начало строки. Может отсутствовать. */
  label?: string;
  text: string;
}

export interface OverviewTrack {
  name: string;
  /** «85 tasks» целиком строкой: число и слово переводятся вместе. */
  count: string;
  note: string;
}

/**
 * Полоса дней между занятием и моментом, когда навык понадобился.
 * Ячейки задаются здесь, а не в компоненте: их число — часть высказывания,
 * а не оформление.
 */
export interface OverviewGapFigure {
  cells: { label: string; kind: 'lesson' | 'empty' | 'later' }[];
  caption: string;
}

/**
 * Задание целиком, нарисованное разметкой. Числа настоящие, сняты запросом
 * к `public/data/quaera.dataset`; запрос в фигуре — тот самый, которым они
 * получены, вместе с обеими границами периода. Если датасет пересобирается
 * генератором, эти строки надо переснять тем же запросом.
 */
export interface OverviewTaskFigure {
  promptLabel: string;
  prompt: string;
  query: string[];
  columns: string[];
  rows: string[][];
  /** Строка вместо середины таблицы: показаны первые и последние месяцы. */
  ellipsis: string;
  verdict: string;
  verdictNote: string;
  missTitle: string;
  missNote: string;
  caption: string;
}

export interface OverviewBlock {
  id: string;
  title: string;
  body: string[];
  figure?: OverviewFigure;
  list?: OverviewListItem[];
  /** Второй список блока границ: чего здесь нет. */
  omits?: OverviewListItem[];
  after?: string[];
}

export interface OverviewPageContent {
  title: string;
  lead: string;
  printLabel: string;
  stats: OverviewStat[];
  gap: OverviewGapFigure;
  tracks: OverviewTrack[];
  task: OverviewTaskFigure;
  schemaCaption: string;
  blocks: OverviewBlock[];
  closing: {
    title: string;
    body: string[];
    appLabel: string;
    appNote: string;
    introLabel: string;
    introNote: string;
    termsTitle: string;
    terms: OverviewListItem[];
    author: string;
  };
}

const EN: OverviewPageContent = {
  title: 'Quaera in four pages',
  lead: 'What it is, how one task works, what data sits underneath, and what it deliberately does not do. Written for someone deciding whether to spend an evening on it or hand it to a group.',
  printLabel: 'Print or save as PDF',

  stats: [
    { value: '287', label: 'tasks' },
    { value: '72', label: 'technique cards' },
    { value: '13', label: 'tables' },
    { value: '159,740', label: 'rows of data' },
    { value: '3.5 MB', label: 'to load, once' },
    { value: '0', label: 'sign-ups' },
  ],

  gap: {
    cells: [
      { label: 'Class', kind: 'lesson' },
      { label: '', kind: 'empty' },
      { label: '', kind: 'empty' },
      { label: '', kind: 'empty' },
      { label: '', kind: 'empty' },
      { label: '', kind: 'empty' },
      { label: '', kind: 'empty' },
      { label: '', kind: 'empty' },
      { label: '', kind: 'empty' },
      { label: 'You need it', kind: 'later' },
    ],
    caption: 'The app lives in the empty cells. It is not a course and does not compete with one.',
  },

  tracks: [
    {
      name: 'SQL for analysts',
      count: '85 tasks',
      note: 'From a first SELECT to window functions. You write the query, it runs.',
    },
    {
      name: 'Analytics as a profession',
      count: '79 tasks',
      note: 'What the person asking actually wants, which metric answers it, why a number with no conclusion attached is not an answer.',
    },
    {
      name: 'Data model and BI',
      count: '77 tasks',
      note: 'How flat exports become a model a report can be trusted on. Star schema, grain, filter context, DAX.',
    },
    {
      name: 'pandas for analysts',
      count: '46 tasks',
      note: 'The slice of Python that handles data, each technique placed next to its SQL equivalent. Your code runs.',
    },
  ],

  task: {
    promptLabel: 'The task',
    prompt: 'Sales of the Nettora brand are falling. Find out what is behind it.',
    query: [
      "SELECT substr(s.week_start, 1, 7) AS month,",
      "       COUNT(DISTINCT s.customer_id) AS outlets,",
      "       SUM(s.units) AS units",
      "FROM fact_sellout s",
      "JOIN dim_product p ON p.product_id = s.product_id",
      "WHERE p.brand = 'Nettora'",
      "  AND s.week_start >= '2025-01-01'",
      "  AND s.week_start <  '2026-01-01'",
      'GROUP BY month',
      'ORDER BY month;',
    ],
    columns: ['month', 'outlets', 'units'],
    rows: [
      ['2025-01', '74', '2200'],
      ['2025-02', '74', '2331'],
      ['2025-11', '43', '1825'],
      ['2025-12', '40', '1701'],
    ],
    ellipsis: 'eight more months',
    verdict: 'Correct',
    verdictNote: 'The volume was never the story. The brand ended the year in 34 fewer outlets than it started, which is a distribution problem and not a pricing one.',
    missTitle: 'And when it does not match',
    missNote: 'Ask for unit and the answer is not "no such column". The column exists, in dim_product, and your query only names fact_sellout.',
    caption: 'A real task on the real database. The numbers above came out of the same file the browser downloads.',
  },

  schemaCaption: 'The schema as the app draws it, with the row count of every table read from the database rather than typed in by hand.',

  blocks: [
    {
      id: 'gap',
      title: 'Four hours on a Saturday, and then Wednesday',
      body: [
        'A course does its job in the room. Someone explains SELECT, WHERE and GROUP BY, every step follows from the last one, and by the final exercise it all makes sense. None of that is wrong.',
        'The trouble starts on the way home. The next time SQL comes up may be a week later, and the part that has to be recalled without help is exactly the part nobody practiced: which table to start from, whether that join quietly multiplies rows, why the total came out larger than the sum of its parts.',
        'Watching a query being written and writing one yourself are two different skills, and only the second one shows up in an interview.',
      ],
      figure: 'gap',
    },
    {
      id: 'what',
      title: 'Open a link, write a query',
      body: [
        'Quaera is a browser app for practicing the working part of data analysis: SQL, pandas, the data model behind a BI report, and the judgment that turns a number into an answer.',
        'There is nothing to install and no account to create. The page loads a 3.5 MB database into the browser, and every query after that runs locally, offline, on a phone if a phone is what you have. Progress is saved on the device.',
        'Four tracks, open in any order:',
      ],
      figure: 'tracks',
      after: [
        'Before the first task on a new technique there is a card: the notation, one worked example on this data, and the mistake people make with it. Not a lesson to read in advance, a card at the moment the technique is needed.',
        'A scheduler decides what comes back and when, so a technique met on Monday returns before it has time to fade.',
      ],
    },
    {
      id: 'task',
      title: 'Checked by running it, not by matching text',
      body: [
        'A task is a question against the distributor database. You write the query in an editor, with no multiple choice underneath.',
        'The answer is compared by what it returns. Any query producing the right result is accepted, whether or not it looks like the one I would have written.',
        'When the result does not match, the app does not say wrong. The shape of the difference usually names the cause, and that is what comes back: every group multiplied by the same whole number is a join fanning out rows, groups shifted by different amounts is a period filter that went missing, the same rows in a different order is a missing ORDER BY, a column that exists in the schema but not in the tables you named is said in exactly those words.',
      ],
      figure: 'task',
      after: [
        'This is the part a person practicing alone cannot get from a book, and the part a teacher has no time to do thirty times on a Saturday afternoon.',
      ],
    },
    {
      id: 'data',
      title: 'One company, thirteen tables, all of it connected',
      body: [
        'Every task runs on one dataset: Kaiyo Trading, a fictional distributor of FMCG and over the counter pharma in Japan. Thirteen tables, 159,740 rows, two and a half years of daily records, 144 outlets and 47 products.',
        'It is internally consistent, and that is the expensive part. Sell out rolls up into sell in. Sell in minus sell out gives stock. Plans are built from actuals, prices carry promotions, forecasts are stored as snapshots so you can ask how wrong the forecast for last month turned out to be.',
        'One consequence matters for learning. A brand losing distribution is the same event in all four tracks: you find it with a query, then with a dataframe, then as a DAX measure, then you write the sentence a sales director can act on. The four answers have to agree, because they come from the same rows.',
      ],
      figure: 'schema',
      after: [
        'Two textbook tables cannot do this. Nothing in them ever surprises you, and the schema is small enough to hold in your head instead of reading it.',
      ],
    },
    {
      id: 'limits',
      title: 'What is here, and what is not',
      body: ['Covered, with tasks that run and are checked:'],
      list: [
        {
          label: 'Querying',
          text: 'SELECT, WHERE, GROUP BY, HAVING, joins of every kind, subqueries, CTEs, window functions, and the arithmetic of shares and growth on top of them.',
        },
        {
          label: 'The same work in pandas',
          text: 'filtering, grouping, merges, time series, each technique placed next to the SQL it corresponds to.',
        },
        {
          label: 'The model behind a report',
          text: 'star schema, grain, keys, filter context, DAX measures checked as text.',
        },
        {
          label: 'Judgment',
          text: 'what the question really was, which metric answers it, what the number does not prove, and how to say the finding in one sentence.',
        },
      ],
      after: ['Not here, and in most cases on purpose:'],
      omits: [
        {
          label: 'Creating and changing tables',
          text: 'CREATE TABLE, INSERT, schema design. The database in the browser is read only by design: every task is checked against a reference result, and a database anyone can rewrite has no reference left. If a course covers that part, this app starts where it ends.',
        },
        {
          label: 'A teacher dashboard',
          text: 'no group report, no grades, no certificate. Progress lives on the device the student is working on and nowhere else, which also means I cannot tell you who finished what.',
        },
        {
          label: 'Your database',
          text: 'the tasks are written against this dataset. A schema built by someone else is a feature rather than a gap: a student who cannot fall back on remembering the table from class has to read it instead.',
        },
        {
          label: 'A course',
          text: 'no lectures, no video, no cohort, no deadline. It is what happens between the lessons, and it stops being useful the moment it pretends otherwise.',
        },
      ],
    },
  ],

  closing: {
    title: 'One link is the whole handover',
    body: [
      'For yourself: open the app and take the SQL track. The first task arrives inside a minute, and the technique card comes with it.',
      'For a group: there is nothing to install, no accounts to create, no lab machines and no license per seat. Fifteen people on school wifi load 3.5 MB once and keep working offline afterwards, including on the way home.',
      'If a set of tasks phrased in your own words would make it usable in your programme, I will write them. That is a week of work, and I would rather spend it on a group that will actually run it.',
    ],
    appLabel: 'Open the app',
    appNote: 'quaera.app, four tracks, no sign-up',
    introLabel: 'What is data analytics',
    introNote: 'Three minutes for someone new to the profession, written without a single professional term (quaera.app/?intro).',
    termsTitle: 'Terms, in full',
    terms: [
      { label: 'Free', text: 'for everyone, with no paid tier waiting behind it.' },
      { label: 'Code', text: 'Apache 2.0, open, the whole app runs in the browser with no server behind it.' },
      {
        label: 'Learning content',
        text: 'CC BY-NC-SA 4.0, so a class can use and adapt it with attribution. For a paid programme, write to me and the answer will be yes.',
      },
      {
        label: 'Data',
        text: 'without an account, nothing about a student exists on any server. Signing in is optional and does exactly one thing: it carries progress to a second device.',
      },
    ],
    author: 'Built by Stanislav Sidorovich, a PMO and project controls specialist in industrial construction, as the trainer I wanted while getting these skills back myself.',
  },
};

/**
 * Русской версии пока нет намеренно (см. шапку): на обеих локалях отдаётся
 * английский текст. Когда `RU` появится, поменяется только эта строка.
 */
export function overviewPage(_locale: Locale): OverviewPageContent {
  return EN;
}
