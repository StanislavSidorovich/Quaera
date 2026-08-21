English | [Русский](README.ru.md)

# Quaera — a data analyst trainer

**Open the link and within a minute you're writing a real query against
a fictional distributor's database: hunting for why a brand's sales dropped,
and seeing right away whether your answer matches the data.** Nothing to
install, no sign-up, works on a phone and offline.

**[Open the app → quaera.app](https://quaera.app)**

If "data analytics" doesn't mean much to you yet, start here:
**[What is data analytics](https://quaera.app/?intro)** — a three-minute
walkthrough written without a single professional term.

Technically it's a mobile web app (PWA) for practicing SQL, pandas, data
modeling and analyst judgment on data built to resemble the real thing.
The code actually executes: SQLite and Python (Pyodide) run entirely
in the browser, no server involved.

## Three minutes, depending on who you are

| Who you are | Where to look |
| --- | --- |
| You don't work with data | [What is data analytics](https://quaera.app/?intro) — what the profession is and where it's needed, no jargon |
| You're learning SQL or pandas | [quaera.app](https://quaera.app), SQL track: a 3.5 MB database that boots in seconds and then runs offline |
| You're an analyst — or hiring one | [Kaiyo Trading: three findings and what they cost](docs/analysis/kaiyo-trading.en.md) — a dataset write-up styled as an analyst's actual work product |
| You're here for the code | [How it's built](#how-its-built) below and [ROADMAP.md](ROADMAP.md): what's checked automatically by a gate and what still needs manual review |

![Home screen: the "Analyst's work week" campaign, four tracks, a recommended starting point](docs/screenshots/01-home.png)

## What's inside

**Four tracks — 248 tasks and 71 skills.** Fully populated, reviewed
and translated to English: interface, tasks, technique cards.

| Track | Tasks | Skills | How the answer is checked |
| --- | --- | --- | --- |
| SQL for analysts | 76 | 18 | The query runs against SQLite (sql.js) |
| Analytics as a profession | 66 | 20 | Multiple choice with a full explanation (`predict`) |
| Data model and BI | 63 | 19 | Multiple choice with a full explanation (`predict`) |
| pandas for analysts | 43 | 14 | The code runs in Python (Pyodide) |

**Story mode — an analyst's work week.** Two five-day weeks: a client
brings a question in the morning, you bring back a finding by evening.
SQL techniques are introduced exactly where the work needs them, not
in a syllabus order. Marked in the app as an early prototype — the story
is complete for SQL, the other tracks haven't been carried into it yet.

![Story mode: Monday of the first week, a brief from the sales director](docs/screenshots/03-story.png)

**A technique card sits right before the first task on a new skill**,
rather than a lesson you read ahead of time: the notation, a worked example
on the distributor's data, a common mistake.

![Technique card: notation, example, common mistake](docs/screenshots/02-lesson.png)

Beyond the tracks, the app also has:

- **A technique reference** — every card on its own screen, with an example
  you can run right there without opening a task;
- **A sandbox** — free-form mode on the same data: any query, no task and
  no hints, with a list of starter questions next to it if you're not sure
  what to ask;
- **A data screen** — a schema of 12 tables with grain and row counts
  computed from the real dataset, not typed in by hand;
- **Spaced repetition and reminders** — an interval scheduler and a push
  notification when it's time to revisit a topic;
- **Sync — opt-in.** Without signing in, progress lives in the browser and
  there isn't a single row about you on any server; signing in exists for
  exactly one purpose — carrying progress to a second device.

There's also a separate screen for anyone who knows nothing about this
profession: what companies actually do with data, why that needs dedicated
tools, and where this kind of work happens. You can send the link to someone
you know without explaining anything out loud first.

![Walkthrough "What is data analytics": the area map and the first block](docs/screenshots/08-intro.png)

## What sets it apart from other trainers

Not the number of exercises — four specific things.

**1. One connected dataset instead of textbook tables.** A fictional FMCG
and OTC-pharma distributor, "Kaiyo Trading" — a star schema of 12 tables,
156 thousand rows over two and a half years. The data is internally
consistent: sell-out rolls up into sell-in, sell-in minus sell-out gives
stock, plans are built from actuals. All four tracks run on the same
numbers — a brand losing distribution gets worked through as a query,
a dataframe, a DAX measure and a written argument, and the answers have
to agree.

**2. Diagnosis instead of a verdict.** The answer is compared by its
result, not by the text of the query, and the shape of the mismatch
reconstructs the likely cause: a join fanning out rows, a dropped date
filter, `INNER` where `LEFT` was needed, a missing `ORDER BY`, a typo
in a column name.

<table>
<tr>
<td width="50%">

**A task is a real query against a real database.** A prompt, an editor
with a token panel sized for a thumb, a "Table / Chart" toggle on
the result.

![Task screen: prompt, SQL editor, result as a table](docs/screenshots/04-task-run.png)

</td>
<td width="50%">

**The same result — as a chart.** The toggle only appears where a chart
would be honest (see "How it's built" → `chartSpec`), not everywhere.

![The same result as a chart — horizontal bars by price](docs/screenshots/05-task-chart.png)

</td>
</tr>
<tr>
<td width="50%">

**Checked by execution, not by text.** Any query that returns the same
result is accepted; the answer is verified against the data it actually
returned.

![Task solved: a green "Correct" panel next to the editor](docs/screenshots/06-task-solved.png)

</td>
<td width="50%">

**The data schema is live numbers, not prose.** Grain and row count for
every table are computed from the real dataset, not written by hand.

![Data schema: distributor tables with grain and row counts](docs/screenshots/07-schema.png)

</td>
</tr>
</table>

**3. Every claim has a source.** Numbers a task quotes in its prose
(predicting a query's result, a business metric in `domain`, a measure's
value in `model`) are checked against the dataset ahead of time and
protected by a dedicated build-time gate — see "Stories in the data" below.

**4. The code runs on a phone.** SQLite and pandas run in a Web Worker
right in the browser, offline included, no server — usually a limitation
of desktop-only tools.

## Stories in the data

Tasks are built on planted situations, not random numbers:

- the "Nettora" brand's sales are cut in half — not because of demand
  and not because of price, but because more than half its outlets
  stopped carrying it;
- distributor "Setouchi Trading" overstocked in Q4 2025: the sell-in
  to sell-out ratio spiked from a normal 1.04 to 2.44 and returned
  to normal within two quarters — but warehouse stock rose fivefold
  and never came back down: the flow recovered, the level didn't
  (flow vs. stock, `dom-021`);
- seasonality pulling in opposite directions: water in summer, vitamins
  and fever reducers in winter — the same month-over-month transition
  reads as +316%, +36% or +3.2% depending purely on which base you
  compare against (`dom-025`);
- a systematic planning skew: only 3–7 of 25 sales reps hit their revenue
  target each month of the half-year — the distribution reveals a quota
  defect invisible in the average percentage (`dom-022`);
- "Vitanor Forte" launches in September 2025 with a gradual distribution
  rollout;
- a missing row in `fact_sellout` means "wasn't sold," not zero;
- `staging_raw_sellout` is a raw layer with duplicates, NULLs, dates in
  four different formats and one chain spelled two different ways;
- one date playing two roles: order date and ship date in `fact_sellin`
  diverge by 2–11 days, and 1,979 of 15,362 orders ship into the following
  month — exactly the case where a data model needs one active and one
  inactive relationship to the same calendar, not two (`mdl-031`, `mdl-032`).

Three of these are worked all the way through in one document —
**[Kaiyo Trading: three findings and what they cost](docs/analysis/kaiyo-trading.en.md)**.
The app shows how to ask data questions; this write-up shows how they get
answered: question → what the data showed → what it means → what to do →
what it costs, with alternative explanations checked and a dollar figure
on each finding.

`npm run verify:data` checks that all of these are still there: if a change
to the generator kills a story, the tasks' reference answers would silently
drift from reality. For numbers a task quotes in its prose (not just in
an executable reference answer — that's how every task in `domain` and
`model` is built), `verify-content.mjs` has a dedicated check per task:
the gate verifies not just "the query runs" but "the text still matches
the database."

---

What follows is for people looking at the code: how to run it locally,
what it's built from, how deployment works, and how to add a task.

## Running it

```bash
npm install && npm run prepare:assets && npm run dev
```

`prepare:assets` copies the sql.js and Pyodide runtimes, draws the icons
and generates the dataset — the app won't start without it. You can open
it from your phone at the address Vite prints (`--host` is on), and add
it to the home screen from there.

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Type check, production build, service worker |
| `npm run gen:data` | Rebuild the dataset |
| `npm run verify` | All 14 gates: dataset, content, spaced-repetition scheduler, progress merge, chart rules, schema layout, English prose, text-based diff for DAX, storage migration, cross-check between the two executors, push-notification schedule, CSS column widths, the story line, and the story-mode ladder |

### If you fork it: account and sync

Google sign-in and progress sync run on Supabase. The publishable key
and project URL sit in the code in plain sight (`src/sync/client.ts`) —
that's not an oversight: a key like that ends up in the bundle no matter
how you store it, and the actual protection is RLS
(`supabase/migrations/0001_progress.sql`, access limited to rows matching
your own `auth.uid()`).

**A fork needs to replace both constants with its own**, otherwise
a copy of the app would write into the original author's database.
There's also an account-deletion button that calls a `delete-account`
Edge Function **not included in this repository** — it needs
a `service_role` key, which can't go in a browser, and was deployed
through the Supabase dashboard editor instead. Everything else works
without it; account deletion doesn't.

## How it's built

```
scripts/build-dataset.mjs   dataset generator (deterministic seed)
scripts/verify-dataset.mjs  checks that the stories in the data are still there
scripts/verify-content.mjs  checks that every reference answer actually runs
public/sql-worker.js        SQLite in a Web Worker: execution and diff against the reference
public/python-worker.js     Pyodide+pandas in a Web Worker, same contract
public/sw.js                offline cache
src/engine/                 worker clients, types, error diagnosis
src/content/                content types, task packs and their translations (JSON)
src/i18n/                   interface strings (ru/en) — separate from content
src/srs/                    spaced-repetition scheduler and local progress
src/ui/                     mobile components
```

Three decisions everything else rests on:

**Content is data, not code.** A task is a JSON object. The app is a
player: it knows nothing about any specific task. The same format works
for tracks with an executor (`sql`, `python` — the reference answer is
checked by running it) and for tracks without one (`domain`, `model` —
the only allowed mode is `predict`, a multiple-choice answer with a full
explanation). A pack can grow without a new app release.

**Verification by execution.** Wherever there's an executor, the query
or code runs against the real database and the resulting sets are compared,
not the text of the solution. Any correct solution is accepted, and
a mismatch becomes material for a substantive hint.

**The repetition interval belongs to the skill, not the task.** Someone
who solved the "top-3 SKU" task didn't learn that task — they learned
"window function in a CTE, filter applied outside it." What needs
repeating is the technique, ideally on a different task, or you end up
training recall of the prompt's wording instead.

### Why a PWA and not a native app

The only setup where SQLite (sql.js) and Python with pandas (Pyodide)
coexist in one app — both running entirely in the browser, no server.
Plus install-to-home-screen with no app stores and instant updates.
Wrapping it in Capacitor for the stores later is possible without
a rewrite.

### Why the dataset is 12 MB

3.5 MB (gzip) goes over the network, once, and after that it's served
from the service worker's cache. A smaller dataset wouldn't let tasks
resemble real work: at a thousand rows you can't see seasonality, or
the difference between `COUNT(*)` and `COUNT(DISTINCT)`.

The file is named `quaera.dataset`, not `*.gz`, even though it's gzip
inside. Download managers (IDM, FDM) intercept known archive extensions
and the page gets an empty response instead of the data. Compression is
detected from the byte signature, so the file name doesn't matter — and
it also removes any dependency on whether the host sets a
`Content-Encoding` header.

### Why Pyodide loads only after consent

The Python runtime with pandas weighs around 52 MB — an order of
magnitude more than the dataset. The `pandas` track shows a consent
screen before the first download and explains the cost; declining still
leaves the skill map and reference usable without it. SQL and the other
tracks never show this screen.

## Deployment

Hosted on Cloudflare Pages, connected to this repository. Build settings:

| Setting | Value |
| --- | --- |
| Build command | `npm run prepare:assets && npm run build` |
| Build output directory | `dist` |
| Node version | from `.node-version` |

The dataset isn't stored in the repository — it's generated at build time
from `scripts/build-dataset.mjs` with a fixed seed, so the hosted build
ends up byte-identical. Cloudflare picks up `_headers` and `_redirects`
from `public/` on its own. Deploys are automatic on every push to `main`.

The service worker only registers in a production build, so offline mode
needs to be checked on the live site or via
`npm run build && npm run preview`, not `npm run dev`.

## Adding a task

Add an object to the relevant track's pack
(`src/content/packs/<track>-core.json`) and run `npm run verify:content`.
The check rejects a task whose reference answer doesn't run, returns
nothing, has an unaliased column, needs a sort but has no `ORDER BY`,
or points at a skill that doesn't exist. A task in `predict` mode needs
exactly one correct option, and every option needs an explanation of why
it's chosen (or not).

Tracks without a code executor (`domain`, `model`) only run in `predict`
mode: instead of `predictSql` they have a `scenario` field — a business
situation instead of a query or a ready-made measure, and the gate
requires exactly one of the two. A pack can be filled in partially: a
theory card and the gate check are only required for skills that already
have at least one task, not for the whole graph at once — so a track can
be built in batches without holding back topics that are already done.

**English translation** lives in a parallel file (`sql-core.json` →
`sql-core.en.json`), not as fields inside each task — that way translation
doesn't immediately double the cost of every content batch. It's merged
by id over the Russian pack at runtime (`applyTranslation` in
`src/content/index.ts`); untranslated tasks stay in Russian instead of
breaking the build. Code — `solution`, `predictSql`, `starter`,
`template` — is never translated or duplicated: it's already executable
text checked by the gate, including the dataset's Cyrillic values (brand
names, cities), which are the same in either locale.

## Author and license

Stanislav Sidorovich —
[LinkedIn](https://www.linkedin.com/in/stanislavsidorovich).
A wrong task, a disagreement with an explanation, or a question about
the code can go in [issues](https://github.com/StanislavSidorovich/Quaera/issues).

Code (`src/`, `scripts/`, configs) — [Apache-2.0](LICENSE).

Learning content — the task packs and theory cards in
`src/content/packs/` (business framing, task text, answer explanations) —
is separate, under [CC BY-NC-SA 4.0](LICENSE-CONTENT): attribution
required, commercial use prohibited, derivatives under the same license.
The split exists because the project's actual value isn't the code that
plays the tasks — it's the stories and write-ups built on the dataset.

Third-party software bundled into the app or served to the browser
(React, sql.js, Pyodide and the packages it loads — numpy, pandas, the
CPython stdlib) is listed with its licenses in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## What's next

The content is fully built out — tasks and translation both. Sandbox,
DAX in fill-in mode, progress sync, story mode, and the walkthrough for
people outside the profession are all done too. The work ahead isn't
about filling empty branches of the skill graph — it's about depth:

- **Real people going through it.** So far only the author has completed
  the app. This is the top of the queue, ahead of any new feature —
  where someone gets stuck only shows up by watching someone get stuck.
  A note on a task, a disagreement with an explanation, or where you gave
  up — all welcome in
  [issues](https://github.com/StanislavSidorovich/Quaera/issues).
- **Statistics for analysts** — significance, confidence intervals,
  outliers, A/B testing: a gap none of the tracks currently cover.
- **A capstone** — an end-to-end case from a business question to
  a recommendation. The engine already has a multi-step task type, but
  steps don't yet pass state to each other, and a capstone needs exactly
  that.
- **Story-mode prose for the other three tracks** — the story line itself
  is already derived and working for them; only the writing is missing.

The order, scope and reasoning behind each of these live in
[ROADMAP.md](ROADMAP.md), along with a section on what's checked
automatically by a gate versus what needs manual expertise and can't be
done in large batches, and a section on which suggestions from outside
reviews were deliberately declined, and why.
