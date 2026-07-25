"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlarmClock,
  Phone,
  DoorOpen,
  MapPin,
  Clock3,
  Timer,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import { apiFetch, getApiBase } from "@/app/lib/api";
import { getInitials } from "@/app/lib/userProfile";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";

// "2h 15m" style label for how long past the return deadline the student is.
const overdueDuration = (inTime, now) => {
  const due = new Date(inTime).getTime();
  if (Number.isNaN(due)) return "";
  const mins = Math.max(0, Math.floor((now - due) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function OverdueStudentsView({ onCountChange }) {
  const { t } = useTranslation("warden");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();

  const formatTime = (iso) =>
    new Date(iso).toLocaleString(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Live clock so the "overdue by" badge stays current between fetches.
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/outing/overdue");
      setItems(data);
      setError("");
      onCountChange?.(data.length);
    } catch (err) {
      setError(err.message || t("couldNotLoadOverdue"));
    } finally {
      setLoading(false);
    }
  }, [onCountChange, t]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 30000);
    return () => clearInterval(poll);
  }, [load]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(clock);
  }, []);

  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/outing/stream`, { withCredentials: true });
    source.addEventListener("outing:changed", () => load());
    return () => source.close();
  }, [load]);

  return (
    <section className="space-y-5">
      <div className="sd-luxe-panel sd-glow-border sd-enter flex flex-wrap items-center justify-between gap-3 rounded-4xl px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="sd-luxe-float relative flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <AlarmClock className="h-6 w-6" />
            {items.length > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-rose-500" />}
          </span>
          <div>
            <h2 className="sd-title sd-title-sm">{t("overdueTitle")}</h2>
            <p className="sd-micro mt-0.5">{`${items.length} ${t("overdueStudents")}`}</p>
          </div>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          <Timer className="h-4 w-4" /> {tc("refresh")}
        </button>
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> {tc("loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="sd-luxe-panel sd-enter rounded-4xl py-16">
          <div className="sd-empty">
            <div className="relative mx-auto mb-4 flex h-14 w-14 items-center justify-center">
              <span className="sd-ring" aria-hidden="true" />
              <span className="sd-ring sd-ring--2" aria-hidden="true" />
              <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-400 text-white">
                <CheckCircle2 className="h-5 w-5" />
              </span>
            </div>
            <p className="sd-card-title">{t("noOverdue")}</p>
            <p className="sd-micro mt-1">{t("allReturned")}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {items.map((o, i) => {
            const student = o.student || {};
            return (
              <article
                key={o._id}
                style={{ "--accent": "#f43f5e", animationDelay: `${0.05 + Math.min(i, 10) * 0.05}s` }}
                className="sd-luxe-card sd-luxe-rise relative overflow-hidden rounded-3xl p-5 ring-1 ring-rose-200"
              >
                <span className="absolute inset-y-0 left-0 w-1" style={{ background: "var(--accent)" }} aria-hidden="true" />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                      <AlarmClock className="h-6 w-6" />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{student.name || "—"}</h3>
                        <span className="rounded-full border border-rose-200 bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold text-rose-700">
                          {`${t("overdueBy")} ${overdueDuration(o.inTime, now)}`}
                        </span>
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Clock3 className="h-3.5 w-3.5" /> {t("expectedReturn")} {formatTime(o.inTime)}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Timer className="h-3.5 w-3.5" /> {t("departedAt")} {formatTime(o.outTime)}
                        </span>
                      </p>
                      {o.destination && (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                          <MapPin className="h-3.5 w-3.5" /> {o.destination}
                        </p>
                      )}
                    </div>
                  </div>

                  {student.phoneNumber && (
                    <a
                      href={`tel:${student.phoneNumber}`}
                      className="flex items-center gap-1.5 rounded-xl bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5"
                    >
                      <Phone className="h-4 w-4" /> {t("callStudent")}
                    </a>
                  )}
                </div>

                {/* Student profile strip — mirrors the SOS alert contact card */}
                <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-slate-100 bg-slate-50/70 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-cyan-400 text-sm font-bold text-white">
                      {getInitials(student.name)}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">{student.name || "—"}</p>
                      <p className="text-xs text-slate-500">
                        {[student.studentId, student.department, student.year].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 text-sm text-slate-600">
                    <DoorOpen className="h-4 w-4 text-slate-400" />
                    {student.hostelName || "—"} {student.roomNumber ? `· Room ${student.roomNumber}` : ""}
                  </span>
                  {student.phoneNumber && (
                    <a href={`tel:${student.phoneNumber}`} className="flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
                      <Phone className="h-4 w-4" /> {student.phoneNumber}
                    </a>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
