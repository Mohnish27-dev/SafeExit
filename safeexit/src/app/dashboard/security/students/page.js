"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Loader2,
  Phone,
  Search,
  UsersRound,
} from "lucide-react";
import { apiFetch, apiFetchWithHeaders } from "@/app/lib/api";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SecurityBottomNav from "../components/SecurityBottomNav";
import StudentAvatar from "../components/StudentAvatar";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

const CAMPUS_TONE = {
  Inside: "bg-emerald-100 text-emerald-700",
  Outside: "bg-amber-100 text-amber-700",
  OnLeave: "bg-purple-100 text-purple-700",
  Overdue: "bg-rose-100 text-rose-700",
  DayScholar: "bg-sky-100 text-sky-700",
};

// A day scholar's campusStatus is never written (the gate only logs their movements), so
// their pill says what they are rather than a stale "Inside".
const pillStatus = (s) => (s.residency === "DayScholar" ? "DayScholar" : s.campusStatus || "Inside");

// ?filter= value -> the server's campusStatus bucket (same buckets as the dashboard tiles).
const FILTER_STATUS = { inside: "Inside", outside: "Outside", onleave: "OnLeave", overdue: "Overdue" };
const PAGE_SIZE = 200;

// A leave's return is a date, not a time (the leave QR works all day on the return date).
const formatExpectedReturn = (value, locale) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(locale || "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
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
  const router = useRouter();
  const searchParams = useSearchParams();
  // The URL is the source of truth, so a dashboard tile link, a refresh and Back all land
  // on the same filter.
  const rawFilter = searchParams.get("filter") || "";
  const statusFilter = FILTER_STATUS[rawFilter] ? rawFilter : "";
  const setStatusFilter = (key) =>
    router.replace(key ? `/dashboard/security/students?filter=${key}` : "/dashboard/security/students", { scroll: false });

  const formatWhen = useCallback((iso) =>
    iso
      ? new Date(iso).toLocaleString(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "—",
    [dateLocale]
  );

  const campusLabel = useCallback((status) => {
    if (status === "Inside") return t("inside");
    if (status === "Outside") return t("outside");
    if (status === "OnLeave") return t("onLeave");
    if (status === "Overdue") return t("overdue");
    if (status === "DayScholar") return t("dayScholar");
    return t("inside");
  }, [t]);

  const [students, setStudents] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  // Which filter+search the list on screen belongs to; loading until it matches the current one.
  const [loadedKey, setLoadedKey] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [totalCount, setTotalCount] = useState(null);
  // Responses can land out of order while the guard types; only the latest one counts.
  const requestIdRef = useRef(0);
  // Who to phone for each overdue student, keyed by student _id. The roster carries no
  // phone numbers; /outing/overdue does, and for girls it carries no number at all.
  const [overdueContacts, setOverdueContacts] = useState(() => new Map());

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  // Filtering and search run on the server. The roster is paginated (newest 200 by
  // default), so filtering in the browser only ever saw the first page: an outside or
  // overdue student who registered earlier was counted by the dashboard tile but missing
  // from this list.
  const fetchPage = useCallback(async (skip) => {
    const params = new URLSearchParams({ role: "Student", limit: String(PAGE_SIZE), skip: String(skip) });
    if (statusFilter) params.set("campusStatus", FILTER_STATUS[statusFilter]);
    if (debouncedSearch) params.set("search", debouncedSearch);
    const { data, headers } = await apiFetchWithHeaders(`/admin/users?${params}`);
    const total = headers.get("X-Total-Count");
    return { data, total: total ? parseInt(total, 10) : null };
  }, [statusFilter, debouncedSearch]);

  const queryKey = `${statusFilter}|${debouncedSearch}`;
  const loading = loadedKey !== queryKey;

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    fetchPage(0)
      .then(({ data, total }) => {
        if (requestId !== requestIdRef.current) return;
        setStudents(data);
        setTotalCount(total);
        setError("");
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return;
        setStudents([]);
        setTotalCount(null);
        setError(err.message || "Could not load students");
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoadedKey(queryKey);
      });
    // Refreshed with every list load so a student who just turned overdue has a number.
    // A failure only costs the contact lines, never the roster.
    apiFetch("/outing/overdue")
      .then((rows) => {
        if (requestId !== requestIdRef.current || !Array.isArray(rows)) return;
        const map = new Map();
        for (const o of rows) {
          const sid = o.student?._id;
          if (sid && !map.has(sid)) map.set(sid, o);
        }
        setOverdueContacts(map);
      })
      .catch(() => {});
  }, [fetchPage, queryKey]);

  const loadMore = async () => {
    const requestId = requestIdRef.current;
    setLoadingMore(true);
    try {
      const { data, total } = await fetchPage(students.length);
      if (requestId !== requestIdRef.current) return;
      setStudents((prev) => {
        const seen = new Set(prev.map((s) => s._id));
        return [...prev, ...data.filter((s) => !seen.has(s._id))];
      });
      setTotalCount(total);
    } catch (err) {
      if (requestId === requestIdRef.current) setError(err.message || "Could not load students");
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = students;
  const hasMore = totalCount !== null && students.length < totalCount;

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-28 md:pb-10">
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
                <p className="sd-body mt-0.5 text-sm">
                  {loading
                    ? " "
                    : hasMore
                      ? `Showing ${students.length} of ${totalCount}`
                      : debouncedSearch || statusFilter
                        ? `${students.length} ${students.length === 1 ? "match" : "matches"}`
                        : `${students.length} ${t("registered")}`}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <LanguageSwitcher />
              <div className="sd-luxe-card flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 sm:flex-none">
                <Search className="h-4 w-4 shrink-0 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchNameRoll") || t("searchNameRollEmail")}
                  className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none sm:w-56"
                />
              </div>
            </div>
          </header>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              { key: "", label: t("all") || "All" },
              { key: "inside", label: t("inside") },
              { key: "outside", label: t("outside") },
              { key: "onleave", label: t("onLeave") },
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

          <section className="sd-luxe-panel sd-enter mt-6 rounded-3xl p-4 sm:rounded-[2.5rem] sm:p-6" style={{ animationDelay: "0.14s" }}>
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
                <p className="sd-micro mt-1 max-w-xs mx-auto">
                  {debouncedSearch
                    ? t("noSearchMatch")
                    : statusFilter === "inside"
                      ? t("noneInsideNow")
                      : statusFilter === "outside"
                        ? t("noneOutsideNow")
                        : statusFilter === "onleave"
                          ? t("noneOnLeaveNow")
                          : statusFilter === "overdue"
                          ? t("noneOverdueNow")
                          : t("studentsWillAppear")}
                </p>
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
                        <StudentAvatar
                          id={s._id}
                          name={s.name}
                          hasPhoto={s.hasPhoto}
                          className="sd-lift-lg relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white"
                        />
                        <div className="sd-lift-md min-w-0 flex-1">
                          <p className="sd-card-title truncate text-[0.95rem]">{s.name}</p>
                          <p className="sd-micro truncate">{s.studentId || "—"}</p>
                        </div>
                        <span
                          className={`sd-lift-md shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                            CAMPUS_TONE[pillStatus(s)] || CAMPUS_TONE.Inside
                          }`}
                        >
                          {campusLabel(pillStatus(s))}
                        </span>
                      </div>

                      {s.campusStatus === "Overdue" && (
                        <OverdueContact row={overdueContacts.get(s._id)} t={t} />
                      )}
                      {s.campusStatus === "OnLeave" && <LeaveContact student={s} t={t} dateLocale={dateLocale} />}
                      {/* Sent only for boys on an outing, never for anyone on leave; plain text, the gate PC cannot dial. */}
                      {s.campusStatus === "Outside" && s.phoneNumber && (
                        <p className="sd-lift-md mt-3 flex items-center gap-2 text-slate-700">
                          <Phone className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                          <span className="select-all font-mono text-base font-bold tabular-nums tracking-wide">
                            {s.phoneNumber}
                          </span>
                        </p>
                      )}

                      <div className="sd-lift-md mt-4 flex items-center gap-1 border-t border-slate-100 pt-3 text-[11px] font-medium text-slate-400">
                        <Clock3 className="h-3.5 w-3.5" /> {t("lastSeen")} {formatWhen(s.lastSeenAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!loading && hasMore && (
              <div className="mt-6 flex justify-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="sd-luxe-card inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
                >
                  {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
                  Load more ({totalCount - students.length} left)
                </button>
              </div>
            )}
          </section>

          <SecurityBottomNav active="Students" />
        </div>
      </div>
    </main>
  );
}

