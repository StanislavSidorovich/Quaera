import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n/context';
import { IconBook, IconCompass, IconStory } from './Sidebar';
import markLab from '../../family/marks/lab.svg';
import './startGuide.css';

/**
 * Гид новичка «Как здесь всё устроено»: четыре двери и показ по шагам.
 * Карточка видна новичку (нет решённых заданий, кампания не начата), закрывается
 * крестиком (запоминается), вернуть её можно из бокового меню и по `?guide=1`.
 * Подсветку частей приложения даёт тот же `data-pair`, что у пар меню и блоков (pairHighlight.ts):
 * строка-дверь помечена `data-pair-door`, блоки главной ещё и `data-guide`.
 */
const DISMISS_KEY = 'quaera.guide.dismissed.v1';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* хранилище недоступно: карточка просто вернётся в следующий раз */
  }
}

type DoorKey = 'map' | 'story' | 'tracks' | 'family';
const DOORS: { key: DoorKey; pair: string }[] = [
  { key: 'map', pair: 'career' },
  { key: 'story', pair: 'storymode' },
  { key: 'tracks', pair: 'tracks' },
  { key: 'family', pair: 'family' },
];

function visible(el: Element | null): el is HTMLElement {
  return !!el && (el as HTMLElement).getClientRects().length > 0;
}

/** Блок главной, а если его нет на экране, пункт бокового меню; иначе null. */
function findTarget(d: { key: DoorKey; pair: string }): HTMLElement | null {
  const main = [...document.querySelectorAll(`[data-guide="${d.key}"]`)].find(visible);
  if (main) return main as HTMLElement;
  const side = [...document.querySelectorAll(`.sidebar [data-pair="${d.pair}"]`)].find(visible);
  return (side as HTMLElement) ?? null;
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function DoorIcon({ k }: { k: DoorKey }) {
  if (k === 'map') return <IconCompass />;
  if (k === 'story') return <IconStory />;
  if (k === 'tracks') return <IconBook />;
  return <img src={markLab} alt="" width={16} height={16} style={{ borderRadius: 4 }} />;
}

export function StartGuide({
  isNewUser,
  storyStarted,
  signal,
  onOpenMap,
  onOpenStoryMode,
}: {
  isNewUser: boolean;
  storyStarted: boolean;
  signal: { n: number; tour: boolean };
  onOpenMap: () => void;
  onOpenStoryMode: (() => void) | null;
}) {
  const { t } = useI18n();
  const g = t.guide;
  const [dismissed, setDismissed] = useState(readDismissed);
  const [forced, setForced] = useState(signal.n > 0);
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (signal.n === 0) return;
    setForced(true);
    if (!signal.tour) return;
    const id = window.setTimeout(() => setStep(0), 700);
    return () => window.clearTimeout(id);
  }, [signal.n, signal.tour]);

  const shown = forced || (isNewUser && !storyStarted && !dismissed);
  const scrollTo = (k: DoorKey) => {
    const el = [...document.querySelectorAll(`[data-guide="${k}"]`)].find(visible);
    el?.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  };
  const go: Record<DoorKey, (() => void) | null> = {
    map: onOpenMap,
    story: onOpenStoryMode,
    tracks: () => scrollTo('tracks'),
    family: () => scrollTo('family'),
  };

  if (!shown && step === null) return null;
  return (
    <>
      {shown && (
        <section className="card start-guide" aria-labelledby="start-guide-title">
          <button
            type="button"
            className="start-guide-x"
            aria-label={g.close}
            onClick={() => {
              setForced(false);
              setDismissed(true);
              writeDismissed();
            }}
          >
            ×
          </button>
          <h2 id="start-guide-title">{g.title}</h2>
          <p className="muted start-guide-lead">{g.lead}</p>
          <ol className="start-guide-doors">
            {DOORS.map((d, i) => {
              const door = g.doors[d.key];
              const action = go[d.key];
              return (
                <li key={d.key} className="start-guide-door" data-pair-door={d.pair}>
                  <span className="start-guide-num" aria-hidden>
                    {i + 1}
                  </span>
                  <span className="start-guide-text">
                    <strong>
                      <span className="pair-ico" aria-hidden>
                        <DoorIcon k={d.key} />
                      </span>
                      {door.situation}
                    </strong>
                    <span className="start-guide-where">{door.where}</span>
                  </span>
                  {action && (
                    <button type="button" className="btn secondary start-guide-go" onClick={action}>
                      {door.btn}
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="muted start-guide-soon">{g.soon}</p>
          <button type="button" className="btn start-guide-tour" onClick={() => setStep(0)}>
            {g.tourBtn}
          </button>
        </section>
      )}
      {step !== null && <GuideTour step={step} setStep={setStep} />}
    </>
  );
}

function GuideTour({ step, setStep }: { step: number; setStep: (n: number | null) => void }) {
  const { t } = useI18n();
  const g = t.guide;
  const d = DOORS[step];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bh, setBh] = useState(200);
  const last = step === DOORS.length - 1;
  const close = useCallback(() => setStep(null), [setStep]);

  const measure = useCallback(() => {
    const el = findTarget(d);
    setRect(el ? el.getBoundingClientRect() : null);
  }, [d]);

  useLayoutEffect(() => {
    const el = findTarget(d);
    if (el && !el.closest('.sidebar')) el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    measure();
    nextRef.current?.focus({ preventScroll: true });
    if (bubbleRef.current) setBh(bubbleRef.current.offsetHeight);
  }, [d, measure]);

  useEffect(() => {
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      document.removeEventListener('keydown', onKey);
    };
  }, [measure, close]);

  const wide = window.innerWidth >= 600;
  let style: React.CSSProperties | undefined;
  if (wide) {
    const w = 320;
    const left = Math.min(Math.max(rect ? rect.left : 0, 16), window.innerWidth - w - 16);
    if (!rect) style = { left: (window.innerWidth - w) / 2 };
    else if (rect.bottom + 14 + bh <= window.innerHeight) style = { left, top: rect.bottom + 14 };
    else if (rect.top - 14 - bh >= 8) style = { left, top: rect.top - 14 - bh };
    else style = { right: 16, bottom: 16 };
  }
  const door = g.doors[d.key];
  return createPortal(
    <div className="sg-layer" onClick={close}>
      {rect ? (
        <div
          className="sg-frame"
          style={{ left: rect.left - 4, top: rect.top - 4, width: rect.width + 8, height: rect.height + 8 }}
        />
      ) : (
        <div className="sg-dim" />
      )}
      <div
        ref={bubbleRef}
        className={`sg-bubble${wide ? '' : ' sg-bubble-m'}${rect || !wide ? '' : ' sg-bubble-c'}`}
        style={style}
        role="dialog"
        aria-label={g.title}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="sg-step">{g.stepOf(step + 1, DOORS.length)}</p>
        <h3>{door.situation}</h3>
        <p>{door.where}</p>
        <div className="sg-actions">
          <button type="button" className="btn secondary" onClick={close}>
            {g.skip}
          </button>
          <button ref={nextRef} type="button" className="btn" onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? g.done : g.next}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
