// MOSA WMS RFID — Service Worker v2.0
// Percepatan #8: Cache-First untuk Vite hashed assets, Stale-While-Revalidate untuk navigasi
const CACHE_NAME = 'mosa-wms-v2.0';
const ASSETS_CACHE = 'mosa-assets-v2.0'; // immutable Vite chunks — separate cache
const OFFLINE_PAGE = '/offline.html';

const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
  '/192x192.png',
  '/logo512.png',
  '/maskable-icon-192.png',
  OFFLINE_PAGE,
];

const isCacheableRequest = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

// Vite hashed assets — safe to cache forever (filename contains hash)
const isHashedAsset = (pathname) =>
  /\/assets\/.*\.[a-zA-Z0-9]{8,}\.(js|css|woff2?|png|svg|ico)(\?.*)?$/.test(pathname);

// Other static extensions that can be cached
const isStaticAsset = (url) => {
  const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2', '.ttf'];
  return staticExtensions.some((ext) => url.split('?')[0].endsWith(ext));
};

// ── 1. Install: Precache shell & critical assets ──────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
  self.skipWaiting();
});

// ── 2. Activate: Delete old caches, claim clients ────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== ASSETS_CACHE)
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  self.clients.claim();
});

// ── 3. Fetch strategy ─────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request.url)) return;
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // Never intercept API calls — always live network
  if (requestUrl.pathname.startsWith('/api/')) return;

  // ── Strategy A: Cache-Forever for Vite hashed chunks (js/css with hash in name)
  // These filenames change on every build, so caching forever is 100% safe.
  if (isHashedAsset(requestUrl.pathname)) {
    event.respondWith(
      caches.open(ASSETS_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) return cached; // instant from cache

        const networkRes = await fetch(event.request);
        if (networkRes && networkRes.status === 200) {
          cache.put(event.request, networkRes.clone());
        }
        return networkRes;
      })
    );
    return;
  }

  // ── Strategy B: Navigation requests (HTML) — Network-first, fallback offline
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          const fallback = await caches.match(OFFLINE_PAGE);
          return fallback || caches.match('/');
        })
    );
    return;
  }

  // ── Strategy C: Other static assets — Stale-While-Revalidate
  if (isStaticAsset(requestUrl.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const networkFetch = fetch(event.request).then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(event.request, networkRes.clone());
            }
            return networkRes;
          }).catch(() => cached);

          return cached || networkFetch;
        })
      )
    );
    return;
  }

  // ── Strategy D: Default — network with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return networkRes;
      })
      .catch(() => caches.match(event.request))
  );
});

// ── 4. Push notifications ─────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title || 'MOSA WMS RFID';
    const options = {
      body: payload.body || 'Pembaruan transaksi material baru tercatat.',
      icon: payload.icon || '/192x192.png',
      badge: payload.badge || '/favicon-196.png',
      data: payload.data || { url: '/' },
      tag: payload.tag || `mosa-${Date.now()}`,
      vibrate: [200, 100, 200],
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.warn('[SW] Push parse error:', e);
  }
});

// ── 5. Notification click ─────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(urlToOpen);
    })
  );
});
