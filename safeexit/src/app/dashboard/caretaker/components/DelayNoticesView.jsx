"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Clock3,
  Timer,
  Loader2,
  CheckCircle2,
  MessageSquareText,
  Phone,
  DoorOpen,
  AlarmClock,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { subscribeToStaffEvents } from "@/app/lib/staffEvents";
import { getInitials } from "@/app/lib/userProfile";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import EmergencyContactsPanel from "@/app/components/EmergencyContactsPanel";

// DelayNotice reason enum → translation key.
const delayReasonKeys = {
  Traffic: "delayReasonTraffic",
  Transport: "delayReasonTransport",
  Medical: "delayReasonMedical",
  Family: "delayReasonFamily",
  Weather: "delayReasonWeather",
  Other: "delayReasonOther",
};

const FILTER_KEYS = ["Pending", "Acknowledged", "All"];

// Every delay notice from students in scope — including those who filed *before*
// their return time passed, who by definition never appear on the overdue list.
export default function DelayNoticesView({ onCountChange }) {
  const { t } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();

  const formatTime = (iso) =>
    new Date(iso).toLocaleString(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("Pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acknowledging, setAcknowledging] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/delay");
      const list = Array.isArray(data) ? data : [];
      setItems(list);
      setError("");
      onCountChange?.(list.filter((n) => n.status === "Pending").length);
    } catch (err) {
      setError(err.message || t("couldNotLoadDelays"));
    } finally {
      setLoading(false);
    }
  }, [onCountChange, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from the API, a client-only external source.
    load();
    const poll = setInterval(load, 30000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "delay:created": load,
      "delay:updated": load,
    });
  }, [load]);

  const acknowledge = async (id) => {
    setAcknowledging(id);
    try {
      await apiFetch(`/delay/${id}/acknowledge`, { method: "PATCH" });
      await load();
    } catch (err) {
      setError(err.message || t("couldNotAcknowledgeDelay"));
    } finally {
      setAcknowledging("");
    }
  };

  const FILTER_LABELS = {
    Pending: t("delayFilterPending"),
    Acknowledged: t("delayFilterAcknowledged"),
    All: t("filterAll"),
  };

  const visible = filter === "All" ? items : items.filter((n) => n.status === filter);
  const pendingCount = items.filter((n) => n.status === "Pending").length;

  return (
    <section className="space-y-5">
      <div className="sd-luxe-panel sd-glow-border sd-enter flex flex-wrap items-center justify-between gap-3 rounded-4xl px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="sd-luxe-float relative flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
            <Clock3 className="h-6 w-6" />
            {pendingCount > 0 && (
              <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-amber-500" />
            )}
          </span>
          <div>
            <h2 className="sd-title sd-title-sm">{t("delayNoticesTitle")}</h2>
            <p className="sd-micro mt-0.5">{`${pendingCount} ${t("delayAwaitingAck")}`}</p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Timer className="h-4 w-4" /> {tc("refresh")}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-xl px-3.5 py-2 text-xs font-bold transition ${
              filter === key
                ? "bg-slate-900 text-white shadow-sm"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {FILTER_LABELS[key]}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> {tc("loading")}
        </div>
      ) : visible.length === 0 ? (
        <div className="sd-luxe-panel sd-enter rounded-4xl py-16">
          <div className="sd-empty">
            <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center">
              <span className="sd-ring" aria-hidden="true" />
              <span className="sd-ring sd-ring--2" aria-hidden="true" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-400 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </div>
            <p className="sd-card-title">{t("noDelayNotices")}</p>
            <p className="sd-micro mt-1">{t("noDelayNoticesHint")}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {visible.map((n, i) => {
            const student = n.student || {};
            const isPending = n.status === "Pending";
            return (
              <article
                key={n._id}
                style={{ "--accent": isPending ? "#f59e0b" : "#10b981", animationDelay: `${0.05 + Math.min(i, 10) * 0.05}s` }}
                className={`sd-luxe-card sd-luxe-rise relative min-w-0 overflow-hidden rounded-3xl p-4 ring-1 sm:p-5 ${
                  isPending ? "ring-amber-200" : "ring-emerald-100"
                }`}
              >
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: "var(--accent)" }} aria-hidden="true" />
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    <span
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
                        isPending ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600"
                      }`}
                    >
                      <MessageSquareText className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{student.name || "—"}</h3>
                        <span className="rounded-full border border-amber-200 bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                          {delayReasonKeys[n.reason] ? t(delayReasonKeys[n.reason]) : n.reason}
                        </span>
                        {/* Filed after their deadline had already passed. */}
                        {n.filedWhileOverdue && (
                          <span className="flex items-center gap-1 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                            <AlarmClock className="h-3 w-3" /> {t("delayFiledLate")}
                          </span>
                        )}
                      </div>
                      {n.note && (
                        <p className="mt-1.5 wrap-break-word text-sm text-slate-600">“{n.note}”</p>
                      )}
                      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5" /> {t("delaySent")} {formatTime(n.createdAt)}
                        </span>
                        {n.originalInTime && (
                          <span className="flex items-center gap-1.5">
                            <Clock3 className="h-3.5 w-3.5" /> {t("expectedReturn")} {formatTime(n.originalInTime)}
                          </span>
                        )}
                        {n.newExpectedTime && (
                          <span className="flex items-center gap-1.5 font-semibold text-amber-700">
                            {t("delayWillReachBy")} {formatTime(n.newExpectedTime)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:w-auto">
                    {student.phoneNumber && (
                      <a
                        href={`tel:${student.phoneNumber}`}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5"
                      >
                        <Phone className="h-4 w-4" /> {t("callStudent")}
                      </a>
                    )}
                    {isPending ? (
                      <button
                        type="button"
                        disabled={acknowledging === n._id}
                        onClick={() => acknowledge(n._id)}
                        className="flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-60"
                      >
                        {acknowledging === n._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {t("delayAcknowledge")}
                      </button>
                    ) : (
                      <span className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
                        <CheckCircle2 className="h-4 w-4" />
                        {t("delayAcknowledged")}
                        {n.acknowledgedBy?.name ? ` · ${n.acknowledgedBy.name}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* Student profile strip — mirrors the overdue and SOS cards. */}
                <div className="mt-4 min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-cyan-400 text-sm font-bold text-white">
                        {getInitials(student.name)}
                      </div>
                      <div className="min-w-0">
                        <p className="wrap-break-word text-sm font-bold text-slate-900">{student.name || "—"}</p>
                        <p className="wrap-break-word text-xs text-slate-500">
                          {[student.studentId, student.department, student.year].filter(Boolean).join(" · ") || "—"}
                        </p>
                      </div>
                    </div>
                    <span className="flex min-w-0 items-start gap-1.5 wrap-break-word text-sm text-slate-600">
                      <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                      {student.hostelName || "—"} {student.roomNumber ? `· Room ${student.roomNumber}` : ""}
                    </span>
                    {student.phoneNumber && (
                      <a
                        href={`tel:${student.phoneNumber}`}
                        className="flex min-w-0 max-w-full items-start gap-1.5 text-sm font-semibold text-indigo-600 hover:underline"
                      >
                        <Phone className="mt-0.5 h-4 w-4 shrink-0" /> <span className="break-all">{student.phoneNumber}</span>
                      </a>
                    )}
                  </div>
                  <EmergencyContactsPanel student={student} />
                </div>

                {isPending && (
                  <p className="mt-3 text-[11px] text-slate-500">{t("delayAckHint")}</p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
