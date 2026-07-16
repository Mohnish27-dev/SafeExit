// Web Push subscription lifecycle (subscribe on user gesture, unsubscribe on logout).

import { apiFetch } from './api';

// Push API needs the VAPID key as a Uint8Array.
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

// Cached per page load.
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

export function isPushSupported() {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission() {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

async function isSubscribed() {
  if (!isPushSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch {
    return false;
  }
}

// Must be called from a user gesture. Returns { success, error? }.
export async function subscribePush() {
  if (!isPushSupported()) {
    return { success: false, error: 'Push notifications are not supported in this browser.' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { success: false, error: 'Notification permission was denied.' };
    }

    const publicKey = await getVapidKey();
    if (!publicKey) {
      return { success: false, error: 'Could not fetch push configuration from server.' };
    }

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

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

// Called on logout so stale sessions stop receiving notifications.
export async function unsubscribePush() {
  if (!isPushSupported()) return;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;

    try {
      await apiFetch('/push/subscribe', {
        method: 'DELETE',
        body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
    } catch {
      // best-effort on logout
    }

    await subscription.unsubscribe();
  } catch (err) {
    console.error('Push unsubscribe error:', err);
  }
}

// Re-subscribe silently on page load if permission already granted (no prompt).
export async function autoSubscribeIfGranted() {
  if (getNotificationPermission() !== 'granted') return;
  if (await isSubscribed()) return;
  await subscribePush();
}
