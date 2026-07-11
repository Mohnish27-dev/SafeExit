"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Loader2,
  MapPin,
  Search,
  ShieldCheck,
  TimerOff,
  UserRound,
  XCircle,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SecurityBottomNav from "../components/SecurityBottomNav";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

const formatDateTime = (value, dateLocale) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toLocaleDateString(dateLocale, { day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString(
    dateLocale,
    { hour: "2-digit", minute: "2-digit" }
  )}`;
};

// Purely a read-only classifier of the warden's existing decision — it never
// re-approves or re-validates anything, it just picks the clearest visual
// treatment for the status the record already carries.
const classifyApplication = (application, t) => {
  if (!application) {
    return {
      tone: "border-slate-200 bg-slate-50 text-slate-500",
      icon: UserRound,
      label: t("noLeaveOnFile"),
    };
  }

  const status = application.status;
  const now = Date.now();
  const leaveTime = new Date(application.leaveDate).getTime();
  const returnTime = new Date(application.returnDate).getTime();

  if (status === "Approved") {
    if (now >= leaveTime && now <= returnTime) {
      return {
        tone: "border-emerald-300 bg-emerald-50 text-emerald-700",
        icon: ShieldCheck,
        label: t("approvedValid"),
      };
    }
    return {
      tone: "border-amber-300 bg-amber-50 text-amber-700",
      icon: CheckCircle2,
      label: t("approvedUpcoming"),
    };
  }
  if (status === "Pending") {
    return {
      tone: "border-amber-300 bg-amber-50 text-amber-700",
      icon: Clock3,
      label: t("pendingReview"),
    };
  }
  if (status === "Rejected") {
    return {
      tone: "border-rose-300 bg-rose-50 text-rose-700",
      icon: XCircle,
      label: t("rejectedStatus"),
    };
  }
  if (status === "Cancelled") {
    return { tone: "border-slate-200 bg-slate-50 text-slate-500", icon: Ban, label: t("cancelledStatus") };
  }
  if (status === "Expired") {
    return { tone: "border-slate-200 bg-slate-50 text-slate-500", icon: TimerOff, label: t("expiredStatus") };
  }
  return { tone: "border-slate-200 bg-slate-50 text-slate-500", icon: CheckCircle2, label: t("completedStatus") };
};

export default function LeaveVerificationPage() {
  const { t } = useTranslation("security");
  const dateLocale = useDateLocale();
  const { checked, authorized } = useRequireAuth("security");

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();

    // Both branches' setState calls live inside this timeout callback (an
    // async boundary), never synchronously in the effect body itself — the
    // empty-query case just resolves immediately instead of after a delay.
    const handle = setTimeout(async () => {
      if (!trimmed) {
        setResults([]);
        setSearched(false);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await apiFetch(`/leave/lookup?query=${encodeURIComponent(trimmed)}`);
        setResults(data || []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, trimmed ? 300 : 0);

    return () => clearTimeout(handle);
  }, [query]);

  const showEmptyState = useMemo(
    () => searched && !loading && results.length === 0,
    [searched, loading, results]
  );

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen dashboard-neo text-slate-900">
      <div className="relative overflow-hidden">
        <div className="dash-orb dash-orb-one" />
        <div className="dash-orb dash-orb-two" />
        <div className="dash-orb dash-orb-three" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="dash-surface dash-animate-rise flex flex-wrap items-center justify-between gap-4 rounded-[2.25rem] px-5 py-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="dash-glow flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-500 text-white shadow-lg">
                <CalendarDays className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">{t("leavePass")}</p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{t("verifyLeavePass")}</h1>
                <p className="text-sm font-medium text-slate-500">{t("leavePassDesc")}</p>
              </div>
            </div>
            <LanguageSwitcher />
          </header>

          <section className="dash-surface dash-animate-rise mt-6 rounded-[2.5rem] p-6 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">{t("searchStudent")}</p>
            <div className="relative mt-4">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("searchByNameOrRoll")}
                autoFocus
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-4 pl-12 pr-4 text-base font-medium text-slate-900 focus:outline-none focus:border-indigo-500 focus:bg-white transition-colors"
              />
              {loading && (
                <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-indigo-500" />
              )}
            </div>
          </section>

          <section className="mt-6 space-y-4">
            {showEmptyState && (
              <div className="dash-card rounded-[2.5rem] p-10 text-center shadow-xl">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                  <UserRound className="h-6 w-6 text-slate-400" />
                </div>
                <p className="mt-4 font-display text-lg font-bold text-slate-700">{t("noResults")}</p>
              </div>
            )}

            {results.map(({ student, application }) => {
              const { tone, icon: StatusIcon, label } = classifyApplication(application, t);
              return (
                <div key={student.id} className={`dash-card rounded-[2rem] border-2 p-6 shadow-xl ${tone}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/80 text-slate-700">
                        <UserRound className="h-7 w-7" />
                      </div>
                      <div>
                        <p className="font-display text-xl font-bold text-slate-900">{student.name}</p>
                        <p className="text-sm font-semibold text-slate-500">
                          {student.studentId} {student.room ? `· Room ${student.room}` : ""}
                          {student.hostel ? ` · ${student.hostel}` : ""}
                        </p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full border-2 px-4 py-2 text-sm font-bold ${tone}`}>
                      <StatusIcon className="h-5 w-5" />
                      {label}
                    </span>
                  </div>

                  {application && (
                    <div className="mt-5 grid gap-3 rounded-2xl border border-white/60 bg-white/60 p-4 sm:grid-cols-2">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <MapPin className="h-4 w-4 text-slate-400" />
                        {application.destination}
                      </div>
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                        <CalendarDays className="h-4 w-4 text-slate-400" />
                        {formatDateTime(application.leaveDate, dateLocale)} → {formatDateTime(application.returnDate, dateLocale)}
                      </div>
                      {application.remarks && (
                        <p className="sm:col-span-2 text-xs text-slate-500">
                          <span className="font-bold text-slate-600">Note: </span>
                          {application.remarks}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>

          <SecurityBottomNav active="LeavePass" />
        </div>
      </div>
    </main>
  );
}
