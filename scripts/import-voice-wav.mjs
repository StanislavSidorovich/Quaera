/**
 * Импорт записей из WAV в public/voice (озвучка диалогов, пачка 2026-11-17).
 *
 *   node scripts/import-voice-wav.mjs <папка с wav> <dialogs-en.md> [--dry-run]
 *   node scripts/import-voice-wav.mjs <папка с wav> <briefs-ru-*.md> --locale ru [--dry-run]
 *
 * Русский режим (--locale ru, брифы дней 1–5 и следующие пачки): имя файла
 * `<говорящий>-<день>-<номер>-ru.wav`, список `## <имя>` с текстом под ним
 * (shots/voice/briefs-ru-*.md). Миссия — `day-<день>-*` кампании ru, слот
 * `m<номер-1>`. Файл без пары в списке, запись списка без файла, текст,
 * изменённый с момента списка, и файл больше лимита названы по имени; ненулевой
 * код выхода, если хоть что-то не встало. Повторный импорт перезаписывает ту же
 * запись по ключу (дублей нет), старый файл при смене хеша удаляется.
 * Записи ru лежат в манифесте в `locales.ru.clips`, файлы в public/voice/ru/.
 *
 * Имя файла `<говорящий>-<день>-<слот>-en.wav`; слот `a<шаг>` или `i<шаг>-<n>`
 * (в манифесте `a<шаг>`, `i<шаг>.<n>`). Миссию берём из строки «Manifest id»
 * списка записи (день в имени не однозначен: дни и миссии идут не 1:1).
 * Конвертация как у брифов: AAC m4a, 24 кГц, моно, 36 кбит/с, +faststart,
 * тишина по краям обрезана (оставлено 0,08 с). Текст реплики берётся из
 * текущей кампании; если он отличается от списка, файл помечается и не
 * импортируется. Пустые и беззвучные файлы пропускаются.
 * Отчёт: секунды на слово (меньше 0,2 или больше 1: подозрительно).
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_CLIP_BYTES, clipFile, clipsOf, dialogLines, manifestPath, spokenText, voiceDir } from './lib/voice-lines.mjs';

const [dir, listPath, ...rest] = process.argv.slice(2);
const dryRun = rest.includes('--dry-run');
const li = rest.indexOf('--locale');
const LOCALE = li >= 0 ? rest[li + 1] : 'en';
if (!dir || !listPath || !['en', 'ru'].includes(LOCALE)) {
  console.error('usage: import-voice-wav.mjs <wav dir> <list.md> [--locale en|ru] [--dry-run]');
  process.exit(1);
}

// Список записи: имя -> { id, text }
const md = await readFile(listPath, 'utf8');
const list = new Map();
const lines = await dialogLines(LOCALE);
const byKey = new Map(lines.map((l) => [l.key, l]));
const report = { ok: [], skipped: [], changed: [], unmapped: [], rate: [] };
if (LOCALE === 'ru') {
  // `## aoki-01-01-ru`, затем строка «Подпись (N зн.)» и текст до следующего заголовка
  for (const block of md.split(/^## /m).slice(1)) {
    const [head, ...body] = block.split('\n');
    const name = head.trim();
    if (!/-ru$/.test(name)) continue; // прозаические разделы списка (голоса, правила чтения)
    const m = /^(?<sp>[a-z]+)-(?<day>\d+)-(?<n>\d+)-ru$/.exec(name);
    if (!m) { report.unmapped.push(`список: заголовок «${name}» не вида <говорящий>-<день>-<номер>-ru`); continue; }
    const rows = body.filter((l) => l.trim() && !/^---+$/.test(l.trim()));
    const text = rows.filter((l) => !/\(\d+ зн\.\)\s*$/.test(l)).join(' ');
    const day = Number(m.groups.day);
    const mission = [...new Set(lines.map((l) => l.mission))].find((id) => id.startsWith(`day-${day}-`));
    if (!mission) { report.unmapped.push(`список ${name}: в кампании ru нет миссии дня ${day}`); continue; }
    list.set(name, { id: `${mission}/m${Number(m.groups.n) - 1}`, text: spokenText(text) });
  }
} else {
  for (const block of md.split(/^### /m).slice(1)) {
    const name = block.split('\n', 1)[0].trim();
    const id = /Manifest id: `([^`]+)`/.exec(block)?.[1];
    const text = block.split('\n').filter((l) => l.startsWith('"')).join(' ');
    if (id) list.set(name, { id, text: spokenText(text) });
  }
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const clips = clipsOf(manifest, LOCALE);
const files = (await readdir(dir)).filter((f) => f.endsWith('.wav')).sort();

const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8' });
const seen = new Set();
let bytes = 0;

for (const f of files) {
  const name = f.replace(/\.wav$/, '');
  const info = list.get(name);
  if (!info) { report.unmapped.push(`${f}: нет в списке записи`); continue; }
  const line = byKey.get(info.id);
  if (!line) { report.unmapped.push(`${f}: ${info.id} нет в кампании`); continue; }
  if (seen.has(info.id)) { report.unmapped.push(`${f}: дубль ${info.id}`); continue; }
  seen.add(info.id);
  const speaker = name.split('-')[0];
  if (name.endsWith('-ru') === false && LOCALE === 'ru') { report.unmapped.push(`${f}: имя не вида <говорящий>-<день>-<номер>-ru`); continue; }
  if (speaker !== line.speaker) { report.unmapped.push(`${f}: говорящий в имени ${speaker}, в кампании ${line.speaker}`); continue; }
  if (info.text !== line.text) { report.changed.push(`${f}: текст изменён с момента списка`); continue; }
  const vol = ff(['-i', path.join(dir, f), '-af', 'volumedetect', '-f', 'null', '-']).stderr;
  const max = /max_volume: (-?[\d.]+|-inf) dB/.exec(vol)?.[1];
  if (!max || max === '-inf' || Number(max) < -50) { report.skipped.push(`${f}: пустой или беззвучный (max ${max})`); continue; }
  const rel = clipFile(line, 'm4a');
  const prevFile = clips[line.key]?.file;
  const out = path.join(voiceDir, rel);
  await mkdir(path.dirname(out), { recursive: true });
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08';
  const r = ff(['-i', path.join(dir, f), '-af', `${trim},areverse,${trim},areverse`, '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '36k', '-movflags', '+faststart', out]);
  if (r.status !== 0) { report.skipped.push(`${f}: ffmpeg ${r.stderr.slice(-200)}`); continue; }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim().split(',');
  const duration = Math.round(Number(probe[0]) * 10) / 10;
  const size = Number(probe[1]);
  if (size > MAX_CLIP_BYTES) {
    await rm(out, { force: true });
    report.skipped.push(`${f}: ${size} байт больше предела ${MAX_CLIP_BYTES}`);
    continue;
  }
  const words = line.text.split(/\s+/).length;
  const spw = Number(probe[0]) / words;
  if (spw < 0.2 || spw > 1) report.rate.push(`${f}: ${spw.toFixed(2)} с/слово (${words} слов, ${duration} с)`);
  if (prevFile && prevFile !== rel) await rm(path.join(voiceDir, prevFile), { force: true }); // текст сменился: старый файл с другим хешем не оставляем
  clips[line.key] = { speaker: line.speaker, voice: 'gemini', hash: line.hash, chars: line.chars, file: rel, bytes: size, duration };
  bytes += size;
  report.ok.push(`${f} -> ${rel} ${size} Б ${duration} с ${spw.toFixed(2)} с/сл`);
}

// запись списка без файла: говорим какая (в русском режиме)
const haveWav = new Set(files.map((f) => f.replace(/\.wav$/, '')));
const noFile = LOCALE === 'ru' ? [...list.keys()].filter((n) => !haveWav.has(n)) : [];
for (const n of noFile) report.unmapped.push(`${n}: в списке есть, wav-файла нет`);
const lack = lines.filter((l) => l.kind !== 'brief' && !clips[l.key]).map((l) => l.key);
if (!dryRun) {
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  if (LOCALE === 'en') manifest.clips = sortObj(manifest.clips);
  else manifest.locales[LOCALE].clips = sortObj(manifest.locales[LOCALE].clips);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}
console.log(report.ok.join('\n'));
for (const k of ['skipped', 'changed', 'unmapped', 'rate']) console.log(`\n${k}: ${report[k].length}\n${report[k].join('\n')}`);
console.log(`\nготово ${report.ok.length}, добавлено ${bytes} Б (${(bytes / 1048576).toFixed(2)} МБ)`);
console.log(`реплик диалогов без записи: ${lack.length}${lack.length ? '\n' + lack.join('\n') : ''}`);
console.log(`(язык ${LOCALE}; ${dryRun ? 'dry-run: манифест не записан' : 'манифест записан'})`);
const problems = report.skipped.length + report.changed.length + report.unmapped.length;
if (LOCALE === 'ru' && problems) {
  console.error(`\n${problems} файлов или записей списка не встали (см. выше)`);
  process.exitCode = 1;
}
