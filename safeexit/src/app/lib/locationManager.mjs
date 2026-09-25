// Geolocation permission lifecycle for students.
//
// Why this exists: the SOS page needs the student's coordinates, but calling
// getCurrentPosition() there fires the browser's location prompt mid-emergency,
// which interrupts a time-critical flow. Instead we prime the permission up
// front on the dashboard's first visit, so by the time an SOS is sent the fix
// resolves silently (see dashboard/student/sos/page.jsx captureLocation).

export function isSecureOrigin(win = typeof window !== 'undefined' ? winFallback() : undefined) {
  if (!win) return true; // Server-side rendering passes by default
  if (typeof win.isSecureContext === 'boolean') {
    return win.isSecureContext;
  }
  const protocol = win.location?.protocol;
  const hostname = win.location?.hostname;
  return (
    protocol === 'https:' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'
  );
}

function winFallback() {
  return typeof window !== 'undefined' ? window : undefined;
}

function navFallback() {
  return typeof navigator !== 'undefined' ? navigator : undefined;
}

export function isGeolocationSupported(
  nav = navFallback(),
  win = winFallback()
) {
  return typeof nav !== 'undefined' && 'geolocation' in nav && Boolean(nav.geolocation);
}

// Returns 'granted' | 'denied' | 'prompt' | 'insecure' | 'unsupported'.
// Modern browsers require a Secure Context (HTTPS or localhost) for Geolocation.
// On unencrypted HTTP origins (such as a college server accessed over plain HTTP),
// Chromium automatically treats geolocation as denied or blocks the API,
// even if the user never touched browser settings.
export async function getGeolocationPermission(
  nav = navFallback(),
  win = winFallback()
) {
  if (!isGeolocationSupported(nav, win)) return 'unsupported';
  if (!isSecureOrigin(win)) return 'insecure';

  if (!nav?.permissions?.query) {
    // No Permissions API (older Safari): we can't read state without prompting,
    // so treat it as promptable and let the banner offer to enable.
    return 'prompt';
  }
  try {
    const status = await nav.permissions.query({ name: 'geolocation' });
    if (status.state === 'denied' && !isSecureOrigin(win)) {
      return 'insecure';
    }
    return status.state; // 'granted' | 'denied' | 'prompt'
  } catch {
    return 'prompt';
  }
}

// Must be called from a user gesture (e.g. a button click) so the browser
// shows its native location prompt. Resolves to 'granted' | 'denied' | 'insecure' | 'unsupported'.
export function requestGeolocationPermission(
  nav = navFallback(),
  win = winFallback(),
  options = { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
) {
  return new Promise((resolve) => {
    if (!isGeolocationSupported(nav, win)) {
      resolve('unsupported');
      return;
    }
    if (!isSecureOrigin(win)) {
      resolve('insecure');
      return;
    }
    nav.geolocation.getCurrentPosition(
      () => resolve('granted'),
      (err) => {
        // PERMISSION_DENIED === 1; timeouts/unavailable leave it promptable,
        // but from the user's perspective the request didn't succeed.
        resolve(err && err.code === 1 ? 'denied' : 'prompt');
      },
      options
    );
  });
}
