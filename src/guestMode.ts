/**
 * Гостевой просмотр: показать тренажёр как видит его новый человек, не
 * открывая инкогнито и не трогая свой прогресс.
 *
 * `localStorage` общий на весь браузерный профиль — новая вкладка всё равно
 * видит чужой (то есть свой) прогресс и вход. Флажок здесь живёт
 * в `sessionStorage`, который **привязан к вкладке**: пока он включён, все
 * модули хранения читают и пишут не в `localStorage`, а в `sessionStorage`
 * этой же вкладки — он у неё пуст, поэтому экран сразу показывает состояние
 * нового занимающегося (кампания с первого дня, счётчики с нуля). Выключили
 * флажок или закрыли вкладку — обычный `localStorage` и обычная сессия
 * входа, ни разу не тронутые за всё время просмотра.
 */

const GUEST_FLAG_KEY = 'quaera-guest-preview';

function readFlag(): boolean {
  try {
    return sessionStorage.getItem(GUEST_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Решается один раз при загрузке модуля, а не на каждый вызов.
 *
 * `window.location.reload()` в enterGuestPreview/exitGuestPreview ниже не
 * останавливает текущую страницу мгновенно: до фактической перезагрузки
 * успевают дожить отложенные таймеры (например, автосохранение занятия
 * в App.tsx — `window.setTimeout(persistSession, 600)`). Читай isGuestMode()
 * заново на каждый вызов, и такой таймер, сработавший в этом окне, писал бы
 * настоящий, ещё не гостевой снимок занятия — уже в `sessionStorage`,
 * потому что флажок к тому моменту успел включиться. На реальный `localStorage`
 * это не влияет (снимок там и остаётся), но гостевой просмотр открывался бы
 * не с чистого листа, а с чужим недорешённым занятием. Замороженное на весь
 * жизненный цикл страницы значение убирает гонку: до перезагрузки код
 * с этой страницы видит старый режим, после — уже новый, с нуля.
 */
const GUEST_MODE = readFlag();

export function isGuestMode(): boolean {
  return GUEST_MODE;
}

/** Хранилище, в которое сейчас пишут модули состояния: реальное или гостевое. */
export function appStorage(): Storage {
  return GUEST_MODE ? sessionStorage : localStorage;
}

export function enterGuestPreview(): void {
  try {
    sessionStorage.setItem(GUEST_FLAG_KEY, '1');
  } catch {
    // sessionStorage недоступен — включить гостевой просмотр нечем
  }
  window.location.reload();
}

export function exitGuestPreview(): void {
  try {
    sessionStorage.removeItem(GUEST_FLAG_KEY);
  } catch {
    // см. enterGuestPreview
  }
  window.location.reload();
}
