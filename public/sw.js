/* Live TV service worker — offline app shell + cached channel data */
const VERSION = 'v3';
const SHELL_CACHE = `shell-${VERSION}`;
const RUNTIME_CACHE = `runtime-${VERSION}`;
const API_CACHE = `api-${VERSION}`;
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const current = [SHELL_CACHE, RUNTIME_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !current.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  /* same-origin: offline-capable app shell */
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      // Network first (fresh HTML), fall back to cache when offline
      event.respondWith(
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(RUNTIME_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        }).catch(() =>
          caches.match('/index.html').then((hit) => hit || caches.match('/'))
        )
      );
      return;
    }
    // Static assets (hashed by Vite): cache first — instant repeats
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(RUNTIME_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => caches.match('/index.html'));
      })
    );
    return;
  }

  /* Live TV API: network first, cache fallback — channels stay browsable offline */
  if (url.hostname.endsWith('workers.dev')) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(API_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  /* everything else (streams, logos): hand back to the browser */
});
