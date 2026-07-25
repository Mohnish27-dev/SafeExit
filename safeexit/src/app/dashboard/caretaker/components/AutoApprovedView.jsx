"use client";
import React, { useEffect, useState } from "react";
import { useTranslation } from "@/app/lib/i18n";

export default function AutoApprovedView({ approved = [], compact = true, onViewAll, onBack, onClear, pageSize = 8 }) {
  const { t } = useTranslation("warden");
  const { t: tc } = useTranslation("common");
  const [page, setPage] = useState(1);

  useEffect(() => {
    // reset page if approved list shrinks
    const totalPages = Math.max(1, Math.ceil(approved.length / pageSize));
    if (page > totalPages) setPage(1);
  }, [approved.length, page, pageSize]);

  const total = approved.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  const pageItems = approved.slice(start, start + pageSize);

  if (compact) {
    return (
      <section className="sd-luxe-panel sd-glow-border sd-enter rounded-4xl p-4 sm:p-5 shadow-md">
        <div className="flex items-center justify-between">
          <h3 className="sd-title sd-title-sm">{t("autoApproved")}</h3>
          <button onClick={onViewAll} className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-colors">{tc("viewAll")}</button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          {approved.slice(0, 6).map((s, i) => (
            <div key={s.id} className="sd-luxe-card rounded-xl p-3 flex flex-col items-center text-center">
              <div className="h-10 w-10 rounded-full bg-linear-to-br from-indigo-400 to-emerald-400 flex items-center justify-center text-white mb-2 font-bold">{s.initials}</div>
              <p className="text-xs font-bold text-slate-900 leading-tight mb-1">{s.name}</p>
              <p className="text-[10px] text-slate-500">{t("outSince")}</p>
              <p className="text-xs font-bold text-slate-800 mb-2">{s.outSince}</p>
              <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-md">{t("notReturned")}</span>
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <h2 className="sd-title sd-title-sm">{t("autoApproved")}</h2>
        <div className="flex items-center gap-2">
          <button onClick={onBack} className="px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 transition-colors">{tc("back")}</button>
          <button onClick={onClear} className="px-3 py-2 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700 transition-colors">{tc("clearAll")}</button>
        </div>
      </div>

        <div className="mt-5 grid gap-4">
        <div className="grid grid-cols-3 gap-4 sd-stagger">
          {pageItems.map((s, i) => (
            <div key={s.id} style={{ animationDelay: `${0.06 + i * 0.06}s` }} className="sd-luxe-card rounded-xl p-3 flex flex-col items-center text-center sd-card-hover sd-animate-fade-up">
              <div className="h-12 w-12 rounded-full bg-linear-to-br from-indigo-400 to-emerald-400 flex items-center justify-center text-white mb-2 font-bold">{s.initials}</div>
              <p className="text-xs font-bold text-slate-900 leading-tight mb-1">{s.name}</p>
              <p className="text-[10px] text-slate-500">{t("outSince")}</p>
              <p className="text-xs font-bold text-slate-800 mb-2">{s.outSince}</p>
              <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-md w-full">{t("notReturned")}</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40">{tc("prev")}</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-2 rounded-xl border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40">{tc("next")}</button>
          </div>

          <div className="sd-micro">{t("pageOf").replace("{page}", page).replace("{total}", totalPages).replace("{count}", total)}</div>
        </div>
      </div>
    </section>
  );
}
