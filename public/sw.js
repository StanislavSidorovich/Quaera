/**
 * Service worker: приложение обязано работать без сети.
 *
 * Стратегии разные, потому что ресурсы разные по природе:
 *  - навигация — сеть с откатом на кеш: так обновление подхватывается сразу,
 *    но при отсутствии сети приложение всё равно открывается;
 *  - ассеты с хешем в имени и датасет — кеш вперёд: они неизменяемы,
 *    а датасет весит 3.5 МБ, и повторно тянуть его по мобильному интернету нельзя.
 */

// Подставляется на сборке (scripts/postbuild-sw.mjs). Новая версия принудительно
// сбрасывает старые кеши: иначе устройство, где приложение уже установлено,
// продолжит открывать прошлую сборку.
const VERSION = '__BUILD_ID__';
const SHELL = `quaera-shell-${VERSION}`;
const ASSETS = `quaera-assets-${VERSION}`;

/**
 * Рантайм Python — в кеше, не привязанном к версии сборки.
 *
 * Pyodide с pandas весит 51 МБ, и человек согласился скачать его один раз.
 * Пока он лежал в ASSETS, его стирал каждый деплой: activate удаляет все
 * кеши, кроме имён текущей версии, — и в день, когда собрано шесть версий,
 * это шесть повторных загрузок по 51 МБ. Именно так это и выглядело
 * снаружи: «при каждом обновлении страницы качает заново».
 *
 * Привязка не к сборке, а к самому Pyodide: версия подставляется из
 * pyodide-lock.json (см. scripts/postbuild-sw.mjs). Пути внутри /pyodide/
 * при обновлении рантайма не меняются, поэтому только смена его версии
 * и должна сбрасывать этот кеш — деплой правки в CSS не должен.
 */
const VENDOR = `quaera-pyodide-__VENDOR_ID__`;

/**
 * То же имя до переименования приложения (querium → quaera, домен quaera.app).
 *
 * Имена кешей переименованы вместе со всем остальным, но у этого кеша
 * переименование не косметическое: `activate` удаляет всё, чего нет в списке
 * текущих имён, — то есть простая смена строки заставила бы каждого, кто уже
 * согласился на 51 МБ рантайма, скачать их заново, возможно по мобильному
 * интернету. Ровно от этого кеш и отвязан от версии сборки (см. VENDOR выше),
 * и терять это на переименовании было бы странно.
 *
 * Поэтому содержимое переносится копированием (adoptLegacyVendor), а не
 * перекачивается: копия идёт по диску, без сети. Строка нужна до тех пор,
 * пока в природе есть устройства, не открывавшие приложение с момента
 * переименования; убирать вместе со следующей сменой версии Pyodide —
 * тогда старый кеш становится негодным сам по себе.
 */
const LEGACY_VENDOR = `querium-pyodide-__VENDOR_ID__`;

/** Что живёт в кеше без версии сборки: содержимое задано пином в scripts/sync-pyodide.mjs. */
const isVendor = (url) => url.pathname.startsWith('/pyodide/');

/**
 * Собранные бандлы с хешем в имени. Список подставляется на сборке, потому что
 * иначе они не попадут в кеш при первом визите: браузер запрашивает их раньше,
 * чем service worker успевает взять страницу под контроль, — и офлайн заработал бы
 * только со второго запуска. Для приложения, которое ставят на телефон, это
 * означало бы пустой экран в первой же поездке без сети.
 */
const BUILD_ASSETS = [/* __BUILD_ASSETS__ */];

/** Минимум, без которого приложение не откроется офлайн. */
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/sqljs/sql-wasm.js',
  '/sqljs/sql-wasm.wasm',
  '/sql-worker.js',
  '/grade-lib.js',
  '/python-worker.js',
  '/python-bootstrap.py',
  '/data/schema.json',
  ...BUILD_ASSETS,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Отдельные запросы: один недоступный ресурс не должен ронять всю установку.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

/**
 * Досоздание пропавшего кеша.
 *
 * Событие install происходит один раз на версию воркера. Если браузер потом
 * вытеснит кеш при нехватке места на устройстве — а офлайн-приложение с базой
 * на 12 МБ первый кандидат на вытеснение, — повторной установки не будет,
 * и приложение молча перестанет открываться без сети. Поэтому состав кеша
 * проверяется при каждом запуске воркера и недостающее докладывается.
 */
