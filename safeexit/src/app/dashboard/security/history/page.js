"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History as HistoryIcon, Loader2, LogIn, LogOut, Search } from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import SecurityBottomNav from "../components/SecurityBottomNav";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";

export default function SecurityHistoryPage() {
  const { t } = useTranslation("security");
  const dateLocale = useDateLocale();
  const { checked, authorized } = useRequireAuth("security");

  const DIRECTIONS = useMemo(() => [
    { key: "all", label: t("all") },
    { key: "IN", label: t("entries") },
    { key: "OUT", label: t("exits") },
  ], [t]);

  const [logs, setLogs] = useState([]);
  const [direction, setDirection] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/scan?limit=200");
      setLogs(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load scan history");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs
      .filter((log) => direction === "all" || log.direction === direction)
      .filter((log) => {
        if (!q) return true;
        const st = log.student || {};
        return (st.name || "").toLowerCase().includes(q) || (st.studentId || "").toLowerCase().includes(q);
      });
  }, [logs, direction, search]);

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-10">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel grd-glow-border sd-enter flex flex-wrap items-center justify-between gap-4 rounded-[2.25rem] px-5 py-4">
            <div className="flex items-center gap-4">
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
              <div>
                <span className="sd-kicker">{t("gateLog")}</span>
                <h1 className="sd-title sd-title-md mt-1">{t("scanHistory")}</h1>
                <p className="sd-body mt-0.5 text-sm">{visible.length} {t("movements")}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <div className="sd-luxe-card flex items-center gap-3 rounded-2xl px-4 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchNameRoll")}
                  className="w-56 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>
          </header>

          <div className="mt-6 flex flex-wrap gap-2">
            {DIRECTIONS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDirection(d.key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition cursor-pointer ${
                  direction === d.key
                    ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow"
                    : "sd-luxe-card text-slate-500 hover:bg-slate-50"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <section className="sd-luxe-panel sd-enter mt-6 rounded-[2.5rem] p-6" style={{ animationDelay: "0.14s" }}>
            {error && (
              <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> {t("loadingScanHistory")}
              </div>
            ) : visible.length === 0 ? (
              <div className="sd-empty py-16">
                <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
                  <span className="sd-ring" aria-hidden="true" />
                  <span className="sd-ring sd-ring--2" aria-hidden="true" />
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-sky-500 to-cyan-400 text-white shadow-lg shadow-cyan-500/30">
                    <HistoryIcon className="h-6 w-6" />
                  </span>
                </div>
                <p className="sd-card-title text-slate-700 text-[0.95rem]">{t("noScansFound")}</p>
                <p className="sd-micro mt-1 max-w-xs mx-auto">{t("scansWillAppear")}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map((log, i) => {
                  const st = log.student || {};
                  return (
                    <div
                      key={log._id}
                      className="sd-row sd-luxe-rise flex-wrap"
                      style={{
                        "--accent": log.direction === "IN" ? "#10b981" : "#38bdf8",
                        animationDelay: `${0.04 + Math.min(i, 12) * 0.03}s`,
                      }}
                    >
                      <span className="sd-row__accent" aria-hidden="true" />
                      <div className="flex items-center gap-4">
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            log.direction === "IN" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {log.direction === "IN" ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                        </span>
                        <div>
                          <p className="sd-card-title text-[0.88rem]">{st.name || t("unknownStudent")}</p>
                          <p className="sd-micro">{st.studentId || "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        {log.punctuality && log.punctuality !== "N/A" && (
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              log.punctuality === "Overdue"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-emerald-100 text-emerald-700"
                            }`}
                          >
                            {log.punctuality}
                          </span>
                        )}
                        <span className="sd-micro grd-mono">
                          {new Date(log.createdAt).toLocaleString(dateLocale, {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <SecurityBottomNav active="History" />
        </div>
      </div>
    </main>
  );
}
