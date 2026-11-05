import { useEffect, useMemo, useState } from 'react';
import { storyCampaign } from '../content/storymode';
import { CODE_FENCE } from '../content/proseCode';
import {
  CAST_SPEAKERS,
  SPEAKER_GENDER,
  SPEAKER_NAMES,
  englishVoices,
  loadVoiceChoices,
  pickCast,
  saveVoiceChoice,
  speakLines,
  speakerId,
  stopSpeaking,
  voiceFlagOn,
  type SpeakerId,
  type SpokenLine,
} from '../voice';

/*
 * Страница прослушки голосов браузера: `?voice=audition`. Инструмент
 * хозяина, не для учеников: без пункта меню, текст только английский и без
 * i18n. Флаг озвучки включается сам (voiceFlagOn запоминает его при
 * `?voice=audition`). Выбор голоса персонажа хранится в localStorage
 * (`quaera-voice-cast`) и тут же действует в кампании.
 */

interface Sample {
  speaker: SpeakerId;
  text: string;
  where: string;
}

function dialogsBySpeaker(): Record<SpeakerId, Sample[]> {
  const out = {} as Record<SpeakerId, Sample[]>;
  for (const id of CAST_SPEAKERS) out[id] = [];
  const strip = (x: string) => x.split(CODE_FENCE).filter((_, i) => i % 2 === 0).join(' ').replace(/\s+/g, ' ').trim();
  for (const m of storyCampaign('en').missions) {
    const add = (msg: { from: string; speaker?: SpeakerId; text: string }, slot: string) => {
      const id = msg.speaker ?? speakerId(msg.from);
      if (out[id]) out[id].push({ speaker: id, text: strip(msg.text), where: `${m.id} ${slot}` });
    };
    m.messages.forEach((x, i) => add(x, `brief ${i + 1}`));
    m.steps.forEach((st, si) => {
      st.interlude?.messages.forEach((x, i) => add(x, `interlude ${i + 1}`));
      if (st.after) add(st.after, `after task ${si + 1}`);
    });
  }
  return out;
}

/** Типичная реплика: ближайшая к медианной длине среди реплик персонажа. */
function typical(list: Sample[]): Sample | null {
  if (!list.length) return null;
  const lens = list.map((s) => s.text.length).sort((a, b) => a - b);
  const med = lens[Math.floor(lens.length / 2)];
  return list.reduce((best, s) => (Math.abs(s.text.length - med) < Math.abs(best.text.length - med) ? s : best));
}

export default function VoiceAudition() {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [choices, setChoices] = useState(loadVoiceChoices);
  const [playing, setPlaying] = useState<string | null>(null);
  const [now, setNow] = useState<Sample | null>(null);
  const data = useMemo(dialogsBySpeaker, []);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    voiceFlagOn();
    document.title = 'Voice audition - Quaera';
    if (!supported) return;
    const s = window.speechSynthesis;
    const update = () => setVoices(s.getVoices());
    update();
    s.addEventListener?.('voiceschanged', update);
    return () => {
      s.removeEventListener?.('voiceschanged', update);
      stopSpeaking();
    };
  }, [supported]);

  const list = useMemo(() => englishVoices(voices), [voices]);
  const goodCount = list.filter((v) => v.good).length;
  const cast = useMemo(() => pickCast(voices, choices, true), [voices, choices]);

  const stop = () => {
    stopSpeaking();
    setPlaying(null);
    setNow(null);
  };
  const play = (id: SpeakerId, key: string, samples: Sample[]) => {
    if (!cast || !samples.length) return;
    if (playing === key) return stop();
    const lines: SpokenLine[] = samples.map((s) => ({ text: s.text, speaker: id }));
    setPlaying(key);
    speakLines(lines, cast, (i) => setNow(samples[i]), stop);
  };
  const choose = (id: SpeakerId, uri: string) => {
    stop();
    saveVoiceChoice(id, uri || null);
    setChoices(loadVoiceChoices());
  };

  return (
    <main className="voice-aud">
      <h1>Voice audition</h1>
      <p className="muted">
        Owner tool, English only. Voices come from this browser; the choice is saved here and also applies in the
        story mode with <code>?voice=1</code>. Students never see this page.
      </p>
      {!supported && <p>This browser has no speech synthesis.</p>}
      {supported && list.length === 0 && <p>No English voices found yet. If this stays empty, open the page in Edge or Chrome.</p>}
      {supported && list.length > 0 && goodCount === 0 && (
        <p>
          No good voices here (Natural, Google, Siri or Enhanced), so the Listen button will not appear for students in
          this browser. Any English voice can still be auditioned below.
        </p>
      )}

      {CAST_SPEAKERS.map((id) => {
        const all = data[id];
        const sample = typical(all);
        const spec = cast?.[id];
        const sampleKey = id + ':sample';
        const allKey = id + ':all';
        return (
          <section className="card voice-aud-card" key={id}>
            <h2>
              {SPEAKER_NAMES[id]}{' '}
              <small className="muted">
                {SPEAKER_GENDER[id] === 'f' ? 'female' : 'male'}, {all.length} lines
              </small>
            </h2>
            <label className="voice-aud-pick">
              Voice
              <select value={choices[id] ?? ''} onChange={(e) => choose(id, e.target.value)}>
                <option value="">
                  Automatic{spec ? ` (${spec.voice.name}, pitch ${spec.pitch.toFixed(2)}, rate ${spec.rate.toFixed(2)})` : ''}
                </option>
                {list.map(({ voice, good }) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang}){good ? '' : ' - plain'}
                  </option>
                ))}
              </select>
            </label>
            {sample && (
              <p className={'story-mode-text voice-aud-sample' + (now && playing === sampleKey ? ' voice-aud-sample--on' : '')}>
                {sample.text} <small className="muted">({sample.where})</small>
              </p>
            )}
            <div className="voice-aud-actions">
              <button type="button" className="btn secondary" disabled={!cast || !sample} onClick={() => sample && play(id, sampleKey, [sample])}>
                {playing === sampleKey ? '■ Stop' : '▶ Sample line'}
              </button>
              <button type="button" className="btn secondary" disabled={!cast || !all.length} onClick={() => play(id, allKey, all)}>
                {playing === allKey ? '■ Stop' : `▶ All ${all.length} lines in a row`}
              </button>
            </div>
            {playing === allKey && now && (
              <p className="muted voice-aud-now">
                Now: {now.where}
                <br />
                {now.text.slice(0, 160)}
                {now.text.length > 160 ? '...' : ''}
              </p>
            )}
          </section>
        );
      })}

      <section className="card voice-aud-card">
        <h2>
          Voices in this browser{' '}
          <small className="muted">
            {list.length} English, {goodCount} good
          </small>
        </h2>
        <ul className="voice-aud-list">
          {list.map(({ voice, good, gender }) => (
            <li key={voice.voiceURI}>
              {voice.name}{' '}
              <span className="muted">
                {voice.lang}, {voice.localService ? 'local' : 'network'}, {good ? 'good' : 'plain'}, guessed{' '}
                {gender === '?' ? 'unknown' : gender === 'f' ? 'female' : 'male'}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
