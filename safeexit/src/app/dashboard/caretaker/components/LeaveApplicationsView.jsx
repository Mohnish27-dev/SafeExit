"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, X, CalendarDays, Loader2, RefreshCcw, MapPin, Clock3, AlertTriangle, FileText, CheckCircle2, XCircle } from "lucide-react";
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
  loading = false,
  loadingHistory = false,
  error = "",
  onRefresh = () => {},
}) {
  const { t } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");
  const [rejectingId, setRejectingId] = useState(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [viewingId, setViewingId] = useState(null);
  const [tab, setTab] = useState("pending");

  // Viewer can open from any tab, so search both lists.
  const viewing = [...pending, ...history].find((r) => r.id === viewingId) || null;

  const historyFor = (status) => history.filter((r) => r.status === status);

  const tabs = [
    { key: "pending", label: t("pendingTab"), count: pending.length },
    { key: "approved", label: t("approvedTab"), count: historyFor("Approved").length },
    { key: "rejected", label: t("rejectedTab"), count: historyFor("Rejected").length },
  ];

  const historyList = tab === "approved" ? historyFor("Approved") : tab === "rejected" ? historyFor("Rejected") : [];

  const statusBadge = (status) =>
    status === "Approved"
      ? { label: tc("approved"), tone: "bg-emerald-100 text-emerald-700", icon: CheckCircle2 }
      : { label: tc("rejected"), tone: "bg-rose-100 text-rose-700", icon: XCircle };

  function closeViewer() {
    if (rejectingId === viewingId) cancelReject();
    setViewingId(null);
  }

  function startReject(id) {
    setRejectingId(id);
    setReason("");
    setReasonError("");
  }

  function cancelReject() {
    setRejectingId(null);
    setReason("");
    setReasonError("");
  }

  function confirmReject(id) {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError(t("rejectionRequired"));
      return;
    }
    rejectLeave(id, trimmed);
    setRejectingId(null);
    setReason("");
    setReasonError("");
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
                <div className="flex items-start justify-between gap-3">
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
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        onClick={() => approveLeave(req.id)}
                        onPointerMove={handleMagneticMove}
                        onPointerLeave={handleMagneticLeave}
                        className="sd-magnetic flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-white font-bold shadow"
                      >
                        <Check className="h-4 w-4" /> {tc("approve")}
                      </button>
                      <button
                        onClick={() => startReject(req.id)}
                        className="flex items-center gap-2 rounded-2xl px-4 py-2 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors"
                      >
                        <X className="h-4 w-4" /> {tc("reject")}
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
                      onChange={(e) => {
                        setReason(e.target.value);
                        if (reasonError) setReasonError("");
                      }}
                      rows={2}
                      className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
                      placeholder={t("reasonForRejection")}
                    />
                    {reasonError && <p className="mt-1.5 text-xs font-semibold text-rose-600">{reasonError}</p>}
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
            const badge = statusBadge(req.status);
            const BadgeIcon = badge.icon;
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
                      {req.status === "Rejected" && req.remarks && (
                        <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                          {t("rejectionReason")} {req.remarks}
                        </p>
                      )}
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
                <p>The Caretaker,</p>
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

            {/* Decided applications are read-only */}
            {viewing.status ? (
              <div className="mt-6">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${statusBadge(viewing.status).tone}`}>
                  {(() => { const I = statusBadge(viewing.status).icon; return <I className="h-3.5 w-3.5" />; })()}
                  {statusBadge(viewing.status).label}
                </span>
                {viewing.status === "Rejected" && viewing.remarks && (
                  <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-600">
                    {t("rejectionReason")} {viewing.remarks}
                  </p>
                )}
                {viewing.status === "Approved" && viewing.caretakerSignature && (
                  <div className="mt-3">
                    <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Signed by caretaker</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={viewing.caretakerSignature}
                      alt="Caretaker signature"
                      className="mt-1.5 h-14 w-auto rounded-lg border border-slate-200 bg-white p-1"
                    />
                  </div>
                )}
              </div>
            ) : rejectingId !== viewing.id ? (
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => approveLeave(viewing.id)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-white font-bold shadow"
                >
                  <Check className="h-4 w-4" /> {tc("approve")}
                </button>
                <button
                  onClick={() => startReject(viewing.id)}
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
                  onChange={(e) => {
                    setReason(e.target.value);
                    if (reasonError) setReasonError("");
                  }}
                  rows={2}
                  className="mt-2 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-300"
                  placeholder={t("reasonForRejection")}
                />
                {reasonError && <p className="mt-1.5 text-xs font-semibold text-rose-600">{reasonError}</p>}
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
    </>
  );
}
