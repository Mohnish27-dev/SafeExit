"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, FileText, Loader2, MapPin, RefreshCw, Search } from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { HOSTELS } from "@/app/lib/hostels";

const STATUSES = ["Pending", "Forwarded", "Approved", "Rejected", "Out", "Returned", "Expired", "Cancelled"];

const STATUS_TONE = {
  Pending: "bg-amber-100 text-amber-700",
  Forwarded: "bg-violet-100 text-violet-700",
  Approved: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-rose-100 text-rose-700",
  Out: "bg-sky-100 text-sky-700",
  Returned: "bg-cyan-100 text-cyan-700",
  Expired: "bg-slate-100 text-slate-600",
  Cancelled: "bg-slate-100 text-slate-600",
};

const formatDate = (value) => value
  ? new Date(value).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
  : "—";

export default function ApplicationsView({ type }) {
  const isLeave = type === "leave";
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState("");
  const [hostel, setHostel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiFetch(isLeave ? "/leave/all" : "/outing/all"));
      setError("");
    } catch (err) {
      setError(err.message || `Could not load ${isLeave ? "leave applications" : "outing requests"}.`);
    } finally {
      setLoading(false);
    }
  }, [isLeave]);

  useEffect(() => {
    // Data is synchronized from the API when this view mounts or changes type.
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
      return [student.name, student.studentId, student.roomNumber, student.hostelName, row.destination, isLeave ? row.reason : row.purpose]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [hostel, isLeave, rows, search, status]);

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-white/70 bg-white/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700"><FileText className="h-6 w-6" /></span>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">{isLeave ? "Leave Applications" : "Outing Requests"}</h2>
              <p className="text-sm font-medium text-slate-500">{visible.length} records across all hostels · view only</p>
            </div>
          </div>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="relative sm:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search student, room, destination" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:bg-white" />
          </div>
          <select value={hostel} onChange={(event) => setHostel(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
            <option value="">All hostels</option>
            {HOSTELS.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.gender === "Female" ? "Girls" : "Boys"}</option>)}
          </select>
          <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
            <option value="">All statuses</option>
            {STATUSES.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading records…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white/80 py-16 text-center text-slate-500">No matching records found.</div>
      ) : (
        <div className="grid gap-4">
          {visible.map((row) => {
            const student = row.student || {};
            const start = isLeave ? row.leaveDate : row.outTime;
            const end = isLeave ? row.returnDate : row.inTime;
            return (
              <article key={row._id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-extrabold text-slate-900">{student.name || "Unknown student"}</h3>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${STATUS_TONE[row.status] || STATUS_TONE.Expired}`}>{row.status}</span>
                      {row.autoApproved && <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-[11px] font-bold text-cyan-700">Auto-approved</span>}
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{[student.studentId, student.department, student.year].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <p className="text-xs font-semibold text-slate-400">Submitted {formatDate(row.createdAt)}</p>
                </div>

                <div className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                  <p className="flex items-center gap-2"><MapPin className="h-4 w-4 text-indigo-500" /><span><b className="text-slate-800">Destination:</b> {row.destination || "—"}</span></p>
                  <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-indigo-500" /><span><b className="text-slate-800">From:</b> {formatDate(start)}</span></p>
                  <p className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-indigo-500" /><span><b className="text-slate-800">Return:</b> {formatDate(end)}</span></p>
                  <p><b className="text-slate-800">Hostel / Room:</b> {[student.hostelName, student.roomNumber && `Room ${student.roomNumber}`].filter(Boolean).join(" · ") || "—"}</p>
                </div>

                <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <b className="text-slate-800">{isLeave ? "Reason" : "Purpose"}:</b> {isLeave ? row.reason : row.purpose}
                </div>

                {(row.forwardedBy?.name || row.approvedBy?.name || row.remarks) && (
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs font-semibold text-slate-500">
                    {row.forwardedBy?.name && <span>Forwarded by {row.forwardedBy.name}{row.forwardedTo?.name ? ` to ${row.forwardedTo.name}` : ""}</span>}
                    {row.approvedBy?.name && <span>Decided by {row.approvedBy.name} ({row.approvedBy.role})</span>}
                    {row.remarks && <span>Remarks: {row.remarks}</span>}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
