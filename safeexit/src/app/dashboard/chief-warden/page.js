"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Clock3,
  Crown,
  FileText,
  Footprints,
  LayoutDashboard,
  LogOut,
  MessageSquareWarning,
  RefreshCw,
  ShieldCheck,
  Siren,
  UserCheck,
  UserRound,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { useRequireAuth, logout } from "@/app/lib/auth";
import { getFirstName, getInitials, getStoredUser } from "@/app/lib/userProfile";
import AuthLoading from "@/app/components/AuthGate";
import SOSAlertsView from "../caretaker/components/SOSAlertsView";
import ApplicationsView from "./components/ApplicationsView";
import MovementLogsView from "./components/MovementLogsView";
import ComplaintsView from "./components/ComplaintsView";

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "outings", label: "Outings", icon: Footprints },
  { key: "leaves", label: "Leave", icon: FileText },
  { key: "movements", label: "Movement", icon: ShieldCheck },
  { key: "sos", label: "SOS", icon: Siren },
  { key: "complaints", label: "Complaints", icon: MessageSquareWarning },
];

function StatCard({ icon: Icon, label, value, note, tone }) {
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${tone}`}>
      <div className="flex items-center gap-4">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 shadow-sm"><Icon className="h-5 w-5" /></span>
        <div><p className="text-3xl font-black leading-none text-slate-900">{value}</p><p className="mt-1 text-sm font-bold text-slate-700">{label}</p></div>
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">{note}</p>
    </div>
  );
}

function HostelCard({ hostel }) {
  const isGirls = hostel.gender === "Female";
  return (
    <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${isGirls ? "bg-fuchsia-100 text-fuchsia-700" : "bg-sky-100 text-sky-700"}`}><Building2 className="h-5 w-5" /></span>
          <div><h3 className="font-extrabold text-slate-900">{hostel.name}</h3><p className="text-xs font-bold text-slate-500">{isGirls ? "Girls' Hostel" : "Boys' Hostel"}</p></div>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">{hostel.students.total} students</span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-emerald-50 px-2 py-3"><p className="text-lg font-black text-emerald-700">{hostel.students.inside}</p><p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600">Inside</p></div>
        <div className="rounded-2xl bg-amber-50 px-2 py-3"><p className="text-lg font-black text-amber-700">{hostel.students.outside}</p><p className="text-[10px] font-bold uppercase tracking-wide text-amber-600">Outside</p></div>
        <div className="rounded-2xl bg-rose-50 px-2 py-3"><p className="text-lg font-black text-rose-700">{hostel.students.overdue}</p><p className="text-[10px] font-bold uppercase tracking-wide text-rose-600">Overdue</p></div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold text-slate-600">
        <span>Pending outings <b className="float-right text-slate-900">{hostel.outings.pending}</b></span>
        <span>With warden <b className="float-right text-slate-900">{hostel.outings.forwarded}</b></span>
        <span>Pending leave <b className="float-right text-slate-900">{hostel.leaves.pending}</b></span>
        <span>Leave forwarded <b className="float-right text-slate-900">{hostel.leaves.forwarded}</b></span>
        <span>Active SOS <b className="float-right text-rose-600">{hostel.activeSOS}</b></span>
        <span>Open complaints <b className="float-right text-orange-600">{hostel.openComplaints}</b></span>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-500">
        <p>Warden: <span className="font-bold text-slate-700">{hostel.warden?.name || "Not assigned"}</span></p>
        <p className="mt-1">Caretaker: <span className="font-bold text-slate-700">{hostel.caretaker?.name || "Not assigned"}</span></p>
      </div>
    </article>
  );
}

