// Geolocation permission lifecycle for students.
//
// Why this exists: the SOS page needs the student's coordinates, but calling
// getCurrentPosition() there fires the browser's location prompt mid-emergency,
// which interrupts a time-critical flow. Instead we prime the permission up
// front on the dashboard's first visit, so by the time an SOS is sent the fix
// resolves silently (see dashboard/student/sos/page.jsx captureLocation).

export function isGeolocationSupported() {
  return typeof navigator !== 'undefined' && 'geolocation' in navigator;
}

// Returns 'granted' | 'denied' | 'prompt' | 'unsupported'.
// Uses the Permissions API when available (lets us skip the banner without
// ever poking getCurrentPosition); falls back to 'prompt' where it isn't.
export async function getGeolocationPermission() {
  if (!isGeolocationSupported()) return 'unsupported';
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    // No Permissions API (older Safari): we can't read state without prompting,
    // so treat it as promptable and let the banner offer to enable.
    return 'prompt';
  }
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'prompt';
  }
}

// Must be called from a user gesture (e.g. a button click) so the browser
// shows its native location prompt. Resolves to 'granted' | 'denied'.
export function requestGeolocationPermission() {
  return new Promise((resolve) => {
    if (!isGeolocationSupported()) {
      resolve('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => {
        // PERMISSION_DENIED === 1; timeouts/unavailable leave it promptable,
        // but from the user's perspective the request didn't succeed.
        resolve(err && err.code === 1 ? 'denied' : 'prompt');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
}
