"use client";

import { useEffect, useState } from "react";
import { getInitials, getStoredUser } from "@/app/lib/userProfile";

const defaultProfile = {
  name: "Security Guard",
  roleLabel: "Guard Dashboard",
  subtitle: "Security Guard",
};

export default function Topbar() {
  const [profile, setProfile] = useState(defaultProfile);

  useEffect(() => {
    const storedProfile = getStoredUser();
    if (!storedProfile?.name) return;

    setProfile((prev) => ({
      ...prev,
      ...storedProfile,
      roleLabel: storedProfile.roleLabel
        ? `${storedProfile.roleLabel} Dashboard`
        : prev.roleLabel,
      subtitle: storedProfile.roleLabel || prev.subtitle,
    }));
  }, []);

  return (
    <header className="glass-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/60 px-5 py-4 shadow-lg shadow-amber-100/70">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
          {profile.roleLabel}
        </p>
        <h1 className="text-xl font-semibold text-slate-900">Welcome back, {profile.name}.</h1>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/80 px-3 py-2 text-xs font-medium text-slate-600 md:flex">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Live scanning
        </div>
        <button className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm shadow-slate-900/20">
          Start patrol
        </button>
        <div className="flex items-center gap-2 rounded-full bg-white/80 px-2 py-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {getInitials(profile.name)}
          </div>
          <div className="hidden flex-col text-xs text-slate-600 sm:flex">
            <span className="font-semibold text-slate-800">{profile.name}</span>
            <span>{profile.subtitle}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
