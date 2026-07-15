"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, MessageSquare, RefreshCcw } from "lucide-react";
import { useTranslation } from "@/app/lib/i18n";

export default function ComplaintsView({
  reports = [],
  resolvedReports = [],
  resolveReport = () => {},
  loading = false,
  error = "",
  onRefresh = () => {},
}) {
  const { t } = useTranslation("warden");
  const { t: tc } = useTranslation("common");
  // 'open' shows the actionable queue; 'resolved' keeps the history of past
  // complaints so they stay listed after the warden actions them.
  const [tab, setTab] = useState("open");

  const tabs = [
    { key: "open", label: t("openTab"), count: reports.length },
    { key: "resolved", label: t("resolvedTab"), count: resolvedReports.length },
  ];

  const list = tab === "open" ? reports : resolvedReports;

  return (
    <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="sd-kicker">{t("complaints")}</p>
          <h2 className="sd-title sd-title-sm">{t("allReports")}</h2>
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
                ? "bg-linear-to-r from-orange-600 via-orange-500 to-amber-500 text-white shadow"
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
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
            <p className="text-sm font-semibold">{t("loadingComplaints")}</p>
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <MessageSquare className="h-7 w-7 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700">
              {tab === "open" ? t("noReports") : t("noResolvedReports")}
            </p>
          </div>
        ) : (
          list.map((comp, i) => (
            <div key={comp.id} className="sd-row sd-luxe-rise" style={{ "--accent": tab === "open" ? "#f97316" : "#10b981", animationDelay: `${0.08 + i * 0.04}s` }}>
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
              <div className="shrink-0 flex items-center gap-2">
                <span className={`text-[10px] font-bold px-3 py-1 rounded-md ${comp.statusTone}`}>{comp.status}</span>
                {tab === "open" ? (
                  <button onClick={() => resolveReport(comp.id)} className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">{tc("resolve")}</button>
                ) : (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-hidden="true" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
