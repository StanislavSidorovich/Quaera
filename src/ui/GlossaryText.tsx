import { useState, type ReactNode } from 'react';
import { GLOSSARY, type GlossaryTerm } from '../content/glossary';
import { useI18n, type Locale } from '../i18n/context';

/**
 * Первое за день появление термина глоссария — подчёркнуто пунктиром,
 * по тапу разворачивает смысл в FMCG и где лежит в данных. Дальше в тот же
 * день термин — обычный текст: подчёркивать каждое повторение значило бы
 * учить читателя игнорировать подчёркивание.
 *
 * «Первое за день» — не свойство одного вызова annotateGlossary, а свойство
 * дня целиком: интро и реплики брифа состоят из нескольких строк, и решение
 * «эта — первая» обязано учитывать все предыдущие строки дня, не только
 * текущую. Отсюда сигнатура: annotateGlossary принимает `shownAlready`
 * (что уже показано в предыдущих строках дня) и возвращает `used` —
 * какие термины пометила эта строка, — а не мутирует состояние сама.
 * Вызывающий (StoryMode) копит `used` по всем строкам фазы в один проход
 * и коммитит в состояние дня эффектом. Так рендер остаётся чистым: класс
 * ошибки, который двойной вызов рендера под React StrictMode ловит
 * в мутирующем коде, здесь невозможен в принципе — мутировать нечего.
 */

/** Экранирование спецсимволов регулярки — термины приходят из данных, не пишутся руками в паттерн. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface Matcher {
  byLower: Map<string, GlossaryTerm>;
  regex: RegExp;
}

/**
 * Один комбинированный паттерн на локаль, а не поиск термин за термином —
 * иначе на каждую строку прозы ушло бы 8 отдельных проходов вместо одного.
 *
 * Границы слова — через `\p{L}`, а не `\b`: `\b` в JS определён по `\w`,
 * который кириллицу не считает буквами вовсе, и «точка» подсветилась бы
 * даже внутри «уточка». Собирается лениво и на модуль один раз: локалей
 * всего две, и словарь между ними не меняется в рантайме.
 */
const MATCHERS = new Map<Locale, Matcher>();

function matcherFor(locale: Locale): Matcher {
  const cached = MATCHERS.get(locale);
  if (cached) return cached;
  const byLower = new Map(GLOSSARY.map((term) => [term.term[locale].toLowerCase(), term]));
  const alternation = GLOSSARY.map((term) => escapeRegExp(term.term[locale])).join('|');
  const matcher: Matcher = { byLower, regex: new RegExp(`(?<!\\p{L})(?:${alternation})(?!\\p{L})`, 'giu') };
  MATCHERS.set(locale, matcher);
  return matcher;
}

/**
 * Размечает одну строку прозы. `shownAlready` — только читается: решение
 * «первая ли это встреча термина» смотрит и на неё, и на термины, уже
 * встреченные раньше в этой же строке (одна строка может назвать «точку»
 * дважды — подсвечивается только первая).
 */
export function annotateGlossary(
  text: string,
  shownAlready: ReadonlySet<string>,
  locale: Locale
): { pieces: ReactNode[]; used: string[] } {
  const { byLower, regex } = matcherFor(locale);
  const pieces: ReactNode[] = [];
  const used: string[] = [];
  const usedHere = new Set<string>();
  let last = 0;
  let key = 0;
  regex.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text))) {
    const matchedText = m[0];
    const term = byLower.get(matchedText.toLowerCase());
    if (!term) continue;
    if (m.index > last) pieces.push(text.slice(last, m.index));
    if (shownAlready.has(term.id) || usedHere.has(term.id)) {
      pieces.push(matchedText);
    } else {
      pieces.push(<GlossaryTermSpan key={`glossary-${key++}`} term={term} matchedText={matchedText} />);
      usedHere.add(term.id);
      used.push(term.id);
    }
    last = m.index + matchedText.length;
  }
  if (last < text.length) pieces.push(text.slice(last));
  return { pieces, used };
}

/**
 * Размечает несколько строк подряд (одна фаза дня — интро, реплики брифа),
 * сохраняя «первое появление» через строки: если «точка» уже подсвечена
 * во второй реплике, третья реплика её больше не подсвечивает. Разметка
 * сама не пишет в состояние — только читает `shownAlready` и возвращает,
 * что показала: хост (StoryMode) коммитит `newlyShown` в состояние дня
 * отдельным эффектом, см. довод у annotateGlossary про чистоту рендера.
 */
export function annotateSequence(
  texts: string[],
  shownAlready: ReadonlySet<string>,
  locale: Locale
): { rendered: ReactNode[][]; newlyShown: string[] } {
  const shown = new Set(shownAlready);
  const rendered = texts.map((text) => {
    const { pieces, used } = annotateGlossary(text, shown, locale);
    used.forEach((id) => shown.add(id));
    return pieces;
  });
  const newlyShown = [...shown].filter((id) => !shownAlready.has(id));
  return { rendered, newlyShown };
}

/**
 * Разворачивается на своей строке, а не всплывающей подсказкой поверх
 * текста: на 375px плавающему поповеру над словом посреди узкой колонки
 * почти негде стоять, не обрезаясь и не закрывая соседний текст, — тот же
 * довод, по которому в проекте уже везде disclosure-раскрытие (`<details>`
 * у TableDoc, у решения задания), а не тултипы.
 */
function GlossaryTermSpan({ term, matchedText }: { term: GlossaryTerm; matchedText: string }) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="glossary-term" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {matchedText}
      </button>
      {open && (
        <span className="glossary-note">
          <span className="glossary-note-line">{term.meaning[locale]}</span>
          <span className="glossary-note-line glossary-note-pointer">→ {term.pointer[locale]}</span>
        </span>
      )}
    </>
  );
}
