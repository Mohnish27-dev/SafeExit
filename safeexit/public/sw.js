// Service Worker: push + offline app-shell (iOS requires offline caching for push).

const CACHE_NAME = 'safeexit-v1';
const OFFLINE_URL = '/offline';
const PRECACHE_URLS = [OFFLINE_URL];

// Precache without letting a single failed fetch reject `install`.
// cache.addAll() rejects atomically if ANY request is non-OK, which would
// prevent the SW from ever activating (breaking offline + push). Instead we
// fetch + cache.put() each URL individually and swallow failures.
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (response && response.ok) {
          await cache.put(url, response.clone());
        }
      } catch {
        // Ignore — offline route just won't be available until first success.
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
  // Activate immediately — don't wait for old tabs to close
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only intercept navigations (not API calls or assets)
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      // If the offline page wasn't precached yet, fall back to a minimal
      // inline response so we never resolve the navigation with undefined.
      return (
        cached ||
        new Response(
          '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
            '<body style="font-family:system-ui;text-align:center;padding:2rem">' +
            "<h1>You're offline</h1><p>Check your connection and try again.</p>",
          { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      );
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: 'SafeExit', body: event.data.text() };
  }

  const options = {
    body: data.body || '',
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    vibrate: [100, 200, 100],
    // Same tag replaces the older notification instead of stacking
    tag: data.tag || 'safeexit-notification',
    renotify: true,
    requireInteraction: data.urgency === 'high',
    data: {
      url: data.url || '/dashboard/caretaker',
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SafeExit', options)
  );
});

// Notification click: focus an existing app tab or open a new one
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/dashboard/caretaker';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        return clients.openWindow(targetUrl);
      })
  );
});
