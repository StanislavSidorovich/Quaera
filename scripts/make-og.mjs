// Draws the link-preview cards (og:image / twitter:image, 1200x630 PNG) for all five Quaera apps
// in the shared family look: IBM Plex Sans, --q-* neutrals, the app accent, the mark from family/marks/.
//
//   node scripts/make-og.mjs            # all five
//   node scripts/make-og.mjs lab flow   # only these
//
// It writes into the sibling repositories (../lab, ../model, ../flow, ../pandas) as well as into this one,
// and renders with headless Edge or Chrome (no npm dependency). It is NOT part of prepare:assets:
// the PNGs are committed, so the Cloudflare build never needs a browser. After redrawing the quaera card,
// bump the ?v= in index.html (social networks cache a preview by its URL).
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const family = path.join(root, 'family')
const sibling = (name) => path.resolve(root, '..', name)

// BG/SURFACE/LINE/TEXT/MUTED are the light --q-* values from family/tokens.css.
const Q = { bg: '#f6f7f9', line: '#e3e6eb', text: '#1d2330', muted: '#6b7385' }

const APPS = [
  { id: 'quaera', name: '', accent: '#2563eb', host: 'quaera.app', line: 'Practise SQL, pandas and DAX on a realistic business dataset. It runs in your browser.', out: path.join(root, 'public/icons/og.png') },
  { id: 'lab', name: 'Lab', accent: '#15803d', host: 'lab.quaera.app', line: 'Query your own CSV and Excel files with SQL in the browser.', out: path.join(sibling('lab'), 'public/og-image.png') },
  { id: 'model', name: 'Model', accent: '#c2410c', host: 'model.quaera.app', line: 'Practise data modeling: from concept to tables to SQL.', out: path.join(sibling('model'), 'public/og-image.png') },
  { id: 'flow', name: 'Flow', accent: '#0f766e', host: 'flow.quaera.app', line: 'Model business processes in BPMN 2.0, in the browser.', out: path.join(sibling('flow'), 'public/og-image.png') },
  { id: 'pandas', name: 'Pandas', accent: '#7c3aed', host: 'pandas.quaera.app', line: '137 auto-checked pandas tasks in one Colab notebook.', out: path.join(sibling('pandas'), 'docs/og.png') },
]

const mark = (id) => readFileSync(path.join(family, 'marks', `${id}.svg`), 'utf8')
const font = pathToFileURL(path.join(family, 'fonts', 'ibm-plex-sans-latin-wght-normal.woff2')).href
const monoFont = pathToFileURL(path.join(family, 'fonts', 'ibm-plex-mono-latin-400-normal.woff2')).href

function html(app) {
  const tiles = APPS.map((a) => `<div class="tile${a.id === app.id ? ' on' : ''}">${mark(a.id)}</div>`).join('')
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:Plex;src:url(${font});font-weight:100 700}
@font-face{font-family:PlexMono;src:url(${monoFont});font-weight:400}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:${Q.bg};font-family:Plex,sans-serif;color:${Q.text};position:relative;overflow:hidden}
.bar{position:absolute;left:0;right:0;bottom:0;height:18px;background:${app.accent}}
.brand{position:absolute;left:88px;top:78px;display:flex;align-items:center;gap:26px}
.brand svg{width:96px;height:96px;display:block}
.brand b{font-size:60px;font-weight:600;letter-spacing:-.01em}
.brand b i{font-style:normal;color:${app.accent}}
h1{position:absolute;left:88px;top:232px;width:1000px;font-size:70px;line-height:1.14;font-weight:600;letter-spacing:-.015em}
.host{position:absolute;left:88px;bottom:70px;font-family:PlexMono,monospace;font-size:30px;color:${Q.muted}}
.host u{text-decoration:none;color:${app.accent}}
.fam{position:absolute;right:88px;bottom:62px;display:flex;gap:14px}
.tile{width:52px;height:52px;opacity:.32}
.tile.on{opacity:1}
.tile svg{width:100%;height:100%;display:block}
</style>
<div class="brand">${mark(app.id)}<b>Quaera${app.name ? ` <i>${app.name}</i>` : ''}</b></div>
<h1>${app.line}</h1>
<div class="host"><u>${app.host}</u></div>
<div class="fam">${tiles}</div>
<div class="bar"></div>`
}

function findBrowser() {
  const candidates = [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ]
  const found = candidates.find((p) => existsSync(p))
  if (!found) throw new Error('No Edge/Chrome found: set one of the paths in findBrowser()')
  return found
}

const only = process.argv.slice(2)
const browser = findBrowser()
const tmp = path.join(tmpdir(), `quaera-og-${process.pid}`)
mkdirSync(tmp, { recursive: true })
for (const app of APPS.filter((a) => !only.length || only.includes(a.id))) {
  const page = path.join(tmp, `${app.id}.html`)
  writeFileSync(page, html(app))
  rmSync(app.out, { force: true }) // so the wait below cannot mistake the old card for the new one
  execFileSync(browser, ['--headless', '--disable-gpu', `--user-data-dir=${path.join(tmp, 'profile-' + app.id)}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--window-size=1200,630', `--screenshot=${app.out}`, '--virtual-time-budget=3000', pathToFileURL(page).href], { stdio: 'ignore' })
  for (let i = 0; i < 20 && !existsSync(app.out); i++) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500) // Edge may still be flushing
  if (!existsSync(app.out)) throw new Error(`no screenshot written for ${app.id}`)
  console.log(`og: ${path.relative(path.resolve(root, '..'), app.out)}`)
}
try { rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }) } catch {} // Edge may still hold its profile
