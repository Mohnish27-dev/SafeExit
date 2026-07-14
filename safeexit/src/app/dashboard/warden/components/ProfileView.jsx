"use client";

import { useTranslation } from "@/app/lib/i18n";

// A warden's managedGender maps to the hostel they oversee.
const HOSTEL_LABEL = { Male: "Boys' Hostel", Female: "Girls' Hostel" };

export default function ProfileView({ user, displayName }) {
  const { t } = useTranslation("warden");
  const { t: tc } = useTranslation("common");
  const hostelLabel = HOSTEL_LABEL[user?.managedGender];

  return (
    <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center gap-6">
        <div className="sd-luxe-float flex h-28 w-28 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-600 to-cyan-400 text-3xl font-bold text-white shadow-lg">{(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || 'WP'}</div>
        <div>
          <h2 className="text-2xl font-bold">{displayName}</h2>
          <p className="text-sm text-slate-500">{(user && (user.roleLabel || user.role)) || t("chiefWarden")}</p>
          {hostelLabel ? (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">Manages: {hostelLabel}</span>
          ) : (
            <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">No hostel assigned — contact admin</span>
          )}
          <p className="mt-3 text-sm text-slate-700 max-w-xl">{t("profileDesc")}</p>
          <div className="mt-4 flex gap-3">
            <button className="px-4 py-2 rounded-2xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 transition-colors" onClick={() => alert('Edit profile (demo)')}>{tc("editProfile")}</button>
            <button className="px-4 py-2 rounded-2xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 transition-colors" onClick={() => alert('Contact student (demo)')}>{tc("contact")}</button>
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="sd-luxe-card rounded-2xl p-4">
          <h4 className="sd-card-title">{t("shift")}</h4>
          <p className="sd-body mt-1 text-sm">{t("shiftInfo")}</p>
        </div>
        <div className="sd-luxe-card rounded-2xl p-4">
          <h4 className="sd-card-title">{tc("contact")}</h4>
          <p className="sd-body mt-1 text-sm">{t("contactInfo")}</p>
        </div>
      </div>
    </section>
  );
}
