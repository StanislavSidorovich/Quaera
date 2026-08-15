import { supabase } from './client';
import { mergeProgress } from './merge';
import { emptyProgress, type Progress } from '../srs/store';

/**
 * Обмен прогрессом с сервером.
 *
 * Весь модуль построен на одном правиле: **сеть не имеет права мешать
 * заниматься.** Приложение офлайн-первое, и до сих пор работало вовсе без
 * сервера; появление аккаунта не должно превратить отсутствие связи
 * в неисправность. Поэтому здесь нет ни одного `throw`: каждая функция
 * возвращает результат или `null`, а вызывающий продолжает с локальной
 * копией. Ошибку видно в консоли — и только.
 *
 * Порядок в `syncProgress` тоже следствие этого правила: сначала слить,
 * потом отдать наверх, и только потом писать на сервер. Человек видит
 * объединённый прогресс сразу, даже если запись не удалась.
 */

/** Строка прогресса этого пользователя или null — строки нет либо сеть недоступна. */
async function pull(userId: string): Promise<Progress | null> {
  const { data, error } = await supabase
    .from('progress')
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('[sync] не удалось прочитать прогресс:', error.message);
    return null;
  }
  if (!data) return null;

  /*
   * Проверка формы, а не доверие типу. Строка приходит из базы как jsonb,
   * то есть TypeScript о её содержимом не знает ничего — а `mergeProgress`
   * обходит `Object.keys(p.skills)` и упал бы на объекте без этого поля.
   * Это тот же рубеж, что `parseImportedProgress` для файла: чужие данные
   * проверяются на входе, а дальше внутри системы считаются валидными.
   */
  const raw = data.data as Partial<Progress> | null;
  if (!raw || typeof raw !== 'object' || raw.version !== 1) {
    console.warn('[sync] строка на сервере не похожа на прогресс — игнорируем');
    return null;
  }
  return { ...emptyProgress(), ...raw };
}

/** true — записалось. false — не записалось, и это не повод что-либо менять на экране. */
async function push(userId: string, progress: Progress): Promise<boolean> {
  const { error } = await supabase
    .from('progress')
    .upsert({ user_id: userId, data: progress }, { onConflict: 'user_id' });

  if (error) {
    console.warn('[sync] не удалось сохранить прогресс:', error.message);
    return false;
  }
  return true;
}

/**
 * Полный цикл: забрать серверную копию, слить с локальной, вернуть
 * объединённое и отправить обратно.
 *
 * **Слияние всегда, а не «если на сервере новее».** Вопроса «чья копия
 * свежее» здесь не существует в принципе: обе стороны могли заниматься
 * с последней встречи, и любой выбор одной из них теряет вторую.
 * Ровно от этого защищает фаза 1, и обходить её здесь нечем.
 *
 * Возвращает объединённый прогресс — вызывающий обязан положить его
 * и в состояние, и в localStorage, иначе следующая запись на сервер
 * отправит несведённую копию.
 */
export async function syncProgress(
  userId: string,
  local: Progress
): Promise<{ merged: Progress; ok: boolean }> {
  const remote = await pull(userId);
  const merged = remote ? mergeProgress(local, remote) : local;
  const ok = await push(userId, merged);
  /*
   * `ok` отдельно от прогресса: слияние удалось и без записи, объединённую
   * копию надо показать в любом случае. Отличается только подпись под
   * кнопкой — «сведено» против «сервер не ответил», — и врать в ней нельзя:
   * человек, увидевший «сохранено» при упавшей сети, закроет вкладку
   * спокойно и потеряет ровно то, что берёгся сохранить.
   */
  return { merged, ok };
}

/**
 * Отправка без чтения — для обычного хода занятия, когда локальная копия
 * заведомо новее серверной, потому что мы же её только что и слили.
 *
 * Отдельной функцией, а не `syncProgress` на каждое изменение: полный
 * цикл делает два запроса вместо одного и на каждом решённом задании
 * стоил бы лишний round-trip там, где сливать нечего.
 */
export const pushProgress = push;

/**
 * Удаление аккаунта: строка прогресса уходит здесь, сама запись
 * в `auth.users` — задача серверного кода, которого пока нет.
 *
 * Функция существует раньше кнопки намеренно: без неё «удалить аккаунт»
 * выглядело бы сделанным, пока в базе лежит вся история занятий. Что
 * именно ещё не сделано, записано в ROADMAP отдельным пунктом.
 */
export async function deleteRemoteProgress(userId: string): Promise<boolean> {
  const { error } = await supabase.from('progress').delete().eq('user_id', userId);
  if (error) {
    console.warn('[sync] не удалось удалить прогресс на сервере:', error.message);
    return false;
  }
  return true;
}
