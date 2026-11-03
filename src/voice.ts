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

/**
 * Два голоса для двух собеседников. Первый — лучший из хороших; второй —
 * лучший другого пола, иначе любой другой хороший, иначе тот же голос с
 * другим pitch (0.9 и 1.1). null — хорошего голоса нет, кнопки не будет.
 */
export function pickPair(voices: SpeechSynthesisVoice[]): [VoiceSpec, VoiceSpec] | null {
  const good = goodVoices(voices);
  if (good.length === 0) return null;
  const a = good[0];
  const rest = good.filter((v) => v.name !== a.name);
  const b = rest.find((v) => gender(v) !== gender(a) && gender(v) !== '?') ?? rest[0];
  if (b) return [{ voice: a, pitch: 1 }, { voice: b, pitch: 1 }];
  return [{ voice: a, pitch: 0.9 }, { voice: a, pitch: 1.1 }];
}

/** Голоса приходят асинхронно (`voiceschanged`); null — хорошего голоса или API нет. */
export function useVoicePair(enabled: boolean): [VoiceSpec, VoiceSpec] | null {
  const [pair, setPair] = useState<[VoiceSpec, VoiceSpec] | null>(null);
  useEffect(() => {
    const s = synth();
    if (!enabled || !s) return;
    const update = () => setPair(pickPair(s.getVoices()));
    update();
    s.addEventListener?.('voiceschanged', update);
    return () => s.removeEventListener?.('voiceschanged', update);
  }, [enabled]);
  return pair;
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
  /** Номер собеседника: чётные и нечётные получают разные голоса. */
  speaker: number;
}

/**
 * Читает реплики по очереди. onLine(i) — реплика i началась (подсветка),
 * onEnd — очередь закончилась или оборвана.
 */
export function speakLines(
  lines: SpokenLine[],
  pair: [VoiceSpec, VoiceSpec],
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
    const spec = pair[l.speaker % 2];
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
