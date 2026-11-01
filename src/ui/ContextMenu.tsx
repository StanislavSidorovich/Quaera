import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n/context';

/**
 * Своё меню по правому клику, но только над объектом, у которого есть что
 * сделать: блок кода, таблица результата, таблица схемы. На пустом фоне и на
 * обычном тексте остаётся меню браузера: заменить его там нечем, а выделение
 * и копирование текста перестали бы вести себя привычно.
 *
 * Меню одно на всё приложение (хост ниже), а блок только говорит, где и с чем
 * его открыть. Поэтому блоки не знают ни о положении, ни о закрытии.
 */

export type ContextItem = { label: string; run: () => void; disabled?: boolean } | 'separator';

type Open = (at: { x: number; y: number }, items: ContextItem[]) => void;

const OpenContext = createContext<Open>(() => undefined);

/** Держит открытое меню и рисует его поверх страницы. */
export function ContextMenuHost({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<{ at: { x: number; y: number }; items: ContextItem[] } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const close = useCallback(() => setMenu(null), []);
  const open = useCallback<Open>((at, items) => setMenu({ at, items }), []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu, close]);

  // Меню не должно уходить за край окна: после первой отрисовки узнаём его размер и сдвигаем.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(menu.at.x, window.innerWidth - width - 4)),
      y: Math.max(4, Math.min(menu.at.y, window.innerHeight - height - 4)),
    });
  }, [menu]);

  return (
    <OpenContext.Provider value={open}>
      {children}
      {menu && (
        <div
          ref={ref}
          role="menu"
          className="ctx-menu"
          style={{ left: pos?.x ?? menu.at.x, top: pos?.y ?? menu.at.y }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {menu.items.map((item, i) =>
            item === 'separator' ? (
              <div key={i} className="ctx-sep" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.run();
                }}
              >
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </OpenContext.Provider>
  );
}

/** Поля ввода и ссылки оставляют меню браузера: там нужны вставка и «открыть в новой вкладке». */
function keepsNative(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('input, textarea, select, a, [contenteditable="true"]') !== null;
}

function copy(text: string) {
  navigator.clipboard?.writeText(text).catch(() => undefined);
}

/**
 * Обработчики для элемента, который открывает меню по правому клику, а на
 * сенсорном экране по долгому нажатию (там события contextmenu нет на iOS).
 * `build` получает элемент под курсором, чтобы меню таблицы знало, над какой
 * ячейкой оно открыто. Выделенный текст всегда идёт первым пунктом.
 */
export function useContextMenu(build: (target: Element | null) => ContextItem[]) {
  const open = useContext(OpenContext);
  const { t } = useI18n();
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const fired = useRef(false);

  const show = (at: { x: number; y: number }, target: Element | null) => {
    const selected = window.getSelection()?.toString() ?? '';
    const own = build(target);
    if (!own.length) return false;
    const head: ContextItem[] = selected.trim() ? [{ label: t.ctx.copySelection, run: () => copy(selected) }, 'separator'] : [];
    open(at, [...head, ...own]);
    return true;
  };
  const cancel = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };

  return {
    onContextMenu: (e: ReactMouseEvent) => {
      if (keepsNative(e.target)) return;
      if (!show({ x: e.clientX, y: e.clientY }, e.target as Element)) return;
      e.preventDefault();
      e.stopPropagation();
    },
    onPointerDown: (e: ReactPointerEvent) => {
      if (e.pointerType !== 'touch' || keepsNative(e.target)) return;
      cancel();
      fired.current = false;
      const at = (start.current = { x: e.clientX, y: e.clientY });
      timer.current = window.setTimeout(() => {
        fired.current = true;
        show(at, document.elementFromPoint(at.x, at.y));
      }, 550);
    },
    // Палец, поднятый после открытия меню, не должен щёлкнуть по тому, что под ним.
    onTouchEnd: (e: React.TouchEvent) => {
      if (fired.current) e.preventDefault();
      fired.current = false;
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    // Палец никогда не стоит совсем неподвижно; прокрутка отменяет нажатие.
    onPointerMove: (e: ReactPointerEvent) => {
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) cancel();
    },
  };
}

export { copy as copyText };
