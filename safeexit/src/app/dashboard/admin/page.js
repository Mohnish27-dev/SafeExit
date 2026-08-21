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
  MessageSquareText,
  CalendarDays,
  RefreshCw,
  DoorOpen,
  ChartNoAxesCombined,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { subscribeToStaffEvents } from "@/app/lib/staffEvents";
import { getStoredUser, getFirstName, getInitials } from "@/app/lib/userProfile";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SOSAlertsView from "./components/SOSAlertsView";
import MovementLogsView from "./components/MovementLogsView";
import PeopleView from "./components/PeopleView";
import AnalyticsView from "./components/AnalyticsView";
import OverdueStudentsView from "../caretaker/components/OverdueStudentsView";
import DelayNoticesView from "../caretaker/components/DelayNoticesView";
import DelayNoticeToast from "../caretaker/components/DelayNoticeToast";

// `short` keeps every tab on one line in the 4-across phone nav.
const NAV = [
  { key: "overview", label: "Overview", short: "Overview", icon: LayoutDashboard },
  { key: "analytics", label: "Analytics", short: "Analytics", icon: ChartNoAxesCombined },
  { key: "sos", label: "SOS Alerts", short: "SOS", icon: Siren },
  { key: "overdue", label: "Overdue", short: "Overdue", icon: Clock3 },
  { key: "delays", label: "Delays", short: "Delays", icon: MessageSquareText },
  { key: "logs", label: "Movement Logs", short: "Logs", icon: ScrollText },
  { key: "people", label: "People", short: "People", icon: Users },
];

