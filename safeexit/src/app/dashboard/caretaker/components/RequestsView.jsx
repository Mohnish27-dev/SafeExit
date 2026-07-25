"use client";

import { Check, X, ClipboardList, Loader2, RefreshCcw } from "lucide-react";
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

export default function RequestsView({
  pending = [],
  approveRequest = () => {},
  rejectRequest = () => {},
  loading = false,
  error = "",
  onRefresh = () => {},
}) {
  const { t } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");

  return (
    <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="sd-kicker">{t("outingRequests")}</p>
          <h2 className="sd-title sd-title-sm">{t("manageRequests")}</h2>
        </div>
        <button
          onClick={onRefresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" /> {tc("refresh")}
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>
      )}

      <div className="mt-6 space-y-3">
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm font-semibold">{t("loadingRequests")}</p>
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-slate-500">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
              <ClipboardList className="h-7 w-7 text-slate-400" />
            </div>
            <p className="font-semibold text-slate-700">{t("noPendingRequests")}</p>
            <p className="text-sm text-slate-500">{t("noRequestsYet")}</p>
          </div>
        ) : (
          pending.map((req, i) => (
            <div
              key={req.id}
              onPointerMove={handleTilePointerMove}
              onPointerLeave={handleTilePointerLeave}
              style={{
                animationDelay: `${0.08 + i * 0.06}s`,
                "--tint": "linear-gradient(160deg, rgba(99,102,241,0.14) 0%, rgba(56,189,248,0.08) 100%)",
                "--glow": "rgba(99,102,241,0.45)",
                "--tile-border": "rgba(129,140,248,0.5)",
              }}
              className="sd-tile sd-luxe-rise"
            >
              <div className="sd-tile__inner flex items-center justify-between gap-3 p-4">
                <span className="sd-tile__glare" aria-hidden="true" />
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-linear-to-br from-indigo-400 to-cyan-400 flex items-center justify-center text-white font-bold">
                    {req.initials}
                  </div>
                  <div>
                    <p className="sd-card-title text-slate-900 text-base">{req.name}</p>
                    <p className="sd-micro mt-0.5">
                      {req.branch}
                      {req.roll ? <> • <span className="font-mono">{req.roll}</span></> : null}
                    </p>
                    {req.destination && (
                      <p className="sd-micro mt-0.5 text-slate-500">{t("toDestination")} {req.destination}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right mr-2">
                    <p className="text-xs text-slate-500">{tc("out")}</p>
                    <p className="font-semibold text-slate-900">{req.out}</p>
                  </div>
                  <div className="flex sm:flex-col gap-2">
                    <button
                      onClick={() => approveRequest(req.id)}
                      onPointerMove={handleMagneticMove}
                      onPointerLeave={handleMagneticLeave}
                      className="sd-magnetic flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 text-white font-bold shadow"
                    >
                      <Check className="h-4 w-4" /> {tc("approve")}
                    </button>
                    <button
                      onClick={() => rejectRequest(req.id)}
                      className="flex items-center gap-2 rounded-2xl px-4 py-2 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors"
                    >
                      <X className="h-4 w-4" /> {tc("reject")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
