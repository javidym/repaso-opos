/* Service worker · Repaso OPOS
   Sube el número de versión cuando cambies preguntas.js o el código. */
var VERSION = 'repaso-opos-v31';
var ASSETS = [
  './',
  './index.html',
  './app.js',
  './data/preguntas.js',
  './manifest.webmanifest',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// network-first para tener siempre las últimas preguntas cuando hay conexión,
// con vuelta a la caché cuando se está sin conexión.
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  // Pedimos a la red saltándonos la caché HTTP del navegador (cache:'reload'),
  // así los cambios de app.js/preguntas.js llegan sin esperar a que caduque la caché.
  var netReq = (e.request.url.indexOf(self.location.origin) === 0)
    ? new Request(e.request.url, { cache: 'reload' })
    : e.request;
  e.respondWith(
    fetch(netReq).then(function (resp) {
      var copy = resp.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      return resp;
    }).catch(function () {
      return caches.match(e.request).then(function (m) { return m || caches.match('./index.html'); });
    })
  );
});
