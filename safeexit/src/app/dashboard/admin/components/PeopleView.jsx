"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GraduationCap,
  ShieldCheck,
  UserCog,
  Search,
  Loader2,
  Mail,
  Phone,
  DoorOpen,
  CircleDot,
  Users,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { getInitials } from "@/app/lib/userProfile";

const TABS = [
  { key: "Student", label: "Students", icon: GraduationCap },
  { key: "Guard", label: "Guards", icon: ShieldCheck },
  { key: "Warden", label: "Wardens", icon: UserCog },
];

const CAMPUS_TONE = {
  Inside: "bg-emerald-100 text-emerald-700",
  Outside: "bg-amber-100 text-amber-700",
  Overdue: "bg-rose-100 text-rose-700",
};

const formatWhen = (iso) =>
  iso ? new Date(iso).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

export default function PeopleView() {
  const [role, setRole] = useState("Student");
  const [people, setPeople] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch(`/admin/users?role=${role}`);
      setPeople(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load users");
    } finally {
      setLoading(false);
    }
  }, [role]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        (p.name || "").toLowerCase().includes(q) ||
        (p.studentId || "").toLowerCase().includes(q) ||
        (p.email || "").toLowerCase().includes(q)
    );
  }, [people, search]);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/70 bg-white/80 px-5 py-4 shadow-sm backdrop-blur">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Users className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-slate-900">People &amp; Status</h2>
            <p className="text-sm text-slate-600">{visible.length} {role.toLowerCase()}s</p>
          </div>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name / id / email"
            className="w-56 rounded-full border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setRole(t.key); setSearch(""); }}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition ${
              role === t.key ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow" : "bg-white text-slate-500 hover:bg-slate-100"
            }`}
          >
            <t.icon className="h-4 w-4" /> {t.label}
          </button>
        ))}
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading {role.toLowerCase()}s…
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white py-16 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">No {role.toLowerCase()}s found</p>
          <p className="text-sm text-slate-400">They will appear here once registered.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <article key={p._id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white">
                  {getInitials(p.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{p.name}</p>
                  <p className="truncate text-xs text-slate-500">{p.studentId || p.email}</p>
                </div>
                {role === "Student" && (
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${CAMPUS_TONE[p.campusStatus] || CAMPUS_TONE.Inside}`}>
                    {p.campusStatus || "Inside"}
                  </span>
                )}
                {role === "Guard" && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${p.onDuty ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                    <CircleDot className="h-3 w-3" /> {p.onDuty ? "On Duty" : "Off Duty"}
                  </span>
                )}
              </div>

              <div className="mt-4 space-y-2 text-sm text-slate-600">
                {(p.department || p.year) && (
                  <p className="flex items-center gap-2">
                    <GraduationCap className="h-4 w-4 text-slate-400" />
                    {[p.department, p.year].filter(Boolean).join(" · ")}
                  </p>
                )}
                {(p.hostelName || p.roomNumber) && (
                  <p className="flex items-center gap-2">
                    <DoorOpen className="h-4 w-4 text-slate-400" />
                    {[p.hostelName, p.roomNumber && `Room ${p.roomNumber}`].filter(Boolean).join(" · ")}
                  </p>
                )}
                {p.email && (
                  <p className="flex items-center gap-2 truncate">
                    <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate">{p.email}</span>
                  </p>
                )}
                {p.phoneNumber && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-slate-400" /> {p.phoneNumber}
                  </p>
                )}
              </div>

              <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400">
                {role === "Student"
                  ? `Last seen ${formatWhen(p.lastSeenAt)}`
                  : `Last active ${formatWhen(p.lastActiveAt)}`}
                {p.webAuthnRegistered && <span className="ml-2 text-emerald-500">· Passkey ✓</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
