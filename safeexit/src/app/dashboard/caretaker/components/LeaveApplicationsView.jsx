"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, X, CalendarDays, Loader2, RefreshCcw, MapPin, Clock3, AlertTriangle, FileText, CheckCircle2, XCircle, ArrowUpRight } from "lucide-react";
import { useTranslation } from "@/app/lib/i18n";

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

const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

// Return is a date only — no time is collected.
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-US", { day: "2-digit", month: "short" })
    : "—";

// With year: the letter view needs an unambiguous formal date.
const formatLetterDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const formatLetterDate = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

const getDurationLabel = (leaveDate, returnDate) => {
  const ms = new Date(returnDate).getTime() - new Date(leaveDate).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.round((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days === 0) return `${hours}h`;
  if (hours === 0) return `${days}d`;
  return `${days}d ${hours}h`;
};

const isActingSoon = (leaveDate) => {
  const ms = new Date(leaveDate).getTime() - Date.now();
  return ms > 0 && ms < 24 * 60 * 60 * 1000;
};

export default function LeaveApplicationsView({
  pending = [],
  history = [],
  approveLeave = () => {},
  rejectLeave = () => {},
  forwardLeave = () => {},
  loading = false,
  loadingHistory = false,
  error = "",
  onRefresh = () => {},
}) {
  const { t } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectingFromViewer, setRejectingFromViewer] = useState(false);
  const [reason, setReason] = useState("");
  const [viewingId, setViewingId] = useState(null);
  const [tab, setTab] = useState("pending");

  // Viewer can open from any tab, so search both lists.
  const viewing = [...pending, ...history].find((r) => r.id === viewingId) || null;

  // Tabs key off the frozen `decision`, not `status` — a pass the student cancelled after
  // approval keeps its Approved verdict and stays in that tab.
  const historyFor = (decision) => history.filter((r) => r.decision === decision);
  const forwardedList = history.filter((r) => r.status === "Forwarded" && !r.decision);

  const tabs = [
    { key: "pending", label: t("pendingTab"), count: pending.length },
    { key: "forwarded", label: t("forwardedTab"), count: forwardedList.length },
    { key: "approved", label: t("approvedTab"), count: historyFor("Approved").length },
    { key: "rejected", label: t("rejectedTab"), count: historyFor("Rejected").length },
  ];

  const historyList =
    tab === "approved" ? historyFor("Approved")
    : tab === "rejected" ? historyFor("Rejected")
    : tab === "forwarded" ? forwardedList
    : [];

  const statusBadge = (decision) =>
    decision === "Approved"
      ? { label: tc("approved"), tone: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      : decision === "Rejected"
      ? { label: tc("rejected"), tone: "bg-rose-100 text-rose-700", icon: XCircle }
      : { label: t("awaitingWarden"), tone: "bg-teal-100 text-teal-700", icon: ArrowUpRight };

  // Who signed it off — only worth showing once a verdict exists.
  const decidedByLabel = (req) => {
    if (!req.decision) return "";
    if (req.decidedByRole === "Warden") return t("decidedByWarden", { name: req.decidedByName });
    if (req.decidedByName) return t("decidedBy", { name: req.decidedByName });
    return "";
  };

  function closeViewer() {
    if (rejectingId === viewingId) cancelReject();
    setViewingId(null);
  }

  function startReject(id, fromViewer = false) {
    setRejectingId(id);
    setRejectingFromViewer(fromViewer);
    setReason("");
    if (fromViewer) setViewingId(null);
  }

  function cancelReject() {
    setRejectingId(null);
    setRejectingFromViewer(false);
    setReason("");
  }

  function confirmReject(id) {
    const trimmed = reason.trim();
    // If the decision came from the full-application drawer, dismiss that
    // overlay before the request is removed from the pending list.
    setViewingId(null);
    rejectLeave(id, trimmed);
    setRejectingId(null);
    setRejectingFromViewer(false);
    setReason("");
  }

  return (
    <>
    <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="sd-kicker">{t("leaveApplications")}</p>
          <h2 className="sd-title sd-title-sm">{t("manageLeave")}</h2>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" /> {tc("refresh")}
        </button>
      </div>

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

      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>
      )}

      <div className="mt-6 space-y-3">
        {tab === "pending" ? (
          loading ? (
            <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
              <p className="text-sm font-semibold">{t("loadingLeave")}</p>
            </div>
          ) : pending.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                <CalendarDays className="h-7 w-7 text-slate-400" />
              </div>
              <p className="font-semibold text-slate-700">{t("noPendingLeave")}</p>
              <p className="text-sm text-slate-500">{t("noLeaveYet")}</p>
            </div>
          ) : (
            pending.map((req, i) => (
            <div
              key={req.id}
              onPointerMove={handleTilePointerMove}
              onPointerLeave={handleTilePointerLeave}
              style={{
                animationDelay: `${0.08 + i * 0.06}s`,
                "--tint": "linear-gradient(160deg, rgba(139,92,246,0.14) 0%, rgba(217,70,239,0.08) 100%)",
                "--glow": "rgba(139,92,246,0.45)",
                "--tile-border": "rgba(196,132,252,0.5)",
              }}
              className="sd-tile sd-luxe-rise"
            >
              <div className="sd-tile__inner p-4">
                <span className="sd-tile__glare" aria-hidden="true" />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-linear-to-br from-violet-500 to-fuchsia-400 flex items-center justify-center text-white font-bold">
                      {req.initials}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingId(req.id)}
                          className="sd-card-title text-slate-900 text-base underline decoration-dotted decoration-slate-300 underline-offset-4 hover:text-violet-700 hover:decoration-violet-400 transition-colors"
                        >
                          {req.name}
                        </button>
                        {isActingSoon(req.leaveDate) && (
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
                      <p className="mt-1.5 text-sm text-slate-600 line-clamp-2">{req.reason}</p>
                      <button
                        type="button"
                        onClick={() => setViewingId(req.id)}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" /> {t("viewFullApplication")}
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {t("departure")} {formatDateTime(req.leaveDate)}</span>
                        <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {t("returnLabel")} {formatDate(req.returnDate)}</span>
                        <span className="sd-luxe-chip rounded-full px-2.5 py-0.5 font-semibold text-violet-700 bg-violet-50 border border-violet-200">
                          {t("duration")} {getDurationLabel(req.leaveDate, req.returnDate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {rejectingId !== req.id && (
                    <div className="grid grid-cols-3 gap-2 sm:flex sm:shrink-0 sm:flex-col">
                      <button
                        onClick={() => approveLeave(req.id)}
                        onPointerMove={handleMagneticMove}
                        onPointerLeave={handleMagneticLeave}
                        className="sd-magnetic flex items-center justify-center gap-1.5 rounded-2xl px-2.5 py-2.5 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-sm text-white font-bold shadow sm:gap-2 sm:px-4 sm:py-2"
                      >
                        <Check className="h-4 w-4 shrink-0" /> {tc("approve")}
                      </button>
                      <button
                        onClick={() => startReject(req.id)}
                        className="flex items-center justify-center gap-1.5 rounded-2xl px-2.5 py-2.5 border border-rose-300 text-sm text-rose-600 font-bold hover:bg-rose-50 transition-colors sm:gap-2 sm:px-4 sm:py-2"
                      >
                        <X className="h-4 w-4 shrink-0" /> {tc("reject")}
                      </button>
                      <button
                        onClick={() => forwardLeave(req.id)}
                        title={t("forwardToWarden")}
                        className="flex items-center justify-center gap-1.5 rounded-2xl px-2.5 py-2.5 border border-teal-300 text-sm text-teal-700 font-bold hover:bg-teal-50 transition-colors sm:gap-2 sm:px-4 sm:py-2"
                      >
                        <ArrowUpRight className="h-4 w-4 shrink-0" /> {t("forward")}
                      </button>
                    </div>
                  )}
                </div>

                {rejectingId === req.id && (
                  <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                    <label className="text-sm font-semibold text-rose-700">{t("reasonForRejection")}</label>
                    <textarea
                      autoFocus
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={2}
                      className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
                      placeholder={t("reasonForRejection")}
                    />
                    <div className="mt-3 flex items-center gap-2">
                      <button
                        onClick={() => confirmReject(req.id)}
                        className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 transition-colors"
                      >
                        {t("confirmRejection")}
                      </button>
                      <button
                        onClick={cancelReject}
                        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                      >
                        {tc("cancel")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )
        ) : loadingHistory ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            <p className="text-sm font-semibold">{t("loadingLeave")}</p>
          </div>
        ) : historyList.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <CalendarDays className="h-7 w-7 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700">{t("noHistoryYet")}</p>
          </div>
        ) : (
          historyList.map((req, i) => {
            const badge = statusBadge(req.decision);
            const BadgeIcon = badge.icon;
            const decidedBy = decidedByLabel(req);
            return (
              <div
                key={req.id}
                style={{ animationDelay: `${0.08 + i * 0.06}s` }}
                className="sd-luxe-rise rounded-3xl border border-slate-200 bg-white/70 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-10 w-10 shrink-0 rounded-full bg-linear-to-br from-slate-400 to-slate-500 flex items-center justify-center text-white font-bold">
                      {req.initials}
                    </div>
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setViewingId(req.id)}
                        className="sd-card-title text-slate-900 text-base underline decoration-dotted decoration-slate-300 underline-offset-4 hover:text-violet-700 hover:decoration-violet-400 transition-colors"
                      >
                        {req.name}
                      </button>
                      <p className="sd-micro mt-0.5">
                        {req.room}
                        {req.roll ? <> • <span className="font-mono">{req.roll}</span></> : null}
                      </p>
                      <p className="sd-micro mt-1.5 flex items-center gap-1.5 text-slate-500">
                        <MapPin className="h-3.5 w-3.5" /> {t("destination")} {req.destination}
                      </p>
                      <p className="mt-1.5 text-sm text-slate-600 line-clamp-2">{req.reason}</p>
                      <button
                        type="button"
                        onClick={() => setViewingId(req.id)}
                        className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800 transition-colors"
                      >
                        <FileText className="h-3.5 w-3.5" /> {t("viewFullApplication")}
                      </button>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {t("departure")} {formatDateTime(req.leaveDate)}</span>
                        <span className="flex items-center gap-1.5"><Clock3 className="h-3.5 w-3.5" /> {t("returnLabel")} {formatDate(req.returnDate)}</span>
                        <span className="sd-luxe-chip rounded-full px-2.5 py-0.5 font-semibold text-violet-700 bg-violet-50 border border-violet-200">
                          {t("duration")} {getDurationLabel(req.leaveDate, req.returnDate)}
                        </span>
                      </div>
                      {req.decision === "Rejected" && req.remarks && (
                        <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                          {t("rejectionReason")} {req.remarks}
                        </p>
                      )}
                      {req.status === "Forwarded" && !req.decision && req.forwardedToName && (
                        <p className="mt-2 rounded-xl bg-teal-50 px-3 py-2 text-xs font-semibold text-teal-700">
                          {t("forwardedToName", { name: req.forwardedToName })}
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
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${badge.tone}`}>
                    <BadgeIcon className="h-3.5 w-3.5" /> {badge.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>

    {/* Portaled to <body>: transformed ancestors trap `fixed` children, letting the z-50 nav paint over the modal */}
    {viewing && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-70 overflow-y-auto">
          <div onClick={closeViewer} className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <aside className="sd-luxe-panel sd-glow-border sd-enter relative ml-auto min-h-full w-full max-w-lg rounded-l-[2.25rem] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="sd-title sd-title-sm">{t("fullApplication")}</h3>
              <button
                onClick={closeViewer}
                className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 hover:bg-slate-100 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

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
                  <strong>{viewing.destination}</strong> from <strong>{formatLetterDateTime(viewing.leaveDate)}</strong> to{" "}
                  <strong>{formatLetterDate(viewing.returnDate)}</strong>.
                </p>
                <p className="mt-3">
                  <strong>Reason:</strong> {viewing.reason}
                </p>
                <p className="mt-3">
                  I hereby acknowledge that the college/hostel administration shall not be responsible for my
                  safety, whereabouts, or well-being during this leave period, and that I am undertaking this
                  journey at my own responsibility.
                </p>
                <p className="mt-5">Yours sincerely,</p>
                {viewing.studentSignature && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={viewing.studentSignature}
                    alt="Student signature"
                    className="mt-1 h-14 w-auto"
                  />
                )}
                <p className="mt-1 font-bold">{viewing.name}</p>
                {viewing.roll && <p>{viewing.roll}</p>}
                <p>{formatLetterDate(viewing.submittedAt)}</p>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500">
              <CalendarDays className="h-3.5 w-3.5" />
              {t("duration")} {getDurationLabel(viewing.leaveDate, viewing.returnDate)}
            </div>

            {/* Anything already out of the caretaker's hands — decided or forwarded — is read-only */}
            {viewing.status ? (
              <div className="mt-6">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusBadge(viewing.decision).tone}`}>
                  {(() => { const I = statusBadge(viewing.decision).icon; return <I className="h-3.5 w-3.5" />; })()}
                  {statusBadge(viewing.decision).label}
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
                {decidedByLabel(viewing) && (
                  <p className="sd-micro mt-2 text-slate-400">{decidedByLabel(viewing)}</p>
                )}

                {viewing.decision === "Approved" && (viewing.wardenSignature || viewing.caretakerSignature) && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                      {viewing.wardenSignature ? t("signedByWarden") : t("signedByCaretaker")}
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={viewing.wardenSignature || viewing.caretakerSignature}
                      alt={viewing.wardenSignature ? "Warden signature" : "Caretaker signature"}
                      className="mt-1.5 h-14 w-auto rounded-lg border border-slate-200 bg-white p-1"
                    />
                  </div>
                )}
              </div>
            ) : rejectingId !== viewing.id ? (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => {
                    const id = viewing.id;
                    closeViewer();
                    approveLeave(id);
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-white font-bold shadow"
                >
                  <Check className="h-4 w-4" /> {tc("approve")}
                </button>
                <button
                  onClick={() => startReject(viewing.id, true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors"
                >
                  <X className="h-4 w-4" /> {tc("reject")}
                </button>
              </div>
            ) : null}

            {!viewing.status && rejectingId === viewing.id && (
              <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
                <label className="text-sm font-semibold text-rose-700">{t("reasonForRejection")}</label>
                <textarea
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  placeholder={t("reasonForRejection")}
                />
                <div className="mt-3 flex items-center gap-2">
                  <button
                    onClick={() => confirmReject(viewing.id)}
                    className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 transition-colors"
                  >
                    {t("confirmRejection")}
                  </button>
                  <button
                    onClick={cancelReject}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    {tc("cancel")}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>,
        document.body
    )}

    {/* Rejection from the full preview uses a separate dialog so the preview can
        close first, matching the approval/signature flow. */}
    {rejectingFromViewer && rejectingId && typeof document !== "undefined" && createPortal(
      <div className="fixed inset-0 z-70 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-md">
        <button
          type="button"
          aria-label={tc("cancel")}
          onClick={cancelReject}
          className="absolute inset-0"
        />
        <div className="sd-enter relative w-full max-w-md rounded-[2rem] bg-white p-5 shadow-2xl sm:p-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <p className="sd-kicker">{t("leaveApplications")}</p>
              <h3 className="sd-title sd-title-sm mt-0.5">{tc("reject")}</h3>
            </div>
            <button
              type="button"
              onClick={cancelReject}
              className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition-colors hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <label className="mt-4 block text-sm font-semibold text-rose-700">{t("reasonForRejection")}</label>
          <textarea
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            className="mt-2 w-full rounded-xl border border-rose-200 bg-rose-50/40 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
            placeholder={t("reasonForRejection")}
          />
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              onClick={cancelReject}
              className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
            >
              {tc("cancel")}
            </button>
            <button
              type="button"
              onClick={() => confirmReject(rejectingId)}
              className="flex-1 rounded-xl bg-linear-to-r from-rose-600 to-orange-500 py-3 text-sm font-bold text-white shadow-lg transition"
            >
              {t("confirmRejection")}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
