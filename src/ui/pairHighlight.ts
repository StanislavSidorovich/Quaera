import { useEffect } from 'react';

/**
 * Подсветка пары «пункт бокового меню ↔ блок главной».
 *
 * Обе стороны помечены одним `data-pair="<ключ>"`. Наведение на одну подсвечивает
 * все остальные элементы с тем же ключом: у блока главной это тонкая рамка акцентом,
 * у пункта меню фон (стили `[data-pair-lit]` в styles.css). Только мышь:
 * на сенсорном экране нет наведения, там остаются одни общие значки.
 * Ничего не прокручивается: парный блок вне экрана просто остаётся как есть.
 * Атрибут `data-pair-lit` ставится в обход React (он его не знает и не сбрасывает).
 */
export function usePairHighlight() {
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let current: HTMLElement | null = null;
    const clear = () => {
      document.querySelectorAll('[data-pair-lit]').forEach((el) => el.removeAttribute('data-pair-lit'));
      current = null;
    };
    const onOver = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-pair],[data-pair-door]') : null;
      const key = el?.dataset.pair ?? el?.dataset.pairDoor ?? null;
      if (el === current) return;
      clear();
      if (!el || !key) return;
      current = el;
      document.querySelectorAll<HTMLElement>(`[data-pair="${key}"]`).forEach((p) => {
        if (p !== el && !p.contains(el) && !el.contains(p)) p.setAttribute('data-pair-lit', '');
      });
    };
    const onFocus = (e: FocusEvent) => {
      if (e.target instanceof Element && e.target.closest('[data-pair-door]')) onOver(e as unknown as MouseEvent);
    };
    const onLeave = (e: MouseEvent) => {
      if (!e.relatedTarget) clear();
    };
    document.addEventListener('mouseover', onOver);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', clear);
    document.addEventListener('mouseout', onLeave);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onLeave);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', clear);
      clear();
    };
  }, []);
}
