"use client";

// The leave desk shared by the caretaker, warden, chief warden and admin dashboards.
//
// Girls' applications are decided here by whichever of the caretaker, the hostel's wardens
// or the chief warden acts first. Boys' leave arrives already approved; deciders may revoke
// it (with a reason) until the student is Out. Admins see everything and decide nothing.
// Data and actions come from lib/leaveDesk.useLeaveDesk, which the page owns so its badges
// can read the counts.

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  Lock,
  MapPin,
  Phone,
  RefreshCcw,
  Search,
  ShieldAlert,
  Siren,
  X,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { useTranslation } from "@/app/lib/i18n";
import { useSignatures } from "@/app/lib/signatures";
import { isSignatureRequiredError } from "@/app/lib/signatureImage";
import { CAMPUS_TIMEZONE, campusDateKey, leaveDayCount, parseCampusDate } from "@/app/lib/leaveRules.mjs";
import { formatDepartureTime, UNDECIDED_STATUSES } from "@/app/lib/leaveDesk";
import SignatureCapture from "@/app/components/SignatureCapture";
import { LeaveTicketButton } from "@/app/components/LeaveTicketViewer";

const ROLE_LABEL = { Caretaker: "Caretaker", Warden: "Warden", ChiefWarden: "Chief Warden", Admin: "Admin" };

// Leave and return are dates only; the expected departure hour is shown separately. Pinned
// to campus time: a leave date is stored as campus midnight, which in any timezone west of
// IST falls on the previous calendar day.
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-US", { timeZone: CAMPUS_TIMEZONE, day: "2-digit", month: "short" }) : "—";

// With year: the letter view needs an unambiguous formal date.
const formatLetterDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-US", { timeZone: CAMPUS_TIMEZONE, day: "2-digit", month: "short", year: "numeric" }) : "—";

// A leave is a span of dates, so its length is calendar days, both ends included.
const getDurationLabel = (leaveDate, returnDate) => {
  const days = leaveDayCount(leaveDate, returnDate);
  return days ? `${days}d` : "—";
};

// The leave date is today or tomorrow: decide it before the student reaches the gate.
const isActingSoon = (leaveDate) => {
  const leaveDay = campusDateKey(leaveDate);
  const today = campusDateKey(new Date());
  const tomorrow = campusDateKey(parseCampusDate(today).getTime() + 24 * 60 * 60 * 1000);
  return leaveDay === today || leaveDay === tomorrow;
};

const handleTilePointerMove = (e) => {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  el.style.setProperty("--mx", `${px * 100}%`);
  el.style.setProperty("--my", `${py * 100}%`);
  el.style.setProperty("--ry", `${(px - 0.5) * 7}deg`);
  el.style.setProperty("--rx", `${(0.5 - py) * 7}deg`);
};

const handleTilePointerLeave = (e) => {
  e.currentTarget.style.setProperty("--rx", "0deg");
  e.currentTarget.style.setProperty("--ry", "0deg");
};

const matchesSearch = (req, query) =>
  !query ||
  [req.name, req.roll, req.hostelName, req.destination]
    .filter(Boolean)
    .some((v) => v.toLowerCase().includes(query));