let precacheChecked = false;
async function ensurePrecache() {
  if (precacheChecked) return;
  const cache = await caches.open(SHELL);
  const missing = [];
  for (const url of PRECACHE) {
    if (!(await cache.match(url, { ignoreVary: true }))) missing.push(url);
  }
  if (!missing.length) {
    precacheChecked = true;
    return;
  }
  const results = await Promise.allSettled(missing.map((url) => cache.add(url)));
  // Отмечаем проверенным только при полном успехе: если восстановление шло
  // без сети, попытку нужно повторить позже, а не считать выполненной.
  precacheChecked = results.every((r) => r.status === 'fulfilled');
}

/**
 * Перенос кеша рантайма из-под старого имени (см. LEGACY_VENDOR).
 *
 * Возвращает `false`, если перенос нужен, но не удался целиком, — тогда старый
 * кеш не удаляется и попытка повторится на следующей активации. Половина
 * скопированного хуже, чем ничего: недостающие файлы уйдут в сеть по одному,
 * то есть человек всё равно заплатит трафиком, только не заметит, за что.
 */
async function adoptLegacyVendor() {
  const keys = await caches.keys();
  if (!keys.includes(LEGACY_VENDOR)) return true;
  try {
    const [from, to] = await Promise.all([caches.open(LEGACY_VENDOR), caches.open(VENDOR)]);
    for (const request of await from.keys()) {
      if (await to.match(request)) continue;
      const response = await from.match(request);
      if (!response) continue;
      await to.put(request, response);
    }
    return true;
  } catch {
    // Чаще всего это нехватка места: копия существует рядом с оригиналом,
    // пока старый кеш не удалён, и на тесном устройстве 51 МБ может не влезть.
    return false;
  }
}

/**
 * Удаление кешей прошлых версий — только после того, как новый собран целиком.
 *
 * Порядок здесь не косметика, а защита от белого экрана. `install` собирает
 * PRECACHE через `allSettled`: одна сетевая заминка оставляет новый SHELL
 * неполным, установку при этом не роняет, и `skipWaiting` всё равно
 * активирует воркер. Удали в этот момент прежние кеши — и до следующего
 * удачного захода в сеть приложение не откроется вовсе: навигация уйдёт
 * в `fromCache('/index.html')`, не найдёт там ничего и вернёт
 * `Response.error()`. Ровно то же и с бандлом: промах кеша у пути с хешем
 * в имени идёт в сеть, а сети нет — и запасного варианта уже не осталось,
 * потому что старый удалили.
 *
 * Довод тот же, что у adoptLegacyVendor: половина нового хуже целого старого.
 * Пока `precacheChecked` не поднят, прежние кеши — единственное, чем
 * приложение открывается без сети, и они остаются. Повтор бесплатен:
 * `ensurePrecache` зовётся из fetch при каждом запуске воркера, а `activate`
 * происходит один раз на версию и второго шанса бы не дал.
 */
let supersededCleared = false;
async function cleanupSupersededCaches() {
  if (supersededCleared || !precacheChecked) return;
  const adopted = await adoptLegacyVendor();
  const keys = await caches.keys();
  await Promise.all(
    keys
      .filter((k) => k !== SHELL && k !== ASSETS && k !== VENDOR)
      .filter((k) => adopted || k !== LEGACY_VENDOR)
      .map((k) => caches.delete(k))
  );
  // Неусвоенный legacy-кеш значит «повторить позже», а не «готово».
  supersededCleared = adopted;
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await ensurePrecache();
      await cleanupSupersededCaches();
      await self.clients.claim();
    })()
  );
});

/**
 * Схема данных — единственный файл, у которого путь постоянный, а содержимое
 * меняется вместе с датасетом. Отсюда сеть вперёд, как у навигации.
 *
 * Кеш вперёд здесь уже стоил ошибки: `/data/schema.json` лежал под тем же
 * правилом, что бандлы с хешем в имени, и после переезда датасета в Японию
 * экран «Данные» продолжал показывать российские регионы — притом что
 * и сайт, и репозиторий были правильные. Форму такого документа приложение
 * проверяет (isLocalized в SchemaSheet.tsx), но здесь форма совпадала:
 * устарело именно содержимое, и поймать это может только запрос в сеть.
 *
 * Датасет остаётся кешем вперёд: 3.5 МБ по мобильному интернету, и он всё
 * равно перезапрашивается на каждой сборке вместе с именем кеша ASSETS.
 * Схема — 33 КБ, её свежесть стоит одного запроса.
 */
const isSchema = (url) => url.pathname === '/data/schema.json';

