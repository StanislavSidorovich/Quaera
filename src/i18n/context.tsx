import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ru } from './ru';
import { en } from './en';

export type Locale = 'ru' | 'en';
type Strings = typeof ru;

const STORAGE_KEY = 'querium-locale';
const dict: Record<Locale, Strings> = { ru, en };

/**
 * Дефолт для первого визита — язык браузера, а не жёстко русский: с LinkedIn
 * придут в основном англоговорящие, и им незачем сначала видеть русский экран,
 * чтобы найти переключатель. Дальше выбор помнится в localStorage.
 */
function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'ru' || stored === 'en') return stored;
  } catch {
    // localStorage недоступен (приватный режим и т.п.) — просто не запоминаем выбор
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

const I18nContext = createContext<{ locale: Locale; t: Strings; setLocale: (l: Locale) => void } | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // см. initialLocale — недоступность localStorage не должна ломать переключение
    }
  };

  // <html lang> и <title> объявлены в index.html статически по-русски, но
  // интерфейс может быть английским с самого первого визита (см. initialLocale
  // выше). Без синхронизации lang screen reader выбирает произношение
  // и переносы по неверному языку для половины посетителей, а вкладка
  // остаётся русской даже после явного переключения на EN — то есть
  // единственная надпись, которую видно, когда приложение свёрнуто.
  //
  // Статические og:-теги этим не чинятся и не могут: их читает краулер,
  // до всякого JS. Превью ссылки на LinkedIn — отдельное решение.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = dict[locale].app.documentTitle;
  }, [locale]);

  const value = useMemo(() => ({ locale, t: dict[locale], setLocale }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
