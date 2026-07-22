// @file sw.js
// @brief Service Worker: precache app-shell + runtime SWR для прогноза
// @context{Регистрируется из app.js (guarded, D-SW-GUARD); работает только в secure context}
// @strategy{Precache app-shell при install; runtime stale-while-revalidate для weather-API; очистка старых кэшей при activate}
// @keywords{PWA, SERVICE_WORKER, CACHE, SWR, OFFLINE}
// GREP_SUMMARY: sw.js, service worker, PWA, precache, stale-while-revalidate, offline, app-shell, cache API

// ВАЖНО: при каждом релизе с изменениями app.js/index.html БАМПИТЬ версию (vN→vN+1).
// Иначе sw.js остаётся байт-идентичным → браузер не переустанавливает воркер →
// клиенты продолжают получать старый закэшированный app-shell из предыдущего кэша.
// На activate (ниже) старые кэши (key !== CACHE_NAME) удаляются автоматически.
var CACHE_NAME = 'weather-pwa-v3';
var APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icons/icon.svg'
];

// Precache app-shell при установке
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// Очистка старых кэшей при активации
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Runtime: SWR для weather-API, cache-first для app-shell
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // App-shell: cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(function (cached) {
        if (cached) { return cached; }
        return fetch(event.request).then(function (response) {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      }).catch(function () {
        // Fallback для навигации
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503 });
      })
    );
    return;
  }

  // Weather-API: stale-while-revalidate
  if (url.hostname.indexOf('open-meteo') !== -1 ||
      url.hostname.indexOf('wttr.in') !== -1 ||
      url.hostname.indexOf('api.met.no') !== -1 ||
      url.hostname.indexOf('bigdatacloud') !== -1) {
    event.respondWith(
      caches.open(CACHE_NAME).then(function (cache) {
        return cache.match(event.request).then(function (cached) {
          var fetchPromise = fetch(event.request).then(function (response) {
            if (response.ok) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(function () {
            return cached || new Response('{"error":"offline"}', {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
          return cached || fetchPromise;
        });
      })
    );
  }
});
