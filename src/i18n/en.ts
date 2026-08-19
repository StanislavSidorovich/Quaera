/**
 * Строки интерфейса — английская локаль. Полный список того, что переведено
 * где и что остаётся русским намеренно, — в шапке ru.ts; здесь не повторяется,
 * чтобы два описания одного и того же не разъехались (ровно это и случилось
 * с прежней шапкой этого файла: она уверяла, что контент заданий русский,
 * ещё месяц после того, как все четыре пака были переведены целиком, и внешний
 * разбор приложения принял комментарий за состояние продукта).
 *
 * Английский тут не догоняющий: initialLocale() отдаёт 'en' всем, у кого
 * браузер не русский, — то есть это первая локаль для случайного посетителя.
 */
const langGenitive = (track: 'sql' | 'model' | 'python' | 'domain') => (track === 'python' ? 'Python' : 'SQL');

/** См. комментарий в ru.ts: одни границы периода на две подписи, тире здесь другое. */
const periodRange = (from: string, to: string) => `${from} – ${to}`;

export const en = {
  app: {
    name: 'Quaera',
    /** См. комментарий в ru.ts: вкладка — последнее русское место в английском интерфейсе. */
    documentTitle: 'Quaera: a data analyst trainer',
    back: 'Back',
    exitHint: 'Press back again to exit',
    streakSuffix: (days: number) => `${days}-day streak`,
  },
  welcome: {
    headline: 'An analytics trainer: the query runs, the answer is checked against the data',
    body:
      "Four tracks on one continuous dataset of a fictional FMCG and OTC-pharma distributor: analytics as a profession, SQL, pandas, the data model. The tasks are the ones an analyst actually gets: find where a brand's distribution went, work out a warehouse overstock, explain a seasonal sales dip.",
    proofPoints: [
      {
        title: 'The code runs in the browser',
        body: 'SQLite and pandas (via Pyodide) execute right on the page: the query goes against real data, and what gets compared is what it returned, not how it was written.',
      },
      {
        /** См. комментарий в ru.ts: «build conditions» — слово автора, не читателя. */
        title: 'The writeup is checked like code',
        body: "If a number or a conclusion in a task's writeup drifts from the dataset, an automated check catches it.",
      },
      {
        title: 'One dataset, four tracks',
        body: 'The same case is worked through with a query, a dataframe, and a measure, and the answers have to agree.',
      },
    ],
    chainTitle: 'From question to decision',
    chainIntro: 'The same path for every business case, and each step has its own track.',
    chainSteps: ['business question', 'requirements', 'metric', 'data', 'analysis', 'model', 'insight', 'decision'],
    /** См. комментарий в ru.ts: подписи к картинке рядом с заголовком. */
    /** См. комментарий в ru.ts: вход от вопроса пришедшего, а не от названия раздела. */
    sandboxLink: 'Just try a query → Sandbox',
    loop: {
      queryLabel: 'your query',
      resultLabel: 'what came back',
      expectedLabel: 'expected',
      matchLabel: 'they agree',
      aria:
        'The query runs against the dataset, and the table it returned is checked row by row against the expected table.',
    },
  },
  /** См. комментарий в ru.ts: боковая навигация существует только на десктопе. */
  nav: {
    ariaLabel: 'Sections',
    sectionsLabel: 'Learning',
    tracksLabel: 'Tracks',
    home: 'Home',
    /** См. комментарий в ru.ts: порядок пунктов повторяет порядок намерений. */
    story: 'Story line',
    storyMode: 'Story mode',
    reference: 'Reference',
    sandbox: 'Sandbox',
    data: 'Data',
    /** См. комментарий в ru.ts: пункт живёт в подвале меню, а не первым в «Обучении». */
    onboarding: 'Where to start',
    about: 'About',
    account: 'Account and data',
    /** См. комментарий в ru.ts: подпись называет состояние, а не требует действия. */
    accountSignedOut: 'On this device only',
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
    /** См. комментарий в ru.ts: метка ставится по Executor.runsCode, не по режиму задания. */
    runsCodeBadge: 'the code runs',
    recommendedBadge: 'start here',
    /** См. комментарий в ru.ts: укорочено, чтобы уместиться в 4 строки на 375px. */
    recommendedNote:
      'Not sure where to begin? Start with SQL: almost every analyst posting asks for it, it opens with no extra download, and the answer is checked against the result of your query. The other three tracks are open from the start, in any order.',
  },
  home: {
    dueLabel: 'due for review',
    solvedLabel: 'solved',
    /**
     * Число сюда не подставляется, хотя и приходит аргументом: экран рисует
     * его крупно строкой выше (см. startedCount в Home). Прежняя редакция
     * повторяла его в подписи, и по-английски плитка читалась «3 / 3 of 16
     * topics started» — в русской такой ошибки не было.
     */
    startedOf: (_started: number, total: number) => `of ${total} topics started`,
    startBtnResume: 'Review and continue',
    startBtnBegin: 'Start session',
    resumeBtn: 'Back to your session',
    resumeNote: (step: string) => `Left unfinished: ${step.toLowerCase()}. Everything you did is still there.`,
    loading: 'Loading data…',
    loadingRuntime: 'Loading Python with pandas…',
    loadingRuntimeNote: 'Downloaded once, then served from device cache and works offline.',
    loadingRuntimeCached: 'Starting Python from the device cache…',
    loadingRuntimeCachedNote: 'The files are already on your device; no internet needed.',
    heroNote:
      'Up to 5 tasks, 7–10 minutes. New techniques are introduced with a card before the first task. Your queries run against 2.5 years of FMCG and OTC-pharma distributor data.',
    heroNoteNoCode:
      "Up to 5 tasks, 7–10 minutes. New topics are introduced with a card before the first task. No code to write here: each task is a real situation where you pick a decision and see why the others don't hold up.",
    /** См. комментарий в ru.ts: видна только pandas без единого повторения в SQL. */
    pandasSqlNote: "This track is written as a continuation of SQL, and you haven't started that track yet: some explanations lean on things you haven't seen.",
    /** См. комментарий в ru.ts: подпись называет то, что меряется, а не долю сделанного. */
    overallProgressLabel: 'Memory strength in this track',
    /** См. комментарий в ru.ts: объяснение жило в `title=`, то есть на телефоне не жило вовсе. */
    overallProgressHint:
      'This is not the share of tasks solved: the bar grows as you come back to a topic over days and weeks, so one evening cannot fill it. A low number early on is by design.',
    skillMapTitle: 'Skill map',
    /** См. комментарий в ru.ts: совет по порядку, а не запрет — карта открыта для любой темы. */
    unlockedAfter: (prereqs: string) => `Usually taken after: ${prereqs}`,
    /** Только значение — правило переехало в видимую overallProgressHint, см. ru.ts. */
    masteryAria: (pct: number) => `Memory strength: ${pct}%`,
    referenceBtn: 'Reference',
    sandboxBtn: 'Sandbox',
    schemaBtn: 'Data schema',
    draftNote: 'The skill graph is already designed; tasks will land in one of the upcoming sprints.',
    accountStatusSignedIn: (email: string) => `Progress is saved to ${email}`,
    accountStatusSignedOut: 'Progress is only on this device',
    accountStatusSignInBtn: 'Sign in',
    oldDomainNotice: 'The trainer moved to quaera.app. This link still works, but the new address is easier to remember.',
    oldDomainNoticeBtn: 'Go to quaera.app',
  },
  consent: {
    title: 'Python engine download needed',
    body: (mb: number) =>
      `Pandas tasks run right in the browser, and that needs a Python runtime with pandas, about ${mb} MB. Downloaded once, then served from the device cache; offline works just like the other tracks.`,
    note: 'Wi-Fi is best: on mobile data this is a noticeable chunk of traffic.',
    confirmBtn: 'Download and continue',
    /** См. комментарий в ru.ts: отказ должен быть таким же явным действием, как согласие. */
    laterBtn: 'Later',
    deferredNote:
      'The engine is not downloaded, so pandas code cannot run yet. The skill map and the reference work without it.',
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
      "Anyone already working with data or heading that way: a product or commercial analyst, a reporting specialist, a finance person tired of waiting on someone else's export. There is no syntax-for-its-own-sake here: every task grew out of a question analysts get asked.",
    audienceStartLabel: 'Where it starts',
    audienceStartBody:
      'From zero on every track: SQL opens with SELECT, pandas with what a DataFrame even is, the data model with why a star schema exists at all. No prior knowledge assumed, with one exception: parts of pandas are explained through their SQL counterpart further in.',
    audienceCeilingLabel: 'Where it gets you',
    audienceCeilingBody:
      'To a confident mid-level: window functions with frames, CTEs and query decomposition, filter context and time intelligence in DAX, reshaping data in pandas. That is the level at which an analyst closes most business requests without handing them onward.',
    audienceNotLabel: 'What is not here',
    audienceNotBody:
      'Database administration, query plan tuning, data engineering, and machine learning. Those are adjacent professions: they begin where this trainer ends, and promising them in passing would be a lie.',
    structureTitle: 'Structure',
    structureIntro: (skills: number, tasks: number) =>
      `Right now the tracks add up to ${skills} skills and ${tasks} tasks. The numbers grow with every sprint, and the counter on each track tile is always accurate.`,
    howTitle: 'How it works',
    howSrs:
      "The system decides on its own what to show: a new topic or one that's due for review. The interval is assigned to the skill, not the task, so if you just worked through one window-function problem, what comes back isn't that same task but a different one on the same technique. It guards against the illusion of understanding: remembering the wording of a task isn't the same as remembering the technique.",
    howModes:
      'Three input modes for different circumstances: predict the result (readable one-handed on the go), fill in the gaps in a query (an intermediate step), write it from scratch (for the desk). The same skill moves through all three as you master it.',
    howData:
      "The dataset is 156,000 rows over two and a half years, with a few dozen storylines beyond the ones already named above: a new SKU's rollout, a promo that cannibalised its own category, sell-in and sell-out drifting apart. Every skill is trained on its own concrete situation, not an abstract example.",
    privacyTitle: 'Privacy',
    /**
     * См. довод в ru.ts: здесь краткий ответ, подробный — на «Аккаунте
     * и данных» (account.dataTitle). Разделение вынужденное дважды:
     * полный текст ломает балансир about-columns, и он же отвечает
     * на вопросы, которые задают у кнопки входа, а она на том экране.
     */
    privacyBody:
      'The account is optional: without one the trainer works in full and offline, and all your progress stays in this browser. There is no analytics here, no visit counters and no ads, and not one query you write ever leaves the device, with an account or without one. If you do sign in, what goes to the server is your progress and your Google account email; exactly what, where to, and how to remove it is spelled out under Account and data.',
    /** См. довод в ru.ts: ссылка стоит под «Приватностью» и называет действия, а не раздел. */
    accountLink: 'Sign-in, backup and reset →',
    /** См. комментарий в ru.ts: карточка видна только когда beforeinstallprompt пришёл. */
    installTitle: 'Install the app',
    installBody:
      'You can install the trainer on your device like a regular app: its own icon, its own entry in the app list, no browser tabs around it.',
    installBtn: 'Install',
    authorTitle: 'Author and licence',
    authorBody:
      'Quaera was built by Stanislav Sidorovich, an analyst who made this trainer first of all to keep their own SQL, Power BI and Python in working shape. If you found an error in a task, disagree with an explanation, or just want to get in touch, both links below work.',
    linkedinBtn: "Author's LinkedIn",
    repoBtn: 'Source code on GitHub',
    licenseBody:
      'The application code is under Apache-2.0. The learning content (tasks, explanations, technique cards, the dataset storylines) is under CC BY-NC-SA 4.0: you may reuse it with attribution to the author, for non-commercial purposes, and keeping the same licence on anything derived from it.',
    tracksWhyTitle: 'Why these tracks, in this order',
    /** См. комментарий в ru.ts: единственное место, где цепочка объяснена прозой, а не нарисована. */
    chainBody:
      'Every working task travels the same path: business question → requirements → metric → data → analysis → model → insight → decision. The tools cover the middle; the path breaks at its ends, and the start is the more dangerous of the two: a misread question yields a flawlessly computed wrong answer, and no later step will catch it, because every one of them adds up perfectly. The middle has something to check it against: the query result is visible at once. The ends are checked only by the questions you ask the person who requested the work.',
    tracksWhyBody:
      "The order of the tracks follows that path. Start with the profession itself: what an analyst is asked for and why, so the syntax that follows has a point. Then SQL, because that's where data is pulled from a source system. Then pandas, for the transforms and analysis that go beyond what a single query comfortably expresses. Power BI/DAX comes last, since a BI model is built on top of data that's already been extracted and shaped. Modeling it before that exists would put the roof on before the walls. That is the order of the work, not the order of learning: SQL is the easier place to begin, in the middle of the path but asked for most often, and it shows a result from the very first task. The profession track then runs alongside rather than before it, because it covers what people trip on once the syntax is already there.",
  },
  /** См. комментарий в ru.ts: свой экран, потому что здесь не читают, а делают. */
  account: {
    title: 'Account and data',
    /** См. довод в ru.ts: заголовок карточки называет пользу, а не механику. */
    syncTitle: 'Your progress on every device',
    syncBody:
      'Signing in ties your progress to your Google account: sessions from your phone and your laptop merge into one, and clearing site data stops being the end of the story. You can keep practising without signing in, in which case everything stays on this device.',
    signInBtn: 'Sign in with Google',
    signOutBtn: 'Sign out',
    signedInAs: (email: string) => `Signed in as ${email}`,
    syncing: 'Merging progress…',
    synced: 'Progress merged and saved',
    /** См. довод в ru.ts: отказ сети не потеря, и текст обязан это сказать. */
    syncError: 'Could not reach the server. Your progress is saved on this device, and we will try again later',
    signInError: 'Could not start sign-in. Check your connection and try again',
    /** См. довод в ru.ts: текст называет границу удаления, а не только последствие. */
    deleteTitle: 'Delete account',
    deleteBody:
      'Your Google account is unlinked from the trainer, and the server copy of your progress goes with it. Practice on this device stays: deleting removes what sits on the server, not what is in the browser. For the local copy there is the reset in the card below.',
    deleteBtn: 'Delete account',
    deleteConfirm: 'Delete the account for good? The server copy cannot be brought back, and signing in again means starting a new account from scratch.',
    deleteConfirmBtn: 'Yes, delete',
    deleteCancelBtn: 'Cancel',
    deleting: 'Deleting the account…',
    deleteDone: 'Account deleted. Your progress on this device is still here',
    deleteError: 'Could not delete the account. Check your connection and try again',
    backupTitle: 'Backup',
    backupBody:
      'Without signing in, progress lives only in this browser: clearing site data, reinstalling the app, or switching phones wipes it with no way back. The file is a safeguard that works without an account too.',
    exportBtn: 'Download progress file',
    importBtn: 'Load progress from file',
    importSuccess: 'Progress loaded from file',
    importError: "Doesn't look like a Quaera progress file. Check you picked the right one",
    /** См. комментарий в ru.ts: текст называет обе границы, что исчезнет и что останется. */
    resetTitle: 'Reset progress',
    resetBody:
      'Start from a clean slate: the streak, the review history and every solved-task mark go away, and so does an unfinished session. Sandbox scripts, settings and the Python runtime you already downloaded stay where they are, so there are no 52 MB to fetch again. A reset cannot be undone, so download the progress file first.',
    resetBtn: 'Reset progress',
    resetConfirm: 'Reset for good? The only way back is the progress file.',
    resetConfirmBtn: 'Yes, reset',
    resetCancelBtn: 'Cancel',
    resetDone: 'Progress reset',
    /*
     * См. развёрнутый довод в ru.ts: три вещи обязаны быть сказаны
     * до нажатия, потому что разрешение необратимо из приложения.
     * Тире не ставить — бюджет en.ts нулевой (test:prose-en).
     */
    pushTitle: 'Review reminders',
    pushBody:
      'The review schedule is built on coming back after days and weeks, and so far the only nudge was the number on the app icon, which you can see only while the app is open. A reminder arrives when topics come due and the app is closed. No account is needed: what goes to the server is the address your browser issued for this device plus a timestamp saying when to wake it, not your topics, answers or progress.',
    pushExample: 'It looks like this: "Time to review. 3 topics are due. A session takes 7 to 10 minutes."',
    pushEnableBtn: 'Turn on reminders',
    pushDisableBtn: 'Turn off reminders',
    pushOn: 'Reminders are on for this device',
    pushOnNote:
      'You will get at most one reminder at a time: the next one is scheduled only when you open the app again.',
    pushDenied:
      'Notifications are blocked for this site in your browser. The app cannot ask again; the permission comes back only through the site settings in your browser.',
    pushUnsupported: 'This browser cannot deliver notifications to a closed app.',
    pushIosNote:
      'On iPhone and iPad notifications work only in an app added to the Home Screen: open Share, then Add to Home Screen, launch Quaera from there and come back to this page.',
    pushFailed: 'Could not turn reminders on. Check your connection and try again',
    /**
     * См. развёрнутый довод в ru.ts: четыре подраздела на четыре вопроса,
     * каждый задаётся до нажатия кнопки входа. Правило письма оттуда же:
     * гейта у этой прозы нет, поэтому каждое утверждение проверяемо
     * по репозиторию. Тире не ставить вовсе — бюджет en.ts нулевой
     * (test:prose-en).
     */
    dataTitle: 'What happens to your data',
    dataDeviceTitle: 'What stays on the device',
    dataDeviceBody:
      'Progress, an unfinished session, saved sandbox scripts, settings and the Python runtime you downloaded are all kept by the browser itself. Answers are checked in the same place: both SQL and pandas run inside this tab, so not one query you write ever leaves the device, with an account or without one.',
    dataServerTitle: 'What goes to the server if you sign in',
    dataServerBody:
      'One row: that same progress file, meaning skills, review intervals and marks for the tasks you solved. Next to it the sign-in machinery keeps your Google account email and its identifier, because without them there is no telling whose progress this is. The database is Supabase, on a server in Frankfurt. From Google the trainer asks for the email and nothing else: no contacts, no drive, no other access; your password is typed on a Google page and never reaches this one.',
    dataNoneTitle: 'What is not here',
    dataNoneBody:
      'No analytics, no visit counters, no ads, no tracking pixels: not a single one, and the source code shows it. Three outside addresses appear in the code, and all three are the sign-in server, the GitHub repository and the author’s LinkedIn. The page pulls no fonts and no scripts from elsewhere, sets no cookies of its own, and the running app contains no language model at all: an answer is compared against the reference result, not against an AI.',
    dataKeepTitle: 'How long it is kept, and how to remove it',
    dataKeepBody:
      'The row on the server lives until you delete it: the Delete account button removes the sign-in record, and the progress goes with it, at once and with no way back. The local copy goes with a reset or by clearing site data. And two honest boundaries: the access rules close your row to other learners but not to whoever owns the database, which is how any hosting works and cannot be undone from here; and the server takes no backups at all, so the safeguard against loss is the progress file, not the server copy.',
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
      "The trainer doesn't march you down a single road: the tracks are independent, a session assembles itself, and the order is yours to pick. But freedom only helps once it's clear what you're choosing between. This page is about that choice: how the four tools differ and when each one is cheaper, what pace to work at, and what isn't here even though the job will ask for it.",

    toolsTitle: 'Four tools, and how to choose between them',
    toolsIntro:
      "The tracks are named after tools, but they all teach the same thing: a working question can almost always be answered several ways, and picking the way is a skill in itself. One and the same case, brand «Nettora»'s revenue falling by almost half, is worked through on all four tracks, because the data is the same and the answers have to agree. When they don't, it isn't that \"the tools count differently\": it's that someone made a mistake.",
    toolsWhenLabel: 'When this is your tool',
    /** См. довод у toolsCostLabel в ru.ts: подпись про отказы, а не про цену. */
    toolsCostLabel: 'Where it lets you down',
    toolsWhen: {
      domain:
        "Before everything else. Before counting sales you have to know whose: shipments to the distributor or sales at the till, before discounts or after. This track isn't about a tool: it's about what the number you computed means and who needs it.",
      sql:
        "The answer is needed once and the data sits in a database. Pull, join, group: the shortest path from question to numbers, and the first line of requirements in analyst job ads.",
      python:
        "A calculation that takes several steps (intermediate states, branching, statistics), which is exactly where a single query stops being comfortable. The result stays an object in memory you can keep working with.",
      model:
        "The same number is needed every day and under different slices. You build the model once, and from then on the report recalculates itself, with no new query for each new question.",
    } as Record<'sql' | 'model' | 'python' | 'domain', string>,
    /** См. комментарий в ru.ts: код и пояснения к нему живут в content/tools-compare.json, здесь только облицовка. */
    compareTitle: 'One question, three answers',
    compareIntro:
      'Here is the same task in three tools. The thing to watch is not the syntax but what turned out to be the essential part of each answer.',
    compareQuestionLabel: 'Question',
    compareRunnable: 'runs in the trainer',
    compareNotRunnable: 'cannot be run',
    compareFooter:
      'The build executes the first two fragments and checks their results against each other: had they disagreed, this page would not have built. For the third there is nothing to check against, and that is exactly the difference between the tools worth knowing in advance.',
    toolsCost: {
      domain:
        'Not a line of code, and no automatic checking: no engine will confirm that a judgement about the business is right. Everything expressible as a number is reconciled against the dataset, but a conclusion stays a conclusion.',
      sql:
        "A mistake in SQL rarely breaks the query. More often it runs without a single complaint and returns the wrong thing. And dialects diverge: a technique is worth remembering together with the engine it works on.",
      python:
        'The data is held in memory in full, so on large extracts it hits the limits of the machine long before a database would. This is a tool for exploration and one-off calculations, not for a report people open every day.',
      model:
        'DAX outside a model is meaningless: the formula leans on the relationships between tables. And the model itself is not free: an extra relationship or an extra high-cardinality column slows the report down.',
    } as Record<'sql' | 'model' | 'python' | 'domain', string>,

    stepsTitle: 'How to work through it',
    stepsIntro:
      "None of this is required: any step can be skipped, and the trainer imposes no gates. It's the order that saves time, not a condition of entry.",
    steps: [
      {
        title: "Start with whatever is on fire",
        /* См. комментарий в ru.ts: шаг советует, а не пересказывает about.audienceStartBody и about.chainBody. */
        body: 'There are no formal prerequisites between tracks: nothing is locked, and any of them is a valid start. One caveat: pandas is written as a continuation of SQL, so you can work through it without SQL, but a good part of the explanations rest on the comparison and will pass you by. If nothing is on fire, take them in the order they are listed above: it follows the path from question to decision.',
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
        body: "Every technique is there with its minimal form, a worked example and the mistake people usually make, and the example runs right inside the card. Looking it up mid-session isn't cheating: on the job you open the documentation too.",
      },
      {
        title: 'Test your own hunch in the sandbox',
        body: "Free mode on the same data: any query, no task and no hints, with a list of questions beside it for when you have nothing to ask. It's the one place in the trainer where the answer is checked against nothing, so check it yourself.",
      },
      {
        title: 'Come back tomorrow',
        body: 'The "memory strength" bar grows from returning to a topic across days, not from how much you cleared in one evening. One evening cannot fill it, by design: three short days do more than one long one.',
      },
    ],
    /** См. довод в ru.ts: приватность и бэкап сказаны на «О тренажёре», здесь — что делать. */
    stepsNote:
      'If you switch devices or clear site data, sign in with Google or download the progress file from the Account and data page: without one of the two it will not survive the move.',
    /** См. комментарий в ru.ts: не пересказываем механику, только называем адрес действия. */
    installNote:
      'You can install the trainer as an app from the About page, and download the Python runtime for offline pandas ahead of time, on the Python track itself, without waiting for the first task.',

    extraTitle: 'What to learn elsewhere',
    extraIntro:
      "The trainer covers four tools and a way of thinking around them, and an analyst's job is not exhausted by that. An honest list of what isn't here: first the gaps next door, the ones you'll be asked about in the same role, then the adjacent professions this trainer does not lead to.",
    /** См. комментарий в ru.ts: зона без описаний, она нужна ради границы, а не содержимого. */
    extraInsideLabel: 'The trainer covers',
    extraNearLabel: "Next door: asked for on the job, absent here",
    extraNear: [
      {
        title: 'Python as a language',
        body: 'The pandas track is not "Python from scratch": it is about dataframes and is built on comparison with SQL. Functions, loops, working with files, virtual environments and pip stay outside the boundary, and without them you cannot assemble anything more complex than a single table.',
      },
      {
        title: 'Spreadsheets',
        body: 'Excel and Google Sheets are the language everyone else uses to talk to an analyst. Pivot tables and a cleanly formatted extract come up more often at work than window functions, and neither appears here at all.',
      },
      {
        title: 'Power BI by hand',
        body: "On the model track you read finished measures and predict their result, but you never write one: the DAX engine is closed and does not port to a browser. Install Power BI Desktop and build a model on your own data: mistakes in relationships and in filter direction only become visible by hand.",
      },
      {
        title: 'Statistics',
        body: 'Significance, confidence intervals, outliers, A/B tests: none of it is in the trainer yet, and BI and DA interviews ask about it. The place to start is not the formulas but the question "is this difference distinguishable from noise at all?"',
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
    /* См. комментарий в ru.ts: не повтор хвоста about.audienceNotBody, а ответ на вопрос «что с этим списком делать». */
    extraClosing:
      'The list is not a curriculum: close these gaps one at a time, and when the work runs into them. Otherwise it turns into a permanent "let me prepare first". And the two lists are not equally expensive: what sits next door is learned on top of what you already have, while an adjacent profession is a door you open deliberately.',

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
      'Free mode: any query against the same "Kaiyo Trading" data, with no task, no hints and no reference answer. The schema is one click away; results come as a table or a chart.',
    envLabel: 'Environment',
    envSql: 'SQL',
    envPython: 'Python (pandas)',
    runBtn: 'Run',
    running: 'Running…',
    clearBtn: 'Clear',
    errorTitle: 'Execution failed',
    emptyResult: 'Results will show up here. Hit Run: nothing can break, the data is read-only.',
    disclaimerTitle: 'Nothing here checks your answer',
    disclaimerBody:
      '"The query ran" is not the same as "the number is right". The engine will report a syntax error, but it stays silent when a join has multiplied your rows and tripled the total, or when you have averaged something that was already an average. This is the only place in the trainer where a discrepancy is caught by neither a reference answer nor a writeup: check the result yourself, against the order of magnitude, a control total, a second way of counting.',
    /** См. комментарий в ru.ts: «что тут вообще есть» — вопрос более ранний, чем «что спросить». */
    tablesTitle: 'What tables are here',
    tablesIntro:
      'Where any query starts: what is in the database and what one row of each table stands for. Tap a table to see its columns, its links and three real rows.',
    tableOpenAria: (table: string) => `Open the schema for ${table}`,
    questionsTitle: 'Where to start',
    questionsIntro:
      'Questions analysts genuinely get asked, and every one of them has an answer in this data. Clicking inserts the question into the editor as a comment.',
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
    savedEmpty: 'Empty. A query worth keeping can be saved, and it stays on this device.',
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
      `Tasks completed: ${n}. The skills they touched will come back for review, and the interval depends on how confidently you got them.`,
    moreBtn: 'Another session',
    homeBtn: 'Home',
    prevAria: 'Previous step',
    stepAria: (i: number) => `Step ${i}`,
    /** См. комментарий в ru.ts: возврат на линию вместо главной, когда занятие было миссией. */
    lineBtn: 'Back to the line',
  },
  story: {
    title: 'Story line',
    /** См. комментарий в ru.ts: число стоит в самой ссылке, чтобы «где я» читалось до перехода. */
    entryLink: (current: number, total: number) => `Story line: mission ${current} of ${total} →`,
    entryLinkDone: 'Story line: complete →',
    entryLinkStart: (total: number) => `Story line: ${total} missions to the base →`,
    progressLabel: (current: number, total: number) => `Mission ${current} of ${total}`,
    progressDone: (total: number) => `Line complete: ${total} missions`,
    /** См. комментарий в ru.ts: подпись называет статус, номер уже стоит кружком слева. */
    statusDone: 'Done',
    statusCurrent: 'You are here',
    statusAhead: 'Ahead',
    meta: (tasks: number, minutes: number) => `Tasks: ${tasks} · ~${minutes} min`,
    solvedOf: (solved: number, total: number) => `Solved ${solved} of ${total}`,
    /** См. комментарий в ru.ts: подпись отдельной строкой, чтобы сам итог остался предложением. */
    outcomeLabel: 'What you can do now',
    startBtn: 'Start the mission',
    continueBtn: 'Continue the mission',
    againBtn: 'Run it again',
    /** См. комментарий в ru.ts: порядок здесь рекомендация, а не замок. */
    openBtn: 'Open',
    /** См. комментарий в ru.ts: заголовок называет вопрос, а не действие. */
    openingSummary: 'Where you are and what the company is',
    endingTitle: 'Line complete',
    emptyTrack: 'This track has no tasks yet, so it has no line either. The skill map is worth a look: the graph is already designed.',
  },
  storyMode: {
    headerTitle: 'Story mode',
    badge: 'Early prototype',
    /** См. комментарий в ru.ts: подпись выводится из следующего экрана. */
    next: 'Next',
    toTask: 'Take on the task',
    reflectionTitle: 'Before you move on',
    /** См. комментарий в ru.ts: единица кампании — день. */
    nextMission: 'Next day',
    toBeContinued: 'To be continued',
    finish: 'Home',
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
    runNote: '"Run" just shows the result. Try things: mistakes cost nothing here.',
    /** См. комментарий в ru.ts: показывается на зачтённом задании. */
    solvedRunNote: 'Task passed. You can still change the query and run it: neither the verdict nor the review schedule changes.',
    /** См. комментарий в ru.ts: граница проверки там, где движка нет. */
    checkTextNote:
      'Nothing runs here: your answer is compared with the reference formula as text. Case and extra spaces do not matter.',
    blanksWrongTitle: (n: number) => (n === 1 ? 'One blank does not match' : `${n} blanks do not match`),
    blanksWrongBody: (positions: number[]) =>
      positions.length === 1 ? `Check blank ${positions[0]}.` : `Check blanks: ${positions.join(', ')}.`,
    placeholder: (track: 'sql' | 'model' | 'python' | 'domain'): string =>
      track === 'python' ? 'Write your code…' : 'Write your query…',
    hintWait: (s: number) => `Hint unlocks in ${s}s (try it yourself first)`,
    hintShow: (shown: number, total: number) => `Show hint (${shown} of ${total})`,
    /** Label above the reflexive question, between the diagnosis and the hint button. */
    reflexiveLabel: 'Before you look at the hint',
    correctTitle: 'Correct',
    wrongOptionTitle: 'Not quite',
    wrongOptionBody: 'The breakdown of every option is below.',
    giveUpTitle: "Let's break it down",
    giveUpBody: "Below is the breakdown and the reference solution. The skill will come back for review today, on a different task.",
    giveUpBtn: "Stuck? Show the breakdown",
    explainTitle: 'Breakdown',
    solutionSummary: 'Show reference solution',
    nextBtn: 'Next',
    /** См. комментарии в ru.ts. */
    stepLabel: (n: number, total: number) => `Step ${n} of ${total}`,
    nextStepBtn: 'Next step',
    prevStepBtn: 'Back to the previous step',
    interpretOnReference: 'The calculation did not match, so the interpretation below is about the reference result.',
    interpretLoading: 'Computing the result of the previous step…',
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
    periodLabel: (from: string, to: string) => `Data period: ${periodRange(from, to)}`,
    /** См. комментарий в ru.ts: те же границы без подписи — для паспорта датасета. */
    periodRange,
    sampleCaption: (n: number) => `${n} rows from different parts of the table: what the data looks like in practice`,
  },
  /** См. комментарий в ru.ts: деление на факты и справочники названо словами, а не отдано префиксу имени. */
  data: {
    title: 'Data',
    intro: (tables: number) =>
      `${tables} tables from one fictional distributor. Every track runs on them: a SQL task, a pandas walkthrough and a data-model question all pull the same rows. Open a table to see its columns and three real rows, enough to show the date format, the order of magnitude and where values go missing.`,
    /** См. комментарий в ru.ts: колонка названа первой — их 96, а таблиц двенадцать. */
    searchPlaceholder: 'Search columns and tables…',
    /** См. комментарий в ru.ts: подписи паспорта датасета, без числа таблиц. */
    size: {
      period: 'Data period',
      rows: 'Rows',
      columns: 'Columns',
    },
    searchAria: 'Search the data schema',
    searchFound: (n: number) => `Found ${n} ${n === 1 ? 'table' : 'tables'}`,
    searchEmpty: (query: string) => `Nothing found for "${query}"`,
    tableCount: (n: number) => `${n} ${n === 1 ? 'table' : 'tables'}`,
    incomingLabel: (n: number) => `Referenced by ${n} ${n === 1 ? 'table' : 'tables'}`,
    /** См. довод у mapTitle в ru.ts: подписи колонок здесь, геометрия — в schemaMap.ts. */
    mapTitle: 'How the tables connect',
    mapIntro:
      'An arrow runs from a fact to a lookup: many event rows for one row of description. That is a star, and there is more than one here: several facts sharing the same lookups, which is exactly why sales, shipments and stock line up on the same names. Click a table to open its description below.',
    mapAria: 'Diagram of the links between tables',
    mapFactsLabel: 'Facts',
    mapDimsLabel: 'Lookups',
    mapOpenAria: (table: string) => `Open the description of ${table}`,
    mapLegendStar:
      'A fact points at a lookup, the ordinary link of a star: the event stores the key, the description lives in the lookup and is edited in one place.',
    mapLegendSnowflake:
      'A lookup points at another lookup, a snowflake: an outlet stores the region key, not the region name. The name is still edited in one place, at the cost of one more hop.',
    mapLegendSelf:
      '↻ marks a table pointing at itself: a hierarchy inside a lookup (an outlet has its distributor, a rep has a manager). Such a link does not affect the fact-or-lookup split.',
    mapLegendStandalone:
      'The raw layer stands apart: it has no keys at all, and it can only be joined to the rest once it has been put in order.',
    groups: {
      fact: {
        title: 'Facts: what happened',
        body: 'Events and measurements: a shipment, a sale, stock on hand, a target. One row is one fact, and almost everything in them is numbers and keys. This is where the totals in a report come from; the lookups explain what those totals are about.',
      },
      dimension: {
        title: 'Lookups: who and what',
        body: 'Products, customers, regions, staff, promotions, the calendar. No totals here, only descriptions: a brand name, an outlet city, an opening date. They join onto facts by key, and without them a number has no name.',
      },
      standalone: {
        title: 'Raw layer: before cleaning',
        body: 'An export as it arrived, tied to nothing by keys: dates as text in several formats, numbers with a comma, one chain spelled three ways. This is how data shows up at work, and putting it in order is a skill of its own.',
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
    backspaceAria: 'Erase character',
    digitsAria: 'Digits',
    keyboardShow: 'Show keyboard',
    keyboardHide: 'Hide keyboard',
    /** См. комментарий в ru.ts: видны только на десктопе. */
    tokensShow: 'Show insert panel',
    tokensHide: 'Hide insert panel',
  },
  loadError: {
    title: 'Failed to load data',
    /** См. комментарий в ru.ts: своя фраза вместо служебной метки WORKER_FAILURE. */
    workerBody: 'The engine stopped without reporting a reason. Reloading the page usually clears it.',
    reloadBtn: 'Reload',
  },
  locale: {
    switchAriaLabel: 'Language',
    /** См. комментарий в ru.ts: строка сторожевая, показывается только при частичном переводе пака. */
    partialNote:
      "Part of this track's content is not translated yet: task wording and breakdowns show in Russian. The translation is catching up with the content; the interface itself is fully in English.",
  },
  fontSize: {
    aria: 'Font size: tap to switch',
  },
  theme: {
    aria: (current: 'system' | 'light' | 'dark') =>
      `Theme: ${current === 'system' ? 'system default' : current} (tap to switch)`,
  },
};
