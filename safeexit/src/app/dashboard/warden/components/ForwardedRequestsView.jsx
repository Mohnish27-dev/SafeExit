"use client";

import { useState } from "react";
import { Check, X, ClipboardList, History, Loader2, RefreshCcw, ArrowUpRight, MapPin, Clock3 } from "lucide-react";
import DecisionHistoryList from "./DecisionHistoryList";

// Warden action queue for outing requests a caretaker escalated (status 'Forwarded'),
// with a History tab holding this hostel's decided outings.
// Presentational: page.js maps the data and owns the approve (signature) / reject flow.
export default function ForwardedRequestsView({
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

  const tabs = [
    { key: "pending", label: "Pending", count: pending.length, icon: ClipboardList },
    { key: "history", label: "History", count: history.length, icon: History },
  ];

  return (
    <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="sd-kicker">Escalated to you</p>
          <h2 className="sd-title sd-title-sm">Forwarded Outing Requests</h2>
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
                ? "bg-linear-to-r from-indigo-600 via-indigo-500 to-cyan-500 text-white shadow"
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
          <DecisionHistoryList list={history} kind="outing" loading={loadingHistory} />
        </div>
      ) : (
      <>
      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-semibold">Loading forwarded requests…</p>
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <ClipboardList className="h-7 w-7 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700">Nothing awaiting your decision</p>
            <p className="text-sm text-slate-500">When a caretaker escalates an outing, it lands here.</p>
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
                  <div className="h-11 w-11 shrink-0 rounded-full bg-linear-to-br from-indigo-500 to-cyan-400 flex items-center justify-center text-white font-bold">{req.initials}</div>
                  <div className="min-w-0">
                    <p className="sd-card-title text-slate-900 text-base">{req.name}</p>
                    <p className="sd-micro mt-0.5">{req.room}{req.roll ? <> • <span className="font-mono">{req.roll}</span></> : null}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {req.destination || "—"}</span>
                      <span className="inline-flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {req.out} → {req.return}</span>
                      {req.outingType ? <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">{req.outingType}</span> : null}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button onClick={() => approve(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 text-white font-bold shadow hover:-translate-y-0.5 transition-transform">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button onClick={() => reject(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors">
                    <X className="h-4 w-4" /> Reject
                  </button>
                </div>
              </div>

              {(req.forwardedBy || req.forwardedNote) && (
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-indigo-50/70 px-3 py-2 text-xs text-indigo-800">
                  <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <p className="min-w-0">
                    {req.forwardedBy ? <span className="font-semibold">{req.forwardedBy}</span> : "A caretaker"} forwarded this
                    {req.forwardedNote ? <> — “{req.forwardedNote}”</> : "."}
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
  );
}
