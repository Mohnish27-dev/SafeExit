"use client";

import { useEffect, useMemo, useState } from "react";
import {
  defaultStudentProfile,
  formatDisplayMobile,
  getRoomFromProfile,
  getStoredUser,
  normalizeStudentProfile,
} from "@/app/lib/userProfile";

export function useStudentProfile() {
  const [profile, setProfile] = useState(defaultStudentProfile);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    setProfile(normalizeStudentProfile(stored));
    setHydrated(true);
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
      isLoggedIn: hydrated && profile.name !== defaultStudentProfile.name,
    }),
    [profile, hydrated]
  );

  return { profile, display, hydrated };
}
