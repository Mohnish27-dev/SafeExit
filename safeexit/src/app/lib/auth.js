"use client";

// Client-side route protection for the role dashboards.

import { useEffect, useState } from "react";
import { getApiBase } from "./api";
import { getStoredUser, setStoredUser } from "./userProfile";
import { autoSubscribeIfGranted } from "./pushManager";

// Logout deliberately keeps each role's device-local Quick Login (PIN/passkey)
const ROLE_CONFIG = {
  student: { loginPath: "/login/student" },
  caretaker: { loginPath: "/login/caretaker" },
  security: { loginPath: "/login/security" },
  admin: { loginPath: "/login/admin" },
  department: { loginPath: "/login/department" },
};

const loginPathFor = (role) => ROLE_CONFIG[role]?.loginPath || "/login";

// Backend role enum → frontend role slugs
const BACKEND_ROLE_TO_SLUG = {
  Student: "student",
  Caretaker: "caretaker",
  Guard: "security",
  Admin: "admin",
  Department: "department",
};

const ROLE_LABELS = {
  student: "Student",
  caretaker: "Caretaker",
  security: "Security Guard",
  admin: "Administrator",
  department: "Department",
};

// Silent session restore via the httpOnly `jwt` cookie; returns role slug or null.
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
    // Staff are identified by loginId, students by roll number + email
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
      ...(data.managedHostel ? { managedHostel: data.managedHostel } : {}),
      ...(data.managedDepartment ? { managedDepartment: data.managedDepartment } : {}),
    });

    // Re-sync the push subscription under the fresh token. Best-effort.
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

// Token present AND stored profile role matches the page's role.
const isAuthorized = (expectedRole) => {
  if (!getToken()) return false;
  if (!expectedRole) return true;
  const user = getStoredUser();
  return user?.role === expectedRole;
};

// Gate a dashboard on a valid session for `expectedRole`; returns { checked, authorized }.
export const useRequireAuth = (expectedRole) => {
  const [state, setState] = useState({ checked: false, authorized: false });

  useEffect(() => {
    // Syncs a client-only external source (sessionStorage) into state once on mount
    if (isAuthorized(expectedRole)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ checked: true, authorized: true });
      return;
    }

    // No tab session — try cookie restore before bouncing to login.
    let cancelled = false;
    (async () => {
      const restoredRole = await tryRestoreSession();
      if (cancelled) return;
      if (restoredRole && (!expectedRole || restoredRole === expectedRole)) {
        setState({ checked: true, authorized: true });
        return;
      }
      setState({ checked: true, authorized: false });
      // Replace (not push) so Back can't return to the unauthorized URL
      window.location.replace(loginPathFor(expectedRole));
    })();
    return () => { cancelled = true; };
  }, [expectedRole]);

  return state;
};

// Logout teardown: server cookie clear, drop the tab session (Quick Login kept)
export const logout = async (router, { role } = {}) => {
  try {
    await fetch(`${getApiBase()}/auth/logout`, {
      method: "POST",
      credentials: "include",
    });
  } catch {
    /* ignore network errors on logout */
  }

  // Deliberately DON'T unsubscribe push on logout: this is a safety app, so a
  // caretaker's device must keep receiving SOS/outing alerts even when no one is
  // logged in. Tapping the notification opens the login page. The subscription
  // is re-associated to whichever caretaker next logs in on this browser (the
  // /push/subscribe upsert keys on endpoint). To fully stop alerts, a caretaker
  // disables notifications in their browser's site settings.

  if (typeof window !== "undefined") {
    ["safeexit_token", "safeexit:user"].forEach((k) => sessionStorage.removeItem(k));
  }

  const dest = loginPathFor(role);
  if (router?.push) router.push(dest);
  else if (typeof window !== "undefined") window.location.assign(dest);
};
