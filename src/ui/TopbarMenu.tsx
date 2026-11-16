import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { useI18n } from '../i18n/context';
import { AppearanceMenu } from './AppearanceMenu';
import './topbarMenu.css';

type Appearance = Omit<ComponentProps<typeof AppearanceMenu>, 'inline'>;

/**
 * Кнопка «···» в шапке главной на телефоне: «?» (справка) и «Aa» (вид)
 * уезжают сюда, чтобы шапка занимала одну строку. На ширине от 768px
 * кнопка скрыта CSS-ом, а справка и «Aa» стоят в шапке как раньше.
 *
 * Закрывается по Esc и клику вне; фокус-ловушки нет (это не модальное окно),
 * но по Esc и после выбора справки фокус возвращается на кнопку.
 * Двойной тап не открывает второе меню: состояние одно, переключатель.
 */
export function TopbarMenu({
  appearance,
  onHelp,
}: {
  appearance: Appearance;
  onHelp: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="topbar-menu" ref={root}>
      <button
        ref={btn}
        type="button"
        className="icon-btn topbar-menu-btn"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls="topbar-menu-pop"
        aria-label={t.appearance.moreAria}
        title={t.appearance.moreAria}
        onClick={() => setOpen((o) => !o)}
      >
        ···
      </button>
      {open && (
        <div id="topbar-menu-pop" className="topbar-menu-pop">
          <button
            type="button"
            className="topbar-menu-item"
            onClick={() => {
              setOpen(false);
              onHelp();
            }}
          >
            <span className="topbar-menu-mark" aria-hidden>
              ?
            </span>
            {t.appearance.helpAria}
          </button>
          <AppearanceMenu {...appearance} inline />
        </div>
      )}
    </div>
  );
}
