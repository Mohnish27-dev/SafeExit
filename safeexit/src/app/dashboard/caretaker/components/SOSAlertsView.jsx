"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Shield,
  HeartPulse,
  AlertTriangle,
  Eye,
  Radio,
  Phone,
  MapPin,
  Clock3,
  CheckCircle2,
  BellRing,
  Loader2,
  DoorOpen,
} from "lucide-react";
import { apiFetch, getApiBase } from "@/app/lib/api";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import EmergencyContactsPanel from "@/app/components/EmergencyContactsPanel";

const getInitials = (name = "") =>
  name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

const TYPE_TONE = {
  harassment: { icon: Shield, tone: "bg-rose-100 text-rose-600" },
  medical: { icon: HeartPulse, tone: "bg-orange-100 text-orange-600" },
  unsafe: { icon: AlertTriangle, tone: "bg-amber-100 text-amber-600" },
  stalking: { icon: Eye, tone: "bg-sky-100 text-sky-600" },
  other: { icon: Radio, tone: "bg-slate-100 text-slate-600" },
};

const STATUS_META = {
  Active: "bg-rose-100 text-rose-700 border-rose-200",
  Acknowledged: "bg-amber-100 text-amber-700 border-amber-200",
  Resolved: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const FILTER_KEYS = ["Active", "Acknowledged", "Resolved", "All"];

export default function SOSAlertsView({ onCountChange, readOnly = false }) {
  const { t } = useTranslation("sos");
  const dateLocale = useDateLocale();

  const formatTime = (iso) =>
    new Date(iso).toLocaleString(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  const FILTER_LABELS = {
    Active: t("filterActive"),
    Acknowledged: t("filterAcknowledged"),
    Resolved: t("filterResolved"),
    All: t("filterAll"),
  };

  const TYPE_LABELS = {
    harassment: t("typeHarassment"),
    medical: t("typeMedical"),
    unsafe: t("typeUnsafe"),
    stalking: t("typeStalking"),
    other: t("typeOther"),
  };

  const STATUS_LABELS = {
    Active: t("statusActive"),
    Acknowledged: t("statusAcknowledged"),
    Resolved: t("statusResolved"),
  };

  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("Active");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await apiFetch("/sos");
      setAlerts(data);
      setError("");
      onCountChange?.(data.filter((a) => a.status === "Active").length);
    } catch (err) {
      setError(err.message || t("couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [onCountChange, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // Frequent poll: these are emergencies; SSE below is the fast path.
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/sos/stream`, { withCredentials: true });
    source.addEventListener("sos:created", () => load());
    source.addEventListener("sos:updated", () => load());
    return () => source.close();
  }, [load]);

  const { t: tc } = useTranslation("common");

  const updateStatus = async (id, status) => {
    setBusyId(id);
    try {
      await apiFetch(`/sos/${id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      await load();
    } catch (err) {
      setError(err.message || t("couldNotUpdate"));
    } finally {
      setBusyId(null);
    }
  };

  const visible = alerts.filter((a) => (filter === "All" ? true : a.status === filter));
  const activeCount = alerts.filter((a) => a.status === "Active").length;

  return (
    <section className="space-y-5">
      <div className="sd-luxe-panel sd-glow-border sd-enter flex flex-wrap items-center justify-between gap-3 rounded-4xl px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="sd-luxe-float relative flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
            <BellRing className="h-6 w-6" />
            {activeCount > 0 && <span className="absolute -right-1 -top-1 h-3 w-3 animate-ping rounded-full bg-rose-500" />}
          </span>
          <div>
            <h2 className="sd-title sd-title-sm">{t("title")}</h2>
            <p className="sd-micro mt-0.5">{t("subtitle", { count: activeCount })}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTER_KEYS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${
                filter === f ? "bg-slate-900 text-white" : "sd-luxe-card text-slate-500 hover:bg-slate-50"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">{error}</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" /> {t("loadingAlerts")}
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
            <p className="sd-card-title">{filter === "All" ? t("noAlertsAll") : t("noAlerts", { filter: FILTER_LABELS[filter] })}</p>
            <p className="sd-micro mt-1">{t("allClear")}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          {visible.map((a, i) => {
            const meta = TYPE_TONE[a.type] || TYPE_TONE.other;
            const student = a.student || {};
            return (
              <article
                key={a._id}
                style={{ "--accent": a.status === "Active" ? "#f43f5e" : "#94a3b8", animationDelay: `${0.05 + Math.min(i, 10) * 0.05}s` }}
                className={`sd-luxe-card sd-luxe-rise relative min-w-0 overflow-hidden rounded-3xl p-4 sm:p-5 ${a.status === "Active" ? "ring-1 ring-rose-200" : ""}`}
              >
                <span
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ background: "var(--accent)" }}
                  aria-hidden="true"
                />
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${meta.tone}`}>
                      <meta.icon className="h-6 w-6" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="break-words text-base font-bold text-slate-900">{TYPE_LABELS[a.type] || TYPE_LABELS.other}</h3>
                        <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${STATUS_META[a.status]}`}>{STATUS_LABELS[a.status] || a.status}</span>
                      </div>
                      <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Clock3 className="h-3.5 w-3.5" /> {formatTime(a.createdAt)}
                      </p>
                      {a.note && <p className="mt-2 max-w-xl rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">&ldquo;{a.note}&rdquo;</p>}
                    </div>
                  </div>

                  {!readOnly && <div className="flex w-full gap-2 sm:w-auto">
                    {a.status !== "Acknowledged" && a.status !== "Resolved" && (
                      <button
                        onClick={() => updateStatus(a._id, "Acknowledged")}
                        disabled={busyId === a._id}
                        className="min-w-0 flex-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50 sm:flex-none sm:px-4"
                      >
                        {t("acknowledge")}
                      </button>
                    )}
                    {a.status !== "Resolved" && (
                      <button
                        onClick={() => updateStatus(a._id, "Resolved")}
                        disabled={busyId === a._id}
                        className="flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-600 disabled:opacity-50 sm:flex-none sm:px-4"
                      >
                        {busyId === a._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        {tc("resolve")}
                      </button>
                    )}
                  </div>}
                </div>

                {/* Student profile strip */}
                <div className="mt-4 min-w-0 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 sm:p-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-indigo-500 to-cyan-400 text-sm font-bold text-white">
                      {getInitials(student.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="break-words text-sm font-bold text-slate-900">{student.name || "—"}</p>
                      <p className="break-words text-xs text-slate-500">
                        {[student.studentId, student.department, student.year].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  </div>
                  <span className="flex min-w-0 items-start gap-1.5 break-words text-sm text-slate-600">
                    <DoorOpen className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    {student.hostelName || "—"} {student.roomNumber ? `· Room ${student.roomNumber}` : ""}
                  </span>
                  {a.location && (
                    <span className="flex min-w-0 items-start gap-1.5 break-words text-sm text-slate-600">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> {a.location}
                    </span>
                  )}
                  {/* GPS snapshot from raise time; opens maps at that pin */}
                  {a.coords?.lat != null && a.coords?.lng != null && (
                    <a
                      href={`https://www.google.com/maps?q=${a.coords.lat},${a.coords.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      <MapPin className="h-4 w-4" /> Open in Maps
                      {Number.isFinite(a.coords.accuracy) && (
                        <span className="text-xs font-medium text-rose-400">±{Math.round(a.coords.accuracy)}m</span>
                      )}
                    </a>
                  )}
                  {student.phoneNumber && (
                    <a href={`tel:${student.phoneNumber}`} className="flex min-w-0 max-w-full items-start gap-1.5 text-sm font-semibold text-indigo-600 hover:underline">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0" /> <span className="break-all">{student.phoneNumber}</span>
                    </a>
                  )}
                  {a.handledBy?.name && (
                    <span className="ml-auto text-xs text-slate-400">{t("handledBy")} {a.handledBy.name}</span>
                  )}
                  </div>
                  <EmergencyContactsPanel student={student} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
