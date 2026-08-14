"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Home,
  ClipboardList,
  CalendarDays,
  Siren,
  MessageSquare,
  User,
  LogOut,
  ShieldAlert,
  Sparkles,
  Clock,
  ArrowRight,
  Check,
  X,
  AlertTriangle,
  Bell,
  BellOff,
  Building2,
  Mail,
  Phone,
  ShieldCheck,
  ScrollText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { subscribeToStaffEvents } from "@/app/lib/staffEvents";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SignatureCapture from "@/app/components/SignatureCapture";
import SignatureCard from "@/app/components/SignatureCard";
import { isSignatureRequiredError } from "@/app/lib/signatureImage";
import {
  isPushSupported,
  getNotificationPermission,
  subscribePush,
  autoSubscribeIfGranted,
} from "@/app/lib/pushManager";
import ForwardedRequestsView from "./components/ForwardedRequestsView";
import ForwardedLeaveView from "./components/ForwardedLeaveView";
import SOSAlertsView from "../caretaker/components/SOSAlertsView";
import ComplaintsView from "../caretaker/components/ComplaintsView";
// Wardens get the same read-only movement log as caretakers; /scan already scopes by managedHostel.
import MovementLogsView from "../caretaker/components/MovementLogsView";
import OverdueStudentsView from "../caretaker/components/OverdueStudentsView";
import DelayNoticesView from "../caretaker/components/DelayNoticesView";
import DelayNoticeToast from "../caretaker/components/DelayNoticeToast";

const initials = (name = "") =>
  name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

const formatTime = (value) =>
  value ? new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "—";

const room = (s) => [s?.hostelName, s?.roomNumber].filter(Boolean).join(", ") || "—";

const mapForwardedOuting = (o) => ({
  id: o._id,
  name: o.student?.name || "Unknown Student",
  roll: o.student?.studentId || "",
  room: room(o.student),
  destination: o.destination || "",
  outingType: o.outingType || "",
  out: formatTime(o.outTime),
  return: formatTime(o.inTime),
  forwardedBy: o.forwardedBy?.name || "",
  forwardedNote: o.forwardedNote || "",
  initials: initials(o.student?.name),
});

const mapForwardedLeave = (l) => ({
  id: l._id,
  name: l.student?.name || "Unknown Student",
  roll: l.student?.studentId || "",
  room: room(l.student),
  // Split out too: the full-application letter addresses the hostel and room separately.
  hostelName: l.student?.hostelName || "",
  roomNumber: l.student?.roomNumber || "",
  destination: l.destination || "",
  reason: l.reason || "",
  leaveDate: l.leaveDate,
  returnDate: l.returnDate,
  submittedAt: l.createdAt,
  studentSignature: l.studentSignature || null,
  forwardedBy: l.forwardedBy?.name || "",
  forwardedNote: l.forwardedNote || "",
  initials: initials(l.student?.name),
});

// History rows render off `decision` — the frozen verdict — not `status`. `status` keeps
// moving after the call is made (Out, Returned, Cancelled, Expired); the verdict doesn't,
// so a pass the student later cancelled still shows as the Approved it was.
const mapOutingHistory = (o) => ({
  id: o._id,
  name: o.student?.name || "Unknown Student",
  destination: o.destination || "",
  out: formatTime(o.outTime),
  return: formatTime(o.inTime),
  decision: o.decision || "",
  // Set when the pass never played out as decided — "Cancelled" or "Expired".
  lapsed: o.lapsed || "",
  decidedByName: o.approvedBy?.name || "",
  decidedByRole: o.decidedByRole || o.approvedBy?.role || "",
  remarks: o.remarks || "",
  decidedAt: o.decidedAt || o.updatedAt,
});

