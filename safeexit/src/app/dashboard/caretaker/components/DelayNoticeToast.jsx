"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock3, X, MessageSquareText, ArrowRight } from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { subscribeToStaffEvents } from "@/app/lib/staffEvents";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";

// DelayNotice reason enum → translation key.
const delayReasonKeys = {
  Traffic: "delayReasonTraffic",
  Transport: "delayReasonTransport",
  Medical: "delayReasonMedical",
  Family: "delayReasonFamily",
  Weather: "delayReasonWeather",
  Other: "delayReasonOther",
};

// Live popup for delay notices, shown on the caretaker and warden dashboards.
// The SSE payload carries no student PII, so an event only tells us to refetch
// /delay — the details come from that scoped, authenticated response.
export default function DelayNoticeToast({ onView }) {
  const { t } = useTranslation("caretaker");
  const dateLocale = useDateLocale();

  const [queue, setQueue] = useState([]);
  // Notices already known to this session, so a refetch only pops genuinely new
  // ones. Seeded on mount, which is why a page load never shows a stale popup.
  const seen = useRef(new Set());
  const seeded = useRef(false);

  const sync = useCallback(async () => {
    let data;
    try {
      data = await apiFetch("/delay?status=Pending");
    } catch {
      return; // best-effort — the overdue tab is still the source of truth
    }
    const notices = Array.isArray(data) ? data : [];
    if (!seeded.current) {
      notices.forEach((n) => seen.current.add(n._id));
      seeded.current = true;
      return;
    }
    const fresh = notices.filter((n) => !seen.current.has(n._id));
    if (!fresh.length) return;
    fresh.forEach((n) => seen.current.add(n._id));
    setQueue((prev) => [...fresh, ...prev].slice(0, 3));
  }, []);

  useEffect(() => {
    sync();
    return subscribeToStaffEvents({ "delay:created": sync });
  }, [sync]);

  const dismiss = (id) => setQueue((prev) => prev.filter((n) => n._id !== id));

  if (!queue.length) return null;

  return (
    // bottom-28 clears the fixed mobile nav, which is md:hidden on both dashboards.
    <div className="pointer-events-none fixed inset-x-3 bottom-28 z-80 flex flex-col gap-2 md:inset-x-auto md:right-5 md:bottom-5 md:w-96">
      {queue.map((n) => {
        const student = n.student || {};
        const eta = n.newExpectedTime
          ? new Date(n.newExpectedTime).toLocaleString(dateLocale, {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";
        return (
          <div
            key={n._id}
            role="status"
            aria-live="polite"
            className="sd-enter pointer-events-auto overflow-hidden rounded-3xl border border-amber-200 bg-white shadow-2xl"
          >
            <span className="block h-1 w-full bg-linear-to-r from-amber-500 to-amber-300" aria-hidden="true" />
            <div className="flex items-start gap-3 p-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Clock3 className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">{t("delayPopupTitle")}</p>
                <p className="mt-0.5 wrap-break-word text-xs text-slate-600">
                  <span className="font-semibold text-slate-800">{student.name || "—"}</span>{" "}
                  {t("delayPopupBody")}
                </p>
                <p className="mt-1.5 flex items-center gap-1.5 text-xs font-bold text-amber-700">
                  <MessageSquareText className="h-3.5 w-3.5 shrink-0" />
                  {delayReasonKeys[n.reason] ? t(delayReasonKeys[n.reason]) : n.reason}
                </p>
                {n.note && (
                  <p className="mt-1 wrap-break-word text-xs text-slate-500">“{n.note}”</p>
                )}
                {eta && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    {t("delayWillReachBy")} {eta}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      dismiss(n._id);
                      onView?.();
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:-translate-y-0.5"
                  >
                    {t("delayPopupView")} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => dismiss(n._id)}
                    className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    {t("delayPopupDismiss")}
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => dismiss(n._id)}
                aria-label={t("delayPopupDismiss")}
                className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
