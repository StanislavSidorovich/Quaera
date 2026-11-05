import { useEffect, useState } from 'react';
import { speakerId, SPEAKER_IDS, type SpeakerId } from './speakers';

export { speakerId };
export type { SpeakerId };

/**
 * Проба озвучки режима истории голосом браузера (Web Speech API).
 * Видна только по флагу `?voice=1` (или `?voice=audition`), который запоминается в localStorage.
 * Только английский текст и английский голос: записанных голосов нет,
 * решение «оставлять ли» за хозяином (после разговоров с людьми и Ignite).
 */

const FLAG_KEY = 'quaera-voice';

/** Флаг пробы: `?voice=1` включает и запоминает, `?voice=0` выключает. */
export function voiceFlagOn(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('voice');
    if (q === '1' || q === 'audition') window.localStorage.setItem(FLAG_KEY, '1');
    else if (q === '0') window.localStorage.removeItem(FLAG_KEY);
    return window.localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    try {
      const q = new URLSearchParams(window.location.search).get('voice');
      return q === '1' || q === 'audition';
    } catch {
      return false;
    }
  }
}

/** `?voice=audition`: страница прослушки голосов (инструмент хозяина, без пункта меню). */
export function auditionRequested(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('voice') === 'audition';
  } catch {
    return false;
  }
}

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
}

/*
 * ПРАВИЛА «ХОРОШЕГО» ГОЛОСА. Единственное место, где они записаны.
 *
 * Зачем фильтр: голос по умолчанию в Windows-Chrome (Microsoft Mark, Zira,
 * David, SAPI) звучит как робот, и кнопка с ним вредит истории сильнее, чем
 * тишина. Поэтому кнопка есть только там, где найден голос нейросетевого
 * качества:
 *   - «Natural» в имени: Edge (Microsoft ... Online (Natural));
 *   - «Google»: Chrome и Android (сетевые голоса Google);
 *   - «Siri»: iOS/macOS;
 *   - Apple-голос с пометкой Enhanced/Premium и localService (Samantha,
 *     Daniel, Ava...): без пометки это компактная версия, она звучит хуже.
 * Всё остальное (в том числе старые Microsoft SAPI) считается плохим.
 */
function isEnglish(v: SpeechSynthesisVoice): boolean {
  return /^en([-_]|$)/i.test(v.lang);
}

/** Чем меньше число, тем лучше; null — голос плохой. */
function quality(v: SpeechSynthesisVoice): number | null {
  if (!isEnglish(v)) return null;
  if (/natural/i.test(v.name)) return 0;
  if (/google/i.test(v.name)) return 1;
  if (/siri/i.test(v.name)) return 2;
  if (v.localService && /enhanced|premium/i.test(v.name)) return 3;
  return null;
}

export function goodVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
  return voices
    .map((v) => ({ v, q: quality(v) }))
    .filter((x): x is { v: SpeechSynthesisVoice; q: number } => x.q !== null)
    .sort((a, b) => a.q - b.q)
    .map((x) => x.v);
}

// Пол по имени голоса: в Web Speech API его нет, остаётся список известных имён.
const MALE = /\b(guy|ryan|davis|tony|brian|andrew|christopher|eric|roger|steffan|james|jason|daniel|alex|fred|tom|thomas|aaron|arthur|oliver|male|mark|david)\b/i;
const FEMALE = /\b(aria|jenny|michelle|ana|emma|sonia|libby|natasha|clara|samantha|ava|allison|susan|karen|moira|tessa|nicky|female|zira|us english)\b/i;

function gender(v: SpeechSynthesisVoice): 'm' | 'f' | '?' {
  if (FEMALE.test(v.name)) return 'f';
  if (MALE.test(v.name)) return 'm';
  return '?';
}

export interface VoiceSpec {
  voice: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
}

export type Gender = 'm' | 'f';

/** Встроенный голос каждого персонажа кампании. */
export type VoiceCast = Record<SpeakerId, VoiceSpec>;

/*
 * ПОЛ ПЕРСОНАЖЕЙ КАМПАНИИ. Единственное место: в данных кампании пола нет,
 * только id говорящего (src/speakers.ts). Из текста: Аоки (she), Мори (he),
 * руководитель (мужчина, решение хозяина); Ито и Танака в тексте без
 * местоимений, пол выбран здесь. Рассказчик в озвучку не входит (его текст
 * остаётся текстом); если он всё же встретится, ему мужской голос.
 */
export const SPEAKER_GENDER: Record<SpeakerId, Gender> = {
  aoki: 'f',
  mori: 'm',
  ito: 'm',
  tanaka: 'f',
  manager: 'm',
  narrator: 'm',
};

