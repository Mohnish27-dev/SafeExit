"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Clock3,
  Loader2,
  Search,
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

// 3D tilt for roster tiles; module scope so handlers aren't recreated per render.
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

function SecurityStudentsContent() {
  const { t } = useTranslation("security");
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
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-10">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel grd-glow-border sd-enter flex flex-wrap items-center justify-between gap-4 rounded-[2.25rem] px-5 py-4">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard/security"
                className="sd-lift-lg flex h-14 w-14 items-center justify-center rounded-2xl text-white"
                style={{
                  background: "linear-gradient(145deg, #0f172a 0%, #0f766e 52%, #2dd4bf 100%)",
                  boxShadow: "0 18px 40px -20px rgba(13,148,136,0.6)",
                }}
              >
                <ArrowLeft className="h-7 w-7" />
              </Link>
              <div>
                <span className="sd-kicker">{t("liveRoster")}</span>
                <h1 className="sd-title sd-title-md mt-1">{t("students")}</h1>
                <p className="sd-body mt-0.5 text-sm">{visible.length} {t("registered")}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <div className="sd-luxe-card flex items-center gap-3 rounded-2xl px-4 py-3">
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
                    : "sd-luxe-card text-slate-500 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <section className="sd-luxe-panel sd-enter mt-6 rounded-[2.5rem] p-6" style={{ animationDelay: "0.14s" }}>
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
              <div className="sd-empty py-16">
                <div className="relative mx-auto mb-5 flex h-16 w-16 items-center justify-center">
                  <span className="sd-ring" aria-hidden="true" />
                  <span className="sd-ring sd-ring--2" aria-hidden="true" />
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/30">
                    <UsersRound className="h-6 w-6" />
                  </span>
                </div>
                <p className="sd-card-title text-slate-700 text-[0.95rem]">{t("noStudentsFound")}</p>
                <p className="sd-micro mt-1 max-w-xs mx-auto">{t("studentsWillAppear")}</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {visible.map((s, i) => (
                  <div
                    key={s._id}
                    onPointerMove={handleTilePointerMove}
                    onPointerLeave={handleTilePointerLeave}
                    className="sd-tile sd-luxe-rise"
                    style={{
                      animationDelay: `${0.05 + i * 0.04}s`,
                      "--tint": "linear-gradient(160deg, rgba(99,102,241,0.12) 0%, rgba(45,212,191,0.08) 100%)",
                      "--glow": "rgba(99,102,241,0.45)",
                      "--tile-border": "rgba(129,140,248,0.5)",
                    }}
                  >
                    <div className="sd-tile__inner p-5">
                      <span className="sd-tile__glare" aria-hidden="true" />
                      <div className="flex items-center gap-3">
                        <div className="sd-lift-lg relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white">
                          {s.photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={s.photo} alt={s.name} className="h-full w-full object-cover" />
                          ) : (
                            getInitials(s.name)
                          )}
                        </div>
                        <div className="sd-lift-md min-w-0 flex-1">
                          <p className="sd-card-title truncate text-[0.95rem]">{s.name}</p>
                          <p className="sd-micro truncate">{s.studentId || "—"}</p>
                        </div>
                        <span
                          className={`sd-lift-md shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            CAMPUS_TONE[s.campusStatus] || CAMPUS_TONE.Inside
                          }`}
                        >
                          {campusLabel(s.campusStatus || "Inside")}
                        </span>
                      </div>

                      <div className="sd-lift-md mt-4 flex items-center gap-1 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400">
                        <Clock3 className="h-3.5 w-3.5" /> {t("lastSeen")} {formatWhen(s.lastSeenAt)}
                      </div>
                    </div>
                  </div>
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

// useSearchParams requires a Suspense boundary for static prerendering.
export default function SecurityStudentsPage() {
  return (
    <Suspense fallback={<AuthLoading />}>
      <SecurityStudentsContent />
    </Suspense>
  );
}
