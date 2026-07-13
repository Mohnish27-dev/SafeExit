"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  Home,
  MessageSquare,
  User,
  X,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Siren,
  Sparkles,
  Users,
} from "lucide-react";
import ProfileView from "./components/ProfileView";
import ComplaintsView from "./components/ComplaintsView";
import AutoApprovedView from "./components/AutoApprovedView";
import RequestsView from "./components/RequestsView";
import SOSAlertsView from "./components/SOSAlertsView";
import LeaveApplicationsView from "./components/LeaveApplicationsView";
import { apiFetch, getApiBase } from "@/app/lib/api";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";

const initials = (name = "") =>
  name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "—";

// A warden's managedGender maps to the hostel they oversee.
const HOSTEL_LABEL = { Male: "Boys' Hostel", Female: "Girls' Hostel" };

// Map a backend OutingRequest (with populated student) to the pending-card shape.
const mapPending = (o) => ({
  id: o._id,
  name: o.student?.name || "Unknown Student",
  branch: [o.student?.year, o.student?.department].filter(Boolean).join(", ") || "—",
  roll: o.student?.studentId || "",
  destination: o.destination || "",
  outingType: o.outingType || "",
  out: formatTime(o.outTime),
  return: formatTime(o.inTime),
  initials: initials(o.student?.name),
});

// Complaint category → icon/tone styling used by the complaint cards.
const complaintTone = (category) => {
  switch (category) {
    case "Electrical":
      return { tone: "bg-amber-100 text-amber-500", icon: AlertTriangle };
    case "Plumbing":
      return { tone: "bg-sky-100 text-sky-500", icon: AlertCircle };
    case "Security":
      return { tone: "bg-rose-100 text-rose-500", icon: ShieldAlert };
    default:
      return { tone: "bg-orange-100 text-orange-500", icon: AlertCircle };
  }
};

const statusToneFor = (status) =>
  status === "Resolved"
    ? "bg-emerald-100 text-emerald-600"
    : status === "In Progress"
    ? "bg-amber-100 text-amber-600"
    : "bg-rose-100 text-rose-600";

// Map a backend LeaveApplication (with populated student) to the pending-card shape.
const mapLeavePending = (l) => ({
  id: l._id,
  name: l.student?.name || "Unknown Student",
  roll: l.student?.studentId || "",
  room: [l.student?.hostelName, l.student?.roomNumber].filter(Boolean).join(", ") || "—",
  destination: l.destination || "",
  reason: l.reason || "",
  leaveDate: l.leaveDate,
  returnDate: l.returnDate,
  initials: initials(l.student?.name),
});

// Map a backend Complaint (with populated student) to the report-card shape.
const mapReport = (c) => {
  const { tone, icon } = complaintTone(c.category);
  return {
    id: c._id,
    title: c.description || c.category,
    by: c.student?.name || "Unknown Student",
    time: c.createdAt
      ? new Date(c.createdAt).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "—",
    status: c.status || "Open",
    tone,
    icon,
    statusTone: statusToneFor(c.status),
  };
};

