import { RECIPES, recipeCode } from '../content/recipes';
import { SANDBOX_QUESTIONS, sandboxStarter, sandboxText } from '../content/sandbox';
import type { Locale } from '../i18n/context';

/**
 * Наша собственная проза в редакторе песочницы — вслед за языком интерфейса.
 *
 * В буфере редактора оказывается три вида текста, написанного нами, а не
 * человеком: заготовка при первом входе, строка-комментарий с вопросом
 * («Вставить вопрос») и код рецепта из шпаргалки. Все три локализованы —
 * не сам SQL, а комментарии внутри, — и все три попадали в редактор один раз,
 * на том языке, который стоял в момент вставки. Дальше человек переключал
 * язык, и на английском экране висел русский комментарий (замер на телефоне
 * 2026-09-06: вопрос про портфель брендов над английской панелью).
 *
 * Тот же корень, что у разбора ошибки (см. ui/feedback.ts), но лечится иначе:
 * повод здесь заменить нечем — в редакторе лежит текст, и он же рабочий
 * материал человека. Поэтому не пересборка, а **перевод построчно и только
 * дословных совпадений**: строка меняется, если она в точности равна нашей
 * строке на другой локали. Набранное человеком не совпадёт ни с чем и
 * останется как есть — включая случай, когда он отредактировал наш
 * комментарий: тронутая строка перестаёт быть нашей.
 *
 * Таблица строится из тех же STARTER/RECIPES/SANDBOX_QUESTIONS, что и сами
 * вставки, поэтому расходиться с содержимым ей не с чем — сверять гейтом
 * тут нечего.
 *
 * Чего перевод намеренно не трогает: историю запусков и сохранённые скрипты.
 * Это записи о том, что человек действительно выполнил и сохранил; менять
 * их задним числом значило бы править его архив.
 */

/** Строка на любой локали → её пара на обеих. Строится один раз при первом обращении. */
let table: Map<string, Record<Locale, string>> | null = null;

/**
 * Пары строк из двух версий одного текста, по позиции.
 *
 * Разное число строк — отказ целиком, а не пословный разбор: код рецепта
 * на двух локалях обязан совпадать построчно (это сторожит verify-content),
 * и если когда-нибудь не совпадёт, лучше не перевести ничего, чем подставить
 * комментарий не на своё место.
 */
function pairLines(ru: string, en: string, into: Map<string, Record<Locale, string>>): void {
  const a = ru.split('\n');
  const b = en.split('\n');
  if (a.length !== b.length) return;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue;
    const pair = { ru: a[i], en: b[i] };
    into.set(a[i], pair);
    into.set(b[i], pair);
  }
}

function buildTable(): Map<string, Record<Locale, string>> {
  const map = new Map<string, Record<Locale, string>>();
  for (const env of ['sql', 'python'] as const) {
    pairLines(sandboxStarter(env, 'ru'), sandboxStarter(env, 'en'), map);
    for (const r of RECIPES) pairLines(recipeCode(r, env, 'ru'), recipeCode(r, env, 'en'), map);
    // Вопрос вставляется одной строкой с комментарием своего языка — см. insertQuestion.
    const mark = env === 'sql' ? '--' : '#';
    for (const q of SANDBOX_QUESTIONS) {
      pairLines(`${mark} ${sandboxText(q, 'ru').question}`, `${mark} ${sandboxText(q, 'en').question}`, map);
    }
  }
  return map;
}

/** Буфер редактора на языке интерфейса: наши строки переведены, чужие не тронуты. */
export function localizeSandboxCode(code: string, locale: Locale): string {
  if (!table) table = buildTable();
  return code
    .split('\n')
    .map((line) => table!.get(line)?.[locale] ?? line)
    .join('\n');
}
