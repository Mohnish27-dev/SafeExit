"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  ShieldCheck,
  LayoutDashboard,
  Siren,
  ScrollText,
  Users,
  LogOut,
  UserRound,
  UserCheck,
  AlertTriangle,
  Clock3,
  Building2,
  MessageSquareWarning,
  CalendarDays,
  RefreshCw,
  DoorOpen,
} from "lucide-react";
import { apiFetch, getApiBase } from "@/app/lib/api";
import { getStoredUser, getFirstName, getInitials } from "@/app/lib/userProfile";
import SOSAlertsView from "./components/SOSAlertsView";
import MovementLogsView from "./components/MovementLogsView";
import PeopleView from "./components/PeopleView";

const NAV = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "sos", label: "SOS Alerts", icon: Siren },
  { key: "logs", label: "Movement Logs", icon: ScrollText },
  { key: "people", label: "People", icon: Users },
];

function StatCard({ icon: Icon, label, value, note, tone }) {
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${tone}`}>
      <div className="flex items-center gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
          <Icon className="h-6 w-6" />
        </span>
        <div>
          <p className="text-3xl font-bold leading-none text-slate-900">{value}</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
        </div>
      </div>
      {note && <p className="mt-3 text-xs font-medium text-slate-500">{note}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [view, setView] = useState("overview");
  const [profile, setProfile] = useState({ name: "Administrator", roleLabel: "Administrator" });
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored?.name) setProfile((p) => ({ ...p, ...stored }));
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await apiFetch("/admin/overview");
      setOverview(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load overview");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
    // Keep the headline numbers fresh while the console is open.
    const t = setInterval(loadOverview, 15000);
    return () => clearInterval(t);
  }, [loadOverview]);

  // Live SOS push: refresh the overview (and its "Active SOS" badge) the moment
  // a student raises an alert or a responder resolves one, without waiting for
  // the 15s tick.
  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/sos/stream`, { withCredentials: true });
    source.addEventListener("sos:created", () => loadOverview());
    source.addEventListener("sos:updated", () => loadOverview());
    return () => source.close();
  }, [loadOverview]);

  const handleLogout = async () => {
    try {
      await fetch(`${getApiBase()}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      /* ignore network errors on logout */
    }
    ["safeexit_token", "safeexit:user"].forEach((k) => sessionStorage.removeItem(k));
    ["safeexit_webauthn_registered_admin", "safeexit_admin_profile"].forEach((k) =>
      localStorage.removeItem(k)
    );
    router.push("/login");
  };

  const greetingName = useMemo(() => getFirstName(profile.name) || profile.name, [profile.name]);
  const formattedDate = useMemo(
    () => now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }),
    [now]
  );
  const formattedTime = useMemo(
    () => now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [now]
  );

  const s = overview?.students || {};
  const stats = [
    { icon: UserCheck, label: "Inside Campus", value: s.inside ?? "—", note: "Students currently in", tone: "border-emerald-200 bg-emerald-50 text-emerald-700" },
    { icon: UserRound, label: "Outside Campus", value: s.outside ?? "—", note: "On approved outings", tone: "border-amber-200 bg-amber-50 text-amber-700" },
    { icon: Clock3, label: "Overdue", value: s.overdue ?? "—", note: "Not returned in time", tone: "border-rose-200 bg-rose-50 text-rose-700" },
    { icon: Siren, label: "Active SOS", value: overview?.activeSOS ?? "—", note: "Awaiting response", tone: "border-rose-200 bg-rose-50 text-rose-700" },
    { icon: ShieldCheck, label: "Guards On Duty", value: overview ? `${overview.guards.onDuty}/${overview.guards.total}` : "—", note: "Active security staff", tone: "border-indigo-200 bg-indigo-50 text-indigo-700" },
    { icon: CalendarDays, label: "Pending Outings", value: overview?.pendingOutings ?? "—", note: "Awaiting warden approval", tone: "border-sky-200 bg-sky-50 text-sky-700" },
    // Distinct from "Outside Campus" above: that tile counts User.campusStatus
    // ('Outside'), set the moment a student scans out. This one counts
    // OutingRequest.status === 'Out' — the pass-level lifecycle stage set by
    // the same scan. They usually move together but aren't the same field,
    // so surfacing both lets an admin spot the two ever drifting apart
    // (e.g. an overdue student is 'Overdue' in campusStatus but their pass
    // is still 'Out' until they're scanned back in).
    { icon: DoorOpen, label: "Gate: Out", value: overview?.studentsOut ?? "—", note: "Outing passes currently 'Out'", tone: "border-cyan-200 bg-cyan-50 text-cyan-700" },
    { icon: MessageSquareWarning, label: "Open Complaints", value: overview?.openComplaints ?? "—", note: "Unresolved reports", tone: "border-orange-200 bg-orange-50 text-orange-700" },
    { icon: Building2, label: "Total Students", value: s.total ?? "—", note: "Registered on platform", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  ];

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#eef2ff] via-[#f5f7ff] to-[#eaf2ff] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-white/70 bg-white/80 px-5 py-4 shadow-xl backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-500 text-white shadow-lg">
              <Shield className="h-7 w-7" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Command Center</p>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">SafeExit Admin</h1>
              <p className="text-sm font-medium text-slate-500">Welcome back, {greetingName}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 sm:flex">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-400 font-bold text-white">
                {getInitials(profile.name)}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{profile.name}</p>
                <p className="text-xs font-medium text-slate-500">{profile.roleLabel || "Administrator"}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Date + refresh strip */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-600">
            <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2">
              <CalendarDays className="h-4 w-4 text-slate-400" /> {formattedDate}
            </span>
            <span suppressHydrationWarning className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2">
              <Clock3 className="h-4 w-4 text-slate-400" /> {formattedTime}
            </span>
          </div>
          <button
            onClick={loadOverview}
            className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-600 transition hover:bg-indigo-100"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Nav tabs */}
        <nav className="mt-4 grid grid-cols-2 gap-2 rounded-3xl border border-white/70 bg-white/80 p-2 shadow-sm backdrop-blur sm:grid-cols-4">
          {NAV.map((item) => {
            const active = view === item.key;
            const badge = item.key === "sos" ? overview?.activeSOS : null;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`relative flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                  active ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
                {badge ? (
                  <span className={`ml-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${active ? "bg-white/25 text-white" : "bg-rose-500 text-white"}`}>
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            <AlertTriangle className="h-4 w-4" /> {error}
          </div>
        )}

        {/* Views */}
        <div className="mt-6 flex-1">
          {view === "overview" && (
            <section className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((card) => (
                  <StatCard key={card.label} {...card} />
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <button
                  onClick={() => setView("sos")}
                  className="flex items-center justify-between gap-4 rounded-3xl border border-rose-200 bg-rose-50/80 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                      <Siren className="h-7 w-7" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-400">Emergencies</p>
                      <h2 className="text-xl font-bold text-slate-900">{overview?.activeSOS ?? 0} Active SOS</h2>
                      <p className="text-sm text-slate-600">Review and respond to live alerts.</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setView("logs")}
                  className="flex items-center justify-between gap-4 rounded-3xl border border-indigo-200 bg-indigo-50/80 p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="flex items-center gap-4">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
                      <ScrollText className="h-7 w-7" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400">Gate Activity</p>
                      <h2 className="text-xl font-bold text-slate-900">Movement Logs</h2>
                      <p className="text-sm text-slate-600">All entry / exit scans across campus.</p>
                    </div>
                  </div>
                </button>
              </div>
            </section>
          )}

          {view === "sos" && <SOSAlertsView onChange={loadOverview} />}
          {view === "logs" && <MovementLogsView />}
          {view === "people" && <PeopleView />}
        </div>
      </div>
    </main>
  );
}
