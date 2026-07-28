"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DoorClosed, Loader2, LogIn, LogOut, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { HOSTELS } from "@/app/lib/hostels";

const formatDate = (value) => new Date(value).toLocaleString("en-IN", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
});

export default function MovementLogsView() {
  const [logs, setLogs] = useState([]);
  const [direction, setDirection] = useState("");
  const [hostel, setHostel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ limit: "500" });
      if (direction) query.set("direction", direction);
      setLogs(await apiFetch(`/scan?${query.toString()}`));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load movement logs.");
    } finally {
      setLoading(false);
    }
  }, [direction]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return logs.filter((log) => {
      const student = log.student || {};
      if (hostel && student.hostelName !== hostel) return false;
      if (!query) return true;
      return [student.name, student.studentId, student.roomNumber, student.hostelName, log.guard?.name]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [hostel, logs, search]);

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Movement Logs</h2>
            <p className="text-sm font-medium text-slate-500">{visible.length} of the latest {logs.length} gate scans · all hostels</p>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, room, guard" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <select value={hostel} onChange={(event) => setHostel(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
            <option value="">All hostels</option>
            {HOSTELS.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select>
          <select value={direction} onChange={(event) => setDirection(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
            <option value="">All movements</option>
            <option value="OUT">Exits</option>
            <option value="IN">Entries</option>
          </select>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading movement logs…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 py-16 text-center">
          <DoorClosed className="mx-auto h-10 w-10 text-slate-300" /><p className="mt-3 font-semibold text-slate-600">No matching movement logs.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          {visible.map((log, index) => {
            const student = log.student || {};
            const isOut = log.direction === "OUT";
            return (
              <article key={log._id} className={`flex flex-wrap items-center justify-between gap-4 px-5 py-4 ${index ? "border-t border-slate-100" : ""}`}>
                <div>
                  <p className="font-extrabold text-slate-900">{student.name || "Unknown student"}</p>
                  <p className="mt-0.5 text-xs font-semibold text-slate-500">{[student.studentId, student.hostelName, student.roomNumber && `Room ${student.roomNumber}`, student.department].filter(Boolean).join(" · ") || "—"}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${isOut ? "bg-sky-100 text-sky-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {isOut ? <LogOut className="h-3.5 w-3.5" /> : <LogIn className="h-3.5 w-3.5" />} {isOut ? "Exit" : "Entry"}
                  </span>
                  <span className={`rounded-full px-3 py-1 ${log.punctuality === "Overdue" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>{log.punctuality || "N/A"}</span>
                  <span className="inline-flex items-center gap-1.5 text-slate-500"><ShieldCheck className="h-3.5 w-3.5" /> {log.guard?.name || "System"}</span>
                  <span className="text-slate-400">{formatDate(log.createdAt)}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
