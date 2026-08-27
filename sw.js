// Service Worker v4 — Final optimized version
'use strict';
var V='ltv-v4',SC=V+'-shell',CC=V+'-cdn',AC=V+'-api',IC=V+'-img';
var TTL=18e5; // 30 min
var SHELL=['./','./index.html','./worker.js'];
var CDN=[
  'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/shaka-player.ui.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.7.11/controls.min.css'
];

// Install: pre-cache shell + CDN
self.addEventListener('install', function(e) {
  e.waitUntil(
    Promise.all([
      caches.open(SC).then(function(c) { return c.addAll(SHELL); }),
      caches.open(CC).then(function(c) {
        return Promise.all(CDN.map(function(u) {
          return fetch(u, {mode: 'cors'}).then(function(r) { return c.put(u, r); }).catch(function() {});
        }));
      })
    ]).then(function() { self.skipWaiting(); })
  );
});

// Activate: clean old caches
self.addEventListener('activate', function(e) {
  var keep = new Set([SC, CC, AC, IC]);
  e.waitUntil(
    caches.keys().then(function(ks) {
      return Promise.all(ks.filter(function(k) { return !keep.has(k); }).map(function(k) { return caches.delete(k); }));
    }).then(function() { self.clients.claim(); })
  );
});

// TTL cache put
function tp(cn, req, res, t) {
  return caches.open(cn).then(function(c) {
    var h = new Headers(res.headers);
    h.set('ca', Date.now().toString());
    h.set('tl', t.toString());
    return c.put(req, new Response(res.clone().body, {status: res.status, statusText: res.statusText, headers: h}));
  });
}

// Check TTL expiry
function exp(r) {
  var a = parseInt(r.headers.get('ca') || '0', 10);
  var t = parseInt(r.headers.get('tl') || '0', 10);
  return t > 0 && (Date.now() - a) > t;
}

// Fetch routing
self.addEventListener('fetch', function(e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // CDN: cache-first
  if (u.hostname === 'cdnjs.cloudflare.com') {
    e.respondWith(cf(e.request, CC));
    return;
  }
  // API: network-first + TTL
  if (u.pathname === '/channels' || u.pathname === '/cookies') {
    e.respondWith(nwt(e.request, AC, TTL));
    return;
  }
  // Images: cache-first
  if (u.hostname === 'ui-avatars.com' || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(u.pathname)) {
    e.respondWith(cf(e.request, IC));
    return;
  }
  // HTML: stale-while-revalidate
  if (e.request.mode === 'navigate' || u.pathname === '/' || u.pathname === '/index.html') {
    e.respondWith(swr(e.request, SC));
    return;
  }
  // Worker: cache-first
  if (u.pathname === '/worker.js') {
    e.respondWith(cf(e.request, SC));
    return;
  }
  // Default: network-first
  e.respondWith(nf(e.request));
});

// Strategy: cache-first
function cf(request, cn) {
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(res) {
      if (res.ok) {
        caches.open(cn).then(function(c) { c.put(request, res.clone()); });
      }
      return res;
    }).catch(function() {
      return new Response('', {status: 408, statusText: 'Offline'});
    });
  });
}

// Strategy: network-first
function nf(request) {
  return fetch(request).catch(function() {
    return caches.match(request).then(function(cached) {
      return cached || new Response('Offline', {status: 503});
    });
  });
}

// Strategy: network-first + TTL cache
function nwt(request, cn, ttl) {
  return fetch(request).then(function(res) {
    if (res.ok) tp(cn, request, res, ttl);
    return res;
  }).catch(function() {
    return caches.match(request).then(function(cached) {
      if (cached && !exp(cached)) return cached;
      return cached || new Response('[]', {status: 200, headers: {'Content-Type': 'application/json'}});
    });
  });
}

// Strategy: stale-while-revalidate
function swr(request, cn) {
  return caches.match(request).then(function(cached) {
    var fetchPromise = fetch(request).then(function(res) {
      if (res.ok) tp(cn, request, res, TTL);
      return res;
    }).catch(function() { return cached; });
    return cached || fetchPromise;
  });
}

// Background sync
self.addEventListener('sync', function(e) {
  if (e.tag === 'retry-channels') {
    e.waitUntil(retryChannels());
  }
});

function retryChannels() {
  return fetch(API_URL + '/channels').then(function(r) {
    if (r.ok) {
      return tp(AC, new Request(API_URL + '/channels'), r, TTL).then(function() {
        return self.clients.matchAll();
      }).then(function(cs) {
        cs.forEach(function(c) { c.postMessage({type: 'CHANNELS_UPDATED'}); });
      });
    }
  }).catch(function() {});
}
var API_URL = 'https://fragrant-butterfly-575f.bhargavtodimela4.workers.dev';

// Push notifications
self.addEventListener('push', function(e) {
  if (!e.data) return;
  var d = e.data.json();
  e.waitUntil(self.registration.showNotification(d.title || 'Live TV', {
    body: d.body || 'New content available',
    data: d.url || '/'
  }));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type: 'window'}).then(function(cs) {
    var u = e.notification.data || '/';
    for (var i = 0; i < cs.length; i++) {
      if ('focus' in cs[i]) { cs[i].navigate(u); return cs[i].focus(); }
    }
    return self.clients.openWindow(u);
  }));
});

// Message handler
self.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data.type === 'CLEAR_API_CACHE') caches.delete(AC);
  if (e.data.type === 'CACHE_STATS') {
    Promise.all([
      caches.open(SC).then(function(c) { return c.keys(); }),
      caches.open(CC).then(function(c) { return c.keys(); }),
      caches.open(AC).then(function(c) { return c.keys(); }),
      caches.open(IC).then(function(c) { return c.keys(); })
    ]).then(function(ks) {
      e.source.postMessage({
        type: 'CACHE_STATS',
        data: {shell: ks[0].length, cdn: ks[1].length, api: ks[2].length, images: ks[3].length, total: ks[0].length + ks[1].length + ks[2].length + ks[3].length}
      });
    });
  }
});
