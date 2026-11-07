import { useEffect, useState } from 'react';

/**
 * Совпадает ли окно с `(min-width: Npx)`, с подпиской на изменение.
 *
 * Нужен там, где блок должен рендериться ровно в одном месте дерева (у него
 * ref и счётчики), а место зависит от ширины: CSS умеет прятать, но не переносить.
 * Раскладку внутри блока по-прежнему решает CSS.
 */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`;
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const sync = () => setMatch(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [query]);
  return match;
}