/**
 * Данные, которым нельзя верить браузерному HTTP-кешу.
 *
 * `fetch()` внутри service worker'а — не «сходить в сеть», а «спросить
 * сетевой слой», и слой этот сначала смотрит в свой HTTP-кеш. Пока `/data/*`
 * раздавалось с `max-age=604800`, свежая копия оттуда не запрашивалась
 * неделю: после переезда датасета на латиницу Chrome ещё сутки показывал
 * прежние названия брендов, хотя стратегия «сеть вперёд» для схемы уже
 * стояла и формально работала. Заголовок исправлен (см. public/_headers),
 * но устройства, успевшие запомнить старое правило, дожили бы с ним
 * до конца недели — их расколдовывает только явный `cache: 'no-cache'`,
 * который заставляет спросить сервер независимо от срока годности.
 *
 * Не `'reload'`: тот запрещает и условный запрос тоже, то есть тянул бы
 * 3.5 МБ там, где хватает ETag и ответа 304.
 */
const revalidating = (request) => new Request(request, { cache: 'no-cache' });
const isData = (url) => url.pathname.startsWith('/data/');

/** Файлы, которые можно докладывать в кеш по мере запроса: имя однозначно задаёт содержимое. */
const isImmutable = (url) =>
  url.pathname.startsWith('/assets/') ||
  url.pathname.startsWith('/sqljs/') ||
  url.pathname.startsWith('/pyodide/') ||
  (url.pathname.startsWith('/data/') && !isSchema(url)) ||
  url.pathname.startsWith('/icons/');

/**
 * Все обращения к кешу идут с ignoreVary, и это не перестраховка.
 *
 * Серверы отдают статику с заголовком Vary (Origin у Vite, Accept-Encoding
 * у большинства CDN). В кеш файл попадает из запроса, который этих заголовков
 * не несёт, а браузер запрашивает модульный скрипт с атрибутом crossorigin —
 * то есть уже с Origin. По правилам Vary это разные запросы, совпадения нет,
 * и офлайн молча ломается: скрипт не грузится, остаётся пустая страница.
 * Для файлов с хешем в имени учитывать Vary бессмысленно — содержимое
 * однозначно задано именем.
 */
const fromCache = (request) => caches.match(request, { ignoreVary: true });

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Навигация: сеть вперёд, чтобы обновление подхватывалось сразу,
  // с откатом на кеш, когда сети нет.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(async () => (await fromCache('/index.html')) ?? Response.error())
    );
    return;
  }

  // Сам service worker перехватывать нельзя: браузер должен видеть его свежую
  // версию, иначе приложение навсегда застрянет на текущей сборке.
  if (url.pathname === '/sw.js') return;

  // Схема данных: сеть вперёд, кеш — запасной аэродром на офлайн.
  if (isSchema(url)) {
    event.respondWith(
      fetch(revalidating(request))
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(async () => (await fromCache(request)) ?? Response.error())
    );
    return;
  }

  // Проверка целостности кеша при первом запросе после запуска воркера.
  // Не блокирует ответ: восстановление идёт фоном. Уборка прежних версий
  // прицеплена сюда же — она отложена, если кеш собрался не с первого раза
  // (см. cleanupSupersededCaches), и это её единственный шанс догнать.
  event.waitUntil(ensurePrecache().then(cleanupSupersededCaches));

  event.respondWith(
    (async () => {
      // Кеш проверяется для всего, а не только для «неизменяемых» путей.
      // Иначе предзагруженные файлы в корне — /sql-worker.js, /manifest.webmanifest —
      // офлайн уходили бы в сеть, и приложение открывалось бы, но не работало.
      const hit = await fromCache(request);
      if (hit) return hit;
      if (!isImmutable(url)) return fetch(request);
      try {
        // Промах кеша воркера у датасета означает «эта сборка хочет свежую
        // копию» — значит и HTTP-кеш обязан спросить сервер, а не ответить
        // сам (см. revalidating выше).
        const res = await fetch(isData(url) ? revalidating(request) : request);
        if (res.ok) {
          const copy = res.clone();
          caches.open(isVendor(url) ? VENDOR : ASSETS).then((c) => c.put(request, copy));
        }
        return res;
      } catch (err) {
        // Сети нет и точного совпадения не нашлось — пробуем ещё раз,
        // игнорируя строку запроса: она бывает добавлена для обхода кеша.
        const loose = await caches.match(request, { ignoreVary: true, ignoreSearch: true });
        if (loose) return loose;
        throw err;
      }
    })()
  );
});

/**
 * Напоминания: текст собирается здесь, а не приходит с сервера.
 *
 * Сервер присылает только число (см. supabase/functions/push-send). Причина
 * не в экономии байтов: так у того, кто добудет приватный ключ VAPID,
 * нет способа показать человеку произвольный текст от имени приложения —
 * он сможет ошибиться числом, но не подменить фразу.
 *
 * Цена решения названа честно: это единственная проза приложения, живущая
 * не в `src/i18n/`. Иначе никак — service worker не видит ни бандла,
 * ни localStorage, а тянуть в него модуль локалей значит тащить в воркер,
 * который обязан оставаться крошечным, половину приложения. Правя строки
 * ниже, править и там: `push.title` / `push.body` в ru.ts и en.ts держат
 * те же фразы для экрана настроек.
 */
