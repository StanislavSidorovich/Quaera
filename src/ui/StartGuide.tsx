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

/**
 * Приглашение в гид: окно по центру один раз получает каждый, кто гид не видел.
 * «Не сейчас» молчит до конца вкладки (sessionStorage), всего не больше трёх показов
 * (счётчик в localStorage); «Больше не показывать» и «Готово» в показе гасят насовсем.
 */
const INVITE_KEY = 'quaera.guide.invite.v1';
const INVITE_COUNT_KEY = 'quaera.guide.invite.count.v1';
const INVITE_SESSION_KEY = 'quaera.guide.invite.snoozed';
const INVITE_MAX = 3;
/* Глубокий адрес (?roles, ?intro, ?story, #...): читается до того, как App сотрёт параметры из строки. */
const DEEP_LINK = (() => {
  try {
    return window.location.search !== '' || window.location.hash !== '';
  } catch {
    return false;
  }
})();

function inviteAllowed(): boolean {
  try {
    if (DEEP_LINK) return false;
    if (localStorage.getItem(INVITE_KEY) === '1') return false;
    if (Number(localStorage.getItem(INVITE_COUNT_KEY) ?? '0') >= INVITE_MAX) return false;
    if (sessionStorage.getItem(INVITE_SESSION_KEY) === '1') return false;
    return true;
  } catch {
    return false;
  }
}
function inviteShown() {
  try {
    sessionStorage.setItem(INVITE_SESSION_KEY, '1');
    localStorage.setItem(INVITE_COUNT_KEY, String(Number(localStorage.getItem(INVITE_COUNT_KEY) ?? '0') + 1));
  } catch {
    /* без хранилища приглашение просто может повториться */
  }
}
function inviteDone() {
  try {
    localStorage.setItem(INVITE_KEY, '1');
  } catch {
    /* см. выше */
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

/** Блок главной и парный пункт бокового меню (любой из двух может отсутствовать на экране). */
function findTargets(d: { key: DoorKey; pair: string }): { main: HTMLElement | null; side: HTMLElement | null } {
  const main = [...document.querySelectorAll(`[data-guide="${d.key}"]`)].find(visible) as HTMLElement | undefined;
  const side = [...document.querySelectorAll(`.sidebar [data-pair="${d.pair}"]`)].find(visible) as HTMLElement | undefined;
  return { main: main ?? null, side: side ?? null };
}

const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * Показать раздел с его верха, под липкой шапкой. `block: 'center'` у раздела выше экрана
 * (карта данных, семья приложений на телефоне) открывал его с середины. Раздел, который
 * целиком помещается над пузырём подсказки, по-прежнему ставится по центру.
 */
function revealSection(el: HTMLElement) {
  const behavior = reduced() ? 'auto' : 'smooth';
  const bar = document.querySelector('.topbar');
  const headH = bar ? bar.getBoundingClientRect().bottom : 0;
  const room = window.innerHeight - Math.max(headH, 0);
  const wide = window.innerWidth >= 600;
  const h = el.getBoundingClientRect().height;
  const base = el.getBoundingClientRect().top + window.scrollY - Math.max(headH, 0);
  /* По центру области под шапкой, а не экрана: при A+ липкая шапка прикрывала верх раздела. */
  const top = wide && h <= room - 32 ? base - (room - h) / 2 : base - 8;
  window.scrollTo({ top: Math.max(top, 0), behavior });
}

/** Пункт бокового меню при крупном шрифте может лежать ниже экрана: прокрутить само меню, не страницу. */
function revealInSidebar(el: HTMLElement) {
  const box = el.closest<HTMLElement>('.sidebar-inner');
  if (!box || box.scrollHeight <= box.clientHeight) return;
  const b = box.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.top >= b.top + 8 && r.bottom <= b.bottom - 8) return;
  box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
}

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
  const [invite, setInvite] = useState(false);

  useEffect(() => {
    if (signal.n > 0 || !inviteAllowed()) return;
    const id = window.setTimeout(() => {
      if (!inviteAllowed() || document.querySelector('[role="dialog"]')) return;
      inviteShown();
      setInvite(true);
    }, 800);
    return () => window.clearTimeout(id);
  }, [signal.n]);

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
    if (el) revealSection(el);
  };
  const go: Record<DoorKey, (() => void) | null> = {
    map: onOpenMap,
    story: onOpenStoryMode,
    tracks: () => scrollTo('tracks'),
    family: () => scrollTo('family'),
  };

  if (!shown && step === null && !invite) return null;
  return (
    <>
      {invite && (
        <GuideInvite
          onShow={() => {
            setInvite(false);
            setStep(0);
          }}
          onLater={() => setInvite(false)}
          onNever={() => {
            inviteDone();
            setInvite(false);
          }}
        />
      )}
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
      {step !== null && <GuideTour step={step} setStep={setStep} onFinish={inviteDone} />}
    </>
  );
}

function GuideTour({ step, setStep, onFinish }: { step: number; setStep: (n: number | null) => void; onFinish: () => void }) {
  const { t } = useI18n();
  const g = t.guide;
  const d = DOORS[step];
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [rect2, setRect2] = useState<DOMRect | null>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [bh, setBh] = useState(200);
  const last = step === DOORS.length - 1;
  const close = useCallback(() => setStep(null), [setStep]);

  const measure = useCallback(() => {
    const { main, side } = findTargets(d);
    setRect((main ?? side)?.getBoundingClientRect() ?? null);
    setRect2(main && side ? side.getBoundingClientRect() : null);
  }, [d]);

  useLayoutEffect(() => {
    const { main: el, side } = findTargets(d);
    if (el) revealSection(el);
    if (side) revealInSidebar(side);
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
    const headH = Math.max(document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0, 0);
    const left = Math.min(Math.max(rect ? rect.left : 0, 16), window.innerWidth - w - 16);
    if (!rect) style = { left: (window.innerWidth - w) / 2 };
    else if (rect.bottom + 14 + bh <= window.innerHeight) style = { left, top: rect.bottom + 14 };
    else if (rect.top - 14 - bh >= headH + 8) style = { left, top: rect.top - 14 - bh };
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
      {rect2 && (
        <div
          className="sg-frame sg-frame-side"
          style={{ left: rect2.left - 3, top: rect2.top - 3, width: rect2.width + 6, height: rect2.height + 6 }}
        />
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
          <button ref={nextRef} type="button" className="btn" onClick={() => {
              if (last) {
                onFinish();
                close();
              } else setStep(step + 1);
            }}>
            {last ? g.done : g.next}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function GuideInvite({ onShow, onLater, onNever }: { onShow: () => void; onLater: () => void; onNever: () => void }) {
  const { t } = useI18n();
  const g = t.guide;
  const showRef = useRef<HTMLButtonElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    showRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onLater();
      if (e.key !== 'Tab' || !boxRef.current) return;
      const f = [...boxRef.current.querySelectorAll<HTMLElement>('button')];
      const first = f[0];
      const lastEl = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onLater]);
  return createPortal(
    <div className="sg-layer sg-invite-layer" onClick={onLater}>
      <div className="sg-dim" />
      <div
        ref={boxRef}
        className="sg-invite"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sg-invite-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sg-invite-title">{g.title}</h2>
        <p>{g.inviteLine}</p>
        <div className="sg-actions">
          <button type="button" className="btn secondary" onClick={onLater}>
            {g.later}
          </button>
          <button ref={showRef} type="button" className="btn" onClick={onShow}>
            {g.show}
          </button>
        </div>
        <button type="button" className="sg-never" onClick={onNever}>
          {g.never}
        </button>
      </div>
    </div>,
    document.body,
  );
}
