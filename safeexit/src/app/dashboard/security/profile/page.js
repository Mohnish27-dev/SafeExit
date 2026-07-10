"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Loader2,
  LogOut,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { getInitials } from "@/app/lib/userProfile";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SecurityBottomNav from "../components/SecurityBottomNav";
import { useTranslation } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

export default function SecurityProfilePage() {
  const { t } = useTranslation("security");
  const { t: tc } = useTranslation("common");
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("security");
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loggingOut, setLoggingOut] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/auth/profile");
      setMe(data);
      setError("");
    } catch (err) {
      setError(err.message || t("couldNotLoadProfile"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleLogout = async () => {
    setLoggingOut(true);
    await logout(router, { role: "security" });
  };

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen dashboard-neo text-slate-900">
      <div className="relative overflow-hidden">
        <div className="dash-orb dash-orb-one" />
        <div className="dash-orb dash-orb-two" />
        <div className="dash-orb dash-orb-three" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="dash-surface dash-animate-rise flex flex-wrap items-center gap-4 rounded-[2.25rem] px-5 py-4 shadow-xl">
            <Link
              href="/dashboard/security"
              className="dash-glow flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-500 text-white shadow-lg"
            >
              <ArrowLeft className="h-7 w-7" />
            </Link>
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">{t("account")}</p>
              <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{tc("profile")}</h1>
            </div>
            <LanguageSwitcher />
          </header>

          <section className="dash-surface dash-animate-rise mt-6 rounded-[2.5rem] p-6 shadow-xl">
            {error && (
              <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> {t("loadingProfile")}
              </div>
            ) : me ? (
              <>
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-cyan-400 text-xl font-bold text-white">
                    {getInitials(me.name)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xl font-bold text-slate-900">{me.name}</p>
                    <p className="inline-flex items-center gap-1 text-sm font-semibold text-indigo-600">
                      <ShieldCheck className="h-4 w-4" /> {me.role}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3 text-sm text-slate-600">
                  {me.email && (
                    <p className="dash-outline flex items-center gap-3 rounded-2xl px-4 py-3">
                      <Mail className="h-4 w-4 text-slate-400" /> {me.email}
                    </p>
                  )}
                  {me.phoneNumber && (
                    <p className="dash-outline flex items-center gap-3 rounded-2xl px-4 py-3">
                      <Phone className="h-4 w-4 text-slate-400" /> {me.phoneNumber}
                    </p>
                  )}
                  {me.studentId && (
                    <p className="dash-outline flex items-center gap-3 rounded-2xl px-4 py-3">
                      <Building2 className="h-4 w-4 text-slate-400" /> {t("guardId")} {me.studentId}
                    </p>
                  )}
                </div>

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:opacity-60 cursor-pointer"
                >
                  <LogOut className="h-5 w-5" />
                  {loggingOut ? tc("loggingOut") : tc("logout")}
                </button>
              </>
            ) : null}
          </section>

          <SecurityBottomNav active="Profile" />
        </div>
      </div>
    </main>
  );
}
