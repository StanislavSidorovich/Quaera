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
const SHELL = `querium-shell-${VERSION}`;
const ASSETS = `querium-assets-${VERSION}`;

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
const VENDOR = `querium-pyodide-__VENDOR_ID__`;

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

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS && k !== VENDOR).map((k) => caches.delete(k)))
      )
      .then(() => ensurePrecache())
      .then(() => self.clients.claim())
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
      fetch(request)
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
  // Не блокирует ответ: восстановление идёт фоном.
  event.waitUntil(ensurePrecache());

  event.respondWith(
    (async () => {
      // Кеш проверяется для всего, а не только для «неизменяемых» путей.
      // Иначе предзагруженные файлы в корне — /sql-worker.js, /manifest.webmanifest —
      // офлайн уходили бы в сеть, и приложение открывалось бы, но не работало.
      const hit = await fromCache(request);
      if (hit) return hit;
      if (!isImmutable(url)) return fetch(request);
      try {
        const res = await fetch(request);
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
