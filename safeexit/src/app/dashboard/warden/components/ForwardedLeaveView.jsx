"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Check, X, CalendarDays, History, Loader2, RefreshCcw, ArrowUpRight, MapPin, FileText } from "lucide-react";
import DecisionHistoryList from "./DecisionHistoryList";

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-US", { day: "2-digit", month: "short" }) : "—";

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

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
  value ? new Date(value).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const getDurationLabel = (leaveDate, returnDate) => {
  const ms = new Date(returnDate).getTime() - new Date(leaveDate).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const hours = Math.round((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  if (days === 0) return `${hours}h`;
  if (hours === 0) return `${days}d`;
  return `${days}d ${hours}h`;
};

// Warden action queue for leave applications a caretaker escalated (status 'Forwarded'),
// with a History tab holding this hostel's decided leave applications.
// Reject requires remarks server-side; the parent captures them before calling reject().
export default function ForwardedLeaveView({
  pending = [],
  history = [],
  approve = () => {},
  reject = () => {},
  loading = false,
  loadingHistory = false,
  error = "",
  onRefresh = () => {},
  onRefreshHistory = () => {},
}) {
  const [tab, setTab] = useState("pending");
  const [viewingId, setViewingId] = useState(null);
  const viewing = pending.find((r) => r.id === viewingId) || null;

  const closeViewer = () => setViewingId(null);

  const tabs = [
    { key: "pending", label: "Pending", count: pending.length, icon: CalendarDays },
    { key: "history", label: "History", count: history.length, icon: History },
  ];

  return (
    <>
    <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="sd-kicker">Escalated to you</p>
          <h2 className="sd-title sd-title-sm">Forwarded Leave Applications</h2>
        </div>
        <button
          onClick={tab === "history" ? onRefreshHistory : onRefresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${
              tab === tb.key
                ? "bg-linear-to-r from-violet-600 via-violet-500 to-fuchsia-500 text-white shadow"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <tb.icon className="h-4 w-4" />
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

      {tab === "history" ? (
        <div className="mt-6">
          <DecisionHistoryList list={history} kind="leave" loading={loadingHistory} />
        </div>
      ) : (
      <>
      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            <p className="text-sm font-semibold">Loading forwarded applications…</p>
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <CalendarDays className="h-7 w-7 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700">Nothing awaiting your decision</p>
            <p className="text-sm text-slate-500">When a caretaker escalates a leave application, it lands here.</p>
          </div>
        ) : (
          pending.map((req, i) => (
            <div
              key={req.id}
              className="sd-luxe-card sd-luxe-rise rounded-2xl px-4 py-4"
              style={{ animationDelay: `${0.08 + i * 0.06}s` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-11 w-11 shrink-0 rounded-full bg-linear-to-br from-violet-500 to-fuchsia-400 flex items-center justify-center text-white font-bold">{req.initials}</div>
                  <div className="min-w-0">
                    <p className="sd-card-title text-slate-900 text-base">{req.name}</p>
                    <p className="sd-micro mt-0.5">{req.room}{req.roll ? <> • <span className="font-mono">{req.roll}</span></> : null}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {req.destination || "—"}</span>
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" /> {formatDate(req.leaveDate)} → {formatDate(req.returnDate)}</span>
                    </div>
                    {req.reason ? <p className="mt-1 text-xs text-slate-500"><span className="font-semibold">Reason:</span> {req.reason}</p> : null}
                    <button
                      type="button"
                      onClick={() => setViewingId(req.id)}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800 transition-colors"
                    >
                      <FileText className="h-3.5 w-3.5" /> View full application
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => approve(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-white font-bold shadow hover:-translate-y-0.5 transition-transform">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button onClick={() => reject(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors">
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>

              {(req.forwardedBy || req.forwardedNote) && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-violet-50/70 px-3 py-2 text-xs text-violet-800">
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p className="min-w-0">
                    {req.forwardedBy ? <span className="font-semibold">{req.forwardedBy}</span> : "A caretaker"} forwarded this
                    {req.forwardedNote ? <> — “{req.forwardedNote}”</> : "."}
                    {req.submittedAt ? <span className="text-violet-500"> • filed {formatDateTime(req.submittedAt)}</span> : null}
                  </p>
                </div>
              )}
            </div>
          ))
        )}
      </div>
      </>
      )}
    </section>

    {/* Portaled to <body>: transformed ancestors trap `fixed` children, letting the z-50 nav paint over the modal */}
    {viewing && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-70 overflow-y-auto">
          <div onClick={closeViewer} className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <aside className="sd-luxe-panel sd-glow-border sd-enter relative ml-auto min-h-full w-full max-w-lg rounded-l-[2.25rem] p-5 pb-[max(2rem,env(safe-area-inset-bottom))] sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="sd-title sd-title-sm">Full Leave Application</h3>
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
              Duration: {getDurationLabel(viewing.leaveDate, viewing.returnDate)}
            </div>

            {(viewing.forwardedBy || viewing.forwardedNote) && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-violet-50/70 px-3 py-2 text-xs text-violet-800">
                <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p className="min-w-0">
                  {viewing.forwardedBy ? <span className="font-semibold">{viewing.forwardedBy}</span> : "A caretaker"} forwarded this
                  {viewing.forwardedNote ? <> — “{viewing.forwardedNote}”</> : "."}
                </p>
              </div>
            )}

            {/* Reject collects its reason in the page-level modal, so close this one first. */}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { const id = viewing.id; closeViewer(); approve(id); }}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-white font-bold shadow"
              >
                <Check className="h-4 w-4" /> Approve
              </button>
              <button
                onClick={() => { const id = viewing.id; closeViewer(); reject(id); }}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl px-4 py-2.5 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors"
              >
                <X className="h-4 w-4" /> Reject
              </button>
            </div>
          </aside>
        </div>,
        document.body
    )}
    </>
  );
}
