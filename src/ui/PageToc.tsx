import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/context';

/**
 * Оглавление справа на длинных страницах (экскурс, «С чего начать»).
 *
 * Только от 1280px, раскладку включает CSS (`.page-toc`); ниже его нет
 * совсем. **Кнопки, а не ссылки с `#hash`:** экраны живут в состоянии
 * приложения и в `localStorage`, адрес трогать нельзя.
 *
 * Пункты приходят от страницы, из тех же данных, что рисуют заголовки,
 * — второго списка рядом нет. Секции обязаны иметь `id` и
 * `scroll-margin-top: 72px` (см. `.page-toc-target` в styles.css).
 */
export function PageToc({ items }: { items: { id: string; title: string }[] }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    const targets = items
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0 || typeof IntersectionObserver === 'undefined') return;

    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        // Текущий — самый верхний из видимых в полосе под шапкой.
        const first = items.find((item) => visible.has(item.id));
        if (first) setCurrent(first.id);
      },
      // Отступ сверху на шапку (72px), снизу — оставляем только верхнюю
      // треть окна, чтобы «текущим» был раздел, который читают, а не
      // тот, что только показался внизу.
      { rootMargin: '-72px 0px -60% 0px' },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [items]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setCurrent(id);
  };

  return (
    <nav className="page-toc" aria-label={t.app.onThisPage}>
      <p className="page-toc-title">{t.app.onThisPage}</p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className={`page-toc-item${current === item.id ? ' is-current' : ''}`}
              aria-current={current === item.id ? 'true' : undefined}
              onClick={() => go(item.id)}
            >
              {item.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