function StatCard({ icon: Icon, label, value, note, tone }) {
  return (
    <div className={`rounded-2xl border p-3 shadow-sm sm:rounded-3xl sm:p-5 ${tone}`}>
      <div className="flex items-center gap-2.5 sm:gap-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/80 shadow-sm sm:h-12 sm:w-12 sm:rounded-2xl">
          <Icon className="h-5 w-5 sm:h-6 sm:w-6" />
        </span>
        <div className="min-w-0">
          <p className="text-xl font-bold leading-none text-slate-900 sm:text-3xl">{value}</p>
          <p className="mt-1 text-xs font-semibold text-slate-700 sm:text-sm">{label}</p>
        </div>
      </div>
      {note && <p className="mt-2 text-[10px] font-medium leading-4 text-slate-500 sm:mt-3 sm:text-xs">{note}</p>}
    </div>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("admin");
  const [view, setView] = useState("overview");
  const [profile, setProfile] = useState({ name: "Administrator", roleLabel: "Administrator" });
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  // Pending delay notices. Kept out of /admin/overview because a notice filed
  // before the return time passes never shows up in the overdue figure.
  const [delayCount, setDelayCount] = useState(0);

  const loadDelayCount = useCallback(async () => {
    try {
      const data = await apiFetch("/delay?status=Pending");
      setDelayCount(Array.isArray(data) ? data.length : 0);
    } catch {
      /* best-effort badge; the Delays tab surfaces the real error */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from the API, a client-only external source.
    loadDelayCount();
    const poll = setInterval(loadDelayCount, 30000);
    const unsubscribe = subscribeToStaffEvents({
      "delay:created": loadDelayCount,
      "delay:updated": loadDelayCount,
    });
    return () => {
      clearInterval(poll);
      unsubscribe();
    };
  }, [loadDelayCount]);

  useEffect(() => {
    const stored = getStoredUser();
    if (stored?.name) setProfile((p) => ({ ...p, ...stored }));
  }, []);

  // Push-notification deep link (?view=sos); param consumed once and stripped.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("view");
    if (target && NAV.some((n) => n.key === target)) {
      setView(target);
      window.history.replaceState({}, "", window.location.pathname);
    }
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

  // SSE: refresh the overview immediately on SOS events, not just the 15s tick.
  useEffect(() => {
    return subscribeToStaffEvents({
      "sos:created": loadOverview,
      "sos:updated": loadOverview,
    });
  }, [loadOverview]);

  const handleLogout = () => logout(router, { role: "admin" });

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
    { icon: CalendarDays, label: "Pending Outings", value: overview?.pendingOutings ?? "—", note: "Awaiting caretaker approval", tone: "border-sky-200 bg-sky-50 text-sky-700" },
    // Counts OutingRequest.status === 'Out' (pass-level), distinct from campusStatus 'Outside'.
    { icon: DoorOpen, label: "Gate: Out", value: overview?.studentsOut ?? "—", note: "Outing passes currently 'Out'", tone: "border-cyan-200 bg-cyan-50 text-cyan-700" },
    { icon: Building2, label: "Total Students", value: s.total ?? "—", note: "Registered on platform", tone: "border-slate-200 bg-slate-50 text-slate-700" },
  ];

  // Gate on a valid admin session; hook redirects to /login/admin otherwise.
  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen overflow-x-hidden bg-gradient-to-br from-[#eef2ff] via-[#f5f7ff] to-[#eaf2ff] text-slate-900">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 shadow-xl backdrop-blur sm:gap-4 sm:rounded-3xl sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-500 text-white shadow-lg sm:h-14 sm:w-14">
              <Shield className="h-6 w-6 sm:h-7 sm:w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-400 sm:text-xs sm:tracking-[0.35em]">Command Center</p>
              <h1 className="truncate text-lg font-bold tracking-tight text-slate-900 sm:text-2xl lg:text-3xl">NITP-SafeExit Admin</h1>
              <p className="truncate text-xs font-medium text-slate-500 sm:text-sm">Welcome back, {greetingName}</p>
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
              className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-100 sm:rounded-2xl sm:px-4 sm:py-2.5"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* Date + refresh strip */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 sm:mt-4 sm:gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-600 sm:text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 sm:gap-2 sm:px-4 sm:py-2">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400 sm:h-4 sm:w-4" /> {formattedDate}
            </span>
            <span suppressHydrationWarning className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 sm:gap-2 sm:px-4 sm:py-2">
              <Clock3 className="h-3.5 w-3.5 text-slate-400 sm:h-4 sm:w-4" /> {formattedTime}
            </span>
          </div>
          <button
            onClick={loadOverview}
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-600 transition hover:bg-indigo-100 sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
          >
            <RefreshCw className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Nav tabs — 4 across on phones so all seven stay visible without a scroll */}
        <nav className="mt-3 grid grid-cols-4 gap-1.5 rounded-2xl border border-white/70 bg-white/80 p-1.5 shadow-sm backdrop-blur sm:mt-4 sm:grid-cols-3 sm:gap-2 sm:rounded-3xl sm:p-2 lg:grid-cols-7">
          {NAV.map((item) => {
            const active = view === item.key;
            const badge = item.key === "sos"
              ? overview?.activeSOS
              : item.key === "overdue"
                ? overview?.students?.overdue
                : item.key === "delays"
                  ? delayCount
                  : null;
            return (
              <button
                key={item.key}
                onClick={() => setView(item.key)}
                className={`relative flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] font-bold leading-tight transition sm:flex-row sm:gap-2 sm:rounded-2xl sm:px-3 sm:py-3 sm:text-sm sm:font-semibold ${
                  active ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow-md" : "text-slate-500 hover:bg-slate-100"
                }`}
              >
                <item.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
                {badge ? (
                  <span className={`absolute right-0.5 top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold sm:static sm:ml-1 sm:h-5 sm:min-w-5 sm:px-1.5 sm:text-[11px] ${active ? "bg-white/25 text-white" : item.key === "delays" ? "bg-amber-500 text-white" : "bg-rose-500 text-white"}`}>
                    {badge}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 sm:mt-4">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}

        {/* Views */}
        <div className="mt-4 flex-1 sm:mt-6">
          {view === "overview" && (
            <section className="space-y-4 sm:space-y-6">
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
                {stats.map((card) => (
                  <StatCard key={card.label} {...card} />
                ))}
              </div>

              <div className="grid gap-3 sm:gap-6 lg:grid-cols-2">
                <button
                  onClick={() => setView("sos")}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:rounded-3xl sm:p-6"
                >
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600 sm:h-14 sm:w-14 sm:rounded-2xl">
                      <Siren className="h-5 w-5 sm:h-7 sm:w-7" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-400 sm:text-xs sm:tracking-[0.3em]">Emergencies</p>
                      <h2 className="text-base font-bold text-slate-900 sm:text-xl">{overview?.activeSOS ?? 0} Active SOS</h2>
                      <p className="text-xs text-slate-600 sm:text-sm">Review and respond to live alerts.</p>
                    </div>
                  </div>
                </button>

                <button
                  onClick={() => setView("logs")}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50/80 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md sm:rounded-3xl sm:p-6"
                >
                  <div className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 sm:h-14 sm:w-14 sm:rounded-2xl">
                      <ScrollText className="h-5 w-5 sm:h-7 sm:w-7" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-indigo-400 sm:text-xs sm:tracking-[0.3em]">Gate Activity</p>
                      <h2 className="text-base font-bold text-slate-900 sm:text-xl">Movement Logs</h2>
                      <p className="text-xs text-slate-600 sm:text-sm">All entry / exit scans across campus.</p>
                    </div>
                  </div>
                </button>
              </div>
            </section>
          )}

          {view === "sos" && <SOSAlertsView onChange={loadOverview} />}
          {view === "overdue" && <OverdueStudentsView />}
          {view === "delays" && <DelayNoticesView onCountChange={setDelayCount} />}
          {view === "analytics" && <AnalyticsView />}
          {view === "logs" && <MovementLogsView />}
          {view === "people" && <PeopleView />}
        </div>
      </div>
      <DelayNoticeToast onView={() => setView("delays")} />
    </main>
  );
}
