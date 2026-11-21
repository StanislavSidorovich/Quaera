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

/**
 * Миссии пилота по локали. en: неделя 1, дни 1 и 2; ru: неделя 1, дни 1–5
 * (первая пачка русской озвучки). Расширение = дописать id сюда.
 */
export const PILOT_MISSIONS_BY_LOCALE = {
  en: ['day-1-first-day', 'day-2-counting'],
  ru: ['day-1-first-day', 'day-2-counting', 'day-3-shape-of-the-year', 'day-4-join', 'day-5-shelf-or-demand'],
};
export const PILOT_MISSIONS = PILOT_MISSIONS_BY_LOCALE.en;

/** Локали с озвучкой; `en` лежит в манифесте как `clips`, остальные в `locales.<код>.clips`. */
export const LOCALES = ['en', 'ru'];

/** Локаль по умолчанию для gen-voice (синтез по API только английский). Граница между локалью и миссией в пути файла. */
export const LOCALE = 'en';

/** Записи локали из манифеста (общий вид для скриптов; браузер читает так же в src/voice.ts). */
export function clipsOf(manifest, locale) {
  if (locale === 'en') return (manifest.clips ??= {});
  manifest.locales ??= {};
  manifest.locales[locale] ??= { clips: {} };
  return (manifest.locales[locale].clips ??= {});
}

/** Размер одной записи не больше (байт); гейт и скрипт читают одно число. */
export const MAX_CLIP_BYTES = 400 * 1024;

const FENCE = '```';

async function loadModule(rel) {
  const src = await readFile(path.join(root, rel), 'utf8');
  const { code } = await transform(src, { loader: 'ts', format: 'esm', target: 'es2022' });
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

export const loadCampaign = async (locale = LOCALE) => (await loadModule('src/content/storymode.ts')).storyCampaign(locale);
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
  // Однострочный код в обратных кавычках (proseOps.ts): голос читает слово, не кавычки.
  let t = noCode.replace(/(?<!`)`([^`\n]+)`(?!`)/g, '$1').replace(/\s+/g, ' ').trim();
  if (t.length > 1 && t.startsWith('"') && t.endsWith('"')) t = t.slice(1, -1).trim();
  // русский текст набран во внешних «ёлочках»: голосу они тоже не нужны
  if (t.length > 1 && t.startsWith('«') && t.endsWith('»')) t = t.slice(1, -1).trim();
  return t;
}

export const textHash = (text) => createHash('sha256').update(text).digest('hex').slice(0, 10);

/**
 * Реплики в порядке экрана. Слот: `m<n>` — бриф, `a<шаг>` — реплика
 * после задания, `i<шаг>.<n>` — разговор между делом. Ключ = «миссия/слот».
 * `scope`: 'pilot' — миссии PILOT_MISSIONS, у реплик обязателен `speaker`
 * в данных; 'dialogs' — все диалоги кампании (рассказчик, то есть
 * `reflection` и `hook`, не входит), `speaker` берётся из данных, а если его
 * нет, из подписи `from` функцией speakerId.
 */
async function collectLines(scope, locale = LOCALE) {
  const campaign = await loadCampaign(locale);
  const { speakerId } = await loadSpeakers();
  const pilot = scope === 'pilot';
  const out = [];
  const missions = pilot
    ? PILOT_MISSIONS_BY_LOCALE[locale].map((id) => {
        const m = campaign.missions.find((x) => x.id === id);
        if (!m) throw new Error(`Миссия пилота (${locale}) не найдена в storymode.ts: ${id}`);
        return m;
      })
    : campaign.missions;
  for (const mission of missions) {
    const id = mission.id;
    const push = (slot, msg) => {
      if (pilot && locale === 'en' && !msg.speaker) throw new Error(`${id}/${slot}: у реплики нет speaker (from: «${msg.from}»)`);
      const text = spokenText(msg.text);
      out.push({
        locale,
        key: `${id}/${slot}`,
        mission: id,
        week: mission.week,
        slot,
        kind: slot[0] === 'm' ? 'brief' : slot[0] === 'a' ? 'after' : 'interlude',
        from: msg.from,
        speaker: msg.speaker ?? speakerId(msg.from),
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

export const pilotLines = (locale = LOCALE) => collectLines('pilot', locale);
export const dialogLines = (locale = LOCALE) => collectLines('dialogs', locale);

/** Файл записи: хеш текста в имени, поэтому кеш service worker'а вперёд не устаревает. */
export const clipFile = (line, ext) => `${line.locale ?? LOCALE}/${line.mission}/${line.slot}.${line.hash}.${ext}`;
