"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageSquareWarning, Phone, RefreshCw, Search, Wrench } from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { HOSTELS } from "@/app/lib/hostels";

const STATUS_TONE = {
  Open: "bg-rose-100 text-rose-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Resolved: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-slate-100 text-slate-600",
};

export default function ComplaintsView() {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [hostel, setHostel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch("/complaint"));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load complaints.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => {
      const student = row.student || {};
      if (status && row.status !== status) return false;
      if (hostel && student.hostelName !== hostel) return false;
      if (!query) return true;
      return [student.name, student.studentId, student.roomNumber, student.hostelName, row.category, row.description]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [hostel, rows, search, status]);

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-100 text-orange-700"><MessageSquareWarning className="h-6 w-6" /></span>
            <div><h2 className="text-xl font-extrabold text-slate-900">Complaints</h2><p className="text-sm font-medium text-slate-500">{visible.length} records across all hostels · view only</p></div>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, room, complaint" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white" /></div>
          <select value={hostel} onChange={(event) => setHostel(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"><option value="">All hostels</option>{HOSTELS.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400"><option value="">All statuses</option>{Object.keys(STATUS_TONE).map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading complaints…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 py-16 text-center text-slate-500">No matching complaints found.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((row) => {
            const student = row.student || {};
            return (
              <article key={row._id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div><h3 className="font-extrabold text-slate-900">{row.category}</h3><p className="mt-1 text-xs font-semibold text-slate-500">{student.name || "Unknown"} · {student.studentId || "—"}</p></div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[row.status] || STATUS_TONE.Rejected}`}>{row.status}</span>
                </div>
                <p className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">{row.description}</p>
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500">
                  <span>{student.hostelName || "—"} · Room {row.roomNumber || student.roomNumber || "—"}</span>
                  <span className="inline-flex items-center gap-1"><Wrench className="h-3.5 w-3.5" /> {row.department?.name || "Department not assigned"}</span>
                  {row.department?.phoneNumber && <a href={`tel:${row.department.phoneNumber}`} className="inline-flex items-center gap-1 text-indigo-600"><Phone className="h-3.5 w-3.5" /> {row.department.phoneNumber}</a>}
                </div>
                {row.resolutionComments && <p className="mt-3 text-xs font-semibold text-emerald-700">Resolution: {row.resolutionComments}</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
