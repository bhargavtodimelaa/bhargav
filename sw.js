// Service Worker v3 — Advanced caching with TTL, background sync, and offline support
const CACHE_VERSION = 'ltv-v3';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const CDN_CACHE = `${CACHE_VERSION}-cdn`;
const API_CACHE = `${CACHE_VERSION}-api`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes for API data
const CDN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days for CDN assets

const SHELL = ['./', './index.html', './worker.js'];
const CDN_ASSETS = [
  'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/shaka-player.ui.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/controls.min.css'
];

// ---- Install: pre-cache shell + CDN ----
self.addEventListener('install', e => {
  e.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(c => c.addAll(SHELL)),
      caches.open(CDN_CACHE).then(c =>
        Promise.all(CDN_ASSETS.map(url =>
          fetch(url, { mode: 'cors' }).then(r => c.put(url, r)).catch(() => {})
        ))
      )
    ]).then(() => self.skipWaiting())
  );
});

// ---- Activate: clean old caches ----
self.addEventListener('activate', e => {
  const keep = new Set([SHELL_CACHE, CDN_CACHE, API_CACHE, IMAGE_CACHE]);
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ---- Helper: TTL-aware cache put ----
async function ttlPut(cacheName, request, response, ttl) {
  const cache = await caches.open(cacheName);
  const headers = new Headers(response.headers);
  headers.set('sw-cached-at', Date.now().toString());
  headers.set('sw-ttl', ttl.toString());
  const timedResponse = new Response(response.clone().body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
  await cache.put(request, timedResponse);
}

// ---- Helper: check TTL expiry ----
function isExpired(response) {
  const cachedAt = parseInt(response.headers.get('sw-cached-at') || '0', 10);
  const ttl = parseInt(response.headers.get('sw-ttl') || '0', 10);
  return ttl > 0 && (Date.now() - cachedAt) > ttl;
}

// ---- Fetch handler with strategy routing ----
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  const method = e.request.method;

  // Only handle GET requests
  if (method !== 'GET') return;

  // CDN assets: cache-first (versioned, immutable)
  if (u.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(cacheFirst(e.request, CDN_CACHE));
    return;
  }

  // API calls: network-first with TTL cache fallback
  if (u.pathname === '/channels' || u.pathname === '/cookies') {
    e.respondWith(networkFirstWithTTL(e.request, API_CACHE, CACHE_TTL));
    return;
  }

  // Image assets (ui-avatars, logos): cache-first with network fallback
  if (u.hostname === 'ui-avatars.com' || /\.(png|jpg|jpeg|gif|webp|avif|svg)(\?|$)/i.test(u.pathname)) {
    e.respondWith(cacheFirst(e.request, IMAGE_CACHE));
    return;
  }

  // HTML shell: stale-while-revalidate
  if (e.request.mode === 'navigate' || u.pathname === '/' || u.pathname === '/index.html') {
    e.respondWith(staleWhileRevalidate(e.request, SHELL_CACHE));
    return;
  }

  // Worker JS: cache-first
  if (u.pathname === '/worker.js') {
    e.respondWith(cacheFirst(e.request, SHELL_CACHE));
    return;
  }

  // Everything else: network-first
  e.respondWith(networkFirst(e.request));
});

// ---- Strategy: Cache-first ----
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}

// ---- Strategy: Network-first ----
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ---- Strategy: Network-first with TTL cache ----
async function networkFirstWithTTL(request, cacheName, ttl) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      await ttlPut(cacheName, request, response, ttl);
    }
    return response;
  } catch (_) {
    const cached = await caches.match(request);
    if (cached && !isExpired(cached)) return cached;
    return cached || new Response('[]', {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// ---- Strategy: Stale-while-revalidate ----
async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) {
      ttlPut(cacheName, request, response, CACHE_TTL);
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}

// ---- Background Sync: retry failed API calls when back online ----
self.addEventListener('sync', e => {
  if (e.tag === 'retry-channels') {
    e.waitUntil(retryChannels());
  }
});

async function retryChannels() {
  try {
    const response = await fetch('https://fragrant-butterfly-575f.bhargavtodimela4.workers.dev/channels');
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      await ttlPut(API_CACHE, new Request('https://fragrant-butterfly-575f.bhargavtodimela4.workers.dev/channels'), response, CACHE_TTL);
      // Notify all clients that data is updated
      const clients = await self.clients.matchAll();
      clients.forEach(client => client.postMessage({ type: 'CHANNELS_UPDATED' }));
    }
  } catch (_) {}
}

// ---- Push notifications (for future use) ----
self.addEventListener('push', e => {
  if (!e.data) return;
  const data = e.data.json();
  e.waitUntil(
    self.registration.showNotification(data.title || 'Live TV', {
      body: data.body || 'New content available',
      icon: data.icon || '/icon-192.png',
      badge: data.badge || '/badge-72.png',
      data: data.url || '/'
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(clients => {
      const url = e.notification.data || '/';
      for (const client of clients) {
        if (client.url.includes(self.registration.scope) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// ---- Message handler for cache management ----
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (e.data && e.data.type === 'CLEAR_API_CACHE') {
    caches.delete(API_CACHE);
  }
  if (e.data && e.data.type === 'CACHE_STATS') {
    Promise.all([
      caches.open(SHELL_CACHE).then(c => c.keys()),
      caches.open(CDN_CACHE).then(c => c.keys()),
      caches.open(API_CACHE).then(c => c.keys()),
      caches.open(IMAGE_CACHE).then(c => c.keys())
    ]).then(([shell, cdn, api, images]) => {
      e.source.postMessage({
        type: 'CACHE_STATS',
        data: {
          shell: shell.length,
          cdn: cdn.length,
          api: api.length,
          images: images.length,
          total: shell.length + cdn.length + api.length + images.length
        }
      });
    });
  }
});