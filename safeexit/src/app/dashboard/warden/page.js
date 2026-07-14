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
import useCountUp from "@/app/hooks/useCountUp";

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
  hostelName: l.student?.hostelName || "",
  roomNumber: l.student?.roomNumber || "",
  destination: l.destination || "",
  reason: l.reason || "",
  leaveDate: l.leaveDate,
  returnDate: l.returnDate,
  submittedAt: l.createdAt,
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

// Pointer-tracked 3D tilt for quick-action tiles — module scope so it isn't
// recreated every render; mirrors the tile physics used across the Student and
// Guard dashboards.
const handleTilePointerMove = (e) => {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  el.style.setProperty("--mx", `${px * 100}%`);
  el.style.setProperty("--my", `${py * 100}%`);
  el.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
  el.style.setProperty("--rx", `${(0.5 - py) * 9}deg`);
};

const handleTilePointerLeave = (e) => {
  e.currentTarget.style.setProperty("--rx", "0deg");
  e.currentTarget.style.setProperty("--ry", "0deg");
};

const handleMagneticMove = (e) => {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const dx = e.clientX - (rect.left + rect.width / 2);
  const dy = e.clientY - (rect.top + rect.height / 2);
  el.style.setProperty("--mag-x", `${dx * 0.2}px`);
  el.style.setProperty("--mag-y", `${dy * 0.2}px`);
};

const handleMagneticLeave = (e) => {
  e.currentTarget.style.setProperty("--mag-x", "0px");
  e.currentTarget.style.setProperty("--mag-y", "0px");
};

