/**
 * Импорт записей из WAV в public/voice (озвучка диалогов, пачка 2026-11-17).
 *
 *   node scripts/import-voice-wav.mjs <папка с wav> <dialogs-en.md> [--dry-run]
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
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LOCALE, MAX_CLIP_BYTES, clipFile, dialogLines, manifestPath, spokenText, voiceDir } from './lib/voice-lines.mjs';

const [dir, listPath, ...rest] = process.argv.slice(2);
const dryRun = rest.includes('--dry-run');
if (!dir || !listPath) {
  console.error('usage: import-voice-wav.mjs <wav dir> <dialogs-en.md> [--dry-run]');
  process.exit(1);
}

// Список записи: имя -> { id, text }
const md = await readFile(listPath, 'utf8');
const list = new Map();
for (const block of md.split(/^### /m).slice(1)) {
  const name = block.split('\n', 1)[0].trim();
  const id = /Manifest id: `([^`]+)`/.exec(block)?.[1];
  const text = block.split('\n').filter((l) => l.startsWith('"')).join(' ');
  if (id) list.set(name, { id, text: spokenText(text) });
}

const lines = await dialogLines();
const byKey = new Map(lines.map((l) => [l.key, l]));
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const files = (await readdir(dir)).filter((f) => f.endsWith('.wav')).sort();

const ff = (args) => spawnSync('ffmpeg', ['-hide_banner', '-nostdin', '-y', ...args], { encoding: 'utf8' });
const report = { ok: [], skipped: [], changed: [], unmapped: [], rate: [] };
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
  if (speaker !== line.speaker) { report.unmapped.push(`${f}: говорящий в имени ${speaker}, в кампании ${line.speaker}`); continue; }
  if (info.text !== line.text) { report.changed.push(`${f}: текст изменён с момента списка`); continue; }
  const vol = ff(['-i', path.join(dir, f), '-af', 'volumedetect', '-f', 'null', '-']).stderr;
  const max = /max_volume: (-?[\d.]+|-inf) dB/.exec(vol)?.[1];
  if (!max || max === '-inf' || Number(max) < -50) { report.skipped.push(`${f}: пустой или беззвучный (max ${max})`); continue; }
  const rel = clipFile(line, 'm4a');
  const out = path.join(voiceDir, rel);
  await mkdir(path.dirname(out), { recursive: true });
  const trim = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08';
  const r = ff(['-i', path.join(dir, f), '-af', `${trim},areverse,${trim},areverse`, '-ac', '1', '-ar', '24000', '-c:a', 'aac', '-b:a', '36k', '-movflags', '+faststart', out]);
  if (r.status !== 0) { report.skipped.push(`${f}: ffmpeg ${r.stderr.slice(-200)}`); continue; }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size', '-of', 'csv=p=0', out], { encoding: 'utf8' }).stdout.trim().split(',');
  const duration = Math.round(Number(probe[0]) * 10) / 10;
  const size = Number(probe[1]);
  if (size > MAX_CLIP_BYTES) { report.skipped.push(`${f}: ${size} байт больше предела`); continue; }
  const words = line.text.split(/\s+/).length;
  const spw = Number(probe[0]) / words;
  if (spw < 0.2 || spw > 1) report.rate.push(`${f}: ${spw.toFixed(2)} с/слово (${words} слов, ${duration} с)`);
  manifest.clips[line.key] = { speaker: line.speaker, voice: 'gemini', hash: line.hash, chars: line.chars, file: rel, bytes: size, duration };
  bytes += size;
  report.ok.push(`${f} -> ${rel} ${size} Б ${duration} с ${spw.toFixed(2)} с/сл`);
}

const lack = lines.filter((l) => l.kind !== 'brief' && !manifest.clips[l.key]).map((l) => l.key);
if (!dryRun) {
  const sorted = Object.fromEntries(Object.entries(manifest.clips).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, clips: sorted }, null, 2) + '\n', 'utf8');
}
console.log(report.ok.join('\n'));
for (const k of ['skipped', 'changed', 'unmapped', 'rate']) console.log(`\n${k}: ${report[k].length}\n${report[k].join('\n')}`);
console.log(`\nготово ${report.ok.length}, добавлено ${bytes} Б (${(bytes / 1048576).toFixed(2)} МБ)`);
console.log(`реплик диалогов без записи: ${lack.length}${lack.length ? '\n' + lack.join('\n') : ''}`);
console.log(`(язык ${LOCALE}; ${dryRun ? 'dry-run: манифест не записан' : 'манифест записан'})`);
