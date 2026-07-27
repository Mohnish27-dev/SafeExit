"use client";

import { History, Loader2, Check, X, MapPin, AlertTriangle } from "lucide-react";

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-US", { day: "2-digit", month: "short" }) : "—";

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

const DECISION_TONE = {
  Approved: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-rose-100 text-rose-700",
};

// Who signed it off. The caretaker's own calls show up here too, so the name matters.
const decidedByLabel = (req) => {
  if (!req.decidedByName) return "";
  return req.decidedByRole ? `${req.decidedByName} · ${req.decidedByRole}` : req.decidedByName;
};

// Read-only log of decided requests, embedded under the "History" tab of the Outings and
// Leave sections. Rows key off `decision`, the verdict frozen at decision time, so a later
// cancellation or expiry annotates the record instead of erasing it.
export default function DecisionHistoryList({ list = [], kind = "outing", loading = false }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
        <p className="text-sm font-semibold">Loading history…</p>
      </div>
    );
  }

  if (list.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
          <History className="h-7 w-7 text-slate-400" />
        </div>
        <p className="font-semibold text-slate-700">No decisions yet</p>
        <p className="text-sm text-slate-500">
          {kind === "leave"
            ? "Leave applications approved or rejected in your hostel — by you or your caretaker — will appear here."
            : "Outing requests approved or rejected in your hostel — by you or your caretaker — will appear here."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {list.map((req, i) => {
        const approved = req.decision === "Approved";
        const decidedBy = decidedByLabel(req);
        return (
          <div
            key={req.id}
            className="sd-row sd-luxe-rise flex-wrap"
            style={{ "--accent": approved ? "#10b981" : "#f43f5e", animationDelay: `${0.06 + i * 0.05}s` }}
          >
            <span className="sd-row__accent" aria-hidden="true" />
            <div className="flex items-center gap-3 min-w-0">
              <div className={`h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-white font-bold ${approved ? "bg-linear-to-br from-emerald-500 to-teal-400" : "bg-linear-to-br from-rose-500 to-orange-400"}`}>
                {approved ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
              </div>
              <div className="min-w-0">
                <p className="sd-card-title text-slate-900 truncate">{req.name}</p>
                <p className="sd-micro mt-0.5 flex flex-wrap items-center gap-x-2">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {req.destination || "—"}</span>
                  <span>•</span>
                  <span>{kind === "leave" ? `${formatDate(req.leaveDate)} → ${formatDate(req.returnDate)}` : `${req.out} → ${req.return}`}</span>
                </p>
                {req.remarks ? <p className="sd-micro mt-0.5 text-slate-400">“{req.remarks}”</p> : null}
                {decidedBy ? <p className="sd-micro mt-0.5 text-slate-400">Decided by {decidedBy}</p> : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className={`text-[10px] font-bold px-3 py-1 rounded-md ${DECISION_TONE[req.decision] || "bg-slate-100 text-slate-600"}`}>{req.decision}</span>
              {/* The verdict stands, but the pass never got used as decided. */}
              {req.lapsed ? (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                  <AlertTriangle className="h-3 w-3" />
                  {req.lapsed === "Cancelled" ? "Cancelled by student" : "Expired unused"}
                </span>
              ) : null}
              <span className="text-[11px] text-slate-400">{formatDateTime(req.decidedAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
