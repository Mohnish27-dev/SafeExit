"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  Check,
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
  Wifi,
  Armchair,
} from "lucide-react";
import ProfileView from "./components/ProfileView";
import MovementLogsView from "./components/MovementLogsView";
import ComplaintsView from "./components/ComplaintsView";
import AutoApprovedView from "./components/AutoApprovedView";
import RequestsView from "./components/RequestsView";
import SOSAlertsView from "./components/SOSAlertsView";
import LeaveApplicationsView from "./components/LeaveApplicationsView";
import SignaturePad from "@/app/components/SignaturePad";
import { apiFetch, getApiBase } from "@/app/lib/api";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import useCountUp from "@/app/hooks/useCountUp";
import {
  isPushSupported,
  getNotificationPermission,
  subscribePush,
  autoSubscribeIfGranted,
} from "@/app/lib/pushManager";

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

// managedGender maps to the hostel the warden oversees.
const HOSTEL_LABEL = { Male: "Boys' Hostel", Female: "Girls' Hostel" };

const mapPending = (o) => ({
  id: o._id,
  name: o.student?.name || "Unknown Student",
  branch: [o.student?.year, o.student?.department].filter(Boolean).join(", ") || "—",
  roll: o.student?.studentId || "",
  destination: o.destination || "",
  outingType: o.outingType || "",
  out: formatTime(o.outTime),
  return: formatTime(o.inTime),
  studentSignature: o.studentSignature || null,
  initials: initials(o.student?.name),
});

const complaintTone = (category) => {
  switch (category) {
    case "Electrical":
      return { tone: "bg-amber-100 text-amber-500", icon: AlertTriangle };
    case "Plumbing":
      return { tone: "bg-sky-100 text-sky-500", icon: AlertCircle };
    case "Cleaning":
      return { tone: "bg-emerald-100 text-emerald-500", icon: Sparkles };
    case "Wifi":
      return { tone: "bg-indigo-100 text-indigo-500", icon: Wifi };
    case "Furniture":
      return { tone: "bg-orange-100 text-orange-500", icon: Armchair };
    default:
      return { tone: "bg-slate-100 text-slate-500", icon: AlertCircle };
  }
};

const statusToneFor = (status) =>
  status === "Resolved"
    ? "bg-emerald-100 text-emerald-600"
    : status === "In Progress"
    ? "bg-amber-100 text-amber-600"
    : "bg-rose-100 text-rose-600";

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
  studentSignature: l.studentSignature || null,
  wardenSignature: l.wardenSignature || null,
  initials: initials(l.student?.name),
});

const mapLeaveHistory = (l) => ({
  ...mapLeavePending(l),
  status: l.status || "",
  remarks: l.remarks || "",
  decidedAt: l.updatedAt,
});

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