// `scope` is the gender of the hostel the viewer manages: "Male" for a boys' hostel
// caretaker or warden, "Female" for a girls' one, unset for the campus-wide chief warden and
// admin. A boys' hostel never has an application to decide (boys are auto-approved), and a
// girls' hostel never has a boys' leave to revoke, so each sees only the tabs it can use.
export default function StaffLeaveDesk({ desk, scope, mySignature = null, onSignatureSaved = () => {} }) {
  const { t } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");
  const {
    canDecide,
    pending,
    history,
    boys,
    loading,
    loadingHistory,
    loadingBoys,
    error,
    setError,
    reload,
  } = desk;

  const [selectedTab, setTab] = useState(null);
  const [search, setSearch] = useState("");
  const [viewingId, setViewingId] = useState(null);

  // { kind: 'approve' | 'revoke', id, name, hasStudentSignature }. Approve and Reject are
  // one tap (decideNow); the approve dialog only opens for an approver who has no saved
  // signature yet, so they can draw one once.
  const [dialog, setDialog] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [dialogError, setDialogError] = useState("");

  // The approver's saved signature: from the page when it has one, else fetched once when
  // the approve dialog first needs it. A saved one is locked; changing it is an admin reset.
  const [ownSignature, setOwnSignature] = useState(undefined);
  const signature = ownSignature === undefined ? mySignature : ownSignature;
  const [savingSignature, setSavingSignature] = useState(false);

  useEffect(() => {
    if (dialog?.kind !== "approve" || signature) return undefined;
    let cancelled = false;
    apiFetch("/auth/profile")
      .then((me) => {
        if (!cancelled && me?.signature) setOwnSignature(me.signature);
      })
      .catch(() => {
        /* best-effort: the approve call is the authoritative check */
      });
    return () => {
      cancelled = true;
    };
  }, [dialog, signature]);

  const all = [...pending, ...boys, ...history];
  const viewing = all.find((r) => r.id === viewingId) || null;
  const { signatures: viewingSignatures } = useSignatures("leave", viewingId, Boolean(viewingId));
  const { signatures: dialogSignatures, error: dialogSignatureError } = useSignatures(
    "leave",
    dialog?.id,
    dialog?.kind === "approve" && Boolean(dialog?.hasStudentSignature)
  );

  const query = search.trim().toLowerCase();
  // Tabs key off the frozen `decision`, not `status` — a pass the student cancelled after
  // approval keeps its Approved verdict and stays in that tab.
  const lists = useMemo(
    () => ({
      pending,
      boys,
      approved: history.filter((r) => r.decision === "Approved"),
      rejected: history.filter((r) => r.decision === "Rejected"),
      all: history,
    }),
    [pending, boys, history]
  );
  const revocableCount = boys.filter((r) => r.status === "Approved").length;

  const tabs = !canDecide
    ? [
        { key: "boys", label: t("boysTab"), count: revocableCount },
        { key: "all", label: t("allTab"), count: history.length },
      ]
    : scope === "Male"
    ? [
        { key: "boys", label: t("boysLeaveTab"), count: revocableCount },
        // Only applications filed before boys' leave became automatic.
        ...(pending.length ? [{ key: "pending", label: t("pendingTab"), count: pending.length }] : []),
        ...(history.length ? [{ key: "all", label: t("earlierTab"), count: history.length }] : []),
      ]
    : scope === "Female"
    ? [
        { key: "pending", label: t("pendingTab"), count: pending.length },
        { key: "approved", label: t("approvedTab"), count: lists.approved.length },
        { key: "rejected", label: t("rejectedTab"), count: lists.rejected.length },
      ]
    : [
        { key: "pending", label: t("girlsPendingTab"), count: pending.length },
        { key: "boys", label: t("boysTab"), count: revocableCount },
        { key: "approved", label: t("approvedTab"), count: lists.approved.length },
        { key: "rejected", label: t("rejectedTab"), count: lists.rejected.length },
      ];
  // The scope arrives with the profile, after the first render, so a remembered tab that
  // this viewer does not have falls back to their first one.
  const tab = tabs.some((tb) => tb.key === selectedTab) ? selectedTab : tabs[0].key;

  const visible = (lists[tab] || []).filter((r) => matchesSearch(r, query));
  const tabLoading = tab === "pending" ? loading : tab === "boys" ? loadingBoys : loadingHistory;

  const roleName = (role) => (role === "System" ? t("autoApproved") : ROLE_LABEL[role] || role);

  const statusBadge = (req) => {
    if (UNDECIDED_STATUSES.includes(req.status)) {
      return { label: t("awaitingDecision"), tone: "bg-amber-100 text-amber-700", icon: Clock3 };
    }
    if (req.revokedAt) return { label: t("revoked"), tone: "bg-rose-100 text-rose-700", icon: Ban };
    if (req.decision === "Rejected") return { label: tc("rejected"), tone: "bg-rose-100 text-rose-700", icon: XCircle };
    if (req.status === "Out") return { label: t("onLeaveNow"), tone: "bg-sky-100 text-sky-700", icon: ArrowUpRight };
    if (req.status === "Returned") return { label: t("returned"), tone: "bg-violet-100 text-violet-700", icon: CheckCircle2 };
    if (req.autoApproved) return { label: t("autoApproved"), tone: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 };
    return { label: tc("approved"), tone: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 };
  };

  // Who signed it off, or who revoked it — only worth showing once someone acted.
  const decidedByLabel = (req) => {
    if (!req.decision || req.decidedByRole === "System") return "";
    const name = req.decidedByName || roleName(req.decidedByRole);
    if (req.revokedAt) return t("revokedBy", { name, role: roleName(req.decidedByRole) });
    return t("decidedByRoleName", { name, role: roleName(req.decidedByRole) });
  };

  const isOpen = (req) => canDecide && UNDECIDED_STATUSES.includes(req.status);
  const isRevocable = (req) => canDecide && req.autoApproved && !req.revokedAt && req.status === "Approved";

  function openDialog(kind, req) {
    setViewingId(null);
    setRemarks("");
    setDialogError("");
    setDialog({ kind, id: req.id, name: req.name, hasStudentSignature: req.hasStudentSignature });
  }

  function closeDialog() {
    if (busy) return;
    setDialog(null);
    setRemarks("");
    setDialogError("");
  }

  async function saveMySignature(sig) {
    setSavingSignature(true);
    setDialogError("");
    try {
      const updated = await apiFetch("/auth/profile", { method: "PATCH", body: JSON.stringify({ signature: sig }) });
      const saved = updated.signature || sig;
      setOwnSignature(saved);
      onSignatureSaved(saved);
    } catch (err) {
      setDialogError(err?.message || "Couldn't save your signature. Please try again.");
    } finally {
      setSavingSignature(false);
    }
  }

  // { id, kind: 'approve' | 'reject' } while a one-tap decision is in flight.
  const [acting, setActing] = useState(null);

  async function decideNow(kind, req) {
    setViewingId(null);
    setActing({ id: req.id, kind });
    try {
      if (kind === "approve") await desk.approve(req.id);
      else await desk.reject(req.id);
    } catch (err) {
      if (kind === "approve" && isSignatureRequiredError(err)) {
        // No saved signature yet: fall back to the dialog, which captures one.
        setOwnSignature(null);
        openDialog("approve", req);
      } else {
        // Someone else decided it first, or it expired: the message says which.
        setError(err?.message || "That didn't go through. Please try again.");
      }
    } finally {
      setActing(null);
    }
  }

  async function confirmDialog() {
    if (!dialog) return;
    const trimmed = remarks.trim();
    if (dialog.kind === "revoke" && !trimmed) return;
    setBusy(true);
    setDialogError("");
    try {
      if (dialog.kind === "approve") await desk.approve(dialog.id);
      else await desk.revoke(dialog.id, trimmed);
      setDialog(null);
      setRemarks("");
    } catch (err) {
      // A missing signature keeps the dialog open so the capture below can fix it in place.
      if (isSignatureRequiredError(err)) {
        setOwnSignature(null);
        setDialogError(err?.message || "Add your signature before approving.");
      } else {
        // Someone else decided it first, it expired, or he already left: the message says
        // which, and the reload already moved the row.
        setError(err?.message || "That didn't go through. Please try again.");
        setDialog(null);
      }
    } finally {
      setBusy(false);
    }
  }

  const renderCard = (req, i) => {
    const badge = statusBadge(req);
    const BadgeIcon = badge.icon;
    const decidedBy = decidedByLabel(req);
    const open = isOpen(req);
    const departure = formatDepartureTime(req.expectedDepartureTime);

    return (
      <div
        key={req.id}
        onPointerMove={open ? handleTilePointerMove : undefined}
        onPointerLeave={open ? handleTilePointerLeave : undefined}
        style={{
          animationDelay: `${0.08 + i * 0.06}s`,
          ...(open
            ? {
                "--tint": req.isEmergency
                  ? "linear-gradient(160deg, rgba(244,63,94,0.16) 0%, rgba(251,146,60,0.08) 100%)"
                  : "linear-gradient(160deg, rgba(139,92,246,0.14) 0%, rgba(217,70,239,0.08) 100%)",
                "--glow": req.isEmergency ? "rgba(244,63,94,0.45)" : "rgba(139,92,246,0.45)",
                "--tile-border": req.isEmergency ? "rgba(251,113,133,0.6)" : "rgba(196,132,252,0.5)",
              }
            : {}),
        }}
        className={open ? "sd-tile sd-luxe-rise" : "sd-luxe-rise rounded-3xl border border-slate-200 bg-white/70 p-4"}
      >
        <div className={open ? "sd-tile__inner p-4" : ""}>
          {open && <span className="sd-tile__glare" aria-hidden="true" />}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-white bg-linear-to-br ${
                  open ? "from-violet-500 to-fuchsia-400" : "from-slate-400 to-slate-500"
                }`}
              >
                {req.initials}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingId(req.id)}
                    className="sd-card-title text-base text-slate-900 underline decoration-slate-300 decoration-dotted underline-offset-4 transition-colors hover:text-violet-700 hover:decoration-violet-400"
                  >
                    {req.name}
                  </button>
                  {req.isEmergency && (
                    <span
                      title={t("emergencyHint")}
                      className="inline-flex items-center gap-1 rounded-full bg-rose-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white"
                    >
                      <Siren className="h-3 w-3" /> {t("emergency")}
                    </span>
                  )}
                  {open && !req.isEmergency && isActingSoon(req.leaveDate) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                      <AlertTriangle className="h-3 w-3" /> {t("actingSoon")}
                    </span>
                  )}
                </div>
                <p className="sd-micro mt-0.5">
                  {req.room}
                  {req.roll ? <> • <span className="font-mono">{req.roll}</span></> : null}
                </p>
                <p className="sd-micro mt-1.5 flex items-center gap-1.5 text-slate-500">
                  <MapPin className="h-3.5 w-3.5" /> {t("destination")} {req.destination}
                </p>
                <p className="mt-1.5 line-clamp-2 text-sm text-slate-600">{req.reason}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewingId(req.id)}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 transition-colors hover:text-violet-800"
                  >
                    <FileText className="h-3.5 w-3.5" /> {t("viewFullApplication")}
                  </button>
                  <LeaveTicketButton id={req.id} ticketMime={req.ticketMime} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" /> {t("departure")} {formatDate(req.leaveDate)}
                    {departure ? ` · ${t("around")} ${departure}` : ""}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" /> {t("returnLabel")} {formatDate(req.returnDate)}
                  </span>
                  {req.parentPhone && (
                    <a href={`tel:${req.parentPhone}`} className="flex items-center gap-1.5 font-semibold text-violet-700 hover:underline">
                      <Phone className="h-3.5 w-3.5" /> {t("parentPhone")} {req.parentPhone}
                    </a>
                  )}
                  <span className="sd-luxe-chip rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 font-semibold text-violet-700">
                    {t("duration")} {getDurationLabel(req.leaveDate, req.returnDate)}
                  </span>
                </div>
                {req.decision === "Rejected" && req.remarks && (
                  <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                    {t("rejectionReason")} {req.remarks}
                  </p>
                )}
                {/* The verdict stands, but the pass never got used as decided. */}
                {req.lapsed && (
                  <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                    <AlertTriangle className="h-3 w-3" />
                    {req.lapsed === "Cancelled" ? t("cancelledByStudent") : t("expiredUnused")}
                  </p>
                )}
                {decidedBy && <p className="sd-micro mt-1.5 text-slate-400">{decidedBy}</p>}
              </div>
            </div>

            {open ? (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0 sm:flex-col">
                <button
                  onClick={() => decideNow("approve", req)}
                  disabled={acting?.id === req.id}
                  className="flex items-center justify-center gap-1.5 rounded-2xl bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 px-2.5 py-2.5 text-sm font-bold text-white shadow disabled:opacity-60 sm:gap-2 sm:px-4 sm:py-2"
                >
                  {acting?.id === req.id && acting.kind === "approve" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Check className="h-4 w-4 shrink-0" />}
                  {tc("approve")}
                </button>
                <button
                  onClick={() => decideNow("reject", req)}
                  disabled={acting?.id === req.id}
                  className="flex items-center justify-center gap-1.5 rounded-2xl border border-rose-300 px-2.5 py-2.5 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60 sm:gap-2 sm:px-4 sm:py-2"
                >
                  {acting?.id === req.id && acting.kind === "reject" ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <X className="h-4 w-4 shrink-0" />}
                  {tc("reject")}
                </button>
              </div>
            ) : (
              <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${badge.tone}`}>
                  <BadgeIcon className="h-3.5 w-3.5" /> {badge.label}
                </span>
                {isRevocable(req) && (
                  <button
                    onClick={() => openDialog("revoke", req)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <Ban className="h-3.5 w-3.5" /> {t("revoke")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const emptyState =
    tab === "pending"
      ? { title: t("noPendingLeave"), hint: t("noLeaveYet") }
      : tab === "boys"
      ? { title: t("noBoysLeave"), hint: t("noBoysLeaveHint") }
      : { title: t("noHistoryYet"), hint: "" };

  const viewingBadge = viewing ? statusBadge(viewing) : null;
  const viewingDeparture = viewing ? formatDepartureTime(viewing.expectedDepartureTime) : "";

  return (
    <>
      <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 shadow-xl sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="sd-kicker">{t("leaveApplications")}</p>
            <h2 className="sd-title sd-title-sm">{t("manageLeave")}</h2>
          </div>
          <button
            onClick={reload}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
          >
            <RefreshCcw className="h-4 w-4" /> {tc("refresh")}
          </button>
        </div>

        <p className="sd-micro mt-2 flex items-start gap-1.5 text-slate-500">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-500" />
          {!canDecide
            ? t("adminLeaveNote")
            : scope === "Male"
            ? t("boysScopeNote")
            : scope === "Female"
            ? t("girlsScopeNote")
            : t("sharedQueueNote")}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
                tab === tb.key
                  ? "bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-white shadow"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tb.label}
              <span
                className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                  tab === tb.key ? "bg-white/25 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {tb.count}
              </span>
            </button>
          ))}
        </div>

        <label className="mt-4 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchLeave")}
            className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
        </label>

        {error && (
          <p className="mt-4 flex items-start justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">
            {error}
            <button onClick={() => setError("")} className="shrink-0 text-rose-400 hover:text-rose-600">
              <X className="h-4 w-4" />
            </button>
          </p>
        )}

        <div className="mt-6 space-y-3">
          {tabLoading && visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <p className="text-sm font-semibold">{t("loadingLeave")}</p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-500">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <CalendarDays className="h-7 w-7 text-slate-400" />
              </div>
              <p className="font-semibold text-slate-700">{emptyState.title}</p>
              {emptyState.hint && <p className="max-w-sm text-sm text-slate-500">{emptyState.hint}</p>}
            </div>
          ) : (
            visible.map(renderCard)
          )}
        </div>
      </section>

      {/* Portaled to <body>: transformed ancestors trap `fixed` children, letting the z-50 nav paint over the drawer */}
      {viewing && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-70 overflow-y-auto">
          <div onClick={() => setViewingId(null)} className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <aside className="sd-luxe-panel sd-glow-border sd-enter relative ml-auto min-h-full w-full max-w-lg rounded-l-[2.25rem] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="sd-title sd-title-sm">{t("fullApplication")}</h3>
              <button
                onClick={() => setViewingId(null)}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {viewing.isEmergency && (
              <div className="mb-4 flex items-start gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                <Siren className="mt-0.5 h-4 w-4 shrink-0" /> {t("emergencyHint")}
              </div>
            )}

            <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
              <div className="sf-letter-paper">
                <p>To,</p>
                <p>The Warden,</p>
                <p>{viewing.hostelName || "Hostel Administration"}</p>
                <p className="mt-4 font-bold">Subject: Application for Leave — {viewing.destination}</p>
                <p className="mt-4">Respected Sir/Madam,</p>
                <p className="mt-3">
                  I, <strong>{viewing.name}</strong>
                  {viewing.roomNumber ? <>, a resident of Room {viewing.roomNumber}{viewing.hostelName ? `, ${viewing.hostelName}` : ""}</> : null}
                  {viewing.roll ? <>, Roll No. {viewing.roll}</> : null}, would like to request leave to visit{" "}
                  <strong>{viewing.destination}</strong> from <strong>{formatLetterDate(viewing.leaveDate)}</strong> to{" "}
                  <strong>{formatLetterDate(viewing.returnDate)}</strong>.
                  {viewingDeparture && <> I expect to leave at around <strong>{viewingDeparture}</strong> on the leave date.</>}
                </p>
                <p className="mt-3">
                  <strong>Reason:</strong> {viewing.reason}
                </p>
                {viewing.parentPhone && (
                  <p className="mt-3">
                    My parent can be reached at <strong>{viewing.parentPhone}</strong> during this leave.
                  </p>
                )}
                <p className="mt-3">
                  I hereby acknowledge that the college/hostel administration shall not be responsible for my
                  safety, whereabouts, or well-being during this leave period, and that I am undertaking this
                  journey at my own responsibility.
                </p>
                <p className="mt-5">Yours sincerely,</p>
                {viewing.hasStudentSignature &&
                  (viewingSignatures?.studentSignature ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={viewingSignatures.studentSignature} alt="Student signature" className="mt-1 h-14 w-auto" />
                  ) : (
                    <div className="mt-1 h-14 w-32 animate-pulse rounded bg-slate-100" />
                  ))}
                <p className="mt-1 font-bold">{viewing.name}</p>
                {viewing.roll && <p>{viewing.roll}</p>}
                <p>{formatLetterDate(viewing.submittedAt)}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs font-semibold text-slate-500">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> {t("duration")} {getDurationLabel(viewing.leaveDate, viewing.returnDate)}
              </span>
              {viewing.parentPhone && (
                <a href={`tel:${viewing.parentPhone}`} className="flex items-center gap-1.5 text-violet-700 hover:underline">
                  <Phone className="h-3.5 w-3.5" /> {t("callParent")} {viewing.parentPhone}
                </a>
              )}
              <LeaveTicketButton id={viewing.id} ticketMime={viewing.ticketMime} />
              {viewing.routedTo && <span>{t("routedTo", { name: viewing.routedTo })}</span>}
            </div>

            {isOpen(viewing) ? (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => decideNow("approve", viewing)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 px-4 py-2.5 font-bold text-white shadow"
                >
                  <Check className="h-4 w-4" /> {tc("approve")}
                </button>
                <button
                  onClick={() => decideNow("reject", viewing)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-rose-300 px-4 py-2.5 font-bold text-rose-600 transition-colors hover:bg-rose-50"
                >
                  <X className="h-4 w-4" /> {tc("reject")}
                </button>
              </div>
            ) : (
              <div className="mt-6">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${viewingBadge.tone}`}>
                  <viewingBadge.icon className="h-3.5 w-3.5" /> {viewingBadge.label}
                </span>
                {viewing.lapsed && (
                  <span className="ml-2 inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                    <AlertTriangle className="h-3 w-3" />
                    {viewing.lapsed === "Cancelled" ? t("cancelledByStudent") : t("expiredUnused")}
                  </span>
                )}
                {viewing.decision === "Rejected" && viewing.remarks && (
                  <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
                    {t("rejectionReason")} {viewing.remarks}
                  </p>
                )}
                {decidedByLabel(viewing) && <p className="sd-micro mt-2 text-slate-400">{decidedByLabel(viewing)}</p>}

                {viewing.decision === "Approved" && (viewing.hasWardenSignature || viewing.hasCaretakerSignature) && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                      {t("signedBy", { role: roleName(viewing.decidedByRole) })}
                    </p>
                    {(viewing.hasWardenSignature ? viewingSignatures?.wardenSignature : viewingSignatures?.caretakerSignature) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={viewing.hasWardenSignature ? viewingSignatures.wardenSignature : viewingSignatures.caretakerSignature}
                        alt="Approver signature"
                        className="mt-1.5 h-14 w-auto rounded-lg border border-slate-200 bg-white p-1"
                      />
                    ) : (
                      <div className="mt-1.5 h-14 w-32 animate-pulse rounded-lg border border-slate-200 bg-slate-50" />
                    )}
                  </div>
                )}

                {isRevocable(viewing) && (
                  <button
                    onClick={() => openDialog("revoke", viewing)}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-300 px-4 py-2.5 font-bold text-rose-600 transition-colors hover:bg-rose-50"
                  >
                    <Ban className="h-4 w-4" /> {t("revokeLeave")}
                  </button>
                )}
              </div>
            )}
          </aside>
        </div>,
        document.body
      )}

      {dialog && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
          <button type="button" aria-label={tc("cancel")} onClick={closeDialog} className="absolute inset-0" />
          <div className="sd-enter relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <p className="sd-kicker">{t("leaveApplications")}</p>
                <h3 className="sd-title sd-title-sm mt-0.5">
                  {dialog.kind === "approve" ? tc("approve") : t("revokeLeave")}
                  {dialog.name ? ` — ${dialog.name}` : ""}
                </h3>
              </div>
              <button
                onClick={closeDialog}
                disabled={busy}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {dialog.kind === "approve" ? (
              <>
                <p className="mt-4 text-sm text-slate-600">
                  {signature
                    ? "Your saved signature will be attached to this leave application."
                    : "Add your signature once — it will be attached to every application you approve from now on."}
                </p>

                {dialog.hasStudentSignature && (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Student signature</p>
                    {dialogSignatures?.studentSignature ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={dialogSignatures.studentSignature}
                        alt="Student signature"
                        className="mt-1.5 h-14 w-auto rounded-lg border border-slate-200 bg-white p-1"
                      />
                    ) : dialogSignatureError ? (
                      <p className="mt-1.5 text-xs font-semibold text-amber-600">
                        Could not load the student&rsquo;s signature. Reopen this dialog to retry.
                      </p>
                    ) : (
                      <div className="mt-1.5 h-14 w-32 animate-pulse rounded-lg border border-slate-200 bg-white" />
                    )}
                  </div>
                )}

                {signature ? (
                  <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Your signature</p>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400">
                        <Lock className="h-3 w-3" /> Locked
                      </span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={signature} alt="Your signature" className="mt-1.5 h-14 w-auto rounded-lg border border-slate-200 bg-white p-1" />
                  </div>
                ) : (
                  // Fallback capture: an approver with no saved signature is never hard-blocked;
                  // they set it up here and the approval continues in the same dialog.
                  <div className="mt-4">
                    <SignatureCapture
                      currentSignature={null}
                      onSave={saveMySignature}
                      saving={savingSignature}
                      error={dialogError}
                      disabled={busy}
                      saveLabel="Save signature"
                    />
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-sm font-medium text-rose-800">
                  {t("revokeHint")}
                </p>
                <label className="mt-4 block text-sm font-semibold text-rose-700">
                  {t("reasonForRevoke")}
                </label>
                <textarea
                  autoFocus
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  rows={3}
                  maxLength={500}
                  className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  placeholder={t("reasonForRevoke")}
                />
              </>
            )}

            {dialogError && (dialog.kind !== "approve" || signature) && (
              <p className="mt-2 text-xs font-semibold text-rose-600">{dialogError}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={closeDialog}
                disabled={busy}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                {tc("cancel")}
              </button>
              <button
                onClick={confirmDialog}
                disabled={busy || (dialog.kind === "approve" ? !signature : !remarks.trim())}
                className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  dialog.kind === "approve"
                    ? "bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500"
                    : "bg-linear-to-r from-rose-600 to-orange-500"
                }`}
              >
                {dialog.kind === "approve" ? <Check className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                {busy
                  ? tc("loading")
                  : dialog.kind === "approve"
                  ? tc("approve")
                  : t("confirmRevoke")}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
