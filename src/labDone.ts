/**
 * Отметка «собрано в Lab»: Lab (lab.quaera.app) отправляет человека обратно сюда
 * ссылкой `https://quaera.app/#lab-done=pipeline:kaiyo-sellout`, когда все три
 * проверки конвейера пройдены. Фрагмент, а не запрос: после `#` на сервер не
 * уходит ничего, и открытое окно тренажёра принимает ссылку без перезагрузки.
 *
 * Отметка на доверии, без отпечатка (решение хозяина 2026-11-04): это не
 * сертификат, а след «я это прошёл», и подделка вредит только самому себе.
 *
 * Читаем один раз при загрузке и на hashchange, кладём в localStorage
 * `quaera.labDone` как `{ "pipeline:kaiyo-sellout": "<ISO-дата>" }` (с тем,
 * что там уже есть) и стираем из адреса, не трогая остальной фрагмент и запрос:
 * иначе каждое обновление страницы показывало бы тост заново.
 *
 * Читать надо ПОСЛЕ того, как StartGuide посчитал DEEP_LINK (он на импорте
 * считает любой `#...` глубокой ссылкой и не зовёт гид-приглашение; для этой
 * ссылки так и надо). Поэтому вызов в эффекте компонента, не на импорте модуля.
 * Supabase идёт через `flowType: 'pkce'` (`?code=`), хеш с `lab-done=` его
 * `detectSessionInUrl` не касается.
 *
 * Чистый модуль без импортов: гейт `npm run test:lab-done` собирает его одним файлом.
 */

export const LAB_DONE_KEY = 'quaera.labDone';
export const LAB_DONE_EVENT = 'quaera:lab-done';

/** Что Lab может прислать: вид и id, оба из `[a-z0-9-]`. Пока вид один. */
const KEY_RE = /^pipeline:[a-z0-9-]+$/;

/** Отметка из фрагмента адреса и сам фрагмент без неё; null, если отметки нет или она не по формату. */
export function parseLabDone(hash: string): { key: string; rest: string } | null {
  const parts = hash.replace(/^#/, '').split('&').filter(Boolean);
  const i = parts.findIndex((p) => /^lab-done=/i.test(p));
  if (i < 0) return null;
  let value = parts[i].slice('lab-done='.length);
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  value = value.toLowerCase();
  if (!KEY_RE.test(value)) return null;
  const rest = parts.filter((_, j) => j !== i).join('&');
  return { key: value, rest: rest ? `#${rest}` : '' };
}

/** Что лежит в хранилище: только записи по формату с датой-строкой, остальное выбрасывается. */
export function readLabDoneMap(raw: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw) return out;
  try {
    const p = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
    for (const [k, v] of Object.entries(p)) if (KEY_RE.test(k) && typeof v === 'string') out[k] = v;
  } catch {
    /* повреждённое значение: начинаем заново */
  }
  return out;
}

/** Хранилище после новой отметки: старые записи остаются, повторный приход обновляет дату. */
export function mergeLabDone(raw: string | null, key: string, iso: string): string {
  return JSON.stringify({ ...readLabDoneMap(raw), [key]: iso });
}

interface Loc {
  pathname: string;
  search: string;
  hash: string;
}

/**
 * Принять отметку из адреса: записать и стереть из строки. Возвращает ключ или null.
 * `replace` получает новый адрес (путь, запрос, остаток фрагмента); хранилище может не работать.
 */
export function acceptLabDone(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  loc: Loc,
  replace: (url: string) => void,
  now: Date = new Date()
): string | null {
  const found = parseLabDone(loc.hash);
  if (!found) return null;
  try {
    storage.setItem(LAB_DONE_KEY, mergeLabDone(storage.getItem(LAB_DONE_KEY), found.key, now.toISOString()));
  } catch {
    /* приватный режим: отметка живёт до закрытия вкладки, то есть вовсе не живёт; тост всё равно скажет спасибо */
  }
  try {
    replace(loc.pathname + loc.search + found.rest);
  } catch {
    /* адрес останется как был: повторный приход лишь обновит дату */
  }
  return found.key;
}