export default function WardenDashboardPage() {
  const { t } = useTranslation("warden");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("warden");

  const [now, setNow] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // load stored profile from localStorage if available
    try {
      const raw = typeof window !== "undefined" && sessionStorage.getItem("safeexit:user");
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Refresh the profile from the server so the warden's hostel scope
  // (managedGender) is always current — even for sessions that logged in before
  // the field existed, or whose hostel was assigned/changed by an admin since.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await apiFetch("/auth/profile");
        if (!cancelled) setUser((u) => ({ ...(u || {}), ...profile }));
      } catch {
        /* best-effort; the badge/banner just fall back to the stored user */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formattedDate = now ? now.toLocaleDateString(dateLocale, { weekday: "short", day: "2-digit", month: "short" }) : tc("loading");
  const formattedTime = now ? now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : tc("loading");

  // Lists are loaded from the backend; approve/reject/resolve mutate the server
  // and then update these so the UI reflects changes immediately.
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [reports, setReports] = useState([]);

  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [reportsError, setReportsError] = useState("");

  // Pending leave applications (multi-day, warden-approved) awaiting action.
  const [leavePending, setLeavePending] = useState([]);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [leaveError, setLeaveError] = useState("");

  // Count of unresolved SOS alerts, surfaced as a badge on the nav + quick
  // action. Kept live independently of the SOS view so the badge shows even
  // when the warden is on another tab. The SOS view reports its own count back
  // via onCountChange; this listener catches new alerts while it's unmounted.
  const [sosCount, setSosCount] = useState(0);

  const loadSosCount = useCallback(async () => {
    try {
      const data = await apiFetch("/sos?status=Active");
      setSosCount(data.length);
    } catch {
      /* badge is best-effort; ignore transient errors */
    }
  }, []);

  useEffect(() => {
    loadSosCount();
    const interval = setInterval(loadSosCount, 30000);
    return () => clearInterval(interval);
  }, [loadSosCount]);

  // Live SOS push: a new student alert (or a status change) refreshes the badge
  // instantly, so a warden idling on the home tab still sees the count climb.
  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/sos/stream`, { withCredentials: true });
    source.addEventListener("sos:created", () => loadSosCount());
    source.addEventListener("sos:updated", () => loadSosCount());
    return () => source.close();
  }, [loadSosCount]);

  // Pending outing requests awaiting warden action.
  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    setRequestsError("");
    try {
      const data = await apiFetch("/outing/pending");
      setPending(data.map(mapPending));
    } catch (err) {
      setRequestsError(err.message || t("couldNotLoadRequests"));
    } finally {
      setLoadingRequests(false);
    }
  }, [t]);

  // All complaints for the recent-reports and complaints views.
  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setReportsError("");
    try {
      const data = await apiFetch("/complaint");
      const open = data.filter((c) => c.status !== "Resolved");
      setReports(open.map(mapReport));
    } catch (err) {
      setReportsError(err.message || t("couldNotLoadComplaints"));
    } finally {
      setLoadingReports(false);
    }
  }, [t]);

  // Pending leave applications awaiting warden action.
  const loadLeaveApplications = useCallback(async () => {
    setLoadingLeave(true);
    setLeaveError("");
    try {
      const data = await apiFetch("/leave/pending");
      setLeavePending(data.map(mapLeavePending));
    } catch (err) {
      setLeaveError(err.message || t("couldNotLoadLeave"));
    } finally {
      setLoadingLeave(false);
    }
  }, [t]);

  useEffect(() => {
    loadRequests();
    loadReports();
    loadLeaveApplications();
  }, [loadRequests, loadReports, loadLeaveApplications]);

  // Live updates: a new outing request (or an approval/rejection from another
  // warden/guard) pushes an event over SSE so the pending list refetches
  // instantly instead of requiring a manual refresh while this tab is open.
  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/outing/stream`, { withCredentials: true });
    source.addEventListener("outing:changed", () => {
      loadRequests();
    });
    return () => source.close();
  }, [loadRequests]);

  // Safety net in case the SSE connection is silently dropped (proxies,
  // flaky networks) — a low-frequency background poll keeps data fresh.
  useEffect(() => {
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, [loadRequests]);

  // Live updates: a new student complaint (or a status change from another
  // warden) pushes an event over SSE so the complaints list + badge refresh
  // instantly instead of requiring a manual refresh while this tab is open.
  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/complaint/stream`, { withCredentials: true });
    source.addEventListener("complaint:created", () => loadReports());
    source.addEventListener("complaint:updated", () => loadReports());
    return () => source.close();
  }, [loadReports]);

  // Safety net in case the SSE connection is silently dropped.
  useEffect(() => {
    const interval = setInterval(loadReports, 30000);
    return () => clearInterval(interval);
  }, [loadReports]);

  // Live updates: a new leave application (or a status change from another
  // warden) pushes an event over SSE so the pending list + badge refresh
  // instantly instead of requiring a manual refresh while this tab is open.
  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/leave/stream`, { withCredentials: true });
    source.addEventListener("leave:changed", () => loadLeaveApplications());
    return () => source.close();
  }, [loadLeaveApplications]);

  // Safety net in case the SSE connection is silently dropped.
  useEffect(() => {
    const interval = setInterval(loadLeaveApplications, 30000);
    return () => clearInterval(interval);
  }, [loadLeaveApplications]);

  function openPanel(key) {
    setActivePanel(key);
  }

  const [activePanel, setActivePanel] = useState(null);
  const [view, setView] = useState("home");

  function closePanel() {
    setActivePanel(null);
  }

  async function approveRequest(id) {
    const req = pending.find((p) => p.id === id);
    if (!req) return;
    // Optimistically move the card, then persist to the backend.
    setPending((p) => p.filter((r) => r.id !== id));
    setApproved((a) => [{ id: req.id, name: req.name, outSince: req.out, initials: req.initials }, ...a]);
    try {
      await apiFetch(`/outing/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved" }),
      });
    } catch (err) {
      // If the request expired before the warden could approve it, don't roll
      // back — the card should simply vanish from both pending and approved.
      if (err?.status === 409) {
        setApproved((a) => a.filter((r) => r.id !== id));
        setRequestsError(t("requestExpired"));
        return;
      }
      // Roll back on other failures.
      setApproved((a) => a.filter((r) => r.id !== id));
      setPending((p) => [req, ...p]);
      setRequestsError(err.message || t("couldNotApprove"));
    }
  }

  async function rejectRequest(id) {
    const req = pending.find((p) => p.id === id);
    if (!req) return;
    setPending((p) => p.filter((r) => r.id !== id));
    try {
      await apiFetch(`/outing/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Rejected" }),
      });
    } catch (err) {
      setPending((p) => [req, ...p]);
      setRequestsError(err.message || t("couldNotReject"));
    }
  }

  async function approveLeave(id) {
    const req = leavePending.find((l) => l.id === id);
    if (!req) return;
    setLeavePending((l) => l.filter((r) => r.id !== id));
    try {
      await apiFetch(`/leave/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved" }),
      });
    } catch (err) {
      if (err?.status === 409) {
        setLeaveError(t("leaveExpired"));
        return;
      }
      setLeavePending((l) => [req, ...l]);
      setLeaveError(err.message || t("couldNotApproveLeave"));
    }
  }

  async function rejectLeave(id, remarks) {
    const req = leavePending.find((l) => l.id === id);
    if (!req) return;
    setLeavePending((l) => l.filter((r) => r.id !== id));
    try {
      await apiFetch(`/leave/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Rejected", remarks }),
      });
    } catch (err) {
      if (err?.status === 409) {
        setLeaveError(t("leaveExpired"));
        return;
      }
      setLeavePending((l) => [req, ...l]);
      setLeaveError(err.message || t("couldNotRejectLeave"));
    }
  }

  async function resolveReport(id) {
    const rep = reports.find((r) => r.id === id);
    if (!rep) return;
    setReports((r) => r.filter((item) => item.id !== id));
    try {
      await apiFetch(`/complaint/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Resolved" }),
      });
    } catch (err) {
      setReports((r) => [rep, ...r]);
      setReportsError(err.message || t("couldNotResolve"));
    }
  }

  function toggleAutoRule() {
    // demo placeholder
    alert('Toggled auto-approval rule (demo)');
  }

  const displayName = (user && (user.name || user.displayName)) || "Warden Priya";
  const firstName = displayName.split(" ")[0] || displayName;

  // The hostel this warden oversees. When unset, the backend returns no students,
  // so we surface a "not configured" banner rather than a silently empty queue.
  const managedGender = user?.managedGender;
  const hostelLabel = HOSTEL_LABEL[managedGender];

  const handleLogout = () => logout(router, { role: "warden" });

  // Gate the dashboard on a valid warden session; the hook redirects to
  // /login/warden when the token is missing or belongs to another role.
  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen student-dashboard-luxe text-slate-900 pb-28">
      <div className="relative overflow-hidden">
        <div className="sd-luxe-orb sd-luxe-orb-one" />
        <div className="sd-luxe-orb sd-luxe-orb-two" />
        <div className="sd-luxe-orb sd-luxe-orb-three" />
        <div className="sd-luxe-wave" />
        <div className="sd-luxe-streaks" />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel sd-luxe-rise flex items-center justify-between gap-4 rounded-4xl px-5 py-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="sd-luxe-badge sd-luxe-float flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
                <ShieldAlert className="h-7 w-7" />
              </div>
              <div>
                <p className="sd-eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-indigo-400" /> {t("hub")}</p>
                <h1 className="sd-title sd-reveal sd-stagger-1"><span className="sd-gradient-text text-gradient-primary">{t("dashboardTitle")}</span></h1>
                <p className="sd-subtitle">{t("dashboardSubtitle")}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <div className="sd-luxe-card sd-profile-chip sd-luxe-tilt flex items-center gap-3 rounded-2xl px-4 py-3 min-w-55">
                <div className="sd-profile-avatar bg-linear-to-br from-indigo-600 to-cyan-400 text-white flex h-12 w-12 items-center justify-center rounded-xl font-bold">{(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || 'WP'}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-base">{displayName}</p>
                  {hostelLabel ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">{hostelLabel}</span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">No hostel assigned</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title={tc("logout")}
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition hover:bg-rose-50"
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">{tc("logout")}</span>
              </button>
            </div>
          </header>

          {user && !managedGender && (
            <div className="mt-6 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 shadow-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-bold">Your hostel isn&apos;t configured yet</p>
                <p className="text-sm">Until an admin assigns you to the boys&apos; or girls&apos; hostel, you won&apos;t see any student requests, leave applications, complaints, or alerts. Please contact the admin.</p>
              </div>
            </div>
          )}

          {view === 'home' && (
            <>
              <section className="sd-luxe-panel sd-luxe-rise sd-stagger-2 mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
            <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-5">
                <div className="sd-luxe-float flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-white to-sky-50 text-slate-900 ring-8 ring-white/80 shadow-lg">
                  <Clock className="h-10 w-10 text-indigo-600" />
                </div>
                <div>
                  <p className="sd-eyebrow">{t("dailyPulse")}</p>
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2">{t("greeting")} <span className="text-gradient-secondary">{firstName}</span>.</h2>
                  <p className="sd-body mt-2 max-w-md">{t("overviewText")}</p>
                </div>
              </div>
              <div className="grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-1">
                <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-3 rounded-full px-4 py-2.5">
                  <CalendarDays className="h-5 w-5 text-indigo-500" />
                  {formattedDate}
                </span>
                <span suppressHydrationWarning className="sd-luxe-pill sd-live-pulse inline-flex items-center gap-3 rounded-full px-4 py-2.5">
                  <Clock className="h-5 w-5 text-sky-500" />
                  {formattedTime}
                  <span className="sd-luxe-chip ml-auto rounded-full px-3 py-1 text-xs font-bold">{tc("live")}</span>
                </span>
              </div>
            </div>
              </section>

              <section className="sd-luxe-panel sd-luxe-rise sd-stagger-3 mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sd-eyebrow">{t("quickActions")}</p>
                <h2 className="sd-title sd-title-sm">{t("respondFaster")}</h2>
              </div>
              <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-bold animate-pulse">{t("autoRulesOn")}</span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4 sd-stagger">
              {[{
                title: t("manageRequests"),
                desc: t("manageRequestsDesc"),
                icon: Users,
                tone: 'from-indigo-600',
                onClick: () => openPanel('manage'),
              },{
                title: t("safetyAlerts"),
                desc: t("safetyAlertsDesc"),
                icon: Siren,
                tone: 'from-rose-600',
                badge: sosCount,
                onClick: () => setView('sos'),
              },{
                title: t("leaveApplications"),
                desc: t("leaveApplicationsDesc"),
                icon: CalendarDays,
                tone: 'from-violet-600',
                badge: leavePending.length,
                onClick: () => setView('leave'),
              },{
                title: t("autoApprovals"),
                desc: t("autoApprovalsDesc"),
                icon: Sparkles,
                tone: 'from-sky-600',
                onClick: () => openPanel('auto'),
              }].map((a, idx) => (
                <button key={idx} onClick={a.onClick} style={{ animationDelay: `${0.08 + idx * 0.06}s` }} className="sd-luxe-card sd-action-card sd-luxe-shimmer sd-card-hover sd-animate-pop group relative flex flex-col items-start gap-4 rounded-4xl p-6 text-left">
                  <div className="relative rounded-full bg-white p-3 inline-flex items-center justify-center">
                    <a.icon className="h-6 w-6 text-indigo-600" />
                    {a.badge ? (
                      <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white animate-pulse">{a.badge}</span>
                    ) : null}
                  </div>
                  <div>
                    <div className="sd-card-title">{a.title}</div>
                    <div className="sd-body mt-2">{a.desc}</div>
                  </div>
                </button>
              ))}
            </div>
              </section>

              <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-4 rounded-4xl p-6 sm:p-7 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="sd-title sd-title-sm">{t("pendingApproval")}</h2>
                <span className="sd-luxe-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-indigo-800 bg-indigo-50 border border-indigo-200">{t("after530")}</span>
              </div>
              <div className="mt-6 space-y-3">
                {pending.map((req, i) => (
                  <div key={req.id} className="sd-luxe-card sd-luxe-rise sd-luxe-tilt flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5" style={{ animationDelay: `${0.12 + i * 0.06}s` }}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-linear-to-br from-indigo-400 to-cyan-400 flex items-center justify-center text-white font-bold">{req.initials}</div>
                      <div>
                        <p className="sd-card-title text-slate-900 text-base">{req.name}</p>
                        <p className="sd-micro mt-0.5">{req.branch} • <span className="font-mono">{req.roll}</span></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right mr-2">
                        <p className="text-xs text-slate-500">{tc("out")}</p>
                        <p className="font-semibold text-slate-900">{req.out}</p>
                      </div>
                      <div className="flex sm:flex-col gap-2">
                        <button onClick={() => approveRequest(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 text-white font-bold shadow hover:-translate-y-0.5 transition-transform">
                          <Check className="h-4 w-4" /> {tc("approve")}
                        </button>
                        <button onClick={() => rejectRequest(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors">
                          <X className="h-4 w-4" /> {tc("reject")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <AutoApprovedView approved={approved} compact={true} onViewAll={() => setView('approved')} onClear={() => setApproved([])} />
              </section>

              <section className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="sd-luxe-panel sd-luxe-rise rounded-4xl p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="sd-eyebrow">{t("activity")}</p>
                  <h2 className="sd-title sd-title-sm">{t("liveStats")}</h2>
                </div>
                <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-semibold">{tc("autoSync")}</span>
              </div>
              <div className="mt-5 space-y-4">
                <div className="sd-luxe-card sd-luxe-tilt rounded-2xl px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <p className="sd-micro">{t("pendingRequests")}</p>
                    <p className="text-xl font-bold text-slate-900">{pending.length}</p>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="sd-luxe-progress h-full rounded-full bg-linear-to-r from-indigo-500 via-sky-400 to-transparent" style={{ width: '48%' }} />
                  </div>
                </div>
                <div className="sd-luxe-card sd-luxe-tilt rounded-2xl px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <p className="sd-micro">{t("outNow")}</p>
                    <p className="text-xl font-bold text-slate-900">21</p>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="sd-luxe-progress h-full rounded-full bg-linear-to-r from-amber-400 via-orange-300 to-transparent" style={{ width: '62%' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="sd-luxe-panel sd-luxe-rise rounded-4xl p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-eyebrow">{t("complaints")}</p>
                  <h2 className="sd-title sd-title-sm">{t("recentReports")}</h2>
                </div>
                <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-semibold">{t("priority")}</span>
              </div>
              <div className="mt-5 space-y-4">
                {loadingReports ? (
                  <p className="text-sm text-slate-500">{t("loadingComplaints")}</p>
                ) : reportsError ? (
                  <p className="text-sm font-semibold text-rose-600">{reportsError}</p>
                ) : reports.length === 0 ? (
                  <p className="text-sm text-slate-500">{t("noOpenComplaints")}</p>
                ) : (
                  reports.map((comp, i) => (
                  <div key={comp.id} className="sd-luxe-card sd-timeline-item sd-luxe-rise sd-luxe-tilt flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5" style={{ animationDelay: `${0.08 + i * 0.06}s` }}>
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${comp.tone}`}>
                      <comp.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="sd-card-title text-slate-900">{comp.title}</p>
                      <p className="sd-micro">{comp.by} • {comp.time}</p>
                    </div>
                    <div className="shrink-0">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-md ${comp.statusTone}`}>{comp.status}</span>
                    </div>
                  </div>
                  ))
                )}
              </div>
            </div>
              </section>
            </>
          )}

          {view === 'requests' && (
            <RequestsView
              pending={pending}
              approveRequest={approveRequest}
              rejectRequest={rejectRequest}
              loading={loadingRequests}
              error={requestsError}
              onRefresh={loadRequests}
            />
          )}

          {view === 'approved' && (
            <AutoApprovedView approved={approved} compact={false} onBack={() => setView('home')} onClear={() => setApproved([])} pageSize={6} />
          )}

          {view === 'sos' && <SOSAlertsView onCountChange={setSosCount} />}
          {view === 'profile' && <ProfileView user={user} displayName={displayName} />}
          {view === 'complaints' && <ComplaintsView reports={reports} resolveReport={resolveReport} setReports={setReports} />}
          {view === 'leave' && (
            <LeaveApplicationsView
              pending={leavePending}
              approveLeave={approveLeave}
              rejectLeave={rejectLeave}
              loading={loadingLeave}
              error={leaveError}
              onRefresh={loadLeaveApplications}
            />
          )}

          <nav className="sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid grid-cols-6 gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur">
            <button onClick={() => setView('home')} className={`sd-nav-link ${view === 'home' ? 'sd-nav-link--active' : ''}`}><Home className="h-6 w-6" />{tc("home")}</button>
            <button onClick={() => setView('requests')} className={`sd-nav-link ${view === 'requests' ? 'sd-nav-link--active' : ''}`}><ClipboardList className="h-6 w-6" />{t("requests")}</button>
            <button onClick={() => setView('leave')} className={`sd-nav-link ${view === 'leave' ? 'sd-nav-link--active' : ''}`}>
              <span className="relative inline-flex">
                <CalendarDays className="h-6 w-6" />
                {leavePending.length > 0 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{leavePending.length}</span>}
              </span>
              {t("leaveApplications")}
            </button>
            <button onClick={() => setView('sos')} className={`sd-nav-link ${view === 'sos' ? 'sd-nav-link--active' : ''}`}>
              <span className="relative inline-flex">
                <Siren className="h-6 w-6" />
                {sosCount > 0 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{sosCount}</span>}
              </span>
              {t("safetyAlerts")}
            </button>
            <button onClick={() => setView('complaints')} className={`sd-nav-link ${view === 'complaints' ? 'sd-nav-link--active' : ''}`}>
              <span className="relative inline-flex">
                <MessageSquare className="h-6 w-6" />
                {reports.length > 0 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{reports.length}</span>}
              </span>
              {t("complaints")}
            </button>
            <button onClick={() => setView('profile')} className={`sd-nav-link ${view === 'profile' ? 'sd-nav-link--active' : ''}`}><User className="h-6 w-6" />{tc("profile")}</button>
          </nav>
        </div>
      </div>

      {activePanel && (
        <div className="fixed inset-0 z-60 flex">
          <div onClick={closePanel} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <aside className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{activePanel === 'manage' ? t("manageRequests") : activePanel === 'alerts' ? t("safetyAlerts") : t("autoApprovals")}</h3>
              <button onClick={closePanel} className="p-2 rounded-md text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            {activePanel === 'manage' && (
              <div className="space-y-4">
                {pending.length === 0 ? <p className="text-sm text-slate-500">{t("noPendingRequests")}</p> : pending.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                    <div>
                      <p className="font-bold">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.branch} • {r.roll}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approveRequest(r.id)} className="px-3 py-1 rounded bg-indigo-600 text-white">{tc("approve")}</button>
                      <button onClick={() => rejectRequest(r.id)} className="px-3 py-1 rounded border text-rose-600">{tc("reject")}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'alerts' && (
              <div className="space-y-4">
                {reports.length === 0 ? <p className="text-sm text-slate-500">{t("noReports")}</p> : reports.map((rep) => (
                  <div key={rep.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                    <div>
                      <p className="font-bold">{rep.title}</p>
                      <p className="text-xs text-slate-500">{rep.by} • {rep.time}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => resolveReport(rep.id)} className="px-3 py-1 rounded bg-emerald-600 text-white">{tc("resolve")}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'auto' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">{t("autoApprovalRules")}</p>
                <div className="flex items-center gap-3">
                  <button onClick={toggleAutoRule} className="px-4 py-2 rounded bg-indigo-600 text-white">{t("toggleRule")}</button>
                  <button onClick={() => setApproved((a) => [{ id: Date.now(), name: 'Demo Student', outSince: 'Now', initials: 'DS' }, ...a])} className="px-4 py-2 rounded border">{t("addDemoApproved")}</button>
                </div>
                <div className="mt-4">
                  <h4 className="font-bold">{t("recentlyAutoApproved")}</h4>
                  <div className="mt-2 space-y-2">
                    {approved.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-bold text-sm">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.outSince}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-t border-slate-100 px-6 py-3 pb-4 md:hidden">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <button onClick={() => setView('home')} className="flex flex-col items-center gap-1 text-indigo-700"><Home className="h-6 w-6" /><span className="text-[10px] font-bold">{tc("home")}</span></button>
          <button onClick={() => setView('requests')} className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"><ClipboardList className="h-6 w-6" /><span className="text-[10px] font-semibold">{t("requests")}</span></button>
          <button onClick={() => setView('leave')} className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <span className="relative inline-flex">
              <CalendarDays className="h-6 w-6" />
              {leavePending.length > 0 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{leavePending.length}</span>}
            </span>
            <span className="text-[10px] font-semibold">{t("leaveApplications")}</span>
          </button>
          <button onClick={() => setView('sos')} className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <span className="relative inline-flex">
              <Siren className="h-6 w-6" />
              {sosCount > 0 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{sosCount}</span>}
            </span>
            <span className="text-[10px] font-semibold">{t("safetyAlerts")}</span>
          </button>
          <button onClick={() => setView('complaints')} className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <span className="relative inline-flex">
              <MessageSquare className="h-6 w-6" />
              {reports.length > 0 && <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{reports.length}</span>}
            </span>
            <span className="text-[10px] font-semibold">{t("complaints")}</span>
          </button>
          <button onClick={() => setView('profile')} className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"><User className="h-6 w-6" /><span className="text-[10px] font-semibold">{tc("profile")}</span></button>
        </div>
      </nav>
    </main>
  );
}