// Who the guard phones for an overdue student. Plain text on purpose, not a tel: link or a
// call button: the gate PC cannot dial, so the guard reads the number off the screen.
// Girls are called by the female guard at their hostel, so the backend sends no number at
// all for a girl — the gate guard passes her name and roll number to her hostel's female guard.
function OverdueContact({ row, t }) {
  if (!row) return null;
  const student = row.student || {};

  if (row.hostelGuardCalls) {
    return (
      <div className="sd-lift-md mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-bold text-amber-800">{t("hostelGuardWillCall")}</p>
        <p className="mt-0.5 text-xs text-amber-700">{t("tellHostelGuardNameRoll")}</p>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-2 text-amber-900">
          <span className="text-base font-semibold">{student.name}</span>
          <span className="select-all font-mono text-lg font-bold tabular-nums tracking-wide">
            {student.studentId || "—"}
          </span>
          {student.hostelName && <span className="text-sm font-semibold">· {student.hostelName}</span>}
        </p>
      </div>
    );
  }

  return (
    <div className="sd-lift-md mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-rose-700">{t("studentPhone")}</p>
      {student.phoneNumber ? (
        <p className="mt-1 flex items-center gap-2 text-rose-900">
          <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="select-all font-mono text-xl font-bold tabular-nums tracking-wide">
            {student.phoneNumber}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-sm font-semibold text-rose-800">{t("noPhoneOnFile")}</p>
      )}
      {(student.hostelName || student.roomNumber) && (
        <p className="mt-1 text-xs text-rose-700">
          {[student.hostelName, student.roomNumber && `${t("room")} ${student.roomNumber}`].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}

// A student on leave, laid out like the overdue card but in leave purple. A leave is never
// overdue. The backend sends a boy's number, hostel and room, their expected return date,
// and for a girl only her hostel and expected return date, so this renders whatever arrived
// and needs no gender check of its own.
function LeaveContact({ student, t, dateLocale }) {
  const place = [student.hostelName, student.roomNumber && `${t("room")} ${student.roomNumber}`]
    .filter(Boolean)
    .join(" · ");
  const formattedReturnDate = formatExpectedReturn(student.expectedReturnDate, dateLocale);
  if (!student.phoneNumber && !place && !formattedReturnDate) return null;

  return (
    <div className="sd-lift-md mt-4 rounded-2xl border border-purple-200 bg-purple-50 px-4 py-3">
      {student.phoneNumber && (
        <>
          <p className="text-xs font-bold uppercase tracking-wide text-purple-700">{t("studentPhone")}</p>
          <p className="mt-1 flex items-center gap-2 text-purple-900">
            <Phone className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="select-all font-mono text-xl font-bold tabular-nums tracking-wide">
              {student.phoneNumber}
            </span>
          </p>
        </>
      )}
      {place && (
        <p className={student.phoneNumber ? "mt-1 text-xs text-purple-700" : "text-sm font-semibold text-purple-800"}>
          {!student.phoneNumber && <span className="font-bold">{t("hostel")}: </span>}
          {place}
        </p>
      )}
      {formattedReturnDate && (
        <div
          className={`flex items-center gap-1.5 text-xs text-purple-800 ${
            student.phoneNumber || place ? "mt-2.5 border-t border-purple-200/70 pt-2" : ""
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-purple-600" aria-hidden="true" />
          <span className="font-semibold text-purple-700">{t("expectedReturn")}:</span>
          <span className="font-bold text-purple-950 font-mono tracking-tight">{formattedReturnDate}</span>
        </div>
      )}
    </div>
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
