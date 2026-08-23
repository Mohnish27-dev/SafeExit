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
  ArrowUpRight,
  ShieldAlert,
  Siren,
  Sparkles,
  Users,
  Wifi,
  Armchair,
  ScrollText,
  AlarmClock,
} from "lucide-react";
import ProfileView from "./components/ProfileView";
import MovementLogsView from "./components/MovementLogsView";
import AutoApprovedView from "./components/AutoApprovedView";
import RequestsView from "./components/RequestsView";
import SOSAlertsView from "./components/SOSAlertsView";
import OverdueStudentsView from "./components/OverdueStudentsView";
import DelayNoticesView from "./components/DelayNoticesView";
import DelayNoticeToast from "./components/DelayNoticeToast";
import LeaveApplicationsView from "./components/LeaveApplicationsView";
import SignatureCapture from "@/app/components/SignatureCapture";
import { isSignatureRequiredError } from "@/app/lib/signatureImage";
import { apiFetch } from "@/app/lib/api";
import { subscribeToStaffEvents } from "@/app/lib/staffEvents";
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

// managedGender maps to the hostel the caretaker oversees.
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
  caretakerSignature: l.caretakerSignature || null,
  // Present only when a warden decided the escalation — it's what distinguishes a
  // warden-signed pass from a caretaker-signed one in the viewer.
  wardenSignature: l.wardenSignature || null,
  initials: initials(l.student?.name),
});

const mapLeaveHistory = (l) => ({
  ...mapLeavePending(l),
  status: l.status || "",
  // The frozen verdict. `status` moves on (Out/Returned/Cancelled/Expired) but this doesn't,
  // so a cancelled-after-approval pass still files under Approved.
  decision: l.decision || "",
  // Set when the pass never played out as decided — "Cancelled" or "Expired".
  lapsed: l.lapsed || "",
  decidedByName: l.approvedBy?.name || "",
  decidedByRole: l.decidedByRole || l.approvedBy?.role || "",
  forwardedToName: l.forwardedTo?.name || "",
  remarks: l.remarks || "",
  decidedAt: l.decidedAt || l.updatedAt,
});

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

function CaretakerStat({ label, value, fill, glow }) {
  const [ref, animated] = useCountUp(value);
  return (
    <div ref={ref} className="sd-stat px-4 py-7 text-center" style={{ "--stat-glow": glow }}>
      <p className="sd-micro">{label}</p>
      <p
        className="mt-2 text-5xl font-bold italic tracking-tight text-transparent bg-clip-text"
        style={{ backgroundImage: fill }}
      >
        {Math.round(animated)}
      </p>
    </div>
  );
}

