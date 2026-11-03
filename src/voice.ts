import { useEffect, useState } from 'react';

/**
 * Проба озвучки режима истории голосом браузера (Web Speech API).
 * Видна только по флагу `?voice=1`, который запоминается в localStorage.
 * Только английский текст и английский голос: записанных голосов нет,
 * решение «оставлять ли» принимает хозяин после прослушивания.
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

/** Порядок предпочтений: Natural (Edge), Google (Chrome), Samantha/Daniel (Apple), иначе первый en. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en([-_]|$)/i.test(v.lang));
  if (en.length === 0) return null;
  return (
    en.find((v) => /natural/i.test(v.name)) ??
    en.find((v) => /google/i.test(v.name)) ??
    en.find((v) => /samantha/i.test(v.name)) ??
    en.find((v) => /daniel/i.test(v.name)) ??
    en[0]
  );
}

/** Голос приходит асинхронно (`voiceschanged`); null — голоса нет или API нет. */
export function useEnglishVoice(enabled: boolean): SpeechSynthesisVoice | null {
  const [voice, setVoice] = useState<SpeechSynthesisVoice | null>(null);
  useEffect(() => {
    const s = synth();
    if (!enabled || !s) return;
    const update = () => setVoice(pickVoice(s.getVoices()));
    update();
    s.addEventListener?.('voiceschanged', update);
    return () => s.removeEventListener?.('voiceschanged', update);
  }, [enabled]);
  return voice;
}

export function stopSpeaking(): void {
  try {
    synth()?.cancel();
  } catch {
    // нечего останавливать
  }
}

/** Читает реплики по очереди; onEnd вызывается и по концу, и по ошибке. */
export function speakLines(lines: string[], voice: SpeechSynthesisVoice, onEnd: () => void): void {
  const s = synth();
  if (!s) return onEnd();
  s.cancel();
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (clean.length === 0) return onEnd();
  clean.forEach((text, i) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = 1;
    if (i === clean.length - 1) {
      u.onend = onEnd;
    }
    u.onerror = onEnd;
    s.speak(u);
  });
}
