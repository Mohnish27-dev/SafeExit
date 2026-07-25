"use client";

import { Building2, LogOut, Mail, Phone, ShieldCheck } from "lucide-react";
import { useTranslation } from "@/app/lib/i18n";

const getInitials = (name = "") =>
  name.split(" ").map((part) => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "W";

export default function ProfileView({ user, displayName, onLogout }) {
  const { t } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");
  const profileName = displayName || t("chiefCaretaker");
  const role = user?.roleLabel || user?.role || t("chiefCaretaker");
  const caretakerId = user?.caretakerId || user?.staffId || user?.employeeId || user?.studentId;

  return (
    <section className="sd-luxe-panel sd-enter mx-auto mt-6 w-full max-w-3xl rounded-[2.5rem] p-6 shadow-xl" style={{ animationDelay: "0.12s" }}>
      <div className="flex items-center gap-4">
        <span className="sd-profile-avatar flex h-16 w-16 items-center justify-center bg-linear-to-br from-indigo-700 via-indigo-600 to-cyan-400 text-lg font-bold text-white shadow-lg">
          {getInitials(profileName)}
        </span>
        <div className="min-w-0">
          <p className="sd-card-title text-xl">{profileName}</p>
          <p className="sd-tag mt-1.5"><ShieldCheck className="h-3.5 w-3.5" /> {role}</p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        {user?.email && (
          <div className="sd-row" style={{ "--accent": "#6366f1" }}>
            <span className="sd-row__accent" aria-hidden="true" />
            <div className="flex min-w-0 items-center gap-3"><Mail className="h-4 w-4 shrink-0 text-slate-400" /><span className="sd-card-title truncate text-[0.88rem]">{user.email}</span></div>
          </div>
        )}
        {user?.phoneNumber && (
          <div className="sd-row" style={{ "--accent": "#0ea5e9" }}>
            <span className="sd-row__accent" aria-hidden="true" />
            <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-slate-400" /><span className="sd-card-title text-[0.88rem]">{user.phoneNumber}</span></div>
          </div>
        )}
        {caretakerId && (
          <div className="sd-row" style={{ "--accent": "#2dd4bf" }}>
            <span className="sd-row__accent" aria-hidden="true" />
            <div className="flex items-center gap-3"><Building2 className="h-4 w-4 text-slate-400" /><span className="sd-card-title text-[0.88rem]">{t("caretakerId")} {caretakerId}</span></div>
          </div>
        )}
      </div>

      <button type="button" onClick={onLogout} className="sd-magnetic mt-8 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-rose-600 shadow-sm transition hover:bg-rose-100">
        <LogOut className="h-5 w-5" /> {tc("logout")}
      </button>
    </section>
  );
}
