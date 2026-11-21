/**
 * Гейт озвучки (public/voice/manifest.json).
 *
 * Записи лежат отдельными файлами и привязаны к тексту реплики хешем. Правка
 * реплики без перегенерации молча оставила бы голос, который рассказывает не
 * то, что написано, ровно как число в прозе без проверки. Поэтому гейт
 * сверяет манифест с текущим текстом `storymode.ts` теми же функциями, что и
 * scripts/gen-voice.mjs (scripts/lib/voice-lines.mjs).
 *
 * Пустой манифест проходит: пока озвучка не сгенерирована, приложение читает
 * реплики голосом браузера. Для каждой записи: ключ есть среди реплик пилота,
 * хеш совпадает с текущим текстом, говорящий совпадает, файл существует,
 * лежит по пути с этим хешем и не больше 400 КБ; лишних файлов в public/voice
 * нет. Отдельно: у всех реплик пилота `speaker` задан и совпадает с тем, что
 * вывела бы `speakerId` из подписи `from`.
 *
 * Запуск: npm run test:voice-manifest (входит в npm run verify).
 */
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { LOCALES, MAX_CLIP_BYTES, clipsOf, dialogLines, manifestPath, pilotLines, voiceDir } from './lib/voice-lines.mjs';

let failed = 0;
const fail = (name, msg) => {
  console.log(` FAIL  ${name}: ${msg}`);
  failed++;
};
const ok = (name, msg) => console.log(` ok    ${name}${msg ? `: ${msg}` : ''}`);
const check = (name, cond, msg) => (cond ? ok(name) : fail(name, msg));

let manifest;
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch (e) {
  fail('манифест читается', `${manifestPath}: ${e.message}`);
  process.exit(1);
}
check('манифест: version 1, есть clips', manifest.version === 1 && manifest.clips && typeof manifest.clips === 'object', 'ожидается { version: 1, clips: {} }');

const lines = await pilotLines();
const dialogs = await dialogLines();
const byKey = new Map(dialogs.map((l) => [l.key, l]));
const unknown = dialogs.filter((l) => l.speaker === 'narrator' || l.speaker !== l.speakerFromLabel);
check(
  `у всех ${dialogs.length} диалоговых реплик EN известный говорящий (не рассказчик, speaker совпадает с подписью)`,
  dialogs.length > 0 && unknown.length === 0,
  unknown.map((l) => `${l.key}: «${l.from}» -> ${l.speaker}`).join('; '),
);
check('реплики пилота найдены', lines.length > 0, 'pilotLines() вернул пустой список');
check(
  'speaker реплик пилота совпадает с speakerId(from)',
  lines.every((l) => l.speaker === l.speakerFromLabel),
  lines
    .filter((l) => l.speaker !== l.speakerFromLabel)
    .map((l) => `${l.key}: ${l.speaker} против ${l.speakerFromLabel}`)
    .join('; '),
);

const referenced = new Set();
let total = 0;
for (const locale of LOCALES) {
  const clips = clipsOf(manifest, locale);
  const lang = locale.toUpperCase();
  const ldialogs = locale === 'en' ? dialogs : await dialogLines(locale);
  const lpilot = locale === 'en' ? lines : await pilotLines(locale);
  const lkeys = new Map(ldialogs.map((l) => [l.key, l]));
  if (locale !== 'en') {
    check(`реплики пилота ${lang} найдены, speaker совпадает с speakerId(from)`, lpilot.length > 0 && lpilot.every((l) => l.speaker === l.speakerFromLabel && l.speaker !== 'narrator'), lpilot.filter((l) => l.speaker !== l.speakerFromLabel).map((l) => `${l.key}: ${l.speaker} против ${l.speakerFromLabel}`).join('; ') || 'пусто');
  }
  for (const [key, clip] of Object.entries(clips)) {
    total++;
    const line = lkeys.get(key);
    if (!line) {
      fail(`запись ${lang} ${key}`, 'такой реплики нет среди диалогов кампании (убрана или переименована)');
      continue;
    }
    const problems = [];
    if (clip.hash !== line.hash) problems.push(`хеш ${clip.hash} не совпадает с текстом (${line.hash}): текст реплики изменён, запись надо сделать заново`);
    if (clip.speaker !== line.speaker) problems.push(`говорящий ${clip.speaker}, в данных ${line.speaker}`);
    if (!clip.file || !clip.file.includes(`.${line.hash}.`)) problems.push('в имени файла нет хеша текста');
    if (clip.file && !clip.file.startsWith(`${locale}/`)) problems.push(`файл ${clip.file} лежит не в папке локали ${locale}/`);
    if (clip.file) {
      referenced.add(path.join(voiceDir, clip.file));
      const info = await stat(path.join(voiceDir, clip.file)).catch(() => null);
      if (!info) problems.push(`файл ${clip.file} не найден`);
      else if (info.size > MAX_CLIP_BYTES) problems.push(`файл ${info.size} байт, предел ${MAX_CLIP_BYTES}`);
    } else problems.push('нет file');
    problems.length ? fail(`запись ${lang} ${key}`, problems.join('; ')) : ok(`запись ${lang} ${key}`);
  }
}
const stray = [];
async function walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p);
    else if (p !== manifestPath && !referenced.has(p)) stray.push(path.relative(voiceDir, p));
  }
}
await walk(voiceDir);
check('в public/voice нет файлов вне манифеста', stray.length === 0, stray.join(', '));

console.log(total === 0 ? `озвучка не сгенерирована (записей 0), манифест пуст: проходит` : `записей ${total} (en ${Object.keys(clipsOf(manifest, 'en')).length}, ru ${Object.keys(clipsOf(manifest, 'ru')).length})`);
if (failed) {
  console.log(`\n${failed} проверок не прошли`);
  process.exit(1);
}
console.log('\nвсе проверки озвучки прошли');
