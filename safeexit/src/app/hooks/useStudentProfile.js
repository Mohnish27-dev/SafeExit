"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultStudentProfile,
  formatDisplayMobile,
  getRoomFromProfile,
  getStoredUser,
  normalizeStudentProfile,
  syncStoredStudentProfile,
  USER_UPDATED_EVENT,
} from "@/app/lib/userProfile";
import { isIncompleteStudentProfile } from "@/app/lib/studentProfileState.mjs";
import { apiFetch } from "@/app/lib/api";
import { getToken } from "@/app/lib/auth";

export function useStudentProfile() {
  const [profile, setProfile] = useState(defaultStudentProfile);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    // Re-read on every store write: a cookie session restore (after the mobile OS
    // wiped sessionStorage) lands after this page has already mounted.
    const sync = () => setProfile(normalizeStudentProfile(getStoredUser()));
    sync();
    // Syncs a client-only external source (sessionStorage) into state on mount
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    window.addEventListener(USER_UPDATED_EVENT, sync);
    return () => window.removeEventListener(USER_UPDATED_EVENT, sync);
  }, []);

  // Heal a partial cached profile from the server. Without a token a restore is
  // still in flight and writes the full profile itself.
  useEffect(() => {
    if (!getToken() || !isIncompleteStudentProfile(getStoredUser())) return;
    let cancelled = false;
    apiFetch("/auth/profile")
      .then((me) => {
        if (!cancelled && me?.role === "Student") syncStoredStudentProfile(me);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const display = useMemo(
    () => ({
      name: profile.name,
      rollNo: profile.rollNo,
      email: profile.email,
      room: getRoomFromProfile(profile),
      mobile: formatDisplayMobile(profile),
      subtitle: profile.subtitle,
      hostel: profile.hostel,
      gender: profile.gender,
      isLoggedIn: hydrated && profile.name !== defaultStudentProfile.name,
    }),
    [profile, hydrated]
  );

  return { profile, display, hydrated };
}