export default function ChiefWardenDashboardPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("chief-warden");
  const [view, setView] = useState("overview");
  const [profile, setProfile] = useState({ name: "Chief Warden", roleLabel: "Chief Warden" });
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const stored = getStoredUser();
    // Sync the tab-scoped external session store once after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored?.name) setProfile((current) => ({ ...current, ...stored }));
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    try {
      setOverview(await apiFetch("/chief-warden/overview"));
      setError("");
    } catch (err) {
      setError(err.message || "Could not load the campus hostel overview.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview();
    const timer = setInterval(loadOverview, 30000);
    return () => clearInterval(timer);
  }, [loadOverview]);

  const formattedDate = useMemo(() => now.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }), [now]);
  const formattedTime = useMemo(() => now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }), [now]);

  if (!checked || !authorized) return <AuthLoading />;

  const students = overview?.students || {};
  const stats = [
    { icon: UserCheck, label: "Inside", value: students.inside ?? "—", note: "Students currently inside campus", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { icon: UserRound, label: "Outside", value: students.outside ?? "—", note: "Students outside on active passes", tone: "border-amber-200 bg-amber-50 text-amber-700" },
    { icon: Clock3, label: "Overdue", value: students.overdue ?? "—", note: "Students past their return time", tone: "border-rose-200 bg-rose-50 text-rose-700" },
    { icon: Siren, label: "Active SOS", value: overview?.activeSOS ?? "—", note: "Across boys' and girls' hostels", tone: "border-rose-200 bg-rose-50 text-rose-700" },
    { icon: Footprints, label: "Pending Outings", value: overview?.outings?.pending ?? "—", note: `${overview?.outings?.forwarded ?? 0} currently with wardens`, tone: "border-sky-200 bg-sky-50 text-sky-700" },
    { icon: FileText, label: "Pending Leave", value: overview?.leaves?.pending ?? "—", note: `${overview?.leaves?.forwarded ?? 0} currently with wardens`, tone: "border-violet-200 bg-violet-50 text-violet-700" },
    { icon: MessageSquareWarning, label: "Open Complaints", value: overview?.openComplaints ?? "—", note: "Open or in progress", tone: "border-orange-200 bg-orange-50 text-orange-700" },
    { icon: Building2, label: "All Students", value: students.total ?? "—", note: `${overview?.hostels?.length ?? 0} campus hostels`, tone: "border-slate-200 bg-slate-50 text-slate-700" },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-100 via-indigo-50 to-cyan-50 text-slate-900">
      <div className="mx-auto min-h-screen w-full max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/80 bg-white/90 px-5 py-4 shadow-xl backdrop-blur">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-700 to-cyan-500 text-white shadow-lg"><Crown className="h-7 w-7" /></span>
            <div><p className="text-xs font-bold uppercase tracking-[0.3em] text-indigo-500">All Hostel Command</p><h1 className="text-2xl font-black tracking-tight sm:text-3xl">Chief Warden Dashboard</h1><p className="text-sm font-medium text-slate-500">Welcome, {getFirstName(profile.name) || profile.name} · campus-wide read-only oversight</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 sm:flex"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-sm font-black text-white">{getInitials(profile.name)}</span><div><p className="text-sm font-extrabold">{profile.name}</p><p className="text-xs font-semibold text-slate-500">All hostels · Boys &amp; Girls</p></div></div>
            <button onClick={() => logout(router, { role: "chief-warden" })} className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-100"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Logout</span></button>
          </div>
        </header>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2 text-sm font-bold text-slate-600"><span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2"><CalendarDays className="h-4 w-4" /> {formattedDate}</span><span suppressHydrationWarning className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2"><Clock3 className="h-4 w-4" /> {formattedTime}</span></div>
          <button onClick={loadOverview} disabled={loading} className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-bold text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh overview</button>
        </div>

        <nav className="mt-4 grid grid-cols-2 gap-2 rounded-3xl border border-white/80 bg-white/90 p-2 shadow-sm sm:grid-cols-3 lg:grid-cols-6">
          {NAV.map((item) => <button key={item.key} onClick={() => setView(item.key)} className={`flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold transition ${view === item.key ? "bg-gradient-to-r from-slate-900 to-indigo-600 text-white shadow" : "text-slate-500 hover:bg-slate-100"}`}><item.icon className="h-4 w-4" /> {item.label}</button>)}
        </nav>

        {error && <p className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"><AlertTriangle className="h-4 w-4" /> {error}</p>}

        <div className="mt-6">
          {view === "overview" && (
            <section className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{stats.map((card) => <StatCard key={card.label} {...card} />)}</div>
              <div><div className="mb-4"><h2 className="text-xl font-black text-slate-900">Every Campus Hostel</h2><p className="text-sm font-medium text-slate-500">Operational status, responsible staff, requests, safety alerts, and complaints in one view.</p></div>{loading && !overview ? <div className="py-16 text-center font-semibold text-slate-500">Loading hostel details…</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{overview?.hostels?.map((hostel) => <HostelCard key={hostel.name} hostel={hostel} />)}</div>}</div>
            </section>
          )}
          {view === "outings" && <ApplicationsView type="outing" />}
          {view === "leaves" && <ApplicationsView type="leave" />}
          {view === "movements" && <MovementLogsView />}
          {view === "sos" && <SOSAlertsView readOnly />}
          {view === "complaints" && <ComplaintsView />}
        </div>
      </div>
    </main>
  );
}