const mapLeaveHistory = (l) => ({
  id: l._id,
  name: l.student?.name || "Unknown Student",
  destination: l.destination || "",
  leaveDate: l.leaveDate,
  returnDate: l.returnDate,
  decision: l.decision || "",
  lapsed: l.lapsed || "",
  decidedByName: l.approvedBy?.name || "",
  decidedByRole: l.decidedByRole || l.approvedBy?.role || "",
  remarks: l.remarks || "",
  decidedAt: l.decidedAt || l.updatedAt,
});

const complaintTone = (category) => {
  switch (category) {
    case "Electrical": return "bg-amber-100 text-amber-500";
    case "Plumbing": return "bg-sky-100 text-sky-500";
    case "Cleaning": return "bg-emerald-100 text-emerald-500";
    case "Wifi": return "bg-indigo-100 text-indigo-500";
    case "Furniture": return "bg-orange-100 text-orange-500";
    default: return "bg-slate-100 text-slate-500";
  }
};

const statusToneFor = (status) =>
  status === "Resolved" ? "bg-emerald-100 text-emerald-600"
  : status === "In Progress" ? "bg-amber-100 text-amber-600"
  : "bg-rose-100 text-rose-600";

const mapReport = (c) => ({
  id: c._id,
  title: c.description || c.category,
  by: c.student?.name || "Unknown Student",
  hostelName: c.student?.hostelName || "",
  roomNumber: c.roomNumber || c.student?.roomNumber || "",
  departmentName: c.department?.name || c.category,
  departmentPhone: c.department?.phoneNumber || "",
  time: c.createdAt
    ? new Date(c.createdAt).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—",
  status: c.status || "Open",
  tone: complaintTone(c.category),
  icon: MessageSquare,
  statusTone: statusToneFor(c.status),
});

