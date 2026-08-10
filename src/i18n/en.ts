/**
 * Строки интерфейса — английская локаль.
 *
 * Только UI-облицовка (кнопки, заголовки, статусы), см. комментарий в ru.ts.
 * Контент заданий (тексты, разборы, карточки приёмов) сюда не входит и пока
 * остаётся русским независимо от выбранной локали — переводится отдельно,
 * параллельными файлами паков, а не полями внутри задания.
 */
const langGenitive = (track: 'sql' | 'model' | 'python' | 'domain') => (track === 'python' ? 'Python' : 'SQL');

export const en = {
  app: {
    name: 'Querium',
    back: 'Back',
    exitHint: 'Press back again to exit',
    streakSuffix: (days: number) => `${days}-day streak`,
  },
  welcome: {
    headline: 'Not a course — a trainer where the code actually runs',
    body:
      "SQL and pandas execute for real in the browser, not against a template: the answer is checked by the query's actual result, the way it works on the job. Four tracks — analytics as a profession, SQL, pandas, and the data model — work through the same business cases on one continuous dataset of a fictional FMCG and OTC-pharma distributor: find a distribution loss, untangle a warehouse overstock, explain a seasonal sales dip.",
    proofPoints: [
      {
        title: 'Code actually runs',
        body: "SQLite and pandas (via Pyodide) execute right in the browser — the answer is checked against the query's real result, not its text.",
      },
      {
        title: 'Numbers and conclusions in explanations are build conditions',
        body: "If a number or a conclusion in a task's writeup drifts from the dataset, an automated check catches it — the writeup is held to the same standard as the code.",
      },
      {
        title: 'One dataset, four tracks',
        body: 'SQL, pandas, analytics-as-a-profession, and the data model all work through the same business cases, and the answers are required to agree.',
      },
    ],
    chainTitle: 'From question to decision',
    chainIntro: 'The same path for every business case, and each step has its own track.',
    chainSteps: ['business question', 'requirements', 'metric', 'data', 'analysis', 'model', 'insight', 'decision'],
  },
  /** См. комментарий в ru.ts: боковая навигация существует только на десктопе. */
  nav: {
    ariaLabel: 'Sections',
    sectionsLabel: 'Learning',
    tracksLabel: 'Tracks',
    home: 'Home',
    reference: 'Reference',
    sandbox: 'Sandbox',
    data: 'Data',
    /** См. комментарий в ru.ts: пункт живёт в подвале меню, а не первым в «Обучении». */
    onboarding: 'Where to start',
    about: 'About',
    trackProgress: (solved: number, total: number) => `${solved} / ${total}`,
  },
  tracks: {
    ariaLabel: 'Tracks',
    readyBadge: (n: number) => `${n} tasks`,
    draftBadge: 'coming soon',
    names: {
      sql: 'SQL for analysts',
      domain: 'Analytics as a profession',
      python: 'pandas for analysts',
      model: 'Data model and BI',
    } as Record<'sql' | 'model' | 'python' | 'domain', string>,
    chainStage: {
      domain: 'question → requirements → metric · insight → decision',
      sql: 'data',
      python: 'analysis',
      model: 'model',
    } as Record<'sql' | 'model' | 'python' | 'domain', string>,
    solvedOf: (solved: number, total: number) => `${solved} / ${total} solved`,
    continueBtn: 'Continue →',
    startBtn: 'Start →',
    openBtn: 'Open skill map →',
  },
  home: {
    dueLabel: 'due for review',
    solvedLabel: 'solved',
    startedOf: (started: number, total: number) => `${started} of ${total} topics started`,
    startBtnResume: 'Review and continue',
    startBtnBegin: 'Start session',
    loading: 'Loading data…',
    heroNote:
      'Up to 5 tasks, 7–10 minutes. New techniques are introduced with a card before the first task. Code actually runs — on 2.5 years of FMCG and OTC-pharma distributor data.',
    heroNoteNoCode:
      "Up to 5 tasks, 7–10 minutes. New topics are introduced with a card before the first task. No code to write here: each task is a real situation where you pick a decision and see why the others don't hold up.",
    /** См. комментарий в ru.ts: подпись называет то, что меряется, а не долю сделанного. */
    overallProgressLabel: 'Memory strength in this track',
    /** См. комментарий в ru.ts: объяснение жило в `title=`, то есть на телефоне не жило вовсе. */
    overallProgressHint:
      'This is not the share of tasks solved: the bar grows as you come back to a topic over days and weeks, so one evening cannot fill it — a low number early on is by design.',
    skillMapTitle: 'Skill map',
    /** См. комментарий в ru.ts: совет по порядку, а не запрет — карта открыта для любой темы. */
    unlockedAfter: (prereqs: string) => `Usually taken after: ${prereqs}`,
    /** Только значение — правило переехало в видимую overallProgressHint, см. ru.ts. */
    masteryAria: (pct: number) => `Memory strength: ${pct}%`,
    referenceBtn: 'Reference',
    sandboxBtn: 'Sandbox',
    schemaBtn: 'Data schema',
    draftNote: 'The skill graph is already designed; tasks will land in one of the upcoming sprints.',
  },
  consent: {
    title: 'Python engine download needed',
    body: (mb: number) =>
      `Pandas tasks run right in the browser — that needs a Python runtime with pandas, about ${mb} MB. Downloaded once, then served from the device cache; offline works just like the other tracks.`,
    note: 'Wi-Fi is best — on mobile data this is a noticeable chunk of traffic.',
    confirmBtn: 'Download and continue',
    /** См. комментарий в ru.ts: отказ должен быть таким же явным действием, как согласие. */
    laterBtn: 'Later',
    deferredNote:
      'The engine is not downloaded — pandas code cannot run yet. The skill map and the reference work without it.',
    resumeBtn: (mb: number) => `Download the Python engine (~${mb} MB)`,
  },
  about: {
    title: 'About the trainer',
    entryLink: "What's in the trainer and how it works →",
    tracksStatLabel: 'tracks',
    skillsStatLabel: 'skills',
    tasksStatLabel: 'tasks',
    /** См. комментарий в ru.ts: заявленный вслух потолок честнее умолчания. */
    audienceTitle: 'Who this is for, and how far it goes',
    audienceWhoLabel: 'Who it suits',
    audienceWhoBody:
      "Anyone already working with data or heading that way: a product or commercial analyst, a reporting specialist, a finance person tired of waiting on someone else's export. There is no syntax-for-its-own-sake here — every task grew out of a question analysts actually get asked.",
    audienceStartLabel: 'Where it starts',
    audienceStartBody:
      'From zero on every track: SQL opens with SELECT, pandas with what a DataFrame even is, the data model with why a star schema exists at all. No prior knowledge assumed. The tracks are independent — start with whatever is on fire, not with the first one listed.',
    audienceCeilingLabel: 'Where it gets you',
    audienceCeilingBody:
      'To a confident mid-level: window functions with frames, CTEs and query decomposition, filter context and time intelligence in DAX, reshaping data in pandas. That is the level at which an analyst closes most business requests without handing them onward.',
    audienceNotLabel: 'What is not here',
    audienceNotBody:
      'Database administration, query plan tuning, data engineering, and machine learning. Those are adjacent professions: they begin where this trainer ends, and promising them in passing would be a lie.',
    structureTitle: 'Structure',
    structureIntro: (skills: number, tasks: number) =>
      `Right now the tracks add up to ${skills} skills and ${tasks} tasks — the numbers grow with every sprint, and the counter on each track tile is always accurate.`,
    howTitle: 'How it works',
    howSrs:
      "The system decides on its own what to show: a new topic or one that's due for review. The interval is assigned to the skill, not the task — so if you just worked through one window-function problem, what comes back isn't that same task but a different one on the same technique. It guards against the illusion of understanding: remembering the wording of a task isn't the same as remembering the technique.",
    howModes:
      'Three input modes for different circumstances: predict the result — readable one-handed on the go; fill in the gaps in a query — an intermediate step; write it from scratch — for the desk. The same skill moves through all three as you master it.',
    howData:
      "The dataset is 156,000 rows over two and a half years, with a few dozen storylines beyond the ones already named above: a new SKU's rollout, a promo that cannibalised its own category, sell-in and sell-out drifting apart — every skill is trained on its own concrete situation, not an abstract example.",
    privacyTitle: 'Privacy',
    privacyBody:
      "No account needed. All progress is stored on the device and never sent anywhere — close the tab and pick up where you left off a month later, or clear the site data and start over.",
    backupTitle: 'Backup',
    backupBody:
      "Progress lives only in this browser: clearing site data, reinstalling the app, or switching phones wipes it with no way back. The file is a simple safeguard against that.",
    exportBtn: 'Download progress file',
    importBtn: 'Load progress from file',
    importSuccess: 'Progress loaded from file',
    importError: "Doesn't look like a Querium progress file — check you picked the right one",
    authorTitle: 'Author and licence',
    authorBody:
      'Querium was built by Stanislav Sidorovich — an analyst who made this trainer first of all to keep their own SQL, Power BI and Python in working shape. If you found an error in a task, disagree with an explanation, or just want to get in touch, both links below work.',
    linkedinBtn: "Author's LinkedIn",
    repoBtn: 'Source code on GitHub',
    licenseBody:
      'The application code is under Apache-2.0. The learning content (tasks, explanations, technique cards, the dataset storylines) is under CC BY-NC-SA 4.0: you may reuse it with attribution to the author, for non-commercial purposes, and keeping the same licence on anything derived from it.',
    tracksWhyTitle: 'Why these tracks, in this order',
    tracksWhyBody:
      "This mirrors how the work actually flows. Start with the profession itself — what an analyst is asked for and why, so the syntax that follows has a point. Then SQL, because that's where data is pulled from a source system. Then pandas, for the transforms and analysis that go beyond what a single query comfortably expresses. Power BI/DAX comes last, since a BI model is built on top of data that's already been extracted and shaped — modeling it before that exists would put the roof on before the walls.",
  },
  /**
   * См. комментарий в ru.ts: онбординг ничего не пересказывает, он выбирает
   * и советует. Английская версия здесь не догоняющий перевод — initialLocale()
   * отдаёт en всем, у кого браузер не русский, и на этот экран приходит
   * прежде всего случайный посетитель с LinkedIn.
   */
  onboarding: {
    title: 'Where to start',
    entryLink: 'First time here? Where to start →',
    intro:
      "The trainer doesn't march you down a single road: the tracks are independent, a session assembles itself, and the order is yours to pick. Freedom helps only when it's clear what you're choosing between — that's what this page is for. How the four tools differ and when each one is cheaper, what pace to work at, and what isn't here even though the job will ask for it.",

    toolsTitle: 'Four tools, and how to choose between them',
    toolsIntro:
      "The tracks are named after tools, but they all teach the same thing: a working question can almost always be answered several ways, and picking the way is a skill in itself. One and the same case — brand «Чистовъ»'s revenue falling by almost half — is worked through on all four tracks, because the data is the same and the answers are required to agree. When they don't, it isn't that \"the tools count differently\" — it's that someone made a mistake.",
    toolsWhenLabel: 'When this is your tool',
    toolsCostLabel: 'What it costs you',
    toolsWhen: {
      domain:
        "Before everything else. Before counting sales you have to know whose: shipments to the distributor or sales at the till, before discounts or after. This track isn't about a tool — it's about what the number you computed means and who needs it.",
      sql:
        "The answer is needed once and the data sits in a database. Pull, join, group — the shortest path from question to numbers, and the first line of requirements in analyst job ads.",
      python:
        "A calculation that takes several steps — with intermediate states, branching, or statistics — which is exactly where a single query stops being comfortable. The result stays an object in memory you can keep working with.",
      model:
        "The same number is needed every day and under different slices. You build the model once, and from then on the report recalculates itself — no new query for each new question.",
    } as Record<'sql' | 'model' | 'python' | 'domain', string>,
    /** См. комментарий в ru.ts: код и пояснения к нему живут в content/tools-compare.json, здесь только облицовка. */
    compareTitle: 'One question, three answers',
    compareIntro:
      'Here is the same task in three tools. The thing to watch is not the syntax but what turned out to be the essential part of each answer.',
    compareQuestionLabel: 'Question',
    compareRunnable: 'runs in the trainer',
    compareNotRunnable: 'cannot be run',
    compareFooter:
      'The build actually executes the first two fragments and checks their results against each other: had they disagreed, this page would not have built. The third one there is nothing to check with — and that is exactly the difference between the tools worth knowing in advance.',
    toolsCost: {
      domain:
        'Not a line of code, and no automatic checking: no engine will confirm that a judgement about the business is right. Everything expressible as a number is reconciled against the dataset, but a conclusion stays a conclusion.',
      sql:
        "A mistake in SQL rarely breaks the query — more often it runs without a single complaint and returns the wrong thing. And dialects diverge: a technique is worth remembering together with the engine it works on.",
      python:
        'The data is held in memory in full, so on large extracts it hits the limits of the machine long before a database would. This is a tool for exploration and one-off calculations, not for a report people open every day.',
      model:
        'DAX outside a model is meaningless: the formula leans on the relationships between tables. And the model itself is not free — an extra relationship or an extra high-cardinality column slows the report down.',
    } as Record<'sql' | 'model' | 'python' | 'domain', string>,

    stepsTitle: 'How to work through it',
    stepsIntro:
      "None of this is required: any step can be skipped, and the trainer imposes no gates. It's the order that saves time, not a condition of entry.",
    steps: [
      {
        title: "Start with whatever is on fire",
        body: 'The tracks are independent and each starts from zero: SQL opens with SELECT, pandas with what a DataFrame even is, the model with why a star schema exists. If nothing is on fire, follow the chain: profession → SQL → pandas → model. In that order each one builds on the last.',
      },
      {
        title: "Read the track's intro",
        body: "Five fields: what it is, where it comes up on the job, the main idea, what the track doesn't give you, and how it connects to the others. Two minutes of reading settles the \"why am I doing this\" question that otherwise catches up with you around task ten.",
      },
      {
        title: 'A session is up to five tasks, 7–10 minutes',
        body: "That's how long attention holds for working through an explanation rather than scrolling past it. More in one evening is not better: the system brings a topic back when it's due, so there's no point grinding the same one now.",
      },
      {
        title: 'Forgot a technique? Open the reference',
        body: "Every technique is there with its minimal form, a worked example and the mistake people usually make — and the example runs right inside the card. Looking it up mid-session isn't cheating: on the job you open the documentation too.",
      },
      {
        title: 'Test your own hunch in the sandbox',
        body: "Free mode on the same data: any query, no task and no hints, with a list of questions beside it for when you have nothing to ask. It's the one place in the trainer where the answer is checked against nothing — so check it yourself.",
      },
      {
        title: 'Come back tomorrow',
        body: 'The "memory strength" bar grows from returning to a topic across days, not from how much you cleared in one evening — one evening cannot fill it, by design. Three short days do more than one long one.',
      },
    ],
    stepsNote:
      'Progress lives only in this browser: there is no account and nothing is sent to a server. If you switch devices or clear site data, download the progress file from the About page — that is the only way to carry it over.',

    extraTitle: 'What to learn elsewhere',
    extraIntro:
      "The trainer covers four tools and a way of thinking around them — an analyst's job is not exhausted by that. An honest list of what isn't here: first the gaps next door, the ones you'll be asked about in the same role, then the adjacent professions this trainer does not lead to.",
    /** См. комментарий в ru.ts: зона без описаний, она нужна ради границы, а не содержимого. */
    extraInsideLabel: 'The trainer covers',
    extraNearLabel: "Next door: asked for on the job, absent here",
    extraNear: [
      {
        title: 'Python as a language',
        body: 'The pandas track is not "Python from scratch": it is about dataframes and is built on comparison with SQL. Functions, loops, working with files, virtual environments and pip stay outside the boundary — and without them you cannot assemble anything more complex than a single table.',
      },
      {
        title: 'Spreadsheets',
        body: 'Excel and Google Sheets are the language everyone else uses to talk to an analyst. Pivot tables and a cleanly formatted extract come up more often at work than window functions, and neither appears here at all.',
      },
      {
        title: 'Power BI by hand',
        body: "On the model track you read finished measures and predict their result, but you never write one: the DAX engine is closed and does not port to a browser. Install Power BI Desktop and build a model on your own data — mistakes in relationships and in filter direction only become visible by hand.",
      },
      {
        title: 'Statistics',
        body: 'Significance, confidence intervals, outliers, A/B tests — none of it is in the trainer yet, and BI and DA interviews ask about it. The place to start is not the formulas but the question "is this difference distinguishable from noise at all?"',
      },
      {
        title: 'Visualisation',
        body: 'Results here are shown as a table and a simple chart, but choosing the form, the scale and the labels is a craft of its own. A mistake there is not in the number: the number is right, and what people read off it is not.',
      },
    ],
    extraAdjacentLabel: 'Adjacent professions: this trainer does not lead there',
    extraAdjacent: [
      {
        title: 'Database administration and query plans',
        body: 'Indexes, execution plans, server tuning. It helps an analyst to understand why a query takes twenty minutes, but fixing it is other people with other instruments.',
      },
      {
        title: 'Data engineering',
        body: 'Pipelines, orchestration, warehouse layers. The analyst consumes that layer; building it is a separate profession with a separate toolkit.',
      },
      {
        title: 'Machine learning',
        body: 'Features, models, quality metrics. A neighbouring road from the same junction: the maths partly overlaps, the day-to-day work does not.',
      },
    ],
    extraClosing:
      'The boundary is drawn deliberately, not by oversight: these professions begin where the trainer ends, and promising them in passing would be a lie.',

    startBtn: 'Pick a track and begin →',
  },
  trackIntro: {
    entryLink: 'About this track →',
    whatTitle: 'What this is',
    whereTitle: 'Where it comes up on the job',
    ideaTitle: 'The main idea',
    limitsTitle: "What it doesn't give you",
    bridgeTitle: 'How it connects to the other tracks',
    startBtn: 'Start session',
    skipBtn: 'Skip',
  },
  reference: {
    title: 'Reference',
    intro:
      'For each technique: why it matters on the job, the minimal way to write it, a worked example, and a common mistake. Both queries can be run right in the card.',
    introNoCode:
      "For each topic: why it matters on the job, what it's made of, a worked example, and a common mistake. Nothing to run here: the examples show situations, not code.",
    notSeen: 'Not covered yet',
    openBtn: 'open',
    nextBtn: 'next',
    emptyNote: "Technique cards will appear together with this track's tasks.",
    trackFilterAria: 'Track',
    searchPlaceholder: 'Search techniques…',
    searchAria: 'Search the reference',
    noResults: (query: string) => `Nothing found for "${query}"`,
  },
  /** См. комментарий в ru.ts: экран без эталона, весь блок написан вокруг двух рисков — пустого поля и ложной уверенности. */
  sandbox: {
    title: 'Sandbox',
    intro:
      'Free mode: any query against the same "Нордвинд Трейд" data — no task, no hints, no reference answer. The schema is one click away; results come as a table or a chart.',
    envLabel: 'Environment',
    envSql: 'SQL',
    envPython: 'Python (pandas)',
    runBtn: 'Run',
    running: 'Running…',
    clearBtn: 'Clear',
    errorTitle: 'Execution failed',
    emptyResult: 'Results will show up here. Hit Run — nothing can break, the data is read-only.',
    disclaimerTitle: 'Nothing here checks your answer',
    disclaimerBody:
      '"The query ran" is not the same as "the number is right". The engine will report a syntax error, but it stays silent when a join has multiplied your rows and tripled the total, or when you have averaged something that was already an average. This is the only place in the trainer where a discrepancy is caught by neither a reference answer nor a writeup: check the result yourself — against the order of magnitude, a control total, a second way of counting.',
    /** См. комментарий в ru.ts: «что тут вообще есть» — вопрос более ранний, чем «что спросить». */
    tablesTitle: 'What tables are here',
    tablesIntro:
      'Where any query starts: what is in the database and what one row of each table stands for. Tap a table to see its columns, its links and three real rows.',
    tableOpenAria: (table: string) => `Open the schema for ${table}`,
    questionsTitle: 'Where to start',
    questionsIntro:
      'Questions analysts genuinely get asked — and every one of them has an answer in this data. Clicking inserts the question into the editor as a comment.',
    /** Подписи групп из SandboxGroup (content/sandbox.ts) — порядок задан там же, не здесь. */
    groups: {
      overview: 'Get oriented',
      trend: 'Trend and season',
      distribution: 'Distribution',
      stock: 'Stock and flow',
      promo: 'Promo and price',
      people: 'Targets and territory',
      quality: 'Data quality',
    } as Record<'overview' | 'trend' | 'distribution' | 'stock' | 'promo' | 'people' | 'quality', string>,
    questionTablesLabel: 'Where to look:',
    insertAria: (title: string) => `Insert the question "${title}" into the editor`,
    historyTitle: 'Runs in this session',
    historyEmpty: 'Nothing has been run yet.',
    historyRestoreAria: (n: number) => `Restore run #${n} into the editor`,
    /** См. комментарий в ru.ts: если приложение предлагает что-то сохранить, оно обязано сказать, где это лежит и когда исчезнет. */
    saveBtn: 'Save script',
    saveNamePlaceholder: 'A name you will recognise later',
    saveConfirmBtn: 'Save',
    saveCancelBtn: 'Cancel',
    savedTitle: 'Saved scripts',
    savedEmpty: 'Empty. A query worth keeping can be saved — it stays on this device.',
    savedNote: 'Scripts live in this browser, just like your progress, and disappear the same way if you clear site data.',
    /** См. комментарий в ru.ts: сообщение о факте, а не вопрос задним числом. */
    replacedNote: 'Previous code replaced',
    undoBtn: 'Undo',
    savedOpenAria: (name: string) => `Open the script "${name}"`,
    savedDeleteAria: (name: string) => `Delete the script "${name}"`,
    savedDeleteBtn: 'Delete',
  },
  session: {
    title: 'Session',
    taskProgressOf: (i: number, total: number) => `Task ${i} of ${total}`,
    lessonStep: 'Theory',
    doneTitle: 'Session done',
    doneBody: (n: number) =>
      `Tasks completed: ${n}. The skills they touched will come back for review — the interval depends on how confidently you got them.`,
    moreBtn: 'Another session',
    homeBtn: 'Home',
    prevAria: 'Previous step',
    stepAria: (i: number) => `Step ${i}`,
  },
  lesson: {
    pill: 'Technique',
    formTitle: 'How it is written',
    exampleTitle: 'Example on our data',
    wrongTitle: 'Common mistake',
    selfCheckTitle: 'How to check yourself',
    continueBtn: 'Go to the task',
    practiceBtn: 'Practice this topic',
    runExample: 'Run the example',
    runWrong: 'See what it returns',
    running: 'Running…',
    errorTitle: 'Run failed',
  },
  task: {
    levelLabel: (n: number) => `Level ${n}`,
    modePredict: 'Predict the result',
    modeFill: 'Fill in the query',
    modeWrite: 'Write the query',
    /** См. комментарий в ru.ts: переключатель для write/fill на узком экране. */
    mobileTabBrief: 'Brief',
    mobileTabWork: 'Code',
    mobileTabResults: 'Result',
    schemaBtn: 'Data schema',
    checkBtn: 'Check',
    runBtn: 'Run',
    runNote: '"Run" just shows the result — try things, mistakes cost nothing here.',
    placeholder: (track: 'sql' | 'model' | 'python' | 'domain'): string =>
      track === 'python' ? 'Write your code…' : 'Write your query…',
    hintWait: (s: number) => `Hint unlocks in ${s}s — try it yourself first`,
    hintShow: (shown: number, total: number) => `Show hint (${shown} of ${total})`,
    correctTitle: 'Correct',
    wrongOptionTitle: 'Not quite',
    wrongOptionBody: 'The breakdown of every option is below.',
    giveUpTitle: "Let's break it down",
    giveUpBody: "Below is the breakdown and the reference solution. The skill will come back for review today, on a different task.",
    giveUpBtn: "Stuck — show the breakdown",
    explainTitle: 'Breakdown',
    solutionSummary: 'Show reference solution',
    nextBtn: 'Next',
    columnNameNote: (cols: string) =>
      `The result matches, but the column names differ from what's expected (${cols}). In a real report this matters: a column should be named the way the requester would name it.`,
    yourResult: 'Your result',
    expectedResult: (shown: number, total: string) => `This is what the reference looks like (first ${shown} of ${total})`,
    blankAriaLabel: (n: number) => `Blank ${n}`,
  },
  schema: {
    title: 'Data schema',
    loading: 'Loading schema…',
    /** См. комментарий в ru.ts: в списке таблиц песочницы объём не нужен, формулировка одна на оба места. */
    grainLabel: (grain: string, rows?: string) =>
      rows ? `One row = ${grain} · ${rows} rows` : `One row = ${grain}`,
    closeBtn: 'Close',
    ariaLabel: 'Data schema',
    copyAria: (name: string) => `Copy "${name}"`,
    copied: 'Copied',
    periodLabel: (from: string, to: string) => `Data period: ${from} — ${to}`,
    sampleCaption: (n: number) => `${n} rows from different parts of the table — what the data actually looks like`,
  },
  /** См. комментарий в ru.ts: деление на факты и справочники названо словами, а не отдано префиксу имени. */
  data: {
    title: 'Data',
    intro: (tables: number) =>
      `${tables} tables from one fictional distributor. Every track runs on them: a SQL task, a pandas walkthrough and a data-model question all pull the same rows. Open a table to see its columns and three real rows — enough to show the date format, the order of magnitude and where values go missing.`,
    searchPlaceholder: 'Search tables and columns…',
    searchAria: 'Search the data schema',
    searchFound: (n: number) => `Found ${n} ${n === 1 ? 'table' : 'tables'}`,
    searchEmpty: (query: string) => `Nothing found for "${query}"`,
    tableCount: (n: number) => `${n} ${n === 1 ? 'table' : 'tables'}`,
    incomingLabel: (n: number) => `Referenced by ${n} ${n === 1 ? 'table' : 'tables'}`,
    groups: {
      fact: {
        title: 'Facts — what happened',
        body: 'Events and measurements: a shipment, a sale, stock on hand, a target. One row is one fact, and almost everything in them is numbers and keys. This is where the totals in a report come from; the lookups explain what those totals are about.',
      },
      dimension: {
        title: 'Lookups — who and what',
        body: 'Products, customers, regions, staff, promotions, the calendar. No totals here — only descriptions: a brand name, an outlet city, an opening date. They join onto facts by key, and without them a number has no name.',
      },
      standalone: {
        title: 'Raw layer — before cleaning',
        body: 'An export as it arrived, tied to nothing by keys: dates as text in several formats, numbers with a comma, one chain spelled three ways. This is how data actually shows up at work, and putting it in order is a skill of its own.',
      },
    },
  },
  result: {
    stdoutLabel: 'print() output',
    noColumns: 'The query returned no columns.',
    rowsSuffix: (n: string) => `${n} rows`,
    truncatedSuffix: (n: number) => ` · showing the first ${n}`,
    tableTab: 'Table',
    chartTab: 'Chart',
  },
  editor: {
    symbolsAria: (track: 'sql' | 'model' | 'python' | 'domain') => `${langGenitive(track)} symbols`,
    keywordsAria: (track: 'sql' | 'model' | 'python' | 'domain') => `${langGenitive(track)} keywords`,
    chipsAria: 'Tables and columns',
    keyboardShow: 'Show keyboard',
    keyboardHide: 'Hide keyboard',
  },
  loadError: {
    title: 'Failed to load data',
    reloadBtn: 'Reload',
  },
  locale: {
    switchAriaLabel: 'Language',
    /** См. комментарий в ru.ts: строка сторожевая, показывается только при частичном переводе пака. */
    partialNote:
      "Part of this track's content is not translated yet: task wording and breakdowns show in Russian. The translation is catching up with the content — the interface itself is fully in English.",
  },
  fontSize: {
    aria: 'Font size — tap to switch',
  },
  theme: {
    aria: (current: 'system' | 'light' | 'dark') =>
      `Theme: ${current === 'system' ? 'system default' : current} — tap to switch`,
  },
};
