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
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-28 md:pb-10">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel grd-glow-border sd-enter flex flex-wrap items-center gap-4 rounded-[2.25rem] px-5 py-4">
            <Link
              href="/dashboard/security"
              className="sd-lift-lg flex h-14 w-14 items-center justify-center rounded-2xl text-white"
              style={{
                background: "linear-gradient(145deg, #0f172a 0%, #0f766e 52%, #2dd4bf 100%)",
                boxShadow: "0 18px 40px -20px rgba(13,148,136,0.6)",
              }}
            >
              <ArrowLeft className="h-7 w-7" />
            </Link>
            <div className="flex-1">
              <span className="sd-kicker">{t("account")}</span>
              <h1 className="sd-title sd-title-md mt-1">{tc("profile")}</h1>
            </div>
            <LanguageSwitcher />
          </header>

          <section className="sd-luxe-panel sd-enter mt-6 rounded-[2.5rem] p-6" style={{ animationDelay: "0.12s" }}>
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
                  <span className="sd-profile-avatar" style={{ height: "4rem", width: "4rem", fontSize: "1.15rem" }}>
                    {getInitials(me.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="sd-card-title text-xl">{me.name}</p>
                    <p className="sd-tag mt-1.5">
                      <ShieldCheck className="h-3.5 w-3.5" /> {me.role}
                    </p>
                  </div>
                </div>

                <div className="mt-6 space-y-3">
                  {me.email && (
                    <div className="sd-row" style={{ "--accent": "#6366f1" }}>
                      <span className="sd-row__accent" aria-hidden="true" />
                      <div className="flex min-w-0 items-center gap-3">
                        <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="sd-card-title break-all text-[0.88rem]">{me.email}</span>
                      </div>
                    </div>
                  )}
                  {me.phoneNumber && (
                    <div className="sd-row" style={{ "--accent": "#0ea5e9" }}>
                      <span className="sd-row__accent" aria-hidden="true" />
                      <div className="flex items-center gap-3">
                        <Phone className="h-4 w-4 text-slate-400" />
                        <span className="sd-card-title text-[0.88rem]">{me.phoneNumber}</span>
                      </div>
                    </div>
                  )}
                  {me.studentId && (
                    <div className="sd-row" style={{ "--accent": "#2dd4bf" }}>
                      <span className="sd-row__accent" aria-hidden="true" />
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-slate-400" />
                        <span className="sd-card-title text-[0.88rem]">{t("guardId")} {me.studentId}</span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleLogout}
                  disabled={loggingOut}
                  className="sd-magnetic mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-rose-600 shadow-sm transition hover:bg-rose-100 disabled:opacity-60 cursor-pointer"
                  onPointerMove={(e) => {
                    const el = e.currentTarget;
                    const rect = el.getBoundingClientRect();
                    el.style.setProperty("--mag-x", `${(e.clientX - (rect.left + rect.width / 2)) * 0.2}px`);
                    el.style.setProperty("--mag-y", `${(e.clientY - (rect.top + rect.height / 2)) * 0.2}px`);
                  }}
                  onPointerLeave={(e) => {
                    e.currentTarget.style.setProperty("--mag-x", "0px");
                    e.currentTarget.style.setProperty("--mag-y", "0px");
                  }}
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