/** Имена персонажей для интерфейса прослушки (не для учеников). */
export const SPEAKER_NAMES: Record<SpeakerId, string> = {
  aoki: 'Aoki',
  manager: 'Your manager',
  mori: 'Mori',
  ito: 'Ito',
  tanaka: 'Tanaka',
  narrator: 'Narrator',
};

/** Персонажи, которых озвучиваем (рассказчика нет). */
export const CAST_SPEAKERS: readonly SpeakerId[] = ['aoki', 'manager', 'mori', 'ito', 'tanaka'];

/*
 * ПРАВИЛО ВЫБОРА ВСТРОЕННОГО ГОЛОСА ПО ПЕРСОНАЖУ. Единственное место.
 *
 * Хорошие голоса делятся по полу. Внутри пола персонажи идут в порядке
 * CAST_ORDER (самый частый первым: руководитель получает лучший мужской
 * голос) и берут по одному голосу подряд. Голосов меньше, чем персонажей
 * этого пола: список идёт по кругу, а повторившийся голос различается
 * высотой и скоростью (PROSODY по номеру круга). Нет голоса нужного пола:
 * голос без определённого пола; нет и его: любой хороший голос, у мужчин
 * ниже на 10%, у женщин выше. Выбор хозяина со страницы ?voice=audition
 * (localStorage) перекрывает правило для своего персонажа.
 */
const CAST_ORDER: Record<Gender, SpeakerId[]> = {
  f: ['aoki', 'tanaka'],
  m: ['manager', 'mori', 'ito', 'narrator'],
};
const PROSODY: Array<{ pitch: number; rate: number }> = [
  { pitch: 1, rate: 1 },
  { pitch: 0.92, rate: 0.96 },
  { pitch: 1.08, rate: 1.04 },
  { pitch: 0.85, rate: 0.92 },
];

/** Выбор хозяина: id персонажа -> voiceURI голоса браузера. */
export type VoiceChoices = Partial<Record<SpeakerId, string>>;
const CHOICES_KEY = 'quaera-voice-cast';

export function loadVoiceChoices(): VoiceChoices {
  try {
    const raw = window.localStorage.getItem(CHOICES_KEY);
    const o = raw ? JSON.parse(raw) : null;
    if (!o || typeof o !== 'object') return {};
    const out: VoiceChoices = {};
    for (const id of SPEAKER_IDS) if (typeof o[id] === 'string') out[id] = o[id];
    return out;
  } catch {
    return {};
  }
}

/** uri === null снимает выбор персонажа. */
export function saveVoiceChoice(id: SpeakerId, uri: string | null): void {
  try {
    const all = loadVoiceChoices();
    if (uri) all[id] = uri;
    else delete all[id];
    window.localStorage.setItem(CHOICES_KEY, JSON.stringify(all));
  } catch {
    // без localStorage выбор живёт до перезагрузки страницы
  }
}

/** Все английские голоса браузера с оценкой для страницы прослушки. */
export function englishVoices(voices: SpeechSynthesisVoice[]): Array<{ voice: SpeechSynthesisVoice; good: boolean; gender: Gender | '?' }> {
  return voices.filter(isEnglish).map((voice) => ({ voice, good: quality(voice) !== null, gender: gender(voice) }));
}

export function pickCast(voices: SpeechSynthesisVoice[], choices: VoiceChoices = {}): VoiceCast | null {
  const good = goodVoices(voices);
  if (good.length === 0) return null;
  const cast = {} as VoiceCast;
  for (const g of ['f', 'm'] as Gender[]) {
    let pool = good.filter((v) => gender(v) === g);
    let base = 1;
    if (pool.length === 0) pool = good.filter((v) => gender(v) === '?');
    if (pool.length === 0) {
      pool = good;
      base = g === 'm' ? 0.9 : 1.1;
    }
    CAST_ORDER[g].forEach((id, i) => {
      const p = PROSODY[Math.floor(i / pool.length) % PROSODY.length];
      cast[id] = { voice: pool[i % pool.length], pitch: base * p.pitch, rate: p.rate };
    });
  }
  for (const id of SPEAKER_IDS) {
    const uri = choices[id];
    const chosen = uri ? voices.find((v) => v.voiceURI === uri) : undefined;
    if (chosen) cast[id] = { voice: chosen, pitch: 1, rate: 1 };
  }
  return cast;
}

/** Голоса приходят асинхронно (`voiceschanged`); null — хорошего голоса или API нет. */
export function useVoiceSet(enabled: boolean): VoiceCast | null {
  const [set, setSet] = useState<VoiceCast | null>(null);
  useEffect(() => {
    const s = synth();
    if (!enabled || !s) return;
    const update = () => setSet(pickCast(s.getVoices(), loadVoiceChoices()));
    update();
    s.addEventListener?.('voiceschanged', update);
    return () => s.removeEventListener?.('voiceschanged', update);
  }, [enabled]);
  return set;
}

