// MOSA WMS RFID — Digital Custody Service Worker
const CACHE_NAME = 'mosa-wms-v1.1';
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

// Helper: Check cacheable URL
const isCacheableRequest = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
};

// Helper: Check static extension
const isStaticAsset = (url) => {
  const staticExtensions = [
    '.css', '.js', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.woff', '.woff2', '.ttf'
  ];
  return staticExtensions.some((ext) => url.split('?')[0].endsWith(ext));
};

// 1. Install: Precache shell & offline assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .catch((err) => console.warn('[SW] Precache failed:', err))
  );
  self.skipWaiting();
});

// 2. Activate: Clean old caches & claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// 3. Fetch strategy
self.addEventListener('fetch', (event) => {
  if (!isCacheableRequest(event.request.url)) return;
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);

  // Bypass API calls completely (handled live by Axios)
  if (requestUrl.pathname.startsWith('/api/')) {
    return;
  }

  // Navigation requests (HTML pages)
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

  // Static assets (cache-first with network background revalidate)
  if (isStaticAsset(requestUrl.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          // Revalidate in background
          fetch(event.request)
            .then((networkRes) => {
              if (networkRes && networkRes.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkRes));
              }
            })
            .catch(() => {});
          return cached;
        }

        return fetch(event.request)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              const clone = networkRes.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
            }
            return networkRes;
          })
          .catch(() => caches.match('/192x192.png'));
      })
    );
    return;
  }

  // Default network-first
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

// 4. Push notifications
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

// 5. Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === urlToOpen && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
