import type { ReactNode } from 'react';
import { OP_MEANINGS, splitInlineCode } from '../content/proseOps';
import { useI18n, type Locale } from '../i18n/context';
import './proseOps.css';

/**
 * Однострочный код в прозе (`...`): плашка с лёгким фоном. Оператор, стоящий в кавычках
 * один (`>`, `IN`), при первом появлении в `seen` получает рядом смысл словами; `seen`
 * вызывающий держит на экран (шаг сюжета) или на одну подсказку. Тройные ограды
 * остаются строками, и обычный текст тоже строка (не Fragment): StoryMode режет абзац
 * по пустой строке по строковым кускам (`splitParaBlocks`).
 */
export function markCode(text: string, seen: Set<string>, locale: Locale, keyBase = 'pc'): ReactNode[] {
  return splitInlineCode(text).map((seg, i) => {
    if (!seg.code) return seg.text;
    const op = seg.text.trim();
    const meaning = OP_MEANINGS[op];
    if (!meaning) return <code className="prose-code" key={`${keyBase}-${i}`}>{seg.text}</code>;
    // Смысл не дублируем, если фраза и так его называет («Строго больше» — это `>`).
    const first = !seen.has(op) && !text.toLowerCase().includes(meaning[locale].toLowerCase());
    seen.add(op);
    return (
      <span className="prose-op" key={`${keyBase}-${i}`} data-first={first ? '1' : undefined}>
        <code className="prose-code">{op}</code>
        {first && <span className="prose-op-gloss">{meaning[locale]}</span>}
      </span>
    );
  });
}

/** Подсказка, постановка, цель: строка прозы с плашками кода; свой набор «уже показанных» операторов. */
export function ProseText({ text }: { text: string }) {
  const { locale } = useI18n();
  return <>{markCode(text, new Set(), locale)}</>;
}
