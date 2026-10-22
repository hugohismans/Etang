// Service worker minimal : l'étang fonctionne hors ligne après une première visite.
// - page (navigation) : réseau d'abord, cache en secours ;
// - fichiers (JS, CSS, icônes, tous versionnés par Vite) : cache d'abord.
const CACHE = 'etang-v1';
const SHELL = ['./', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL);
      // Met aussi en cache les fichiers référencés par la page (noms hachés par Vite).
      try {
        const html = await (await fetch('./', { cache: 'no-store' })).text();
        const urls = [...html.matchAll(/(?:src|href)="(\.?\/?assets\/[^"]+)"/g)].map((m) => m[1]);
        await cache.addAll(urls);
      } catch {
        /* hors ligne pendant l'installation : ce sera fait au prochain passage */
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const cache = await caches.open(CACHE);
          await cache.put('./', res.clone());
          return res;
        } catch {
          return (await caches.match('./')) ?? Response.error();
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(req, res.clone());
      }
      return res;
    })(),
  );
});