export default function WardenDashboardPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("warden");

  const [now, setNow] = useState(null);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("home");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && sessionStorage.getItem("safeexit:user");
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  // Refresh from server so managedHostel is current even for older sessions.
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

  // Deep link from push notifications (?view=requests etc.); consumed once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("view");
    if (target && ["requests", "leave", "sos", "overdue", "delays", "complaints", "logs", "profile"].includes(target)) {
      setView(target);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [pending, setPending] = useState([]);
  const [leavePending, setLeavePending] = useState([]);
  const [outingHistory, setOutingHistory] = useState([]);
  const [leaveHistory, setLeaveHistory] = useState([]);
  const [reports, setReports] = useState([]);
  const [resolvedReports, setResolvedReports] = useState([]);
  const [sosCount, setSosCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  // Students who reported they'll be late. Separate from overdueCount because a
  // student can file *before* their deadline passes — they aren't overdue yet.
  const [delayCount, setDelayCount] = useState(0);

  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [leaveError, setLeaveError] = useState("");
  const [reportsError, setReportsError] = useState("");

  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    setRequestsError("");
    try {
      const data = await apiFetch("/outing/forwarded");
      setPending(data.map(mapForwardedOuting));
    } catch (err) {
      setRequestsError(err.message || "Could not load forwarded requests.");
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const loadLeave = useCallback(async () => {
    setLoadingLeave(true);
    setLeaveError("");
    try {
      const data = await apiFetch("/leave/forwarded");
      setLeavePending(data.map(mapForwardedLeave));
    } catch (err) {
      setLeaveError(err.message || "Could not load forwarded applications.");
    } finally {
      setLoadingLeave(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const [o, l] = await Promise.all([
        apiFetch("/outing/warden-history").catch(() => []),
        apiFetch("/leave/warden-history").catch(() => []),
      ]);
      setOutingHistory(o.map(mapOutingHistory));
      setLeaveHistory(l.map(mapLeaveHistory));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setReportsError("");
    try {
      const data = await apiFetch("/complaint");
      setReports(data.filter((c) => c.status !== "Resolved").map(mapReport));
      setResolvedReports(data.filter((c) => c.status === "Resolved").map(mapReport));
    } catch (err) {
      setReportsError(err.message || "Could not load complaints.");
    } finally {
      setLoadingReports(false);
    }
  }, []);

  const loadSosCount = useCallback(async () => {
    try {
      const data = await apiFetch("/sos?status=Active");
      setSosCount(data.length);
    } catch {
      /* best-effort */
    }
  }, []);

  const loadOverdueCount = useCallback(async () => {
    try {
      const data = await apiFetch("/outing/overdue");
      setOverdueCount(data.length);
    } catch {
      /* best-effort */
    }
  }, []);

  const loadDelayCount = useCallback(async () => {
    try {
      const data = await apiFetch("/delay?status=Pending");
      setDelayCount(Array.isArray(data) ? data.length : 0);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    loadRequests();
    loadLeave();
    loadHistory();
    loadReports();
    loadSosCount();
    loadOverdueCount();
    loadDelayCount();
  }, [loadRequests, loadLeave, loadHistory, loadReports, loadSosCount, loadOverdueCount, loadDelayCount]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "delay:created": loadDelayCount,
      "delay:updated": loadDelayCount,
    });
  }, [loadDelayCount]);

  // SSE: refresh the affected queues + history when the backend broadcasts a change.
  useEffect(() => {
    return subscribeToStaffEvents({
      "outing:changed": () => { loadRequests(); loadHistory(); loadOverdueCount(); },
    });
  }, [loadRequests, loadHistory, loadOverdueCount]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "leave:changed": () => { loadLeave(); loadHistory(); },
    });
  }, [loadLeave, loadHistory]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "complaint:created": loadReports,
      "complaint:updated": loadReports,
    });
  }, [loadReports]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "sos:created": loadSosCount,
      "sos:updated": loadSosCount,
    });
  }, [loadSosCount]);

  // Poll as a safety net in case an SSE connection is silently dropped.
  useEffect(() => {
    const id = setInterval(() => { loadRequests(); loadLeave(); loadSosCount(); loadOverdueCount(); }, 30000);
    return () => clearInterval(id);
  }, [loadRequests, loadLeave, loadSosCount, loadOverdueCount]);

  // ---- Approve (signature modal) / Reject (leave needs remarks) ----
  const [approvalTarget, setApprovalTarget] = useState(null); // { kind, id, name }
  const [approving, setApproving] = useState(false);
  // Fallback capture, for a warden with no saved signature or one replacing it here.
  const [savingSignature, setSavingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [changingSignature, setChangingSignature] = useState(false);
  // Hydrated by the /auth/profile refresh this dashboard already runs on mount.
  const mySignature = user?.signature || null;

  const [rejectTarget, setRejectTarget] = useState(null); // { kind, id, name }
  const [rejectRemarks, setRejectRemarks] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const openApproval = (kind, id) => {
    const list = kind === "leave" ? leavePending : pending;
    const req = list.find((r) => r.id === id);
    setApprovalTarget({ kind, id, name: req?.name || "" });
  };
  const closeApproval = () => {
    setApprovalTarget(null);
    setSignatureError("");
    setChangingSignature(false);
  };

  // Persist the warden's signature to their profile so every later approval reuses it.
  const saveMySignature = async (signature) => {
    setSavingSignature(true);
    setSignatureError("");
    try {
      const updated = await apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ signature }),
      });
      setUser((u) => ({ ...(u || {}), signature: updated.signature || signature }));
      setChangingSignature(false);
    } catch (err) {
      setSignatureError(err?.message || "Couldn't save your signature. Please try again.");
    } finally {
      setSavingSignature(false);
    }
  };

  async function confirmApproval() {
    if (!approvalTarget) return;
    setApproving(true);
    setSignatureError("");
    const { kind, id } = approvalTarget;
    const path = kind === "leave" ? `/leave/${id}/warden-status` : `/outing/${id}/warden-status`;
    try {
      // The server stamps our saved profile signature; nothing to send.
      await apiFetch(path, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved" }),
      });
      if (kind === "leave") { setLeavePending((l) => l.filter((r) => r.id !== id)); }
      else { setPending((p) => p.filter((r) => r.id !== id)); }
      loadHistory();
      closeApproval();
    } catch (err) {
      // Keep the modal open so the capture below can fix it in place — closing here would
      // discard the approval the warden already intended to make.
      if (isSignatureRequiredError(err)) {
        setUser((u) => ({ ...(u || {}), signature: undefined }));
        setSignatureError(err?.message || "Add your signature before approving.");
        return;
      }
      if (kind === "leave") setLeaveError(err.message || "Could not approve application.");
      else setRequestsError(err.message || "Could not approve request.");
      closeApproval();
    } finally {
      setApproving(false);
    }
  }

  const openReject = (kind, id) => {
    const list = kind === "leave" ? leavePending : pending;
    const req = list.find((r) => r.id === id);
    setRejectRemarks("");
    setRejectTarget({ kind, id, name: req?.name || "" });
  };
  const closeReject = () => { setRejectTarget(null); setRejectRemarks(""); };

  async function confirmReject() {
    if (!rejectTarget) return;
    const { kind, id } = rejectTarget;
    // Leave rejections require a remark server-side.
    if (kind === "leave" && !rejectRemarks.trim()) return;
    setRejecting(true);
    const path = kind === "leave" ? `/leave/${id}/warden-status` : `/outing/${id}/warden-status`;
    const body = { status: "Rejected" };
    if (rejectRemarks.trim()) body.remarks = rejectRemarks.trim();
    try {
      await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
      if (kind === "leave") { setLeavePending((l) => l.filter((r) => r.id !== id)); }
      else { setPending((p) => p.filter((r) => r.id !== id)); }
      loadHistory();
      closeReject();
    } catch (err) {
      if (kind === "leave") setLeaveError(err.message || "Could not reject application.");
      else setRequestsError(err.message || "Could not reject request.");
      closeReject();
    } finally {
      setRejecting(false);
    }
  }

  // ---- Push notifications ----
  const [pushPermission, setPushPermission] = useState(null);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) { setPushPermission("unsupported"); return; }
    const perm = getNotificationPermission();
    setPushPermission(perm);
    if (perm === "granted") autoSubscribeIfGranted();
  }, []);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    const result = await subscribePush();
    setPushEnabling(false);
    setPushPermission(result.success ? "granted" : getNotificationPermission());
  };

  const displayName = (user && (user.name || user.displayName)) || "Warden";
  const managedHostel = user?.managedHostel;
  const isConfigured = Boolean(managedHostel);
  const handleLogout = () => logout(router, { role: "warden" });

  const formattedDate = now ? now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" }) : "—";
  const formattedTime = now ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  if (!checked || !authorized) return <AuthLoading />;

  const navItems = [
    { key: "home", label: "Home", icon: Home },
    { key: "requests", label: "Outings", icon: ClipboardList, badge: pending.length },
    { key: "leave", label: "Leave", icon: CalendarDays, badge: leavePending.length },
    { key: "sos", label: "Alerts", icon: Siren, badge: sosCount },
    { key: "overdue", label: "Overdue", icon: Clock, badge: overdueCount },
    { key: "delays", label: "Delays", icon: MessageSquare, badge: delayCount },
    { key: "complaints", label: "Complaints", icon: MessageSquare, badge: reports.length },
    { key: "logs", label: "Logs", icon: ScrollText },
    { key: "profile", label: "Profile", icon: User },
  ];

  // Keep six comfortably tappable phone tabs. Profile lives behind the header avatar,
  // movement logs remain available from the full-width home shortcut, and delay
  // notices surface via the "needs your attention" tile whenever any are pending.
  const mobileNavItems = navItems.filter((n) => !["profile", "logs", "delays"].includes(n.key));

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
                <p className="sd-eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Warden Hub</p>
                <h1 className="sd-title sd-reveal sd-stagger-1 truncate"><span className="sd-gradient-text text-gradient-primary">Warden Dashboard</span></h1>
                <p className="sd-subtitle hidden sm:block">Decide escalated requests and oversee your hostel.</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="sd-luxe-card sd-profile-chip hidden items-center gap-3 rounded-2xl px-4 py-3 min-w-55 lg:flex">
                <div className="sd-profile-avatar bg-linear-to-br from-indigo-600 to-cyan-400 text-white flex h-12 w-12 items-center justify-center rounded-xl font-bold">{initials(displayName)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-base truncate">{displayName}</p>
                  {managedHostel ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">{managedHostel}</span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">No hostel assigned</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setView("profile")}
                className="sd-profile-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-cyan-400 text-sm font-bold text-white lg:hidden"
                title="Profile"
              >
                {initials(displayName)}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Logout"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition hover:bg-rose-50 sm:h-12 sm:w-12"
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Logout</span>
              </button>
            </div>
          </header>

          {user && !isConfigured && (
            <div className="mt-6 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 shadow-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-bold">Your hostel isn&apos;t configured yet</p>
                <p className="text-sm">Until an admin assigns you to a hostel, you won&apos;t see any escalated requests, applications, complaints, or alerts. Please contact the admin.</p>
              </div>
            </div>
          )}

          {pushPermission === "default" && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-indigo-200 bg-indigo-50/80 px-5 py-4 text-indigo-800 shadow-sm backdrop-blur-sm sd-enter">
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500 animate-bounce" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Enable push notifications</p>
                <p className="text-sm text-indigo-700">Get alerted the moment a caretaker escalates an outing or leave request to you — even when this app is closed.</p>
              </div>
              <button onClick={handleEnablePush} disabled={pushEnabling} className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95 disabled:opacity-60">
                {pushEnabling ? "Enabling…" : "Enable"}
              </button>
              <button onClick={() => setPushBannerDismissed(true)} className="shrink-0 rounded-xl p-2 text-indigo-400 transition hover:bg-indigo-100" title="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {pushPermission === "denied" && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50/80 px-5 py-4 text-rose-800 shadow-sm backdrop-blur-sm sd-enter">
              <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Notifications blocked</p>
                <p className="text-sm text-rose-700">You won&apos;t receive alerts for escalated requests. Open your browser settings and allow notifications for this site.</p>
              </div>
              <button onClick={() => setPushBannerDismissed(true)} className="shrink-0 rounded-xl p-2 text-rose-400 transition hover:bg-rose-100" title="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {view === "home" && (
            <>
              {(() => {
                const attention = [
                  sosCount > 0 && { key: "sos", label: "Safety Alerts", count: sosCount, icon: Siren, onClick: () => setView("sos") },
                  overdueCount > 0 && { key: "overdue", label: "Overdue Students", count: overdueCount, icon: Clock, onClick: () => setView("overdue") },
                  delayCount > 0 && { key: "delays", label: "Delay Notices", count: delayCount, icon: MessageSquare, onClick: () => setView("delays") },
                  pending.length > 0 && { key: "requests", label: "Forwarded Outings", count: pending.length, icon: ClipboardList, onClick: () => setView("requests") },
                  leavePending.length > 0 && { key: "leave", label: "Forwarded Leave", count: leavePending.length, icon: CalendarDays, onClick: () => setView("leave") },
                  reports.length > 0 && { key: "complaints", label: "Complaints", count: reports.length, icon: MessageSquare, onClick: () => setView("complaints") },
                ].filter(Boolean);
                if (attention.length === 0) return null;
                return (
                  <section className="sd-enter mt-4">
                    <div className="flex items-center gap-2 px-1">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                      </span>
                      <p className="sd-eyebrow">Needs attention</p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
                      {attention.map((a) => (
                        <button key={a.key} onClick={a.onClick} className="wd-attn flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left shadow-md transition hover:-translate-y-0.5 active:scale-95 sm:gap-3 sm:px-4 sm:py-3">
                          <span className="wd-attn__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white sm:h-10 sm:w-10">
                            <a.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold sm:text-sm">{a.label}</span>
                            <span className="block text-[11px] font-semibold text-slate-500 sm:text-xs">{a.count} pending</span>
                          </span>
                          <ArrowRight className="hidden h-4 w-4 shrink-0 opacity-60 sm:block" />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })()}

              <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-5 sm:p-7 shadow-xl">
                <div className="grid items-center gap-4 sm:gap-6 lg:grid-cols-[1.2fr_auto]">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                    <div className="sd-luxe-float hidden h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-white to-sky-50 ring-8 ring-white/80 shadow-lg sm:flex">
                      <Clock className="h-10 w-10 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="sd-kicker">Daily pulse</p>
                      <h2 className="sd-title sd-title-md mt-1 sm:mt-2">Welcome, <span className="sd-name-live">Warden</span>.</h2>
                      <p className="sd-body mt-2 hidden max-w-md sm:block">You decide the outing and leave requests caretakers escalate, and keep an eye on your hostel&apos;s complaints and safety alerts.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-1">
                    <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-2 rounded-full px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
                      <CalendarDays className="h-4 w-4 text-indigo-500 sm:h-5 sm:w-5" /> {formattedDate}
                    </span>
                    <span suppressHydrationWarning className="sd-luxe-pill inline-flex flex-1 items-center gap-2 rounded-full px-3 py-2 sm:flex-none sm:gap-3 sm:px-4 sm:py-2.5">
                      <Clock className="h-4 w-4 text-sky-500 sm:h-5 sm:w-5" /> {formattedTime}
                      <span className="sd-luxe-chip ml-auto rounded-full px-3 py-1 text-xs font-bold">Live</span>
                    </span>
                  </div>
                </div>
              </section>

              <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: "Forwarded Outings", value: pending.length, icon: ClipboardList, onClick: () => setView("requests"), fill: "from-indigo-500 to-cyan-400" },
                  { label: "Forwarded Leave", value: leavePending.length, icon: CalendarDays, onClick: () => setView("leave"), fill: "from-violet-500 to-fuchsia-400" },
                  { label: "Active Alerts", value: sosCount, icon: Siren, onClick: () => setView("sos"), fill: "from-rose-500 to-orange-400" },
                  { label: "Open Complaints", value: reports.length, icon: MessageSquare, onClick: () => setView("complaints"), fill: "from-amber-500 to-orange-400" },
                ].map((s, i) => (
                  <button
                    key={s.label}
                    onClick={s.onClick}
                    className="sd-luxe-panel sd-enter flex items-center gap-4 rounded-3xl p-5 text-left shadow-lg transition hover:-translate-y-0.5"
                    style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${s.fill} text-white shadow`}>
                      <s.icon className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-2xl font-bold text-slate-900">{s.value}</span>
                      <span className="block truncate text-xs font-semibold text-slate-500">{s.label}</span>
                    </span>
                  </button>
                ))}
              </section>

              {/* Direct entry to the movement log — no more digging through "More". */}
              <button
                onClick={() => setView("logs")}
                className="sd-luxe-panel sd-enter mt-4 flex w-full items-center gap-4 rounded-3xl p-5 text-left shadow-lg transition hover:-translate-y-0.5"
                style={{ animationDelay: "0.3s" }}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-teal-500 to-emerald-400 text-white shadow">
                  <ScrollText className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-slate-900">Movement Logs</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">See who&apos;s in and out of your hostel</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />
              </button>
            </>
          )}

          {view === "requests" && (
            <ForwardedRequestsView
              pending={pending}
              history={outingHistory}
              approve={(id) => openApproval("outing", id)}
              reject={(id) => openReject("outing", id)}
              loading={loadingRequests}
              loadingHistory={loadingHistory}
              error={requestsError}
              onRefresh={loadRequests}
              onRefreshHistory={loadHistory}
            />
          )}

          {view === "leave" && (
            <ForwardedLeaveView
              pending={leavePending}
              history={leaveHistory}
              approve={(id) => openApproval("leave", id)}
              reject={(id) => openReject("leave", id)}
              loading={loadingLeave}
              loadingHistory={loadingHistory}
              error={leaveError}
              onRefresh={loadLeave}
              onRefreshHistory={loadHistory}
            />
          )}

          {view === "sos" && <SOSAlertsView onCountChange={setSosCount} />}

          {view === "overdue" && <OverdueStudentsView onCountChange={setOverdueCount} />}
          {view === "delays" && <DelayNoticesView onCountChange={setDelayCount} />}

          {view === "logs" && <MovementLogsView />}

          {view === "complaints" && (
            <ComplaintsView
              reports={reports}
              resolvedReports={resolvedReports}
              loading={loadingReports}
              error={reportsError}
              onRefresh={loadReports}
            />
          )}

          {view === "profile" && (
            <section className="sd-luxe-panel sd-enter mx-auto mt-6 w-full max-w-3xl rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center gap-4">
                <span className="sd-profile-avatar flex h-16 w-16 items-center justify-center bg-linear-to-br from-indigo-700 via-indigo-600 to-cyan-400 text-lg font-bold text-white shadow-lg">
                  {initials(displayName)}
                </span>
                <div className="min-w-0">
                  <p className="sd-card-title text-xl">{displayName}</p>
                  <p className="sd-tag mt-1.5"><ShieldCheck className="h-3.5 w-3.5" /> {user?.roleLabel || "Warden"}</p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {managedHostel && (
                  <div className="sd-row" style={{ "--accent": "#6366f1" }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex items-center gap-3"><Building2 className="h-4 w-4 text-slate-400" /><span className="sd-card-title text-[0.88rem]">{managedHostel}</span></div>
                  </div>
                )}
                {user?.email && (
                  <div className="sd-row" style={{ "--accent": "#0ea5e9" }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex min-w-0 items-center gap-3"><Mail className="h-4 w-4 shrink-0 text-slate-400" /><span className="sd-card-title truncate text-[0.88rem]">{user.email}</span></div>
                  </div>
                )}
                {user?.phoneNumber && (
                  <div className="sd-row" style={{ "--accent": "#2dd4bf" }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-slate-400" /><span className="sd-card-title text-[0.88rem]">{user.phoneNumber}</span></div>
                  </div>
                )}
                <SignatureCard
                  signature={mySignature}
                  onSaved={(signature) => setUser((u) => ({ ...(u || {}), signature }))}
                />
              </div>
              <button type="button" onClick={handleLogout} className="sd-magnetic mt-8 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-rose-600 shadow-sm transition hover:bg-rose-100">
                <LogOut className="h-5 w-5" /> Logout
              </button>
            </section>
          )}

          {/* Desktop nav */}
          <nav className="sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid grid-cols-8 gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur">
            {navItems.map((n) => (
              <button key={n.key} onClick={() => setView(n.key)} className={`sd-navx ${view === n.key ? "sd-navx--active" : ""}`}>
                <span className="sd-navx__icon relative">
                  <n.icon className="h-5 w-5" />
                  {n.badge > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{n.badge}</span>}
                </span>
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Approve modal — signature required */}
      {approvalTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="sd-enter relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="sd-kicker">{approvalTarget.kind === "leave" ? "Leave Application" : "Outing Request"}</p>
                <h3 className="sd-title sd-title-sm mt-0.5">Approve{approvalTarget.name ? ` — ${approvalTarget.name}` : ""}</h3>
              </div>
              <button onClick={closeApproval} disabled={approving} className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {mySignature && !changingSignature
                ? `Your saved signature will be attached to this ${approvalTarget.kind === "leave" ? "leave application" : "outing request"}.`
                : `Add your signature once — it will be attached to every ${approvalTarget.kind === "leave" ? "application" : "request"} you approve from now on.`}
            </p>
            {mySignature && !changingSignature ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Your signature</p>
                  <button
                    type="button"
                    onClick={() => setChangingSignature(true)}
                    disabled={approving}
                    className="cursor-pointer text-[11px] font-bold text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                  >
                    Change
                  </button>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mySignature} alt="Your signature" className="mt-1.5 h-14 w-auto rounded-lg border border-slate-200 bg-white p-1" />
              </div>
            ) : (
              // Fallback capture: a warden with no saved signature is never hard-blocked,
              // they set it up here and the approval continues in the same modal.
              <div className="mt-4">
                <SignatureCapture
                  currentSignature={mySignature}
                  onSave={saveMySignature}
                  saving={savingSignature}
                  error={signatureError}
                  disabled={approving}
                  saveLabel={mySignature ? "Update signature" : "Save signature"}
                />
                {mySignature && (
                  <button
                    type="button"
                    onClick={() => { setChangingSignature(false); setSignatureError(""); }}
                    disabled={savingSignature}
                    className="mt-2 w-full cursor-pointer text-xs font-bold text-slate-500 hover:text-slate-700 disabled:opacity-50"
                  >
                    Keep my current signature
                  </button>
                )}
              </div>
            )}
            {signatureError && mySignature && !changingSignature && (
              <p className="mt-2 text-xs font-semibold text-rose-600">{signatureError}</p>
            )}
            <div className="mt-5 flex gap-3">
              <button onClick={closeApproval} disabled={approving} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmApproval} disabled={approving || !mySignature || changingSignature} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed">
                <Check className="h-4 w-4" />
                {approving ? "Approving…" : "Approve"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal — remarks required for leave, optional for outing */}
      {rejectTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="sd-enter relative w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="sd-kicker">{rejectTarget.kind === "leave" ? "Leave Application" : "Outing Request"}</p>
                <h3 className="sd-title sd-title-sm mt-0.5">Reject{rejectTarget.name ? ` — ${rejectTarget.name}` : ""}</h3>
              </div>
              <button onClick={closeReject} disabled={rejecting} className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-600">
              {rejectTarget.kind === "leave"
                ? "Add a reason for rejecting this leave application — the student will see it."
                : "Optionally add a reason for rejecting this outing request."}
            </p>
            <textarea
              value={rejectRemarks}
              onChange={(e) => setRejectRemarks(e.target.value)}
              rows={3}
              placeholder={rejectTarget.kind === "leave" ? "Reason (required)" : "Reason (optional)"}
              className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-rose-400 focus:bg-white transition-colors"
            />
            <div className="mt-5 flex gap-3">
              <button onClick={closeReject} disabled={rejecting} className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50">
                Cancel
              </button>
              <button
                onClick={confirmReject}
                disabled={rejecting || (rejectTarget.kind === "leave" && !rejectRemarks.trim())}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-rose-600 to-orange-500 py-3 text-sm font-bold text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <X className="h-4 w-4" />
                {rejecting ? "Rejecting…" : "Reject"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile nav — all tabs fit now; Profile lives behind the header avatar */}
      <nav className="sd-luxe-panel sd-glow-border fixed inset-x-2 bottom-3 z-60 grid grid-cols-6 gap-0.5 rounded-[1.75rem] p-1.5 md:hidden">
        {mobileNavItems.map((n) => (
          <button key={n.key} onClick={() => setView(n.key)} className={`sd-navx ${view === n.key ? "sd-navx--active" : ""}`}>
            <span className="sd-navx__icon relative">
              <n.icon className="h-5 w-5" />
              {n.badge > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{n.badge}</span>}
            </span>
            <span className="text-[9px]">{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Live "student is running late" popup — refetches on the /delay stream. */}
      <DelayNoticeToast onView={() => setView("delays")} />
    </main>
  );
}
