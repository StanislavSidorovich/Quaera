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
  },
  /** См. комментарий в ru.ts: боковая навигация существует только на десктопе. */
  nav: {
    ariaLabel: 'Sections',
    sectionsLabel: 'Learning',
    tracksLabel: 'Tracks',
    home: 'Home',
    reference: 'Reference',
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
    skillMapTitle: 'Skill map',
    lockedNote: 'Unlocks after earlier topics',
    masteryAria: (pct: number) => `${pct}% mastered`,
    referenceBtn: 'Reference',
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
    structureTitle: 'Structure',
    structureIntro: (skills: number, tasks: number) =>
      `Four tracks on one dataset. Right now that's ${skills} skills and ${tasks} tasks — the numbers grow with every sprint, and the counter on each track tile is always accurate.`,
    howTitle: 'How it works',
    howSrs:
      "The system decides on its own what to show: a new topic or one that's due for review. The interval is assigned to the skill, not the task — so if you just worked through one window-function problem, what comes back isn't that same task but a different one on the same technique. It guards against the illusion of understanding: remembering the wording of a task isn't the same as remembering the technique.",
    howModes:
      'Three input modes for different circumstances: predict the result — readable one-handed on the go; fill in the gaps in a query — an intermediate step; write it from scratch — for the desk. The same skill moves through all three as you master it.',
    howData:
      'All tracks run on one continuous dataset of a fictional FMCG and OTC-pharma distributor: 156,000 rows over two and a half years, with built-in storylines like distribution loss or warehouse overstock. SQL queries actually run, in the browser, offline.',
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
    tracksWhyTitle: 'Why these tracks, in this order',
    tracksWhyBody:
      "This mirrors how the work actually flows. Start with the profession itself — what an analyst is asked for and why, so the syntax that follows has a point. Then SQL, because that's where data is pulled from a source system. Then pandas, for the transforms and analysis that go beyond what a single query comfortably expresses. Power BI/DAX comes last, since a BI model is built on top of data that's already been extracted and shaped — modeling it before that exists would put the roof on before the walls.",
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
  },
  session: {
    title: 'Session',
    progressOf: (i: number, total: number) => `${i} of ${total}`,
    doneTitle: 'Session done',
    doneBody: (n: number) =>
      `Tasks completed: ${n}. The skills they touched will come back for review — the interval depends on how confidently you got them.`,
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
    grainLabel: (grain: string, rows: string) => `One row = ${grain} · ${rows} rows`,
    closeBtn: 'Close',
    ariaLabel: 'Data schema',
  },
  result: {
    stdoutLabel: 'print() output',
    noColumns: 'The query returned no columns.',
    rowsSuffix: (n: string) => `${n} rows`,
    truncatedSuffix: (n: number) => ` · showing the first ${n}`,
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
    partialNote:
      'This track is not translated yet: its skill names and, once tasks are written, their wording and breakdowns show in Russian. The SQL, analytics and pandas tracks are fully in English.',
  },
  fontSize: {
    aria: 'Font size — tap to switch',
  },
  theme: {
    aria: (current: 'system' | 'light' | 'dark') =>
      `Theme: ${current === 'system' ? 'system default' : current} — tap to switch`,
  },
};
