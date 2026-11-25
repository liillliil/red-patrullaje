/* Service worker: permite instalar la app y carga rápida. Siempre intenta la red primero. */
var CACHE = 'patrullaje-v2';
var ARCHIVOS = ['./', './index.html', './panel.html', './css/estilos.css', './js/config.js', './js/comun.js', './js/policia.js', './js/panel.js', './manifest.json', './icons/icon-192.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ARCHIVOS); }).catch(function () { }));
  self.skipWaiting();
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (k) { return Promise.all(k.filter(function (n) { return n !== CACHE; }).map(function (n) { return caches.delete(n); })); }));
  self.clients.claim();
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  // Solo archivos propios (GET). Las llamadas a la API de Google nunca se guardan.
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      var copia = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copia); });
      return res;
    }).catch(function () { return caches.match(req, { ignoreSearch: true }); })
  );
});
