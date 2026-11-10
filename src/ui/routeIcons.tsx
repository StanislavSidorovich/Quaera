import type { ReactNode } from 'react';
import './routeIcons.css';

/** Контурные значки слоёв карты данных: сетка 24, штрих 1.6, цвет берут от текста заголовка. */
const SHAPES: Record<string, ReactNode> = {
  /* Источники: цилиндр базы. */
  sources: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.7" />
      <path d="M5 5.5v13c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7v-13" />
      <path d="M5 12c0 1.5 3.1 2.7 7 2.7s7-1.2 7-2.7" />
    </>
  ),
  /* Приёмник: лоток с входящей стрелкой. */
  bronze: (
    <>
      <path d="M12 3v8" />
      <path d="m8.5 8 3.5 3.5L15.5 8" />
      <path d="M3 13h5.5a3.5 3.5 0 0 0 7 0H21" />
      <path d="M3 13v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6" />
    </>
  ),
  /* Чистка: воронка и искра. */
  silver: (
    <>
      <path d="M3 4.5h15l-5.8 7v6.5l-3.4 2v-8.5z" />
      <path d="M20 3v4M18 5h4" />
    </>
  ),
  /* Звезда: центр и пять лучей с кружками. */
  gold: (
    <>
      <circle cx="12" cy="12.5" r="2.4" />
      <path d="M12 10.1V6.6M14.3 11.4l3.3-1.3M13.4 14.6l2 2.8M10.6 14.6l-2 2.8M9.7 11.4 6.4 10.1" />
      <circle cx="12" cy="4.6" r="1.8" />
      <circle cx="19.4" cy="9.4" r="1.8" />
      <circle cx="16.6" cy="19" r="1.8" />
      <circle cx="7.4" cy="19" r="1.8" />
      <circle cx="4.6" cy="9.4" r="1.8" />
    </>
  ),
  /* Отчёт и разбор: рамка дашборда с плиткой числа, столбиками и линией. */
  serve: (
    <>
      <rect x="3" y="3.5" width="18" height="17" rx="2" />
      <rect x="5.7" y="6.2" width="5" height="3.4" rx="0.6" />
      <path d="M14 9.6V8M16.3 9.6V6.8M18.6 9.6V7.6" />
      <path d="m5.7 17 3.2-3.4 2.9 2 3.4-3.8 3.1 2.6" />
    </>
  ),
  /* Встреча: двое. */
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M2.8 20c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6" />
      <path d="M15.6 4.9a3.2 3.2 0 0 1 0 6.2M18 14.8c1.9.8 3.2 2.5 3.2 5.2" />
    </>
  ),
  /* Решение: флаг с галочкой. */
  decision: (
    <>
      <path d="M5 21V3" />
      <path d="M5 4h13l-2.2 4.2L18 12.4H5" />
      <path d="m8.4 8.1 1.8 1.8 3.2-3.4" />
    </>
  ),
};

/** Значки слоя по id: у встречи их два, она же и решение. */
const BY_LAYER: Record<string, string[]> = {
  sources: ['sources'],
  bronze: ['bronze'],
  silver: ['silver'],
  gold: ['gold'],
  serve: ['serve'],
  meeting: ['people', 'decision'],
};

export function RouteIcons({ layer }: { layer: string }) {
  const names = BY_LAYER[layer];
  if (!names) return null;
  return (
    <span className="route-icons" aria-hidden="true">
      {names.map((n) => (
        <svg key={n} viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" focusable="false">
          {SHAPES[n]}
        </svg>
      ))}
    </span>
  );
}
