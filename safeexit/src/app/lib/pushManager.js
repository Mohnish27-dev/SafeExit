// Push subscription manager — handles the entire lifecycle of subscribing to
// and unsubscribing from Web Push Notifications on the client side.
//
// Flow:
//   1. Service Worker is registered (done in layout.js on first page load)
//   2. User clicks "Enable Notifications" → subscribePush() is called
//   3. Browser asks for notification permission
//   4. On grant: pushManager.subscribe() creates a PushSubscription
//   5. The subscription is sent to POST /api/push/subscribe on the backend
//   6. Done — the backend can now send push messages to this device
//
// On logout, unsubscribePush() removes the subscription from the backend and
// unsubscribes the browser so the old session doesn't keep getting notifications.

import { getApiBase, apiFetch } from './api';

// Convert a base64 string to a Uint8Array — the Push API needs the VAPID key
// in this format for the `applicationServerKey` parameter.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Cached VAPID key — fetched once per page load from the backend.
let vapidPublicKey = null;

async function getVapidKey() {
  if (vapidPublicKey) return vapidPublicKey;
  try {
    const data = await apiFetch('/push/vapid-key');
    vapidPublicKey = data.publicKey;
    return vapidPublicKey;
  } catch {
    return null;
  }
}

// Check if push notifications are supported in this browser.
export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

// Get the current notification permission state.
export function getNotificationPermission() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission; // 'default', 'granted', or 'denied'
}

// Check if the user is currently subscribed to push on this device.
export async function isSubscribed() {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

// Subscribe to push notifications. Must be called from a user gesture (button
// click) — browsers block programmatic permission prompts.
//
// Returns: { success: boolean, error?: string }
export async function subscribePush() {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications are not supported in this browser.' };
  }

  try {
    // 1. Request notification permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was denied.' };
    }

    // 2. Get the VAPID public key from the backend
    const publicKey = await getVapidKey();
    if (!publicKey) {
      return { success: false, error: 'Could not fetch push configuration from server.' };
    }

    // 3. Subscribe via the Push API
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    // 4. Send the subscription to the backend for storage
    await apiFetch('/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    return { success: true };
  } catch (err) {
    console.error('Push subscription failed:', err);
    return { success: false, error: err.message || 'Subscription failed.' };
  }
}

// Unsubscribe from push notifications — called on logout to stop delivering
// notifications to a session that's no longer active.
export async function unsubscribePush() {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    // Remove from backend first (best-effort)
    try {
      await apiFetch('/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch {
      // Network errors on logout are non-critical
    }

    // Unsubscribe the browser
    await subscription.unsubscribe();
  } catch (err) {
    console.error('Push unsubscribe error:', err);
  }
}

// Auto-subscribe if permission was already granted (e.g. returning user).
// Safe to call on page load — it won't prompt for permission.
export async function autoSubscribeIfGranted() {
  if (getNotificationPermission() !== 'granted') return;
  if (await isSubscribed()) return; // Already subscribed on this device

  // Re-subscribe silently (permission already granted, no prompt shown)
  await subscribePush();
}