// Live-stat row with an animated count-up, mirroring the Student dashboard's
// StatCard so Warden's activity numbers get the same tick-in-on-scroll polish.
function WardenStat({ label, value, width, fill, glow }) {
  const [ref, animated] = useCountUp(value);
  return (
    <div ref={ref} className="sd-stat px-4 py-4" style={{ "--stat-glow": glow }}>
      <div className="flex items-center justify-between">
        <p className="sd-micro">{label}</p>
        <p
          className="text-xl font-bold italic tracking-tight text-transparent bg-clip-text"
          style={{ backgroundImage: fill }}
        >
          {Math.round(animated)}
        </p>
      </div>
      <div className="sd-bar mt-3">
        <div className="sd-bar__fill" style={{ width, background: fill, boxShadow: `0 0 12px ${glow}` }} />
      </div>
    </div>
  );
}

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

  // The hostel this warden oversees. When unset, the backend returns no students,
  // so we surface a "not configured" banner rather than a silently empty queue.
  const managedGender = user?.managedGender;
  const hostelLabel = HOSTEL_LABEL[managedGender];

  // Boys' outings are always auto-approved at creation (see backend
  // outingRules.js — male requests carry requiresWarden: false), so a boys'
  // warden never has an outing queue to action. Their only approval workload is
  // leave applications. We therefore drop every outing-approval surface for them
  // and promote pending leave onto the home dashboard instead. A girls' warden
  // keeps both (female "Market" outings require warden approval) — unchanged.
  const isBoysWarden = managedGender === "Male";

  const handleLogout = () => logout(router, { role: "warden" });

  // Gate the dashboard on a valid warden session; the hook redirects to
  // /login/warden when the token is missing or belongs to another role.
  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-28">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel sd-glow-border sd-enter flex items-center justify-between gap-4 rounded-4xl px-5 py-4 shadow-xl">
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
              <section
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
                  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
                }}
                style={{ animationDelay: "0.12s" }}
                className="sd-luxe-panel sd-glow-border sd-spot-host sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl"
              >
            <span className="sd-spotlight" aria-hidden="true" />
            <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-5">
                <div className="sd-luxe-float sd-orb-halo flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-white to-sky-50 text-slate-900 ring-8 ring-white/80 shadow-lg" style={{ "--halo": "rgba(99,102,241,0.45)" }}>
                  <Clock className="h-10 w-10 text-indigo-600" />
                </div>
                <div>
                  <p className="sd-kicker">{t("dailyPulse")}</p>
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2 mt-2">{t("greeting")} <span className="sd-name-live">{firstName}</span>.</h2>
                  <p className="sd-body mt-2 max-w-md">{isBoysWarden ? t("overviewTextBoys") : t("overviewText")}</p>
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

              <section className="sd-luxe-panel sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sd-kicker">{t("quickActions")}</p>
                <h2 className="sd-title sd-title-sm mt-2">{t("respondFaster")}</h2>
              </div>
              <span className="sd-tag">
                <span className="sd-tag-dot" />
                {t("autoRulesOn")}
              </span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              {(() => {
                const manageAction = {
                  title: t("manageRequests"),
                  desc: t("manageRequestsDesc"),
                  icon: Users,
                  badgeBg: "linear-gradient(145deg, #4338ca 0%, #6366f1 100%)",
                  tint: "linear-gradient(160deg, rgba(99,102,241,0.14) 0%, rgba(56,189,248,0.08) 100%)",
                  glow: "rgba(99,102,241,0.45)",
                  border: "rgba(129,140,248,0.5)",
                  onClick: () => openPanel('manage'),
                };
                const safetyAction = {
                  title: t("safetyAlerts"),
                  desc: t("safetyAlertsDesc"),
                  icon: Siren,
                  badgeBg: "linear-gradient(145deg, #9f1239 0%, #f43f5e 100%)",
                  tint: "linear-gradient(160deg, rgba(244,63,94,0.14) 0%, rgba(251,113,133,0.08) 100%)",
                  glow: "rgba(244,63,94,0.45)",
                  border: "rgba(251,113,133,0.5)",
                  badge: sosCount,
                  onClick: () => setView('sos'),
                };
                const leaveAction = {
                  title: t("leaveApplications"),
                  desc: t("leaveApplicationsDesc"),
                  icon: CalendarDays,
                  badgeBg: "linear-gradient(145deg, #6d28d9 0%, #d946ef 100%)",
                  tint: "linear-gradient(160deg, rgba(139,92,246,0.14) 0%, rgba(217,70,239,0.08) 100%)",
                  glow: "rgba(139,92,246,0.45)",
                  border: "rgba(196,132,252,0.5)",
                  badge: leavePending.length,
                  onClick: () => setView('leave'),
                };
                const autoAction = {
                  title: t("autoApprovals"),
                  desc: t("autoApprovalsDesc"),
                  icon: Sparkles,
                  badgeBg: "linear-gradient(145deg, #0369a1 0%, #2dd4bf 100%)",
                  tint: "linear-gradient(160deg, rgba(14,165,233,0.14) 0%, rgba(45,212,191,0.08) 100%)",
                  glow: "rgba(14,165,233,0.45)",
                  border: "rgba(56,189,248,0.5)",
                  onClick: () => openPanel('auto'),
                };
                // Boys' warden: no outing approvals — lead with Leave, drop the
                // outing "Manage Requests" tile. Girls' warden: keep all four.
                return isBoysWarden
                  ? [leaveAction, safetyAction, autoAction]
                  : [manageAction, safetyAction, leaveAction, autoAction];
              })().map((a, idx) => (
                <button
                  key={idx}
                  onClick={a.onClick}
                  onPointerMove={handleTilePointerMove}
                  onPointerLeave={handleTilePointerLeave}
                  style={{
                    animationDelay: `${0.08 + idx * 0.08}s`,
                    "--tint": a.tint,
                    "--glow": a.glow,
                    "--tile-border": a.border,
                  }}
                  className="sd-tile sd-luxe-rise group block h-full text-left"
                >
                  <div className="sd-tile__inner flex min-h-[13rem] flex-col p-5">
                    <span className="sd-tile__glare" aria-hidden="true" />
                    <div className="flex items-start justify-between">
                      <span
                        className="sd-act sd-lift-lg relative shadow-lg"
                        style={{ background: a.badgeBg, boxShadow: `0 14px 26px -12px ${a.glow}` }}
                      >
                        <a.icon className="h-6 w-6" />
                        {a.badge ? (
                          <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white animate-pulse">{a.badge}</span>
                        ) : null}
                      </span>
                    </div>
                    <div className="sd-lift-md mt-auto pt-6">
                      <span className="sd-act-rule mb-3 block" aria-hidden="true" />
                      <span className="sd-card-title block text-[1.05rem] leading-snug">{a.title}</span>
                      <span className="sd-body mt-1.5 block text-[0.88rem] leading-relaxed">{a.desc}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
              </section>

              {isBoysWarden ? (
              <section className="mt-6">
            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-4 rounded-4xl p-6 sm:p-7 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-eyebrow">{t("leaveApplications")}</p>
                  <h2 className="sd-title sd-title-sm">{t("pendingLeaveApprovals")}</h2>
                </div>
                <span className="sd-luxe-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-violet-800 bg-violet-50 border border-violet-200">
                  <CalendarDays className="h-4 w-4" /> {leavePending.length}
                </span>
              </div>
              <p className="sd-micro mt-1 text-slate-500">{t("leaveOnlyNote")}</p>
              <div className="mt-6 space-y-3">
                {loadingLeave ? (
                  <p className="text-sm text-slate-500">{t("loadingLeave")}</p>
                ) : leaveError ? (
                  <p className="text-sm font-semibold text-rose-600">{leaveError}</p>
                ) : leavePending.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-slate-500">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                      <CalendarDays className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="font-semibold text-slate-700">{t("noPendingLeave")}</p>
                    <p className="text-sm text-slate-500">{t("noLeaveYet")}</p>
                  </div>
                ) : (
                  leavePending.map((req, i) => (
                  <div key={req.id} className="sd-luxe-card sd-luxe-rise sd-luxe-tilt flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3.5" style={{ animationDelay: `${0.12 + i * 0.06}s` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-linear-to-br from-violet-500 to-fuchsia-400 flex items-center justify-center text-white font-bold">{req.initials}</div>
                      <div className="min-w-0">
                        <p className="sd-card-title text-slate-900 text-base">{req.name}</p>
                        <p className="sd-micro mt-0.5">{req.room}{req.roll ? <> • <span className="font-mono">{req.roll}</span></> : null}</p>
                        <p className="sd-micro mt-0.5 text-slate-500">{t("destination")} {req.destination}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => approveLeave(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-white font-bold shadow hover:-translate-y-0.5 transition-transform">
                        <Check className="h-4 w-4" /> {tc("approve")}
                      </button>
                      <button onClick={() => setView('leave')} className="flex items-center gap-2 rounded-2xl px-4 py-2 border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-colors">
                        <ArrowRight className="h-4 w-4" /> {t("reviewInLeave")}
                      </button>
                    </div>
                  </div>
                  ))
                )}
              </div>
            </div>
              </section>
              ) : (
              <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="sd-luxe-panel sd-enter rounded-4xl p-6 sm:p-7 shadow-xl" style={{ animationDelay: "0.26s" }}>
              <div className="flex items-center justify-between gap-3">
                <h2 className="sd-title sd-title-sm">{t("pendingApproval")}</h2>
                <span className="sd-tag">{t("after530")}</span>
              </div>
              <div className="mt-6 space-y-3">
                {pending.map((req, i) => (
                  <div key={req.id} className="sd-row sd-luxe-rise flex-wrap" style={{ "--accent": "#6366f1", animationDelay: `${0.12 + i * 0.06}s` }}>
                    <span className="sd-row__accent" aria-hidden="true" />
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
                        <button
                          onClick={() => approveRequest(req.id)}
                          onPointerMove={handleMagneticMove}
                          onPointerLeave={handleMagneticLeave}
                          className="sd-magnetic flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 text-white font-bold shadow"
                        >
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
              )}

              <section className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="sd-luxe-panel sd-enter rounded-4xl p-6 shadow-xl" style={{ animationDelay: "0.3s" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="sd-kicker">{t("activity")}</p>
                  <h2 className="sd-title sd-title-sm mt-2">{t("liveStats")}</h2>
                </div>
                <span className="sd-tag">{tc("autoSync")}</span>
              </div>
              <div className="mt-5 space-y-4">
                <WardenStat
                  label={isBoysWarden ? t("pendingLeave") : t("pendingRequests")}
                  value={isBoysWarden ? leavePending.length : pending.length}
                  width="48%"
                  fill="linear-gradient(90deg, #6366f1, #38bdf8)"
                  glow="rgba(99,102,241,0.45)"
                />
                <WardenStat
                  label={t("outNow")}
                  value={21}
                  width="62%"
                  fill="linear-gradient(90deg, #f59e0b, #fb923c)"
                  glow="rgba(245,158,11,0.45)"
                />
              </div>
            </div>

            <div className="sd-luxe-panel sd-enter rounded-4xl p-6 shadow-xl" style={{ animationDelay: "0.34s" }}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-kicker">{t("complaints")}</p>
                  <h2 className="sd-title sd-title-sm mt-2">{t("recentReports")}</h2>
                </div>
                <span className="sd-tag">{t("priority")}</span>
              </div>
              <div className="mt-5 space-y-3">
                {loadingReports ? (
                  <p className="text-sm text-slate-500">{t("loadingComplaints")}</p>
                ) : reportsError ? (
                  <p className="text-sm font-semibold text-rose-600">{reportsError}</p>
                ) : reports.length === 0 ? (
                  <div className="sd-empty py-10">
                    <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center">
                      <span className="sd-ring" aria-hidden="true" />
                      <span className="sd-ring sd-ring--2" aria-hidden="true" />
                      <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white">
                        <MessageSquare className="h-5 w-5" />
                      </span>
                    </div>
                    <p className="sd-micro">{t("noOpenComplaints")}</p>
                  </div>
                ) : (
                  reports.map((comp, i) => (
                  <div key={comp.id} className="sd-row sd-luxe-rise" style={{ "--accent": "#f97316", animationDelay: `${0.08 + i * 0.06}s` }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${comp.tone}`}>
                        <comp.icon className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="sd-card-title text-slate-900 truncate">{comp.title}</p>
                        <p className="sd-micro">{comp.by} • {comp.time}</p>
                      </div>
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

          <nav className={`sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid ${isBoysWarden ? 'grid-cols-5' : 'grid-cols-6'} gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur`}>
            <button onClick={() => setView('home')} className={`sd-navx ${view === 'home' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><Home className="h-5 w-5" /></span>{tc("home")}</button>
            {!isBoysWarden && (
              <button onClick={() => setView('requests')} className={`sd-navx ${view === 'requests' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><ClipboardList className="h-5 w-5" /></span>{t("requests")}</button>
            )}
            <button onClick={() => setView('leave')} className={`sd-navx ${view === 'leave' ? 'sd-navx--active' : ''}`}>
              <span className="sd-navx__icon relative">
                <CalendarDays className="h-5 w-5" />
                {leavePending.length > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{leavePending.length}</span>}
              </span>
              {t("leaveApplications")}
            </button>
            <button onClick={() => setView('sos')} className={`sd-navx ${view === 'sos' ? 'sd-navx--active' : ''}`}>
              <span className="sd-navx__icon relative">
                <Siren className="h-5 w-5" />
                {sosCount > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{sosCount}</span>}
              </span>
              {t("safetyAlerts")}
            </button>
            <button onClick={() => setView('complaints')} className={`sd-navx ${view === 'complaints' ? 'sd-navx--active' : ''}`}>
              <span className="sd-navx__icon relative">
                <MessageSquare className="h-5 w-5" />
                {reports.length > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{reports.length}</span>}
              </span>
              {t("complaints")}
            </button>
            <button onClick={() => setView('profile')} className={`sd-navx ${view === 'profile' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><User className="h-5 w-5" /></span>{tc("profile")}</button>
          </nav>
        </div>
      </div>

      {activePanel && (
        <div className="fixed inset-0 z-[60] flex">
          <div onClick={closePanel} className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <aside className="sd-luxe-panel sd-glow-border sd-enter relative ml-auto h-full w-full max-w-md overflow-y-auto rounded-l-[2.25rem] p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="sd-title sd-title-sm">{activePanel === 'manage' ? t("manageRequests") : activePanel === 'alerts' ? t("safetyAlerts") : t("autoApprovals")}</h3>
              <button onClick={closePanel} className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 transition-colors"><X className="h-5 w-5" /></button>
            </div>

            {activePanel === 'manage' && (
              <div className="space-y-3">
                {pending.length === 0 ? <p className="sd-micro">{t("noPendingRequests")}</p> : pending.map((r, i) => (
                  <div key={r.id} className="sd-row sd-luxe-rise" style={{ "--accent": "#6366f1", animationDelay: `${0.05 + i * 0.05}s` }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div>
                      <p className="sd-card-title text-[0.9rem]">{r.name}</p>
                      <p className="sd-micro">{r.branch} • {r.roll}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approveRequest(r.id)} className="rounded-xl px-3 py-1.5 text-sm font-bold text-white bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500">{tc("approve")}</button>
                      <button onClick={() => rejectRequest(r.id)} className="rounded-xl border border-rose-300 px-3 py-1.5 text-sm font-bold text-rose-600 hover:bg-rose-50 transition-colors">{tc("reject")}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'alerts' && (
              <div className="space-y-3">
                {reports.length === 0 ? <p className="sd-micro">{t("noReports")}</p> : reports.map((rep, i) => (
                  <div key={rep.id} className="sd-row sd-luxe-rise" style={{ "--accent": "#f97316", animationDelay: `${0.05 + i * 0.05}s` }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div>
                      <p className="sd-card-title text-[0.9rem]">{rep.title}</p>
                      <p className="sd-micro">{rep.by} • {rep.time}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => resolveReport(rep.id)} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-emerald-700 transition-colors">{tc("resolve")}</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'auto' && (
              <div className="space-y-4">
                <p className="sd-body text-sm">{t("autoApprovalRules")}</p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={toggleAutoRule}
                    onPointerMove={handleMagneticMove}
                    onPointerLeave={handleMagneticLeave}
                    className="sd-magnetic rounded-2xl px-4 py-2 text-sm font-bold text-white bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500"
                  >
                    {t("toggleRule")}
                  </button>
                  <button onClick={() => setApproved((a) => [{ id: Date.now(), name: 'Demo Student', outSince: 'Now', initials: 'DS' }, ...a])} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">{t("addDemoApproved")}</button>
                </div>
                <div className="mt-4">
                  <h4 className="sd-card-title text-[0.9rem]">{t("recentlyAutoApproved")}</h4>
                  <div className="mt-3 space-y-2">
                    {approved.map((s, i) => (
                      <div key={s.id} className="sd-row sd-luxe-rise" style={{ "--accent": "#10b981", animationDelay: `${0.05 + i * 0.05}s` }}>
                        <span className="sd-row__accent" aria-hidden="true" />
                        <div>
                          <p className="sd-card-title text-[0.85rem]">{s.name}</p>
                          <p className="sd-micro">{s.outSince}</p>
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

      <nav className={`sd-luxe-panel sd-glow-border fixed inset-x-2 bottom-3 z-50 grid ${isBoysWarden ? 'grid-cols-5' : 'grid-cols-6'} gap-0.5 rounded-[1.75rem] p-1.5 md:hidden`}>
        <button onClick={() => setView('home')} className={`sd-navx ${view === 'home' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><Home className="h-5 w-5" /></span><span className="text-[9px]">{tc("home")}</span></button>
        {!isBoysWarden && (
          <button onClick={() => setView('requests')} className={`sd-navx ${view === 'requests' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><ClipboardList className="h-5 w-5" /></span><span className="text-[9px]">{t("requests")}</span></button>
        )}
        <button onClick={() => setView('leave')} className={`sd-navx ${view === 'leave' ? 'sd-navx--active' : ''}`}>
          <span className="sd-navx__icon relative">
            <CalendarDays className="h-5 w-5" />
            {leavePending.length > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{leavePending.length}</span>}
          </span>
          <span className="text-[9px]">{t("leaveApplications")}</span>
        </button>
        <button onClick={() => setView('sos')} className={`sd-navx ${view === 'sos' ? 'sd-navx--active' : ''}`}>
          <span className="sd-navx__icon relative">
            <Siren className="h-5 w-5" />
            {sosCount > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{sosCount}</span>}
          </span>
          <span className="text-[9px]">{t("safetyAlerts")}</span>
        </button>
        <button onClick={() => setView('complaints')} className={`sd-navx ${view === 'complaints' ? 'sd-navx--active' : ''}`}>
          <span className="sd-navx__icon relative">
            <MessageSquare className="h-5 w-5" />
            {reports.length > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{reports.length}</span>}
          </span>
          <span className="text-[9px]">{t("complaints")}</span>
        </button>
        <button onClick={() => setView('profile')} className={`sd-navx ${view === 'profile' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><User className="h-5 w-5" /></span><span className="text-[9px]">{tc("profile")}</span></button>
      </nav>
    </main>
  );
}
