/**
 * Service worker: приложение обязано работать без сети.
 *
 * Стратегии разные, потому что ресурсы разные по природе:
 *  - навигация — сеть с откатом на кеш: так обновление подхватывается сразу,
 *    но при отсутствии сети приложение всё равно открывается;
 *  - ассеты с хешем в имени и датасет — кеш вперёд: они неизменяемы,
 *    а датасет весит 3.5 МБ, и повторно тянуть его по мобильному интернету нельзя.
 */

const VERSION = 'v1';
const SHELL = `querium-shell-${VERSION}`;
const ASSETS = `querium-assets-${VERSION}`;

/** Минимум, без которого приложение не откроется офлайн. */
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/sqljs/sql-wasm.js', '/sqljs/sql-wasm.wasm', '/sql-worker.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      // Отдельные запросы: один недоступный ресурс не должен ронять всю установку.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL && k !== ASSETS).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isImmutable = (url) =>
  url.pathname.startsWith('/assets/') ||
  url.pathname.startsWith('/sqljs/') ||
  url.pathname.startsWith('/data/') ||
  url.pathname.startsWith('/icons/');

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r ?? Response.error()))
    );
    return;
  }

  if (isImmutable(url)) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(request, copy));
            }
            return res;
          })
      )
    );
  }
});
