/**
 * Реплики озвучки: общий источник для scripts/gen-voice.mjs и
 * scripts/test-voice-manifest.mjs. Оба обязаны видеть одни и те же реплики,
 * один и тот же текст «на выходе» и один и тот же хеш: иначе гейт сверял бы
 * не то, что отправили на синтез.
 *
 * Данные берутся из src/content/storymode.ts (английская версия). Файл
 * импортирует только типы, поэтому esbuild.transform снимает типы, и модуль
 * грузится из data: URL без сборки.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const voiceDir = path.join(root, 'public', 'voice');
export const manifestPath = path.join(voiceDir, 'manifest.json');

/** Миссии пилота: неделя 1, дни 1 и 2. Расширение пилота = дописать id сюда. */
export const PILOT_MISSIONS = ['day-1-first-day', 'day-2-counting'];

/** Граница между локалью и миссией в пути файла; пилот только английский. */
export const LOCALE = 'en';

/** Размер одной записи не больше (байт); гейт и скрипт читают одно число. */
export const MAX_CLIP_BYTES = 400 * 1024;

const FENCE = '```';

async function loadModule(rel) {
  const src = await readFile(path.join(root, rel), 'utf8');
  const { code } = await transform(src, { loader: 'ts', format: 'esm', target: 'es2022' });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

export const loadCampaign = async () => (await loadModule('src/content/storymode.ts')).storyCampaign(LOCALE);
export const loadSpeakers = () => loadModule('src/speakers.ts');

/**
 * Текст, который уходит на синтез: без блоков кода, пробелы свёрнуты,
 * внешняя пара прямых кавычек снята (реплики набраны в кавычках как речь,
 * голосу они не нужны). Хеш и число знаков считаются от этого текста.
 */
export function spokenText(raw) {
  const noCode = raw
    .split(FENCE)
    .filter((_, i) => i % 2 === 0)
    .join(' ');
  let t = noCode.replace(/\s+/g, ' ').trim();
  if (t.length > 1 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
  return t;
}

export const textHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);

/**
 * Реплики пилота в порядке экрана. Слот: `m<n>` — бриф, `a<шаг>` — реплика
 * после задания, `i<шаг>.<n>` — разговор между делом. Ключ = «миссия/слот».
 * `speaker` берётся из данных; его нет — ошибка (пилот помечается явно).
 */
export async function pilotLines() {
  const campaign = await loadCampaign();
  const { speakerId } = await loadSpeakers();
  const out = [];
  for (const id of PILOT_MISSIONS) {
    const mission = campaign.missions.find((m) => m.id === id);
    if (!mission) throw new Error(`Миссия пилота не найдена в storymode.ts: ${id}`);
    const push = (slot, msg) => {
      if (!msg.speaker) throw new Error(`${id}/${slot}: у реплики нет speaker (from: «${msg.from}»)`);
      const text = spokenText(msg.text);
      out.push({
        key: `${id}/${slot}`,
        mission: id,
        slot,
        speaker: msg.speaker,
        speakerFromLabel: speakerId(msg.from),
        text,
        hash: textHash(text),
        chars: text.length,
      });
    };
    mission.messages.forEach((m, i) => push(`m${i}`, m));
    mission.steps.forEach((s, si) => {
      s.interlude?.messages.forEach((m, i) => push(`i${si}.${i}`, m));
      if (s.after) push(`a${si}`, s.after);
    });
  }
  return out;
}

/** Файл записи: хеш текста в имени, поэтому кеш service worker'а вперёд не устаревает. */
export const clipFile = (line, ext) => `${LOCALE}/${line.mission}/${line.slot}.${line.hash}.${ext}`;
