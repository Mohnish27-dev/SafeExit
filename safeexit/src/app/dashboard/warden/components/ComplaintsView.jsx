"use client";

import { useTranslation } from "@/app/lib/i18n";

export default function ComplaintsView({ reports = [], resolveReport = () => {}, setReports = () => {} }) {
  const { t } = useTranslation("warden");
  const { t: tc } = useTranslation("common");

  return (
    <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="sd-kicker">{t("complaints")}</p>
          <h2 className="sd-title sd-title-sm">{t("allReports")}</h2>
        </div>
        <button onClick={() => setReports([])} className="px-3 py-2 rounded bg-rose-600 text-white">{tc("clearAll")}</button>
      </div>
      <div className="mt-5 space-y-3">
        {reports.length === 0 ? <p className="text-sm text-slate-500">{t("noReports")}</p> : reports.map((comp, i) => (
          <div key={comp.id} className="sd-row sd-luxe-rise" style={{ "--accent": "#f97316", animationDelay: `${0.08 + i * 0.04}s` }}>
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
              <button onClick={() => resolveReport(comp.id)} className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">{tc("resolve")}</button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
