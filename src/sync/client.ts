import { createClient, type Session } from '@supabase/supabase-js';

/**
 * Клиент Supabase и вход через Google.
 *
 * **Ключ лежит в коде открыто, и это не недосмотр.** Publishable-ключ
 * (`sb_publishable_…`) для того и назван так: он попадает в бандл при любом
 * способе хранения — переменные `VITE_*` подставляются на сборке, то есть
 * оказываются в том же JS, который любой откроет в девтулзах. Прятать его
 * в `.env` значит получить ту же публичность и вдобавок сборку, которая
 * молча ломается на деплое без переменных. Настоящая защита — не секретность
 * ключа, а RLS: политики в `supabase/migrations/0001_progress.sql` разрешают
 * трогать только строку с собственным `auth.uid()`, и ключ без входа
 * не открывает ничего.
 *
 * **Форк должен заменить эти две константы своими** — иначе чужая копия
 * будет писать в базу автора. В README про это сказано отдельно.
 */
const SUPABASE_URL = 'https://lueignziprnjnjiixdsh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Bjyj9gNlpgFJXhbWb7vhIg_DlpXtQpx';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    /*
     * PKCE, а не implicit. Разница видна именно в PWA: implicit возвращает
     * токен в хеше адреса, то есть он проходит через историю браузера
     * и через любой скрипт на странице. PKCE возвращает одноразовый код,
     * который меняется на токен отдельным запросом с секретом, живущим
     * только в этой вкладке.
     */
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  /*
   * Realtime не используется вовсе: прогресс синхронизируется по событиям
   * приложения, а не по подписке на изменения. Держать открытый веб-сокет
   * ради одной строки, которую меняет сам же владелец, — расход батареи
   * на телефоне без единого выигрыша.
   */
  realtime: { params: { eventsPerSecond: 0 } },
});

/**
 * Возврат из OAuth — на тот же адрес, с которого ушли.
 *
 * `window.location.origin`, а не захардкоженный домен: приложение живёт
 * и на `quaera.app`, и на `localhost:5173` при разработке, и на прежнем
 * `querium.pages.dev`. Захардкоженный адрес означал бы, что вход
 * работает ровно на одном из них.
 *
 * Тот же адрес обязан стоять в списке Redirect URLs в консоли Supabase
 * (Authentication → URL Configuration), иначе возврат отобьётся.
 */
export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

/**
 * Подписка на сессию: колбэк зовётся сразу текущим значением и дальше
 * на каждое изменение. Сразу — потому что при загрузке страницы сессия
 * восстанавливается из хранилища асинхронно, и компонент, спросивший
 * её синхронно, всегда увидел бы «не вошёл».
 */
export function subscribeSession(fn: (session: Session | null) => void): () => void {
  void supabase.auth.getSession().then(({ data }) => fn(data.session));
  const { data } = supabase.auth.onAuthStateChange((_event, session) => fn(session));
  return () => data.subscription.unsubscribe();
}
