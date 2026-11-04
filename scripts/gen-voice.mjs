/**
 * Генерация озвучки сюжетного режима (пилот: английский, дни 1 и 2).
 *
 * Запускает хозяин своим ключом; в репозитории ключа нет и быть не может.
 *
 *   node scripts/gen-voice.mjs --dry-run
 *   node scripts/gen-voice.mjs --provider elevenlabs
 *   node scripts/gen-voice.mjs --provider azure
 *
 * Ключ только из переменной окружения QUAERA_TTS_KEY (для Azure ещё
 * QUAERA_TTS_REGION, например westeurope). Id голосов: scripts/voice-cast.json.
 *
 * --dry-run    ничего не отправляет и ключа не требует: печатает реплики,
 *              знаки и оценку стоимости для обоих поставщиков.
 * --provider   elevenlabs | azure (для реального запуска обязателен).
 * --only <id>  только одна миссия, например day-2-counting.
 * --force      пересоздать и те реплики, у которых запись уже есть.
 * --format mp3 запасной формат, если поставщик не отдал opus.
 *
 * Реплики и хеши: scripts/lib/voice-lines.mjs. Запись кладётся в
 * public/voice/en/<миссия>/<слот>.<хеш>.<ext>, сведения о ней — в
 * public/voice/manifest.json. Манифест пишется после каждой реплики:
 * оборвалось на середине — повторный запуск продолжит с места.
 * Запись с тем же хешем и существующим файлом пропускается (деньги не
 * тратятся). Правка текста реплики меняет хеш: старый файл удаляется.
 */
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { MAX_CLIP_BYTES, LOCALE, clipFile, manifestPath, pilotLines, root, voiceDir } from './lib/voice-lines.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const dryRun = flag('--dry-run');
const provider = opt('--provider');
const only = opt('--only');
const force = flag('--force');
const format = opt('--format');

/* ---------- оценка стоимости (цены на 2026-11-04, см. docs/voice-pilot-2026-11.md) ---------- */

/** Тарифы ElevenLabs: 1 знак = 1 кредит. Free только некоммерческий: для репозитория не годится. */
const EL_PLANS = [
  { name: 'Starter', credits: 30_000, usd: 6 },
  { name: 'Creator', credits: 121_000, usd: 22 },
];
const AZURE_FREE = 500_000; // F0: знаков в месяц бесплатно
const AZURE_PER_MILLION = 15; // Neural, USD за 1 млн знаков (по вторичным источникам, не проверено)

function estimate(chars) {
  const el = EL_PLANS.find((p) => chars <= p.credits);
  return {
    elevenlabs: el
      ? `${chars} кредитов, влезает в ${el.name} ($${el.usd} за месяц); повторная генерация тратит кредиты заново`
      : `${chars} кредитов, больше тарифа Creator (121 тыс.)`,
    azure:
      chars <= AZURE_FREE
        ? `${chars} из ${AZURE_FREE} бесплатных знаков F0 в месяц: $0`
        : `платный Neural ≈ $${((chars / 1e6) * AZURE_PER_MILLION).toFixed(2)}`,
  };
}

/* ---------- провайдеры ---------- */

const PROVIDERS = {
  elevenlabs: {
    ext: () => (format === 'mp3' ? 'mp3' : 'opus'),
    /** Формат вывода: opus в Ogg, 48 кГц, 32 кбит/с. Имя формата сверить с документацией ElevenLabs. */
    async synth({ text, voice, key, cast }) {
      const fmt = format === 'mp3' ? 'mp3_44100_64' : 'opus_48000_32';
      const res = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=${fmt}`,
        {
          method: 'POST',
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/*' },
          body: JSON.stringify({ text, model_id: cast.model ?? 'eleven_multilingual_v2' }),
        },
      );
      if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return Buffer.from(await res.arrayBuffer());
    },
  },
  azure: {
    ext: () => (format === 'mp3' ? 'mp3' : 'opus'),
    async synth({ text, voice, key, region }) {
      const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const ssml = `<speak version="1.0" xml:lang="en-US" xmlns="http://www.w3.org/2001/10/synthesis"><voice name="${voice}">${esc}</voice></speak>`;
      const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': format === 'mp3' ? 'audio-24khz-48kbitrate-mono-mp3' : 'ogg-24khz-16bit-mono-opus',
          'User-Agent': 'quaera-voice-gen',
        },
        body: ssml,
      });
      if (!res.ok) throw new Error(`Azure ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return Buffer.from(await res.arrayBuffer());
    },
  },
};

/* ---------- длительность ---------- */

/** Длительность Ogg Opus: гранульная позиция последней страницы при 48 кГц. null — не Ogg. */
function oggOpusSeconds(buf) {
  const i = buf.lastIndexOf('OggS');
  if (i < 0 || i + 14 > buf.length) return null;
  const granule = Number(buf.readBigUInt64LE(i + 6));
  return granule > 0 ? granule / 48000 : null;
}

