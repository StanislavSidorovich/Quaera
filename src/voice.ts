import { useEffect, useState } from 'react';

/**
 * Проба озвучки режима истории голосом браузера (Web Speech API).
 * Видна только по флагу `?voice=1`, который запоминается в localStorage.
 * Только английский текст и английский голос: записанных голосов нет,
 * решение «оставлять ли» за хозяином (после разговоров с людьми и Ignite).
 */

const FLAG_KEY = 'quaera-voice';

/** Флаг пробы: `?voice=1` включает и запоминает, `?voice=0` выключает. */
export function voiceFlagOn(): boolean {
  try {
    const q = new URLSearchParams(window.location.search).get('voice');
    if (q === '1') window.localStorage.setItem(FLAG_KEY, '1');
    else if (q === '0') window.localStorage.removeItem(FLAG_KEY);
    return window.localStorage.getItem(FLAG_KEY) === '1';
  } catch {
    try {
      return new URLSearchParams(window.location.search).get('voice') === '1';
    } catch {
      return false;
    }
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
}

export type Gender = 'm' | 'f';

/** Мужской и женский голос для озвучки. */
export interface VoiceSet {
  m: VoiceSpec;
  f: VoiceSpec;
}

/*
 * ПОЛ ПЕРСОНАЖЕЙ КАМПАНИИ. Единственное место: в данных кампании
 * (`StoryMessage.from`) пола нет, только строка «Имя, роль». Ключ ищется в
 * подписи без учёта регистра. Из текста: Аоки (she), Мори (he), руководитель
 * (мужчина, решение хозяина); Ито и Танака в тексте без местоимений, пол
 * выбран здесь. Незнакомая подпись читается мужским голосом.
 */
const CHARACTER_GENDER: Array<[RegExp, Gender]> = [
  [/aoki/i, 'f'],
  [/mori/i, 'm'],
  [/ito/i, 'm'],
  [/tanaka/i, 'f'],
  [/manager/i, 'm'],
];

/** Пол говорящего по подписи `from` (английской версии кампании). */
export function genderOfSpeaker(from: string): Gender {
  return CHARACTER_GENDER.find(([re]) => re.test(from))?.[1] ?? 'm';
}

/**
 * Голоса по полу. Лучший хороший голос нужного пола; нет такого: лучший
 * голос без определённого пола; нет и его: любой хороший голос с pitch 0.9
 * (мужчина) или 1.1 (женщина). null: хорошего голоса нет, кнопки не будет.
 */
export function pickVoices(voices: SpeechSynthesisVoice[]): VoiceSet | null {
  const good = goodVoices(voices);
  if (good.length === 0) return null;
  const pick = (g: Gender): VoiceSpec => {
    const exact = good.find((v) => gender(v) === g) ?? good.find((v) => gender(v) === '?');
    return exact ? { voice: exact, pitch: 1 } : { voice: good[0], pitch: g === 'm' ? 0.9 : 1.1 };
  };
  return { m: pick('m'), f: pick('f') };
}

/** Голоса приходят асинхронно (`voiceschanged`); null — хорошего голоса или API нет. */
export function useVoiceSet(enabled: boolean): VoiceSet | null {
  const [set, setSet] = useState<VoiceSet | null>(null);
  useEffect(() => {
    const s = synth();
    if (!enabled || !s) return;
    const update = () => setSet(pickVoices(s.getVoices()));
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
  /** Пол говорящего: определяет мужской или женский голос. */
  gender: Gender;
}

/**
 * Читает реплики по очереди. onLine(i) — реплика i началась (подсветка),
 * onEnd — очередь закончилась или оборвана.
 */
export function speakLines(
  lines: SpokenLine[],
  voices: VoiceSet,
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
    const spec = voices[l.gender];
    const u = new SpeechSynthesisUtterance(l.text);
    u.voice = spec.voice;
    u.lang = spec.voice.lang;
    u.pitch = spec.pitch;
    u.onstart = () => onLine(l.idx);
    if (i === clean.length - 1) u.onend = onEnd;
    u.onerror = (e) => {
      // cancel() шлёт canceled/interrupted: это наш Stop или новый запуск, не сбой
      if (e.error !== 'canceled' && e.error !== 'interrupted') onEnd();
    };
    s.speak(u);
  });
}
