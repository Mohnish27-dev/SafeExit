"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Clock3,
  DoorOpen,
  GraduationCap,
  Loader2,
  Mail,
  Phone,
  Search,
  UsersRound,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { getInitials } from "@/app/lib/userProfile";
import SecurityBottomNav from "../components/SecurityBottomNav";

const CAMPUS_TONE = {
  Inside: "bg-emerald-100 text-emerald-700",
  Outside: "bg-amber-100 text-amber-700",
  Overdue: "bg-rose-100 text-rose-700",
};

const formatWhen = (iso) =>
  iso
    ? new Date(iso).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

export default function SecurityStudentsPage() {
  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/users?role=Student");
      setStudents(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load students");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        (s.name || "").toLowerCase().includes(q) ||
        (s.studentId || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q)
    );
  }, [students, search]);

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
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Live Roster</p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Students</h1>
                <p className="text-sm font-medium text-slate-500">{visible.length} registered</p>
              </div>
            </div>

            <div className="dash-card flex items-center gap-3 rounded-2xl px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name / roll no / email"
                className="w-56 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          </header>

          <section className="dash-surface dash-animate-rise mt-6 rounded-[2.5rem] p-6 shadow-xl">
            {error && (
              <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading students…
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
                <UsersRound className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">No students found</p>
                <p className="text-sm text-slate-400">They will appear here once registered.</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((s) => (
                  <article key={s._id} className="dash-card rounded-3xl p-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white">
                        {getInitials(s.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900">{s.name}</p>
                        <p className="truncate text-xs text-slate-500">{s.studentId || s.email}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          CAMPUS_TONE[s.campusStatus] || CAMPUS_TONE.Inside
                        }`}
                      >
                        {s.campusStatus || "Inside"}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                      {(s.department || s.year) && (
                        <p className="flex items-center gap-2">
                          <GraduationCap className="h-4 w-4 text-slate-400" />
                          {[s.department, s.year].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {(s.hostelName || s.roomNumber) && (
                        <p className="flex items-center gap-2">
                          <DoorOpen className="h-4 w-4 text-slate-400" />
                          {[s.hostelName, s.roomNumber && `Room ${s.roomNumber}`].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      {s.email && (
                        <p className="flex items-center gap-2 truncate">
                          <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                          <span className="truncate">{s.email}</span>
                        </p>
                      )}
                      {s.phoneNumber && (
                        <p className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-slate-400" /> {s.phoneNumber}
                        </p>
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-1 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" /> Last seen {formatWhen(s.lastSeenAt)}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <SecurityBottomNav active="Students" />
        </div>
      </div>
    </main>
  );
}