/** Запасная оценка по размеру: 32 кбит/с для opus, 64 кбит/с для mp3. */
const estimateSeconds = (bytes, ext) => (bytes * 8) / (ext === 'mp3' ? 64_000 : 32_000);

/* ---------- запуск ---------- */

const all = await pilotLines();
const lines = only ? all.filter((l) => l.mission === only) : all;
if (!lines.length) {
  console.error(`Нет реплик для --only ${only}`);
  process.exit(1);
}
const totalChars = lines.reduce((a, l) => a + l.chars, 0);

console.log(`Озвучка, пилот (${LOCALE}): ${lines.length} реплик, ${totalChars} знаков`);
for (const l of lines) {
  const head = l.text.length > 64 ? l.text.slice(0, 61) + '...' : l.text;
  console.log(`  ${l.key.padEnd(24)} ${l.speaker.padEnd(8)} ${String(l.chars).padStart(4)}  ${l.hash}  ${head}`);
}
const est = estimate(totalChars);
console.log('Оценка стоимости:');
console.log(`  ElevenLabs: ${est.elevenlabs}`);
console.log(`  Azure:      ${est.azure}`);

if (dryRun) {
  console.log('--dry-run: ничего не отправлено, файлы не тронуты.');
  process.exit(0);
}

/* реальный запуск */
const fail = (msg) => {
  console.error('Ошибка: ' + msg);
  process.exit(1);
};
if (!provider || !PROVIDERS[provider]) fail('нужен --provider elevenlabs|azure');
const key = process.env.QUAERA_TTS_KEY;
if (!key) fail('не задана переменная окружения QUAERA_TTS_KEY (ключ из файла не читается)');
const region = process.env.QUAERA_TTS_REGION;
if (provider === 'azure' && !region) fail('для Azure нужна QUAERA_TTS_REGION, например westeurope');

const cast = JSON.parse(await readFile(path.join(root, 'scripts', 'voice-cast.json'), 'utf8'))[provider];
const needed = [...new Set(lines.map((l) => l.speaker))];
const placeholders = needed.filter((s) => !cast.voices[s] || /^TODO/i.test(cast.voices[s]));
if (placeholders.length) fail(`в scripts/voice-cast.json (${provider}) не заполнены голоса: ${placeholders.join(', ')}`);

const impl = PROVIDERS[provider];
const ext = impl.ext();

let manifest = { version: 1, locale: LOCALE, provider: null, clips: {} };
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  /* первого манифеста ещё нет */
}
manifest.provider = provider;

const save = async () => {
  const sorted = Object.fromEntries(Object.entries(manifest.clips).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(manifestPath, JSON.stringify({ ...manifest, clips: sorted }, null, 2) + '\n', 'utf8');
};
const exists = (p) => stat(p).then(() => true, () => false);

let spent = 0;
for (const l of lines) {
  const file = clipFile(l, ext);
  const abs = path.join(voiceDir, file);
  const prev = manifest.clips[l.key];
  if (!force && prev && prev.hash === l.hash && prev.file === file && (await exists(abs))) {
    console.log(`  пропуск  ${l.key} (запись актуальна)`);
    continue;
  }
  process.stdout.write(`  синтез   ${l.key} (${l.chars} знаков)... `);
  const voice = cast.voices[l.speaker];
  const audio = await impl.synth({ text: l.text, voice, key, region, cast });
  if (audio.length > MAX_CLIP_BYTES) fail(`${l.key}: запись ${audio.length} байт больше ${MAX_CLIP_BYTES}`);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, audio);
  if (prev && prev.file !== file) await rm(path.join(voiceDir, prev.file), { force: true });
  const seconds = oggOpusSeconds(audio) ?? estimateSeconds(audio.length, ext);
  manifest.clips[l.key] = {
    speaker: l.speaker,
    voice,
    hash: l.hash,
    chars: l.chars,
    file,
    bytes: audio.length,
    duration: Math.round(seconds * 10) / 10,
  };
  spent += l.chars;
  await save();
  console.log(`${audio.length} байт, ~${manifest.clips[l.key].duration} с`);
}
await save();

// Убрать файлы, на которые манифест больше не ссылается (после правки текста).
const referenced = new Set(Object.values(manifest.clips).map((c) => path.join(voiceDir, c.file)));
async function sweep(dir) {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await sweep(p);
    else if (p !== manifestPath && !referenced.has(p) && !only) await rm(p);
  }
}
await sweep(voiceDir);
console.log(`Готово: отправлено на синтез ${spent} знаков. Манифест: public/voice/manifest.json`);