export default function CaretakerDashboardPage() {
  const { t } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("caretaker");

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

  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestsError, setRequestsError] = useState("");

  const [leavePending, setLeavePending] = useState([]);
  const [loadingLeave, setLoadingLeave] = useState(true);
  const [leaveError, setLeaveError] = useState("");

  const [leaveHistory, setLeaveHistory] = useState([]);
  const [loadingLeaveHistory, setLoadingLeaveHistory] = useState(true);

  // Kept live independently of the SOS view so the badge shows on every tab.
  const [sosCount, setSosCount] = useState(0);

  // Students still out past their outing return time; kept live for the badge.
  const [overdueCount, setOverdueCount] = useState(0);

  // Students who told us they'll be late. Tracked separately from overdueCount
  // because a student can file *before* their deadline passes — they aren't
  // overdue yet, so the overdue list would never surface them.
  const [delayCount, setDelayCount] = useState(0);

  const loadDelayCount = useCallback(async () => {
    try {
      const data = await apiFetch("/delay?status=Pending");
      setDelayCount(Array.isArray(data) ? data.length : 0);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from the API, a client-only external source.
    loadDelayCount();
    const interval = setInterval(loadDelayCount, 30000);
    return () => clearInterval(interval);
  }, [loadDelayCount]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "delay:created": loadDelayCount,
      "delay:updated": loadDelayCount,
    });
  }, [loadDelayCount]);

  // Numeric occupancy only — the API never sends student identities to this card.
  const [studentsOut, setStudentsOut] = useState(0);

  const loadLiveStats = useCallback(async () => {
    try {
      const data = await apiFetch("/caretaker/stats");
      const count = Number(data?.outNow);
      setStudentsOut(Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0);
    } catch {
      /* best-effort */
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

  useEffect(() => {
    loadSosCount();
    const interval = setInterval(loadSosCount, 30000);
    return () => clearInterval(interval);
  }, [loadSosCount]);

  useEffect(() => {
    loadOverdueCount();
    const interval = setInterval(loadOverdueCount, 30000);
    return () => clearInterval(interval);
  }, [loadOverdueCount]);

  useEffect(() => {
    loadLiveStats();
    const interval = setInterval(loadLiveStats, 30000);
    return () => clearInterval(interval);
  }, [loadLiveStats]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "sos:created": loadSosCount,
      "sos:updated": loadSosCount,
    });
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
    loadLeaveApplications();
    loadLeaveHistory();
  }, [loadRequests, loadLeaveApplications, loadLeaveHistory]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "outing:changed": () => {
        loadRequests();
        loadOverdueCount();
        loadLiveStats();
      },
    });
  }, [loadRequests, loadOverdueCount, loadLiveStats]);

  // Poll as safety net in case the SSE connection is silently dropped.
  useEffect(() => {
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, [loadRequests]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "leave:changed": () => {
        loadLeaveApplications();
        loadLeaveHistory();
      },
    });
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
    if (target && ["sos", "overdue", "delays", "leave", "requests", "approved", "profile"].includes(target)) {
      setView(target);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  function closePanel() {
    setActivePanel(null);
  }

  // Approving mints a signed pass, so it routes through a modal that captures the
  // caretaker's drawn signature. { kind: 'outing' | 'leave', id, name } while open.
  const [approvalTarget, setApprovalTarget] = useState(null);
  const [approving, setApproving] = useState(false);
  // Only used by the fallback capture for caretakers who have not set up a signature yet,
  // or who chose to replace it from inside the approval modal.
  const [savingSignature, setSavingSignature] = useState(false);
  const [signatureError, setSignatureError] = useState("");
  const [changingSignature, setChangingSignature] = useState(false);
  // Hydrated by the /auth/profile call this dashboard already makes on mount.
  const mySignature = user?.signature || null;

  const openOutingApproval = (id) => {
    const req = pending.find((p) => p.id === id);
    setApprovalTarget({ kind: "outing", id, name: req?.name || "", studentSignature: req?.studentSignature || null });
  };

  const openLeaveApproval = (id) => {
    const req = leavePending.find((l) => l.id === id);
    setApprovalTarget({ kind: "leave", id, name: req?.name || "", studentSignature: req?.studentSignature || null });
  };

  const closeApproval = () => {
    setApprovalTarget(null);
    setSignatureError("");
    setChangingSignature(false);
  };

  // Persist the caretaker's signature to their profile, then reuse it for every later
  // approval. Reached only when they had none saved.
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

  const [forwardTarget, setForwardTarget] = useState(null);
  const [forwardNote, setForwardNote] = useState("");
  const [forwarding, setForwarding] = useState(false);

  const openOutingForward = (id) => {
    const req = pending.find((p) => p.id === id);
    setForwardNote("");
    setForwardTarget({ kind: "outing", id, name: req?.name || "" });
  };

  const openLeaveForward = (id) => {
    const req = leavePending.find((l) => l.id === id);
    setForwardNote("");
    setForwardTarget({ kind: "leave", id, name: req?.name || "" });
  };

  const closeForward = () => {
    setForwardTarget(null);
    setForwardNote("");
  };

  async function confirmForward() {
    if (!forwardTarget) return;
    setForwarding(true);
    const { kind, id } = forwardTarget;
    try {
      if (kind === "outing") {
        await forwardRequest(id, forwardNote);
      } else {
        await forwardLeave(id, forwardNote);
      }
      closeForward();
    } finally {
      setForwarding(false);
    }
  }

  async function forwardRequest(id, note) {
    const req = pending.find((p) => p.id === id);
    if (!req) return;
    // Optimistic: drop from pending — the warden owns it now.
    setPending((p) => p.filter((r) => r.id !== id));
    try {
      await apiFetch(`/outing/${id}/forward`, {
        method: "PATCH",
        body: JSON.stringify({ note: note?.trim() || undefined }),
      });
    } catch (err) {
      setPending((p) => [req, ...p]);
      setRequestsError(err.message || t("couldNotForward"));
    }
  }

  async function forwardLeave(id, note) {
    const req = leavePending.find((l) => l.id === id);
    if (!req) return;
    setLeavePending((l) => l.filter((r) => r.id !== id));
    try {
      await apiFetch(`/leave/${id}/forward`, {
        method: "PATCH",
        body: JSON.stringify({ note: note?.trim() || undefined }),
      });
    } catch (err) {
      setLeavePending((l) => [req, ...l]);
      setLeaveError(err.message || t("couldNotForwardLeave"));
    }
  }

  async function confirmApproval() {
    if (!approvalTarget) return;
    setApproving(true);
    setSignatureError("");
    const { kind, id } = approvalTarget;
    try {
      if (kind === "outing") {
        await approveRequest(id);
      } else {
        await approveLeave(id);
      }
      closeApproval();
    } catch (err) {
      // Only a missing signature reaches here (the approve fns handle everything else
      // themselves). Keep the modal open so the capture below can fix it in place.
      setSignatureError(err?.message || "Add your signature before approving.");
    } finally {
      setApproving(false);
    }
  }

  async function approveRequest(id) {
    const req = pending.find((p) => p.id === id);
    if (!req) return;
    // Optimistic update; persist to backend after.
    setPending((p) => p.filter((r) => r.id !== id));
    setApproved((a) => [{ id: req.id, name: req.name, outSince: req.out, initials: req.initials }, ...a]);
    try {
      // The server stamps our saved profile signature; nothing to send.
      await apiFetch(`/outing/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved" }),
      });
    } catch (err) {
      // Checked before the 409 branch: this dashboard reads 409 as "request expired".
      if (isSignatureRequiredError(err)) {
        setApproved((a) => a.filter((r) => r.id !== id));
        setPending((p) => [req, ...p]);
        setUser((u) => ({ ...(u || {}), signature: undefined }));
        throw err;
      }
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
      // Before the 409 branch: 409 means "already expired" on this dashboard.
      if (isSignatureRequiredError(err)) {
        setLeavePending((l) => [req, ...l]);
        setUser((u) => ({ ...(u || {}), signature: undefined }));
        throw err;
      }
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

  const displayName = (user && (user.name || user.displayName)) || t("chiefCaretaker");

  // Unset scope means no students; show the "not configured" banner.
  const managedGender = user?.managedGender;
  const managedHostel = user?.managedHostel;
  // Prefer the specific hostel name; fall back to the generic label for legacy caretakers.
  const hostelLabel = managedHostel || HOSTEL_LABEL[managedGender];
  const isConfigured = Boolean(managedHostel || managedGender);

  // Boys' outings are auto-approved, so a boys' caretaker only approves leave.
  const isBoysCaretaker = managedGender === "Male";

  const handleLogout = () => logout(router, { role: "caretaker" });

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
                <p className="text-sm">Until an admin assigns you to a hostel, you won&apos;t see any student requests, leave applications, or alerts. Please contact the admin.</p>
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
                  overdueCount > 0 && {
                    key: 'overdue',
                    label: t("overdueStudents"),
                    count: overdueCount,
                    icon: AlarmClock,
                    className: 'wd-attn--sos',
                    onClick: () => setView('overdue'),
                  },
                  delayCount > 0 && {
                    key: 'delays',
                    label: t("delayNotices"),
                    count: delayCount,
                    icon: Clock,
                    className: 'wd-attn--leave',
                    onClick: () => setView('delays'),
                  },
                  !isBoysCaretaker && pending.length > 0 && {
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
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2 mt-1 sm:mt-2">{t("greeting")} <span className="sd-name-live">Caretaker</span>.</h2>
                  {/* Desktop-only overview text */}
                  <p className="sd-body mt-2 hidden max-w-md sm:block">{isBoysCaretaker ? t("overviewTextBoys") : t("overviewText")}</p>
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
            </div>
            {/* Boys' caretaker gets four tiles, which tile evenly. The girls' set is five,
                so its lead tile spans two columns and both counts fill their rows exactly. */}
            <div className={`mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:gap-4 ${isBoysCaretaker ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
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
                const overdueAction = {
                  title: t("overdueTitle"),
                  desc: t("overdueDesc"),
                  icon: AlarmClock,
                  badgeBg: "linear-gradient(145deg, #9f1239 0%, #fb7185 100%)",
                  tint: "linear-gradient(160deg, rgba(244,63,94,0.14) 0%, rgba(251,113,133,0.08) 100%)",
                  glow: "rgba(244,63,94,0.45)",
                  border: "rgba(251,113,133,0.5)",
                  badge: overdueCount,
                  onClick: () => setView('overdue'),
                };
                // Boys' caretaker has no outing approvals: lead with Leave.
                return isBoysCaretaker
                  ? [leaveAction, safetyAction, overdueAction, logsAction]
                  : [manageAction, safetyAction, overdueAction, leaveAction, logsAction];
              })().map((a, idx) => {
                // Girls' set is five tiles, so its lead one becomes a two-column hero:
                // badge and copy side by side, same treatment as the student dashboard.
                const isHero = !isBoysCaretaker && idx === 0;
                const badgeStyle = { background: a.badgeBg, boxShadow: `0 14px 26px -12px ${a.glow}` };
                const countBubble = a.badge ? (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white animate-pulse">{a.badge}</span>
                ) : null;
                return (
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
                  className={`sd-tile sd-luxe-rise group block h-full text-left ${
                    isHero ? "sd-tile--hero col-span-2" : ""
                  }`}
                >
                  {isHero ? (
                    <div className="sd-tile__inner flex h-full min-h-38 items-center gap-4 p-4 sm:gap-6 sm:p-6">
                      <span className="sd-tile__glare" aria-hidden="true" />
                      <span className="sd-act sd-act--hero sd-lift-lg relative shrink-0 shadow-lg" style={badgeStyle}>
                        <a.icon className="h-7 w-7 sm:h-9 sm:w-9" />
                        {countBubble}
                      </span>
                      <div className="sd-lift-md min-w-0 flex-1">
                        <span className="sd-act-rule mb-2 block sm:mb-3.5" aria-hidden="true" />
                        <span className="sd-card-title block leading-snug">{a.title}</span>
                        <span className="sd-body mt-1 line-clamp-2 sm:mt-2.5 sm:line-clamp-3">{a.desc}</span>
                      </div>
                    </div>
                  ) : (
                  <div className="sd-tile__inner flex min-h-38 flex-col p-4 sm:min-h-52 sm:p-5">
                    <span className="sd-tile__glare" aria-hidden="true" />
                    <div className="flex items-start justify-between">
                      <span className="sd-act sd-lift-lg relative shadow-lg" style={badgeStyle}>
                        <a.icon className="h-6 w-6" />
                        {countBubble}
                      </span>
                    </div>
                    <div className="sd-lift-md mt-auto pt-4 sm:pt-6">
                      <span className="sd-act-rule mb-2 block sm:mb-3" aria-hidden="true" />
                      <span className="sd-card-title block leading-snug">{a.title}</span>
                      <span className="sd-body mt-1 hidden leading-relaxed sm:mt-1.5 sm:block sm:line-clamp-2">{a.desc}</span>
                    </div>
                  </div>
                  )}
                </button>
                );
              })}
            </div>
              </section>

              {isBoysCaretaker ? (
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
                  <div key={req.id} className="sd-luxe-card sd-luxe-rise sd-luxe-tilt flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between" style={{ animationDelay: `${0.12 + i * 0.06}s` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-linear-to-br from-violet-500 to-fuchsia-400 flex items-center justify-center text-white font-bold">{req.initials}</div>
                      <div className="min-w-0">
                        <p className="sd-card-title text-slate-900 text-base">{req.name}</p>
                        <p className="sd-micro mt-0.5">{req.room}{req.roll ? <> • <span className="font-mono">{req.roll}</span></> : null}</p>
                        <p className="sd-micro mt-0.5 text-slate-500">{t("destination")} {req.destination}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                      <button onClick={() => openLeaveApproval(req.id)} className="flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-sm text-white font-bold shadow hover:-translate-y-0.5 transition-transform sm:px-4 sm:py-2">
                        <Check className="h-4 w-4 shrink-0" /> {tc("approve")}
                      </button>
                      <button onClick={() => setView('leave')} className="flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 border border-slate-300 text-sm text-slate-600 font-bold hover:bg-slate-50 transition-colors sm:px-4 sm:py-2">
                        <ArrowRight className="h-4 w-4 shrink-0" /> {t("reviewInLeave")}
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
                  <div key={req.id} className="sd-row sd-luxe-rise flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center" style={{ "--accent": "#6366f1", animationDelay: `${0.12 + i * 0.06}s` }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-linear-to-br from-indigo-400 to-cyan-400 flex items-center justify-center text-white font-bold">{req.initials}</div>
                      <div className="min-w-0">
                        <p className="sd-card-title text-slate-900 text-base">{req.name}</p>
                        <p className="sd-micro mt-0.5">{req.branch} • <span className="font-mono">{req.roll}</span></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="mr-2 shrink-0">
                        <p className="text-xs text-slate-500">{tc("out")}</p>
                        <p className="font-semibold text-slate-900">{req.out}</p>
                      </div>
                      <div className="grid flex-1 grid-cols-2 gap-2 sm:flex sm:flex-none sm:flex-col">
                        <button
                          onClick={() => openOutingApproval(req.id)}
                          onPointerMove={handleMagneticMove}
                          onPointerLeave={handleMagneticLeave}
                          className="sd-magnetic flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 text-sm text-white font-bold shadow sm:px-4 sm:py-2"
                        >
                          <Check className="h-4 w-4 shrink-0" /> {tc("approve")}
                        </button>
                        <button onClick={() => rejectRequest(req.id)} className="flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 border border-rose-300 text-sm text-rose-600 font-bold hover:bg-rose-50 transition-colors sm:px-4 sm:py-2">
                          <X className="h-4 w-4 shrink-0" /> {tc("reject")}
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
              <div className="mt-5">
                <CaretakerStat
                  label={t("outNow")}
                  value={studentsOut}
                  fill="linear-gradient(90deg, #f59e0b, #fb923c)"
                  glow="rgba(245,158,11,0.45)"
                />
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
              forwardRequest={openOutingForward}
              loading={loadingRequests}
              error={requestsError}
              onRefresh={loadRequests}
            />
          )}

          {view === 'approved' && (
            <AutoApprovedView approved={approved} compact={false} onBack={() => setView('home')} onClear={() => setApproved([])} pageSize={6} />
          )}

          {view === 'sos' && <SOSAlertsView onCountChange={setSosCount} />}
          {view === 'overdue' && <OverdueStudentsView onCountChange={setOverdueCount} />}
          {view === 'delays' && <DelayNoticesView onCountChange={setDelayCount} />}
          {view === 'profile' && (
            <ProfileView
              user={user}
              displayName={displayName}
              onLogout={handleLogout}
              onSignatureSaved={(signature) => setUser((u) => ({ ...(u || {}), signature }))}
            />
          )}
          {view === 'leave' && (
            <LeaveApplicationsView
              pending={leavePending}
              history={leaveHistory}
              approveLeave={openLeaveApproval}
              rejectLeave={rejectLeave}
              forwardLeave={openLeaveForward}
              loading={loadingLeave}
              loadingHistory={loadingLeaveHistory}
              error={leaveError}
              onRefresh={() => { loadLeaveApplications(); loadLeaveHistory(); }}
            />
          )}

          {view === 'logs' && <MovementLogsView />}

          {/* Six tabs, seven when the Requests tab is shown — one column each, no empty track */}
          <nav className={`sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid ${isBoysCaretaker ? 'grid-cols-6' : 'grid-cols-7'} gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur`}>
            <button onClick={() => setView('home')} className={`sd-navx ${view === 'home' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><Home className="h-5 w-5" /></span>{tc("home")}</button>
            {!isBoysCaretaker && (
              <button onClick={() => setView('requests')} className={`sd-navx ${view === 'requests' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><ClipboardList className="h-5 w-5" /></span>{t("requests")}</button>
            )}
            <button onClick={() => setView('delays')} className={`sd-navx ${view === 'delays' ? 'sd-navx--active' : ''}`}>
              <span className="sd-navx__icon relative">
                <Clock className="h-5 w-5" />
                {delayCount > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-amber-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{delayCount}</span>}
              </span>
              {t("delayNotices")}
            </button>
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
              <h3 className="sd-title sd-title-sm">{activePanel === 'manage' ? t("manageRequests") : t("safetyAlerts")}</h3>
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
              {mySignature && !changingSignature
                ? `Your saved signature will be attached to this ${approvalTarget.kind === "leave" ? "leave application" : "outing request"}.`
                : `Add your signature once — it will be attached to every ${approvalTarget.kind === "leave" ? "application" : "request"} you approve from now on.`}
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
                <img
                  src={mySignature}
                  alt="Your signature"
                  className="mt-1.5 h-14 w-auto rounded-lg border border-slate-200 bg-white p-1"
                />
              </div>
            ) : (
              // Fallback capture: a caretaker with no saved signature is never hard-blocked,
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
              <button
                onClick={closeApproval}
                disabled={approving}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={confirmApproval}
                disabled={approving || !mySignature || changingSignature}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Check className="h-4 w-4" />
                {approving ? tc("loading") : tc("approve")}
              </button>
            </div>
          </div>
        </div>
      )}

      {forwardTarget && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4">
          <div className="sd-enter relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="sd-kicker">{forwardTarget.kind === "leave" ? t("leaveApplications") : t("outingRequests")}</p>
                <h3 className="sd-title sd-title-sm mt-0.5">{t("forwardToWarden")}{forwardTarget.name ? ` — ${forwardTarget.name}` : ""}</h3>
              </div>
              <button
                onClick={closeForward}
                disabled={forwarding}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mt-4 rounded-2xl border border-teal-200 bg-teal-50/70 px-4 py-3 text-sm font-medium text-teal-800">
              {t("forwardHint")}
            </p>

            <div className="mt-4">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-600">{t("forwardNote")}</label>
              <textarea
                value={forwardNote}
                onChange={(e) => setForwardNote(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={t("forwardNotePlaceholder")}
                className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:outline-none"
              />
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={closeForward}
                disabled={forwarding}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={confirmForward}
                disabled={forwarding}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-teal-700 via-teal-600 to-emerald-500 py-3 text-sm font-bold text-white shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ArrowUpRight className="h-4 w-4" />
                {forwarding ? tc("loading") : t("confirmForward")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile nav — Logs lives on the Home tile grid and Profile behind the header avatar,
          so they're dropped here to keep every tab label on one line. Three tabs, four
          when the Requests tab is shown — one column each, no empty track. */}
      <nav className={`sd-mobile-bottom-nav sd-luxe-panel sd-glow-border fixed inset-x-2 bottom-3 z-50 grid ${isBoysCaretaker ? 'grid-cols-3' : 'grid-cols-4'} gap-0.5 rounded-[1.75rem] p-1.5 md:hidden`}>
        <button onClick={() => setView('home')} className={`sd-navx ${view === 'home' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><Home className="h-5 w-5" /></span><span className="sd-navx__label">{tc("home")}</span></button>
        {!isBoysCaretaker && (
          <button onClick={() => setView('requests')} className={`sd-navx ${view === 'requests' ? 'sd-navx--active' : ''}`}><span className="sd-navx__icon"><ClipboardList className="h-5 w-5" /></span><span className="sd-navx__label">{t("requests")}</span></button>
        )}
        <button onClick={() => setView('leave')} className={`sd-navx ${view === 'leave' ? 'sd-navx--active' : ''}`}>
          <span className="sd-navx__icon relative">
            <CalendarDays className="h-5 w-5" />
            {leavePending.length > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{leavePending.length}</span>}
          </span>
          <span className="sd-navx__label">{t("navLeave")}</span>
        </button>
        <button onClick={() => setView('sos')} className={`sd-navx ${view === 'sos' ? 'sd-navx--active' : ''}`}>
          <span className="sd-navx__icon relative">
            <Siren className="h-5 w-5" />
            {sosCount > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{sosCount}</span>}
          </span>
          <span className="sd-navx__label">{t("navAlerts")}</span>
        </button>
      </nav>

      {/* Live "student is running late" popup — refetches on the /delay stream. */}
      <DelayNoticeToast onView={() => setView("delays")} />
    </main>
  );
}
