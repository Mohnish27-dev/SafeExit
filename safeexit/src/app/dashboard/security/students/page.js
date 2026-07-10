"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Clock3,
  Loader2,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { getInitials } from "@/app/lib/userProfile";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SecurityBottomNav from "../components/SecurityBottomNav";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

const CAMPUS_TONE = {
  Inside: "bg-emerald-100 text-emerald-700",
  Outside: "bg-amber-100 text-amber-700",
  Overdue: "bg-rose-100 text-rose-700",
};

export default function SecurityStudentsPage() {
  const { t } = useTranslation("security");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();
  const { checked, authorized } = useRequireAuth("security");
  const searchParams = useSearchParams();
  const initialFilter = searchParams.get("filter") || "";

  const formatWhen = useCallback((iso) =>
    iso
      ? new Date(iso).toLocaleString(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "—",
    [dateLocale]
  );

  const campusLabel = useCallback((status) => {
    if (status === "Inside") return t("inside");
    if (status === "Outside") return t("outside");
    if (status === "Overdue") return t("overdue");
    return t("inside");
  }, [t]);

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(initialFilter);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch("/admin/users?role=Student");
      setStudents(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load students");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students
      .filter((s) => {
        if (statusFilter === "overdue") return (s.campusStatus || "").toLowerCase() === "overdue";
        if (statusFilter === "outside") return (s.campusStatus || "").toLowerCase() === "outside";
        if (statusFilter === "inside") return (s.campusStatus || "").toLowerCase() === "inside";
        return true;
      })
      .filter((s) => {
        if (!q) return true;
        return (
          (s.name || "").toLowerCase().includes(q) ||
          (s.studentId || "").toLowerCase().includes(q)
        );
      });
  }, [students, search, statusFilter]);

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
              <Link
                href="/dashboard/security"
                className="dash-glow flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-500 text-white shadow-lg"
              >
                <ArrowLeft className="h-7 w-7" />
              </Link>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">{t("liveRoster")}</p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{t("students")}</h1>
                <p className="text-sm font-medium text-slate-500">{visible.length} {t("registered")}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <div className="dash-card flex items-center gap-3 rounded-2xl px-4 py-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchNameRoll") || t("searchNameRollEmail")}
                  className="w-56 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                />
              </div>
            </div>
          </header>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { key: "", label: t("all") || "All" },
              { key: "inside", label: t("inside") },
              { key: "outside", label: t("outside") },
              { key: "overdue", label: t("overdue") },
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition cursor-pointer ${
                  statusFilter === f.key
                    ? "bg-gradient-to-r from-indigo-600 to-cyan-500 text-white shadow"
                    : "dash-card text-slate-500 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <section className="dash-surface dash-animate-rise mt-6 rounded-[2.5rem] p-6 shadow-xl">
            {error && (
              <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {error}
              </p>
            )}
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-16 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" /> {t("loadingStudents")}
              </div>
            ) : visible.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 py-16 text-center">
                <UsersRound className="mx-auto h-10 w-10 text-slate-300" />
                <p className="mt-3 font-semibold text-slate-700">{t("noStudentsFound")}</p>
                <p className="text-sm text-slate-400">{t("studentsWillAppear")}</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((s) => (
                  <article key={s._id} className="dash-card rounded-3xl p-5">
                    <div className="flex items-center gap-3">
                      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white">
                        {s.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.photo} alt={s.name} className="h-full w-full object-cover" />
                        ) : (
                          getInitials(s.name)
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-slate-900">{s.name}</p>
                        <p className="truncate text-xs font-semibold text-slate-500">{s.studentId || "—"}</p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                          CAMPUS_TONE[s.campusStatus] || CAMPUS_TONE.Inside
                        }`}
                      >
                        {campusLabel(s.campusStatus || "Inside")}
                      </span>
                    </div>

                    <div className="mt-4 flex items-center gap-1 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400">
                      <Clock3 className="h-3.5 w-3.5" /> {t("lastSeen")} {formatWhen(s.lastSeenAt)}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <SecurityBottomNav active="Students" />
        </div>
      </div>
    </main>
  );
}
