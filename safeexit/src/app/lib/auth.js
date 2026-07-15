"use client";

// Client-side route protection for the role dashboards.
//
// Auth state is tab-scoped in sessionStorage (see lib/api.js and lib/userProfile.js):
//   - safeexit_token : the JWT used as the Bearer header
//   - safeexit:user  : the profile blob, whose `role` field marks the logged-in role
//
// The backend `protect` middleware already rejects tokenless API calls (401), so
// data is never served without a session. But the dashboard *shells* are static
// client pages — without a guard they render for anyone who types the URL directly
// or hits Back after logging out. `useRequireAuth` closes that gap: it verifies a
// token exists AND matches the page's expected role, and otherwise redirects to
// the correct login. `logout` is the single teardown used by every dashboard.

import { useEffect, useState } from "react";
import { getApiBase } from "./api";
import { getStoredUser, setStoredUser } from "./userProfile";
import { unsubscribePush, autoSubscribeIfGranted } from "./pushManager";

// Where each role signs in. Logout only ends the tab SESSION — it deliberately
// leaves each role's device-local Quick Login (encrypted PIN blob + passkey
// marker) untouched, so a signed-out user can get back in with their 4-digit
// PIN / biometric instead of re-typing the full login form and re-enrolling
// Quick Login every time. The PIN never decrypts to a session on its own — it
// only unlocks the on-device secret that /auth/login then verifies — so keeping
// it across logout doesn't weaken the security boundary. (Fully forgetting a
// device is a separate "Forget this device" action on the login screen, via
// clearQuickLogin in lib/quickLogin.)
const ROLE_CONFIG = {
  student: { loginPath: "/login/student" },
  warden: { loginPath: "/login/warden" },
  security: { loginPath: "/login/security" },
  admin: { loginPath: "/login/admin" },
};

const loginPathFor = (role) => ROLE_CONFIG[role]?.loginPath || "/login";

// Backend role enum → the frontend role slugs used by ROLE_CONFIG / dashboards.
const BACKEND_ROLE_TO_SLUG = {
  Student: "student",
  Warden: "warden",
  Guard: "security",
  Admin: "admin",
};

const ROLE_LABELS = {
  student: "Student",
  warden: "Warden",
  security: "Security Guard",
  admin: "Administrator",
};

// Silent session restore. Mobile OSes kill backgrounded tabs, wiping the
// tab-scoped sessionStorage token — but the 30-day httpOnly `jwt` cookie
// survives. POST /auth/refresh authenticates via that cookie (we deliberately
// send NO Bearer header) and returns a fresh token + profile, so a warden who
// reopens the app lands straight on their dashboard instead of Quick Login.
//
// Returns the restored profile's role slug on success, or null when there is
// no valid cookie (user actually logged out / expired) — callers then fall
// back to the normal login redirect.
const tryRestoreSession = async () => {
  try {
    const res = await fetch(`${getApiBase()}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    if (!res.ok) return null;

    const data = await res.json();
    const slug = BACKEND_ROLE_TO_SLUG[data.role];
    if (!data.token || !slug) return null;

    sessionStorage.setItem("safeexit_token", data.token);
    // Rebuild the profile blob the way each role's login page does — staff are
    // identified by loginId, students by roll number + email.
    setStoredUser({
      name: data.name,
      role: slug,
      roleLabel: ROLE_LABELS[slug],
      id: slug === "student" ? (data.studentId || data.email) : data.loginId,
      ...(slug === "student"
        ? {
            rollNo: data.studentId,
            email: data.email,
            room: data.roomNumber,
            mobile: data.phoneNumber,
          }
        : {}),
      ...(data.managedGender ? { managedGender: data.managedGender } : {}),
    });

    // The device's push subscription may have been upserted under a stale
    // session — re-sync it now that we hold a fresh token. Best-effort.
    autoSubscribeIfGranted().catch(() => {});

    return slug;
  } catch {
    return null; // network error → treat as "no session"
  }
};

export const getToken = () => {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem("safeexit_token");
};

// True when this tab holds a token AND the stored profile's role matches the
// role the page is meant for. A student token on the warden dashboard is treated
// as unauthorized (it would 403 on every request anyway).
export const isAuthorized = (expectedRole) => {
  if (!getToken()) return false;
  if (!expectedRole) return true;
  const user = getStoredUser();
  return user?.role === expectedRole;
};

// Hook: gate a dashboard page on a valid session for `expectedRole`.
//
// Returns { checked, authorized }:
//   - checked=false  → still verifying on the client (render nothing / a loader)
//   - authorized=false after checked → a redirect to the login page is in flight;
//     keep rendering the loader, NOT the protected content, so it never flashes.
//   - authorized=true → safe to render the real page.
export const useRequireAuth = (expectedRole) => {
  const [state, setState] = useState({ checked: false, authorized: false });

  useEffect(() => {
    // Deliberately syncs a client-only external source (sessionStorage) into
    // state once on mount — the same pattern used elsewhere in this app.
    if (isAuthorized(expectedRole)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ checked: true, authorized: true });
      return;
    }

    // No tab session — before bouncing to login, try restoring one from the
    // httpOnly cookie (the tab was likely killed by the mobile OS, not logged
    // out). Only authorize if the restored session matches this page's role;
    // a mismatched cookie (other role logged in elsewhere) still redirects.
    let cancelled = false;
    (async () => {
      const restoredRole = await tryRestoreSession();
      if (cancelled) return;
      if (restoredRole && (!expectedRole || restoredRole === expectedRole)) {
        setState({ checked: true, authorized: true });
        return;
      }
      setState({ checked: true, authorized: false });
      // Replace (not push) so the unauthorized URL doesn't stay in history for
      // the Back button to return to.
      window.location.replace(loginPathFor(expectedRole));
    })();
    return () => { cancelled = true; };
  }, [expectedRole]);

  return state;
};

// Single logout teardown for every dashboard: best-effort server cookie clear,
// then drop only the tab SESSION (token + active profile) — the device's Quick
// Login PIN/passkey are intentionally kept so the user can sign back in fast —
// and send the user to the role's login screen.
export const logout = async (router, { role } = {}) => {
  try {
    await fetch(`${getApiBase()}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* ignore network errors on logout */
  }

  // Unsubscribe from push notifications so the old session stops receiving
  // alerts. Best-effort — network errors here are non-critical.
  try { await unsubscribePush(); } catch { /* ignore */ }

  if (typeof window !== "undefined") {
    // Session-only: clears the Bearer token and the active-tab profile. The
    // httpOnly `jwt` cookie is invalidated server-side above. Quick Login keys
    // in localStorage are deliberately left in place.
    ["safeexit_token", "safeexit:user"].forEach((k) => sessionStorage.removeItem(k));
  }

  const dest = loginPathFor(role);
  if (router?.push) router.push(dest);
  else if (typeof window !== "undefined") window.location.assign(dest);
};
