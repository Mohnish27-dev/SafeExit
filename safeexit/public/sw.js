// SafeExit Service Worker
// ======================
// Runs in the background even when the app/tab is closed. Two responsibilities:
//
// 1. **Push notifications** — receives push events from the browser's push
//    service (Google FCM, Apple APNs, Mozilla autopush) and shows a native
//    notification with the message content. Handles notification clicks to
//    open/focus the correct dashboard page.
//
// 2. **Offline fallback** — caches the app shell so the PWA doesn't show a
//    blank "no internet" page when the network drops. This is the minimum
//    required for a good PWA experience (and for iOS to allow push at all).

const CACHE_NAME = 'safeexit-v1';
const OFFLINE_URL = '/offline';

// ─── Install: pre-cache the offline page ──────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([OFFLINE_URL]))
  );
  // Activate immediately — don't wait for old tabs to close.
  self.skipWaiting();
});

// ─── Activate: clean up old caches ───────────────────────────────────────────
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
  // Take control of all open tabs immediately.
  self.clients.claim();
});

// ─── Fetch: serve offline fallback for navigation requests ───────────────────
self.addEventListener('fetch', (event) => {
  // Only intercept navigation requests (page loads, not API calls or assets).
  if (event.request.mode !== 'navigate') return;

  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});

// ─── Push: show a native notification ────────────────────────────────────────
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
    // Vibrate pattern: short-long-short for attention on mobile.
    vibrate: [100, 200, 100],
    // Tag groups similar notifications so they don't stack endlessly.
    tag: data.tag || 'safeexit-notification',
    // Replace older notification with same tag.
    renotify: true,
    // Keep the notification visible until the user interacts with it.
    requireInteraction: data.urgency === 'high',
    // Stash the target URL so the click handler knows where to navigate.
    data: {
      url: data.url || '/dashboard/warden',
    },
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'SafeExit', options)
  );
});

// ─── Notification click: open or focus the target page ───────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/dashboard/warden';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // If a tab with the app is already open, focus it and navigate.
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin)) {
            client.navigate(targetUrl);
            return client.focus();
          }
        }
        // Otherwise, open a new tab.
        return clients.openWindow(targetUrl);
      })
  );
});
