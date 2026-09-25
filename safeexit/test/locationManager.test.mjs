import test from "node:test";
import assert from "node:assert/strict";
import {
  isSecureOrigin,
  isGeolocationSupported,
  getGeolocationPermission,
  requestGeolocationPermission,
} from "../src/app/lib/locationManager.mjs";

test("isSecureOrigin identifies SSR and secure browser contexts", () => {
  assert.equal(isSecureOrigin(undefined), true, "SSR is considered secure by default");
  assert.equal(isSecureOrigin({ isSecureContext: true }), true);
  assert.equal(isSecureOrigin({ isSecureContext: false }), false);

  // Fallback when isSecureContext is not a boolean
  assert.equal(isSecureOrigin({ location: { protocol: "https:", hostname: "safeexit.nitp.ac.in" } }), true);
  assert.equal(isSecureOrigin({ location: { protocol: "http:", hostname: "localhost" } }), true);
  assert.equal(isSecureOrigin({ location: { protocol: "http:", hostname: "127.0.0.1" } }), true);
  assert.equal(isSecureOrigin({ location: { protocol: "http:", hostname: "172.16.20.10" } }), false);
  assert.equal(isSecureOrigin({ location: { protocol: "http:", hostname: "safeexit.nitp.ac.in" } }), false);
});

test("isGeolocationSupported requires navigator.geolocation", () => {
  assert.equal(isGeolocationSupported(undefined), false);
  assert.equal(isGeolocationSupported({}), false);
  assert.equal(isGeolocationSupported({ geolocation: {} }), true);
});

test("getGeolocationPermission reports 'unsupported' when geolocation is absent", async () => {
  const result = await getGeolocationPermission(undefined, { isSecureContext: true });
  assert.equal(result, "unsupported");
});

test("getGeolocationPermission reports 'insecure' on unencrypted HTTP even if permissions API returns 'denied'", async () => {
  const fakeNav = {
    geolocation: {},
    permissions: {
      query: async () => ({ state: "denied" }),
    },
  };
  const fakeInsecureWin = {
    isSecureContext: false,
    location: { protocol: "http:", hostname: "172.16.20.10" },
  };

  const result = await getGeolocationPermission(fakeNav, fakeInsecureWin);
  assert.equal(result, "insecure", "Must classify HTTP as 'insecure', NOT as user 'denied'");
});

test("getGeolocationPermission returns permission states on secure context", async () => {
  const fakeSecureWin = { isSecureContext: true };

  // Prompt
  const navPrompt = {
    geolocation: {},
    permissions: { query: async () => ({ state: "prompt" }) },
  };
  assert.equal(await getGeolocationPermission(navPrompt, fakeSecureWin), "prompt");

  // Granted
  const navGranted = {
    geolocation: {},
    permissions: { query: async () => ({ state: "granted" }) },
  };
  assert.equal(await getGeolocationPermission(navGranted, fakeSecureWin), "granted");

  // Denied
  const navDenied = {
    geolocation: {},
    permissions: { query: async () => ({ state: "denied" }) },
  };
  assert.equal(await getGeolocationPermission(navDenied, fakeSecureWin), "denied");

  // Fallback when query is unavailable (older Safari)
  const navNoQuery = { geolocation: {} };
  assert.equal(await getGeolocationPermission(navNoQuery, fakeSecureWin), "prompt");
});

test("requestGeolocationPermission avoids native prompt and returns 'insecure' on HTTP", async () => {
  let called = false;
  const fakeNav = {
    geolocation: {
      getCurrentPosition: () => {
        called = true;
      },
    },
  };
  const fakeInsecureWin = { isSecureContext: false };

  const result = await requestGeolocationPermission(fakeNav, fakeInsecureWin);
  assert.equal(result, "insecure");
  assert.equal(called, false, "Must not invoke getCurrentPosition in an insecure context");
});

test("requestGeolocationPermission resolves 'granted' or 'denied' on secure context", async () => {
  const fakeSecureWin = { isSecureContext: true };

  // Granted flow
  const navSuccess = {
    geolocation: {
      getCurrentPosition: (success) => success({ coords: { latitude: 25.6, longitude: 85.1 } }),
    },
  };
  assert.equal(await requestGeolocationPermission(navSuccess, fakeSecureWin), "granted");

  // User denied (err.code = 1)
  const navDenied = {
    geolocation: {
      getCurrentPosition: (_, error) => error({ code: 1, message: "User denied Geolocation" }),
    },
  };
  assert.equal(await requestGeolocationPermission(navDenied, fakeSecureWin), "denied");

  // Timeout or unavailable (err.code = 2/3) leaves promptable
  const navTimeout = {
    geolocation: {
      getCurrentPosition: (_, error) => error({ code: 3, message: "Timeout" }),
    },
  };
  assert.equal(await requestGeolocationPermission(navTimeout, fakeSecureWin), "prompt");
});
