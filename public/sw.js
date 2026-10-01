// Service Worker: hält die App-Dateien vor, damit die App auch offline startet.
// Netzwerk zuerst (immer aktuelle Version), bei fehlender Verbindung aus dem Cache.
// Anfragen an die GitHub-API werden nie zwischengespeichert.
const CACHE = 'timetracker-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req, { ignoreSearch: true });
        if (cached) return cached;
        // Navigation (z.B. /TimeTracker/job/123) → App-Shell
        if (req.mode === 'navigate') return caches.match(new URL('./', self.registration.scope).href);
        return Response.error();
      }),
  );
});
