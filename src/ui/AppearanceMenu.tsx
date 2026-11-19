import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../i18n/context';
import { CONTRASTS, type Contrast } from '../contrast';

export type Borders = 'soft' | 'strong';
type FontSize = 'md' | 'lg' | 'xl';
type Theme = 'system' | 'light' | 'dark';
type Locale = 'ru' | 'en';

const FONT_LABEL: Record<FontSize, string> = { md: 'A', lg: 'A+', xl: 'A++' };
const FONT_ORDER: FontSize[] = ['md', 'lg', 'xl'];
const THEME_ORDER: Theme[] = ['system', 'light', 'dark'];

/**
 * Одно меню вида вместо трёх кнопок: размер, тема, язык, границы — как «Aa»
 * в Lab, Model и Flow. Значения хранит App (он же применяет их к документу),
 * меню только показывает их и зовёт колбэки.
 */
export function AppearanceMenu({
  fontSize,
  onFontSize,
  theme,
  onTheme,
  locale,
  onLocale,
  borders,
  onBorders,
  contrast,
  onContrast,
  inline = false,
}: {
  fontSize: FontSize;
  onFontSize: (v: FontSize) => void;
  theme: Theme;
  onTheme: (v: Theme) => void;
  locale: Locale;
  onLocale: (v: Locale) => void;
  borders: Borders;
  onBorders: (v: Borders) => void;
  contrast: Contrast;
  /** null: сброс выбора, снова действует умолчание (prefers-contrast). */
  onContrast: (v: Contrast | null) => void;
  /** Без кнопки «Aa»: те же группы выложены сразу, внутри чужого меню (TopbarMenu). */
  inline?: boolean;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const a = t.appearance;
  const themeLabel: Record<Theme, string> = { system: a.themeSystem, light: a.themeLight, dark: a.themeDark };
  const group = <V extends string>(
    label: string,
    values: readonly V[],
    current: V,
    text: (v: V) => string,
    set: (v: V) => void,
  ) => (
    <div className="appearance-group">
      <div className="appearance-label">{label}</div>
      <div className="appearance-seg" role="radiogroup" aria-label={label}>
        {values.map((v) => (
          <button key={v} type="button" role="radio" aria-checked={current === v} onClick={() => set(v)}>
            {text(v)}
          </button>
        ))}
      </div>
    </div>
  );

  const pop = (
        <div className={inline ? 'appearance-pop appearance-inline' : 'appearance-pop'} role={inline ? 'group' : 'dialog'} aria-label={a.dialogAria}>
          {group(a.size, FONT_ORDER, fontSize, (v) => FONT_LABEL[v], onFontSize)}
          {group(a.theme, THEME_ORDER, theme, (v) => themeLabel[v], onTheme)}
          {group(a.language, ['ru', 'en'] as const, locale, (v) => v.toUpperCase(), onLocale)}
          {group(
            a.borders,
            ['strong', 'soft'] as const,
            borders,
            (v) => (v === 'strong' ? a.bordersStrong : a.bordersSoft),
            onBorders,
          )}
          {group(a.contrast, CONTRASTS, contrast, (v) => a.contrastNames[v], onContrast)}
          <button
            type="button"
            className="btn secondary appearance-reset"
            onClick={() => {
              onFontSize('md');
              onTheme('system');
              onBorders('strong');
              onContrast(null);
            }}
          >
            {a.reset}
          </button>
        </div>
  );

  if (inline) return pop;

  return (
    <div className="appearance" ref={root}>
      <button
        type="button"
        className="icon-btn appearance-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={a.buttonAria}
        title={a.buttonAria}
        onClick={() => setOpen((o) => !o)}
      >
        {a.button}
      </button>
      {open && pop}
    </div>
  );
}
