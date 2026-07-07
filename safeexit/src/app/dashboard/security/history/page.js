"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, History as HistoryIcon, Loader2, LogIn, LogOut, Search } from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import SecurityBottomNav from "../components/SecurityBottomNav";

const DIRECTIONS = [
  { key: "all", label: "All" },
  { key: "IN", label: "Entries" },
  { key: "OUT", label: "Exits" },
];

export default function SecurityHistoryPage() {
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

  return (
    <main className="min-h-screen dashboard-neo text-slate-900">
      <div className="relative overflow-hidden">
        <div className="dash-orb dash-orb-one" />
        <div className="dash-orb dash-orb-two" />
        <div className="dash-orb dash-orb-three" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="dash-surface dash-animate-rise flex flex-wrap items-center justify-between gap-4 rounded-[2.25rem] px-5 py-4 shadow-xl">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/security"
                className="dash-glow flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-500 text-white shadow-lg"
              >
                <ArrowLeft className="h-7 w-7" />
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Gate Log</p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Scan History</h1>
                <p className="text-sm font-medium text-slate-500">{visible.length} movements</p>
              </div>
            </div>

            <div className="dash-card flex items-center gap-3 rounded-2xl px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / roll no"
                className="w-56 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
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
                    : "dash-card text-slate-500 hover:bg-slate-50"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          <section className="dash-surface dash-animate-rise mt-6 rounded-[2.5rem] p-6 shadow-xl">
            {error && (
              <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading scan history…
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
                <HistoryIcon className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">No scans found</p>
                <p className="text-sm text-slate-400">Logged entries and exits will appear here.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {visible.map((log) => {
                  const st = log.student || {};
                  const meta = [st.year, st.department].filter(Boolean).join(", ");
                  return (
                    <div
                      key={log._id}
                      className="dash-outline flex flex-wrap items-center justify-between gap-4 rounded-2xl px-4 py-3"
                    >
                      <div className="flex items-center gap-4">
                        <span
                          className={`flex h-10 w-10 items-center justify-center rounded-full ${
                            log.direction === "IN" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                          }`}
                        >
                          {log.direction === "IN" ? <LogIn className="h-5 w-5" /> : <LogOut className="h-5 w-5" />}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{st.name || "Unknown Student"}</p>
                          <p className="text-xs text-slate-500">{[meta, st.studentId].filter(Boolean).join(" - ") || "—"}</p>
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
                        <span className="text-xs font-semibold text-slate-500">
                          {new Date(log.createdAt).toLocaleString("en-US", {
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