// Module scope so these aren't recreated every render.
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

  // Refresh from server so managedHostel/managedGender are current even for older sessions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await apiFetch("/auth/profile");
        if (!cancelled) setUser((u) => ({ ...(u || {}), ...profile }));
      } catch {
        /* best-effort */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formattedDate = now ? now.toLocaleDateString(dateLocale, { weekday: "short", day: "2-digit", month: "short" }) : tc("loading");
  const formattedTime = now ? now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : tc("loading");

  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [reports, setReports] = useState([]);
  const [resolvedReports, setResolvedReports] = useState([]);

  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [reportsError, setReportsError] = useState("");

  const [leavePending, setLeavePending] = useState([]);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [leaveError, setLeaveError] = useState("");

  const [leaveHistory, setLeaveHistory] = useState([]);
  const [loadingLeaveHistory, setLoadingLeaveHistory] = useState(true);

  // Kept live independently of the SOS view so the badge shows on every tab.
  const [sosCount, setSosCount] = useState(0);

  const loadSosCount = useCallback(async () => {
    try {
      const data = await apiFetch("/sos?status=Active");
      setSosCount(data.length);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    loadSosCount();
    const interval = setInterval(loadSosCount, 30000);
    return () => clearInterval(interval);
  }, [loadSosCount]);

  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/sos/stream`, { withCredentials: true });
    source.addEventListener("sos:created", () => loadSosCount());
    source.addEventListener("sos:updated", () => loadSosCount());
    return () => source.close();
  }, [loadSosCount]);

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

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setReportsError("");
    try {
      const data = await apiFetch("/complaint");
      const open = data.filter((c) => c.status !== "Resolved");
      setReports(open.map(mapReport));
      setResolvedReports(data.filter((c) => c.status === "Resolved").map(mapReport));
    } catch (err) {
      setReportsError(err.message || t("couldNotLoadComplaints"));
    } finally {
      setLoadingReports(false);
    }
  }, [t]);

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

  const loadLeaveHistory = useCallback(async () => {
    setLoadingLeaveHistory(true);
    try {
      const data = await apiFetch("/leave/history");
      setLeaveHistory(data.map(mapLeaveHistory));
    } catch {
      // Best-effort; the history tab just shows its empty state.
    } finally {
      setLoadingLeaveHistory(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    loadReports();
    loadLeaveApplications();
    loadLeaveHistory();
  }, [loadRequests, loadReports, loadLeaveApplications, loadLeaveHistory]);

  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/outing/stream`, { withCredentials: true });
    source.addEventListener("outing:changed", () => {
      loadRequests();
    });
    return () => source.close();
  }, [loadRequests]);

  // Poll as safety net in case the SSE connection is silently dropped.
  useEffect(() => {
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, [loadRequests]);

  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/complaint/stream`, { withCredentials: true });
    source.addEventListener("complaint:created", () => loadReports());
    source.addEventListener("complaint:updated", () => loadReports());
    return () => source.close();
  }, [loadReports]);

  useEffect(() => {
    const interval = setInterval(loadReports, 30000);
    return () => clearInterval(interval);
  }, [loadReports]);

  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/leave/stream`, { withCredentials: true });
    source.addEventListener("leave:changed", () => {
      loadLeaveApplications();
      loadLeaveHistory();
    });
    return () => source.close();
  }, [loadLeaveApplications, loadLeaveHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadLeaveApplications();
      loadLeaveHistory();
    }, 30000);
    return () => clearInterval(interval);
  }, [loadLeaveApplications, loadLeaveHistory]);

  function openPanel(key) {
    setActivePanel(key);
  }

  const [activePanel, setActivePanel] = useState(null);
  const [view, setView] = useState("home");

  // Push-notification deep link (?view=sos etc.); param consumed once and stripped.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("view");
    if (target && ["sos", "complaints", "leave", "requests", "approved", "profile"].includes(target)) {
      setView(target);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function closePanel() {
    setActivePanel(null);
  }

  // Approving mints a signed pass, so it routes through a modal that captures the
  // warden's drawn signature. { kind: 'outing' | 'leave', id, name } while open.
  const [approvalTarget, setApprovalTarget] = useState(null);
  const [approvalSignature, setApprovalSignature] = useState(null);
  const [approving, setApproving] = useState(false);

  const openOutingApproval = (id) => {
    const req = pending.find((p) => p.id === id);
    setApprovalSignature(null);
    setApprovalTarget({ kind: "outing", id, name: req?.name || "", studentSignature: req?.studentSignature || null });
  };

  const openLeaveApproval = (id) => {
    const req = leavePending.find((l) => l.id === id);
    setApprovalSignature(null);
    setApprovalTarget({ kind: "leave", id, name: req?.name || "", studentSignature: req?.studentSignature || null });
  };

  const closeApproval = () => {
    setApprovalTarget(null);
    setApprovalSignature(null);
  };

  async function confirmApproval() {
    if (!approvalTarget || !approvalSignature) return;
    setApproving(true);
    const { kind, id } = approvalTarget;
    try {
      if (kind === "outing") {
        await approveRequest(id, approvalSignature);
      } else {
        await approveLeave(id, approvalSignature);
      }
      closeApproval();
    } finally {
      setApproving(false);
    }
  }

  async function approveRequest(id, signature) {
    const req = pending.find((p) => p.id === id);
    if (!req) return;
    // Optimistic update; persist to backend after.
    setPending((p) => p.filter((r) => r.id !== id));
    setApproved((a) => [{ id: req.id, name: req.name, outSince: req.out, initials: req.initials }, ...a]);
    try {
      await apiFetch(`/outing/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved", wardenSignature: signature }),
      });
    } catch (err) {
      // 409 = request expired: don't roll back, just drop the card.
      if (err?.status === 409) {
        setApproved((a) => a.filter((r) => r.id !== id));
        setRequestsError(t("requestExpired"));
        return;
      }
      setApproved((a) => a.filter((r) =>r.id !== id));
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

  async function approveLeave(id, signature) {
    const req = leavePending.find((l) => l.id === id);
    if (!req) return;
    setLeavePending((l) => l.filter((r) => r.id !== id));
    try {
      await apiFetch(`/leave/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved", wardenSignature: signature }),
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
    const resolved = { ...rep, status: "Resolved", statusTone: statusToneFor("Resolved") };
    setReports((r) => r.filter((item) => item.id !== id));
    setResolvedReports((r) => [resolved, ...r]);
    try {
      await apiFetch(`/complaint/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Resolved" }),
      });
    } catch (err) {
      setResolvedReports((r) => r.filter((item) => item.id !== id));
      setReports((r) => [rep, ...r]);
      setReportsError(err.message || t("couldNotResolve"));
    }
  }

  function toggleAutoRule() {
    // demo placeholder
    alert('Toggled auto-approval rule (demo)');
  }

  const displayName = (user && (user.name || user.displayName)) || t("chiefWarden");

  // Unset scope means no students; show the "not configured" banner.
  const managedGender = user?.managedGender;
  const managedHostel = user?.managedHostel;
  // Prefer the specific hostel name; fall back to the generic label for legacy wardens.
  const hostelLabel = managedHostel || HOSTEL_LABEL[managedGender];
  const isConfigured = Boolean(managedHostel || managedGender);

  // Boys' outings are auto-approved, so a boys' warden only approves leave.
  const isBoysWarden = managedGender === "Male";

  const handleLogout = () => logout(router, { role: "warden" });

  // Push notification banner state; null until permission API is checked.
  const [pushPermission, setPushPermission] = useState(null);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setPushPermission('unsupported');
      return;
    }
    const perm = getNotificationPermission();
    setPushPermission(perm);

    // Re-subscribe silently in case the subscription expired.
    if (perm === 'granted') {
      autoSubscribeIfGranted();
    }
  }, []);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    const result = await subscribePush();
    setPushEnabling(false);
    if (result.success) {
      setPushPermission('granted');
    } else {
      setPushPermission(getNotificationPermission());
    }
  };

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-28">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel sd-glow-border sd-enter flex items-center justify-between gap-3 rounded-4xl px-4 py-3.5 shadow-xl sm:gap-4 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="sd-luxe-badge sd-luxe-float flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg sm:h-14 sm:w-14">
                <ShieldAlert className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div className="min-w-0">
                <p className="sd-eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-indigo-400" /> {t("hub")}</p>
                <h1 className="sd-title sd-reveal sd-stagger-1 truncate"><span className="sd-gradient-text text-gradient-primary">{t("dashboardTitle")}</span></h1>
                <p className="sd-subtitle hidden sm:block">{t("dashboardSubtitle")}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <LanguageSwitcher />
              <div className="sd-luxe-card sd-profile-chip sd-luxe-tilt hidden items-center gap-3 rounded-2xl px-4 py-3 min-w-55 lg:flex">
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
              {/* Compact avatar on small screens */}
              <button
                type="button"
                onClick={() => setView('profile')}
                className="sd-profile-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-cyan-400 text-sm font-bold text-white lg:hidden"
                title={tc("profile")}
              >
                {(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || 'WP'}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title={tc("logout")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition hover:bg-rose-50 sm:h-12 sm:w-12"
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">{tc("logout")}</span>
              </button>
            </div>
          </header>

          {user && !isConfigured && (
            <div className="mt-6 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 shadow-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-bold">Your hostel isn&apos;t configured yet</p>
                <p className="text-sm">Until an admin assigns you to a hostel, you won&apos;t see any student requests, leave applications, complaints, or alerts. Please contact the admin.</p>
              </div>
            </div>
          )}

          {/* Push notification permission banner */}
          {pushPermission === 'default' && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-indigo-200 bg-indigo-50/80 px-5 py-4 text-indigo-800 shadow-sm backdrop-blur-sm sd-enter" style={{ animationDelay: '0.15s' }}>
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500 animate-bounce" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Enable push notifications</p>
                <p className="text-sm text-indigo-700">Get instant alerts when students submit outing requests, leave applications, or emergencies — even when this app is closed.</p>
              </div>
              <button
                onClick={handleEnablePush}
                disabled={pushEnabling}
                className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
              >
                {pushEnabling ? 'Enabling…' : 'Enable'}
              </button>
              <button
                onClick={() => setPushBannerDismissed(true)}
                className="shrink-0 rounded-xl p-2 text-indigo-400 transition hover:bg-indigo-100"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {pushPermission === 'denied' && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50/80 px-5 py-4 text-rose-800 shadow-sm backdrop-blur-sm sd-enter" style={{ animationDelay: '0.15s' }}>
              <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Notifications blocked</p>
                <p className="text-sm text-rose-700">You won&apos;t receive alerts for new student requests. To enable them, open your browser settings and allow notifications for this site.</p>
              </div>
              <button
                onClick={() => setPushBannerDismissed(true)}
                className="shrink-0 rounded-xl p-2 text-rose-400 transition hover:bg-rose-100"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {view === 'home' && (
            <>
              {/* Needs-attention strip; rendered only when something needs action */}
              {(() => {
                const attention = [
                  sosCount > 0 && {
                    key: 'sos',
                    label: t("safetyAlerts"),
                    count: sosCount,
                    icon: Siren,
                    className: 'wd-attn--sos',
                    onClick: () => setView('sos'),
                  },
                  !isBoysWarden && pending.length > 0 && {
                    key: 'requests',
                    label: t("requests"),
                    count: pending.length,
                    icon: ClipboardList,
                    className: 'wd-attn--requests',
                    onClick: () => setView('requests'),
                  },
                  leavePending.length > 0 && {
                    key: 'leave',
                    label: t("leaveApplications"),
                    count: leavePending.length,
                    icon: CalendarDays,
                    className: 'wd-attn--leave',
                    onClick: () => setView('leave'),
                  },
                  reports.length > 0 && {
                    key: 'complaints',
                    label: t("complaints"),
                    count: reports.length,
                    icon: MessageSquare,
                    className: 'wd-attn--complaints',
                    onClick: () => setView('complaints'),
                  },
                ].filter(Boolean);

                if (attention.length === 0) return null;

                return (
                  <section className="sd-enter mt-4" style={{ animationDelay: '0.08s' }}>
                    <div className="flex items-center gap-2 px-1">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                      </span>
                      <p className="sd-eyebrow">{t("needsAttention")}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
                      {attention.map((a) => (
                        <button
                          key={a.key}
                          onClick={a.onClick}
                          className={`wd-attn ${a.className} flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left shadow-md transition hover:-translate-y-0.5 active:scale-95 sm:gap-3 sm:px-4 sm:py-3`}
                        >
                          <span className="wd-attn__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white sm:h-10 sm:w-10">
                            <a.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold sm:text-sm">{a.label}</span>
                            <span className="wd-attn__count block text-[11px] font-semibold sm:text-xs">{a.count} {t("pendingShort")}</span>
                          </span>
                          <ArrowRight className="hidden h-4 w-4 shrink-0 opacity-60 sm:block" />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })()}

              <section
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
                  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
                }}
                style={{ animationDelay: "0.12s" }}
                className="sd-luxe-panel sd-glow-border sd-spot-host sd-enter mt-6 rounded-4xl p-5 sm:p-7 shadow-xl"
              >
            <span className="sd-spotlight" aria-hidden="true" />
            <div className="grid items-center gap-4 sm:gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                <div className="sd-luxe-float sd-orb-halo hidden h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-white to-sky-50 text-slate-900 ring-8 ring-white/80 shadow-lg sm:flex" style={{ "--halo": "rgba(99,102,241,0.45)" }}>
                  <Clock className="h-10 w-10 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="sd-kicker">{t("dailyPulse")}</p>
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2 mt-1 sm:mt-2">{t("greeting")} <span className="sd-name-live">Warden</span>.</h2>
                  {/* Desktop-only overview text */}
                  <p className="sd-body mt-2 hidden max-w-md sm:block">{isBoysWarden ? t("overviewTextBoys") : t("overviewText")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-1">
                <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-2 rounded-full px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
                  <CalendarDays className="h-4 w-4 text-indigo-500 sm:h-5 sm:w-5" />
                  {formattedDate}
                </span>
                <span suppressHydrationWarning className="sd-luxe-pill sd-live-pulse inline-flex flex-1 items-center gap-2 rounded-full px-3 py-2 sm:flex-none sm:gap-3 sm:px-4 sm:py-2.5">
                  <Clock className="h-4 w-4 text-sky-500 sm:h-5 sm:w-5" />
                  {formattedTime}
                  <span className="sd-luxe-chip ml-auto rounded-full px-3 py-1 text-xs font-bold">{tc("live")}</span>
                </span>
              </div>
            </div>
              </section>

              <section className="sd-luxe-panel sd-enter mt-6 rounded-4xl p-5 sm:p-7 shadow-xl" style={{ animationDelay: "0.2s" }}>
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
            <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 lg:grid-cols-4">
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
                const logsAction = {
                  title: t("movementLogs"),
                  desc: t("movementLogsDesc"),
                  icon: ScrollText,
                  badgeBg: "linear-gradient(145deg, #4338ca 0%, #38bdf8 100%)",
                  tint: "linear-gradient(160deg, rgba(67,56,202,0.14) 0%, rgba(56,189,248,0.08) 100%)",
                  glow: "rgba(67,56,202,0.45)",
                  border: "rgba(129,140,248,0.5)",
                  onClick: () => setView('logs'),
                };
                // Boys' warden has no outing approvals: lead with Leave.
                return isBoysWarden
                  ? [leaveAction, safetyAction, logsAction, autoAction]
                  : [manageAction, safetyAction, leaveAction, logsAction, autoAction];
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
                  <div className="sd-tile__inner flex min-h-38 flex-col p-4 sm:min-h-52 sm:p-5">
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
                    <div className="sd-lift-md mt-auto pt-4 sm:pt-6">
                      <span className="sd-act-rule mb-2 block sm:mb-3" aria-hidden="true" />
                      <span className="sd-card-title block text-[0.95rem] leading-snug sm:text-[1.05rem]">{a.title}</span>
                      <span className="sd-body mt-1 hidden text-[0.88rem] leading-relaxed sm:mt-1.5 sm:block">{a.desc}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
              </section>

              {isBoysWarden ? (
              <section className="mt-6">
            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-4 rounded-4xl p-5 sm:p-7 shadow-xl">
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
                      <button onClick={() => openLeaveApproval(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-white font-bold shadow hover:-translate-y-0.5 transition-transform">
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
                          onClick={() => openOutingApproval(req.id)}
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
            <div className="sd-luxe-panel sd-enter rounded-4xl p-5 sm:p-6 shadow-xl" style={{ animationDelay: "0.3s" }}>
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

            <div className="sd-luxe-panel sd-enter rounded-4xl p-5 sm:p-6 shadow-xl" style={{ animationDelay: "0.34s" }}>
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
                  // Row taps through to Complaints view; pill is display-only.
                  <button
                    key={comp.id}
                    onClick={() => setView('complaints')}
                    className="sd-row sd-luxe-rise w-full text-left cursor-pointer"
                    style={{ "--accent": "#f97316", animationDelay: `${0.08 + i * 0.06}s` }}
                  >
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
                    <div className="flex shrink-0 items-center gap-2">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-md ${comp.statusTone}`}>{comp.status}</span>
                      <ArrowRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </button>
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
              approveRequest={openOutingApproval}
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
          {view === 'profile' && <ProfileView user={user} displayName={displayName} onLogout={handleLogout} />}
          {view === 'complaints' && (
            <ComplaintsView
              reports={reports}
              resolvedReports={resolvedReports}
              resolveReport={resolveReport}
              loading={loadingReports}
              error={reportsError}
              onRefresh={loadReports}
            />
          )}
          {view === 'leave' && (
            <LeaveApplicationsView
              pending={leavePending}
              history={leaveHistory}
              approveLeave={openLeaveApproval}
              rejectLeave={rejectLeave}
              loading={loadingLeave}
              loadingHistory={loadingLeaveHistory}
              error={leaveError}
              onRefresh={() => { loadLeaveApplications(); loadLeaveHistory(); }}
            />
          )}

          {view === 'logs' && <MovementLogsView />}

          <nav className={`sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid ${isBoysWarden ? 'grid-cols-6' : 'grid-cols-7'} gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur`}>
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
            <button onClick={() => setView('logs')} className={`sd-navx ${view === 'logs' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><ScrollText className="h-5 w-5" /></span>{t("movementLogs")}</button>
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
                      <button onClick={() => openOutingApproval(r.id)} className="rounded-xl px-3 py-1.5 text-sm font-bold text-white bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500">{tc("approve")}</button>
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

      {approvalTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="sd-enter relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="sd-kicker">{approvalTarget.kind === "leave" ? t("leaveApplications") : t("outingRequests")}</p>
                <h3 className="sd-title sd-title-sm mt-0.5">{tc("approve")}{approvalTarget.name ? ` — ${approvalTarget.name}` : ""}</h3>
              </div>
              <button
                onClick={closeApproval}
                disabled={approving}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-4 text-sm text-slate-600">
              Sign below to approve this {approvalTarget.kind === "leave" ? "leave application" : "outing request"}. Your signature will be attached to the student&apos;s pass.
            </p>

            {approvalTarget.studentSignature && (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Student signature</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={approvalTarget.studentSignature}
                  alt="Student signature"
                  className="mt-1.5 h-14 w-auto rounded-lg border border-slate-200 bg-white p-1"
                />
              </div>
            )}

            <div className="mt-4">
              <SignaturePad
                label="Warden signature"
                hint="Sign here to approve"
                onChange={setApprovalSignature}
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={closeApproval}
                disabled={approving}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={confirmApproval}
                disabled={approving || !approvalSignature}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="h-4 w-4" />
                {approving ? tc("loading") : !approvalSignature ? "Sign to Approve" : tc("approve")}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className={`sd-luxe-panel sd-glow-border fixed inset-x-2 bottom-3 z-50 grid ${isBoysWarden ? 'grid-cols-6' : 'grid-cols-7'} gap-0.5 rounded-[1.75rem] p-1.5 md:hidden`}>
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
        <button onClick={() => setView('logs')} className={`sd-navx ${view === 'logs' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><ScrollText className="h-5 w-5" /></span><span className="text-[9px]">Logs</span></button>
        <button onClick={() => setView('profile')} className={`sd-navx ${view === 'profile' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><User className="h-5 w-5" /></span><span className="text-[9px]">{tc("profile")}</span></button>
      </nav>
    </main>
  );
}
