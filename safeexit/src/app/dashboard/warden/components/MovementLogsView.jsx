"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, Search, Loader2, ScrollText, ShieldCheck, Clock3, DoorClosed } from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { getInitials } from "@/app/lib/userProfile";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";

const PUNCT_TONE = {
  "On-Time": "bg-emerald-100 text-emerald-700",
  Overdue: "bg-rose-100 text-rose-700",
  "N/A": "bg-slate-100 text-slate-500",
};

export default function MovementLogsView() {
  const { t } = useTranslation("warden");
  const dateLocale = useDateLocale();

  const FILTERS = [
    { key: "", label: t("filterAll") },
    { key: "OUT", label: t("filterExits") },
    { key: "IN", label: t("filterEntries") },
  ];

  const formatTime = (iso) =>
    new Date(iso).toLocaleString(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const [logs, setLogs] = useState([]);
  const [direction, setDirection] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = direction ? `?direction=${direction}` : "";
      const data = await apiFetch(`/scan${qs}`);
      setLogs(data);
      setError("");
    } catch (err) {
      setError(err.message || t("couldNotLoadLogs"));
    } finally {
      setLoading(false);
    }
  }, [direction]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return logs;
    return logs.filter((l) => {
      const st = l.student || {};
      return (
        (st.name || "").toLowerCase().includes(q) ||
        (st.studentId || "").toLowerCase().includes(q) ||
        (st.roomNumber || "").toLowerCase().includes(q)
      );
    });
  }, [logs, search]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <ScrollText className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t("movementLogs")}</h2>
            <p className="text-sm text-slate-600">{visible.length} {t("movementLogsCount")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full bg-slate-100 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.label}
                onClick={() => setDirection(f.key)}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                  direction === f.key ? "bg-white text-slate-900 shadow" : "text-slate-500"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchLogsPlaceholder")}
              className="w-56 rounded-full border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("loadingLogs")}
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <DoorClosed className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">{t("noMovementLogs")}</p>
          <p className="text-sm text-slate-400">{t("noMovementLogsHint")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {visible.map((l, i) => {
            const st = l.student || {};
            const isOut = l.direction === "OUT";
            return (
              <div
                key={l._id}
                className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 ${i !== 0 ? "border-t border-slate-100" : ""}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">
                    {getInitials(st.name)}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{st.name || "Unknown"}</p>
                    <p className="text-xs text-slate-500">
                      {[st.studentId, st.roomNumber && `Room ${st.roomNumber}`, st.department].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${isOut ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {isOut ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />}
                    {isOut ? t("exitOut") : t("entryIn")}
                  </span>
                  {l.punctuality && (
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${PUNCT_TONE[l.punctuality] || PUNCT_TONE["N/A"]}`}>
                      {l.punctuality}
                    </span>
                  )}
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> {l.guard?.name || "System"}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                    <Clock3 className="h-3.5 w-3.5 text-slate-400" /> {formatTime(l.createdAt)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