const PUSH_TEXT = {
  ru: {
    title: 'Пора повторить',
    /*
     * Запасная формулировка на случай, когда числу верить нельзя (payload
     * незнакомой версии или испорчен). Она не «то же самое без числа»:
     * фраза построена так, чтобы быть верной при любом количестве, —
     * соврать «1 тема» там, где их пять, дешевле не будет.
     */
    bodyNoCount: 'Подошли темы для повторения. Занятие — 7–10 минут.',
    body: (n) => {
      const mod100 = n % 100;
      const mod10 = n % 10;
      const teens = mod100 >= 11 && mod100 <= 14;
      const word = teens ? 'тем' : mod10 === 1 ? 'тема' : mod10 >= 2 && mod10 <= 4 ? 'темы' : 'тем';
      const verb = !teens && mod10 === 1 ? 'подошла' : 'подошли';
      return `${n} ${word} ${verb} к повторению. Занятие — 7–10 минут.`;
    },
  },
  en: {
    title: 'Time to review',
    /*
     * «7 to 10», а не «7–10», и это не стиль: ровно эта фраза процитирована
     * на экране настроек как образец («It looks like this…», account.pushExample
     * в en.ts), а бюджет тире у английского текста нулевой (test:prose-en).
     * Разойдись они — образец перестал бы быть образцом.
     */
    bodyNoCount: 'Some topics are due for review. A session takes 7 to 10 minutes.',
    body: (n) => `${n} ${n === 1 ? 'topic is' : 'topics are'} due. A session takes 7 to 10 minutes.`,
  },
};

/**
 * Язык уведомления берётся у самого воркера, а не из payload.
 *
 * `self.navigator.language` — язык браузера, тот же источник, из которого
 * приложение выбирает локаль при первом запуске (`initialLocale`). Это
 * не идеально: человек, переключивший язык внутри приложения, получит
 * уведомление на языке системы. Зато язык не приходит снаружи — то есть
 * не может быть подменён вместе с числом, и таблица строк остаётся
 * закрытой от payload целиком.
 */
const pushLocale = () => (String(self.navigator.language || 'ru').startsWith('ru') ? 'ru' : 'en');

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      /*
       * Число из payload — единственное, что берётся снаружи, и оно
       * проверяется как чужое: не целое, не в диапазоне или payload
       * незнакомой версии — показываем уведомление без числа, а не мусор.
       * Версия `v` нужна не сегодняшнему воркеру, а тому, который останется
       * на устройстве после следующей правки формата.
       */
      let count = null;
      try {
        const data = event.data ? event.data.json() : null;
        if (data && data.v === 1 && Number.isInteger(data.count) && data.count >= 1 && data.count <= 999) {
          count = data.count;
        }
      } catch {
        /* payload не JSON — покажем нейтральный текст */
      }

      /*
       * Приложение открыто прямо сейчас — уведомление не показываем.
       * Человек и так видит и счётчик на главной, и бейдж; всплывшее
       * поверх открытого приложения напоминание «вернитесь в приложение»
       * читается как сбой, а не как забота.
       *
       * `userVisibleOnly` при этом не нарушается: браузер требует показать
       * уведомление, только если приложение не на виду, — открытая
       * видимая вкладка считается достаточной обратной связью.
       */
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (clients.some((c) => c.visibilityState === 'visible')) return;

      const text = PUSH_TEXT[pushLocale()];
      await self.registration.showNotification(text.title, {
        body: count === null ? text.bodyNoCount : text.body(count),
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        /*
         * Один тег на все напоминания: второе заменяет первое, а не ложится
         * рядом. Стопка одинаковых «пора повторить» за неделю — это то,
         * из-за чего уведомления выключают целиком.
         */
        tag: 'quaera-due',
        renotify: false,
        /*
         * Не `requireInteraction`: напоминание про повторение не то дело,
         * ради которого стоит держать баннер на экране, пока его не тронут.
         */
        data: { url: '/' },
      });
    })()
  );
});

/**
 * Нажатие на уведомление: поднять уже открытое окно, а не плодить новые.
 *
 * У установленной PWA новое окно на каждое нажатие — это несколько копий
 * приложения с общим localStorage и расходящимся состоянием в памяти,
 * то есть ровно тот класс дефекта, который чинили в восстановлении занятия.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })()
  );
});
