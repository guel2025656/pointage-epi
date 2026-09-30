const CACHE = 'pointage-epi-v1';
const SHELL = ['/', '/styles.css', '/app.js', '/manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// Coquille applicative en cache-first ; API toujours en direct (réseau).
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) return; // ne jamais mettre l'API en cache
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