export function stopSpeaking(): void {
  try {
    synth()?.cancel();
  } catch {
    // нечего останавливать
  }
}

export interface SpokenLine {
  text: string;
  /** Говорящий: определяет голос. */
  speaker: SpeakerId;
  /** Ключ в манифесте записей («день/слот»); без него реплика читается только голосом браузера. */
  id?: string;
}

/**
 * Читает реплики по очереди. onLine(i) — реплика i началась (подсветка),
 * onEnd — очередь закончилась или оборвана.
 */
export function speakLines(
  lines: SpokenLine[],
  voices: VoiceCast,
  onLine: (i: number) => void,
  onEnd: () => void,
): void {
  const s = synth();
  if (!s) return onEnd();
  s.cancel();
  const clean = lines
    .map((l, idx) => ({ ...l, idx, text: l.text.replace(/\s+/g, ' ').trim() }))
    .filter((l) => l.text);
  if (clean.length === 0) return onEnd();
  clean.forEach((l, i) => {
    const spec = voices[l.speaker];
    const u = new SpeechSynthesisUtterance(l.text);
    u.voice = spec.voice;
    u.lang = spec.voice.lang;
    u.pitch = spec.pitch;
    u.rate = spec.rate;
    u.onstart = () => onLine(l.idx);
    if (i === clean.length - 1) u.onend = onEnd;
    u.onerror = (e) => {
      // cancel() шлёт canceled/interrupted: это наш Stop или новый запуск, не сбой
      if (e.error !== 'canceled' && e.error !== 'interrupted') onEnd();
    };
    s.speak(u);
  });
}

/*
 * ЗАПИСАННЫЕ ГОЛОСА (пилот). Реплика с записью играет файл, остальные читает
 * speakLines. Файлы лежат в public/voice/ и не в precache: service worker
 * кеширует их по одному при первом прослушивании (кеш quaera-voice-v1,
 * public/sw.js). Генерация и состав манифеста: scripts/gen-voice.mjs,
 * гейт test:voice-manifest, план в docs/voice-pilot-2026-11.md.
 */
export interface VoiceClip {
  speaker: SpeakerId;
  /** Путь относительно /voice/; хеш текста входит в имя, поэтому кеш вперёд безопасен. */
  file: string;
  duration?: number;
}

interface VoiceManifest {
  clips: Record<string, VoiceClip>;
}

let manifestPromise: Promise<VoiceManifest> | null = null;

/** Манифест грузится один раз; любой сбой (нет файла, офлайн, HTML вместо JSON) значит «записей нет». */
export function loadVoiceManifest(): Promise<VoiceManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch('/voice/manifest.json')
      .then((r) => (r.ok ? r.json() : { clips: {} }))
      .then((m) => (m && typeof m === 'object' && m.clips && typeof m.clips === 'object' ? (m as VoiceManifest) : { clips: {} }))
      .catch(() => ({ clips: {} }));
  }
  return manifestPromise;
}

/** Записи для всех реплик или null: тогда вся очередь идёт голосом браузера (микс двух голосов в одной сцене хуже обоих). */
export function clipsFor(lines: SpokenLine[], manifest: VoiceManifest | null): VoiceClip[] | null {
  if (!manifest) return null;
  const clips: VoiceClip[] = [];
  for (const l of lines) {
    if (!l.text.trim()) continue;
    const clip = l.id ? manifest.clips[l.id] : undefined;
    if (!clip) return null;
    clips.push(clip);
  }
  return clips.length ? clips : null;
}

let current: HTMLAudioElement | null = null;

export function stopClips(): void {
  const a = current;
  current = null;
  if (a) {
    a.onended = null;
    a.onerror = null;
    try {
      a.pause();
    } catch {
      // нечего останавливать
    }
  }
}

/**
 * Играет записи по очереди. Подсветка: onLine(i) на старте реплики i.
 * Ошибка загрузки или воспроизведения обрывает очередь через onFail:
 * вызывающий переходит на голос браузера.
 */
export function playClips(
  lines: SpokenLine[],
  clips: VoiceClip[],
  onLine: (i: number) => void,
  onEnd: () => void,
  onFail: () => void,
): void {
  stopClips();
  const idx = lines.map((l, i) => (l.text.trim() ? i : -1)).filter((i) => i >= 0);
  const step = (n: number) => {
    if (n >= clips.length) return onEnd();
    const a = new Audio('/voice/' + clips[n].file);
    current = a;
    a.onended = () => {
      if (current === a) step(n + 1);
    };
    a.onerror = () => {
      if (current === a) {
        stopClips();
        onFail();
      }
    };
    onLine(idx[n]);
    a.play().catch(() => {
      // автозапуск запрещён или файл не отдался: пробуем голос браузера
      if (current === a) {
        stopClips();
        onFail();
      }
    });
  };
  step(0);
}
