/**
 * Разобранный пример кода внутри абзаца прозы — подводки режима истории.
 *
 * **Как помечается.** Блок, отделённый пустыми строками и огороженный
 * тройными обратными кавычками на своих строках:
 *
 *     'Пишется это так:\n\n```\nFROM fact_sellout f\n…\n```\n\nУсловие после ON…'
 *
 * **Почему пометка, а не вывод из текста.** Два способа обойтись без неё
 * опровергаются самим контентом. «Средний блок — код» ломается на двух
 * подводках из девяти: в подзапросе пример стоит посреди предложения, а у WITH
 * абзац кончается кодом. «Похоже на SQL» ошибается в другую сторону:
 * `f.sellout_id IS NULL` из одной строки не отличить от прозы, упомянувшей
 * IS NULL. Пометка ставится руками, а забыть её не даёт гейт
 * (`npm run test:story-ladder`, см. `unfencedCodeBlocks`).
 *
 * **Почему не отдельное поле.** `paras` читают глоссарий — по строке
 * на абзац, индекс в индекс с рендером (см. phaseGlossaryTexts в StoryMode) —
 * и гейт лестницы, для которого код в абзаце и есть «приём показан».
 * Строка с пометкой не меняет ни то, ни другое.
 *
 * Внутри блока кода пустых строк нет: `\n\n` — граница блоков, и пример
 * с пустой строкой разрезался бы пополам. Гейт ловит это как непарную
 * ограду.
 */

export const CODE_FENCE = '```';

/** Блок прозы, отделённый пустыми строками, — пример кода с оградой. */
export function isFencedCode(block: string): boolean {
  return block.startsWith(`${CODE_FENCE}\n`) && block.endsWith(`\n${CODE_FENCE}`) && block.length > 2 * CODE_FENCE.length + 1;
}

/** Содержимое примера без ограды. */
export function unfenceCode(block: string): string {
  return block.slice(CODE_FENCE.length + 1, -(CODE_FENCE.length + 1));
}

/**
 * Отрезки строки, занятые примерами кода вместе с оградой, — [начало, конец).
 * Глоссарию: термин внутри кода не размечается (английские `units`, `revenue`,
 * `channel`, `promo` совпадают с именами колонок, а `.` и `_` границей слова
 * для `\p{L}` служат), и что он встретился в коде, «показанным» не считается.
 */
export function fencedCodeRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  let at = 0;
  for (const block of text.split('\n\n')) {
    if (isFencedCode(block)) ranges.push([at, at + block.length]);
    at += block.length + 2;
  }
  return ranges;
}

/** Ключевые слова, с которых начинается фрагмент SQL, — для гейта «пометку не забыли». */
const SQL_START = /^(SELECT|FROM|WITH|WHERE|GROUP BY|HAVING|ORDER BY|JOIN|LEFT JOIN|CASE|ROUND|SUM|COUNT|AVG|COALESCE)\b/;
/** Однострочная проверка вида `f.sellout_id IS NULL` — имя колонки и оператор. */
const SQL_PREDICATE = /^[a-z_]+\.[a-z_]+ (IS|=|<>|>|<|IN|LIKE)\b/;
/** Чем кончается фраза прозы; пример кода так не кончается. */
const SENTENCE_END = /[.:!?…»"]$/;

/**
 * Блоки абзаца, похожие на код, но без ограды, и непарные ограды.
 * Пусто — абзац размечен верно. Похожесть здесь только страховка: она ищет
 * забытую пометку и потому может позволить себе быть грубой, а решение
 * «код или проза» на экране принимает ограда, не она.
 */
export function unfencedCodeBlocks(text: string): string[] {
  const bad: string[] = [];
  for (const block of text.split('\n\n')) {
    if (isFencedCode(block)) continue;
    if (block.includes(CODE_FENCE)) bad.push(`непарная ограда: ${block.slice(0, 60)}`);
    // Проза тоже бывает начата словом SQL («WITH заводит…», «WHERE cannot…»),
    // но кончается знаком конца фразы, а пример кода — нет.
    else if ((SQL_START.test(block) || SQL_PREDICATE.test(block)) && !SENTENCE_END.test(block))
      bad.push(`код без ограды: ${block.slice(0, 60)}`);
  }
  return bad;
}
