const CACHE = 'pointage-epi-v5';
const SHELL = [
  '/', '/styles.css', '/app.js', '/manifest.json',
  '/vendor/bcrypt.min.js',
  '/assets/unicef-logo.svg', '/assets/armoiries-ci.svg', '/assets/armoiries.png',
  '/assets/icon-192.png', '/assets/icon-512.png', '/assets/apple-touch-icon.png',
];

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

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // L'API n'est jamais mise en cache : en ligne direct, sinon l'appli gère
  // elle-même la file d'attente locale (voir app.js).
  if (url.pathname.startsWith('/api/')) return;

  // Navigation (ouverture de page, y compris via un QR code avec ?site=...&lat=...) :
  // on essaie le réseau, et on retombe sur la coquille applicative en cache si hors-ligne.
  // Peu importe les paramètres de l'URL : l'appli lit location.search elle-même.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match('/'))
    );
    return;
  }

  // Fichiers de l'appli (CSS/JS/icônes) : cache d'abord, réseau en secours.
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});

// Clic sur une notification de rappel : on ramène l'utilisateur dans l'application.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      if (wins.length) return wins[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
