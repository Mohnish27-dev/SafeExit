"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Scanner } from '@yudiel/react-qr-scanner';
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  Loader2,
  LogIn,
  LogOut,
  MoonStar,
  ScanLine,
  Shield,
  ShieldCheck,
  Sunrise,
  SunMedium,
  Sunset,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { getFirstName, getStoredUser } from "@/app/lib/userProfile";
import { apiFetch } from "@/app/lib/api";
import { parseScannedQr } from "@/app/lib/qrPayload.mjs";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SecurityBottomNav from "./components/SecurityBottomNav";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import useCountUp from "@/app/hooks/useCountUp";

const defaultProfile = {
  name: "Security Guard",
  roleLabel: "Security Guard",
};

const formatClock = (value) => {
  if (!value) return "N/A";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "N/A";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
};

// 3D tilt for hero tiles; module scope so handlers aren't recreated per render.
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

export default function SecurityDashboardPage() {
  const { t } = useTranslation("security");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();
  const { checked, authorized } = useRequireAuth("security");
  const router = useRouter();

  const handleLogout = () => logout(router, { role: "security" });

  const statusCards = useMemo(() => [
    {
      key: "inside",
      label: t("insideCampus"),
      note: t("insideCampusNote"),
      tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: UserCheck,
    },
    {
      key: "outside",
      label: t("outsideCampus"),
      note: t("outsideCampusNote"),
      tone: "border-amber-200 bg-amber-50 text-amber-700",
      icon: UserRound,
    },
    {
      key: "overdue",
      label: t("overdue"),
      note: t("overdueNote"),
      tone: "border-rose-200 bg-rose-50 text-rose-700",
      icon: Clock3,
    },
  ], [t]);

  const [profile, setProfile] = useState(defaultProfile);
  // null so server and first client render agree; mount effect starts ticking.
  const [now, setNow] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  // Authoritative pre-confirm preview from the backend, for BOTH directions.
  const [scanPreview, setScanPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [scanMode, setScanMode] = useState(null);
  const [scans, setScans] = useState([]);
  const [counts, setCounts] = useState({ inside: 0, outside: 0, overdue: 0 });
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState("");
  // Shown inside the scanner modal when a QR is neither format; the camera stays
  // open so the guard can simply re-aim.
  const [scanError, setScanError] = useState("");

  // Recent scans + Inside/Outside/Overdue counts; backend overlays live 'Overdue'.
  const loadScans = useCallback(async () => {
    try {
      const [logs, students] = await Promise.all([
        apiFetch("/scan?limit=100"),
        apiFetch("/admin/users?role=Student"),
      ]);
      setScans(logs);

      const tally = { inside: 0, outside: 0, overdue: 0 };
      for (const s of students) {
        const status = (s.campusStatus || "").toLowerCase();
        if (status === "inside") tally.inside += 1;
        else if (status === "overdue") tally.overdue += 1;
        else tally.outside += 1; // 'outside' and any unknown status
      }
      setCounts(tally);
    } catch {
      /* guard may briefly be unauthenticated; ignore and retry on next tick */
    }
  }, []);

  useEffect(() => {
    loadScans();
    const t = setInterval(loadScans, 15000);
    return () => clearInterval(t);
  }, [loadScans]);

  // Persist the in-progress scan as a real gate movement, then refresh the feed.
  const confirmScan = async () => {
    if (!scanResult?.id && !scanResult?.sid) {
      setScanResult(null);
      return;
    }
    setLogging(true);
    setLogError("");
    const direction = scanMode === "exit" ? "OUT" : "IN";
    try {
      await apiFetch("/scan", {
        method: "POST",
        body: JSON.stringify({
          student: scanResult.sid,
          studentId: scanResult.id,
          direction,
        }),
      });
      setScanResult(null);
      setScanPreview(null);
      await loadScans();
    } catch (err) {
      setLogError(err.message || t("couldNotLogScan"));
    } finally {
      setLogging(false);
    }
  };

  const recentScans = useMemo(
    () =>
      scans.slice(0, 8).map((log) => {
        const st = log.student || {};
        return {
          id: log._id,
          name: st.name || t("unknownStudent"),
          meta: st.studentId || "—",
          tag: log.direction === "IN" ? t("entryIn") : t("exitOut"),
          time: new Date(log.createdAt).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" }),
          type: log.direction === "IN" ? "in" : "out",
        };
      }),
    [scans, t, dateLocale]
  );

  const handleScan = async (result) => {
    if (result && result[0]) {
      // Accepts the SafeExit QR and the college ID card alike; both reduce to an
      // identifier the backend resolves against the student record.
      const parsed = parseScannedQr(result[0].rawValue);
      if (!parsed) {
        // Never log rawValue — an ID card carries DOB, address and phone number.
        setScanError(t("unreadableQr"));
        return;
      }

      setScanError("");
      setScanResult(parsed);
      setIsScanning(false);

      setScanPreview(null);
      setPreviewLoading(true);
      try {
        const params = new URLSearchParams();
        if (parsed.sid) params.set("sid", parsed.sid);
        if (parsed.id) params.set("studentId", parsed.id);
        // Authenticated (Guard/Admin) — also carries the student's face photo.
        const preview = await apiFetch(`/scan/preview?${params.toString()}`);
        setScanPreview(preview);
        if (preview?.student) {
          setScanResult((prev) =>
            prev
              ? {
                  ...prev,
                  sid: preview.student._id || prev.sid,
                  id: preview.student.studentId || prev.id,
                  name: preview.student.name || prev.name,
                  photo: preview.student.photo || "",
                }
              : prev
          );
        }
      } catch (e) {
        console.error("Failed to load scan preview:", e);
      } finally {
        setPreviewLoading(false);
      }
    }
  };

  useEffect(() => {
    const storedProfile = getStoredUser();
    if (!storedProfile?.name) return;

    setProfile((prev) => ({
      ...prev,
      ...storedProfile,
      roleLabel: storedProfile.roleLabel || prev.roleLabel,
    }));
  }, []);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const greetingName = useMemo(() => {
    const firstName = getFirstName(profile.name);
    return firstName || profile.name;
  }, [profile.name]);

  const formattedDate = useMemo(
    () => (now ? now.toLocaleDateString(dateLocale, { day: "2-digit", month: "short", year: "numeric" }) : ""),
    [now, dateLocale]
  );

  const formattedTime = useMemo(
    () => (now ? now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""),
    [now, dateLocale]
  );

  // Decorative time-of-day visual for the greeting orb, plus the matching greeting.
  const timeVisual = useMemo(() => {
    const hour = now ? now.getHours() : 9;
    if (hour < 12) return { Icon: Sunrise, orb: "from-amber-400 via-orange-400 to-rose-400", halo: "rgba(251,146,60,0.5)", greetingKey: "goodMorning" };
    if (hour < 17) return { Icon: SunMedium, orb: "from-sky-400 via-cyan-400 to-blue-400", halo: "rgba(56,189,248,0.5)", greetingKey: "goodAfternoon" };
    if (hour < 21) return { Icon: Sunset, orb: "from-orange-400 via-pink-500 to-violet-500", halo: "rgba(236,72,153,0.5)", greetingKey: "goodEvening" };
    return { Icon: MoonStar, orb: "from-indigo-500 via-violet-500 to-slate-700", halo: "rgba(99,102,241,0.5)", greetingKey: "goodNight" };
  }, [now]);

  const handleHeroMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    e.currentTarget.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  };

  const totalTracked = counts.inside + counts.outside + counts.overdue;

  // Gate on a valid security session; hook redirects to /login/security otherwise.
  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-28 md:pb-10">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
          <header className="order-1 lg:order-0 sd-luxe-panel grd-glow-border sd-enter flex flex-wrap items-center justify-between gap-3 rounded-4xl px-4 py-3 sm:px-5 sm:py-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <span
                className="flex h-12 w-12 sm:h-14 sm:w-14 shrink-0 items-center justify-center rounded-2xl text-white"
                style={{
                  background: "linear-gradient(145deg, #0f172a 0%, #0f766e 52%, #2dd4bf 100%)",
                  boxShadow: "0 18px 40px -20px rgba(13,148,136,0.6)",
                }}
              >
                <Shield className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <div className="min-w-0">
                <span className="sd-kicker">{t("liveCommand")}</span>
                <h1 className="sd-title sd-title-md mt-0.5 leading-tight">{t("controlTitle")}</h1>
                <p className="sd-micro mt-1">{t("guardOps")}</p>
              </div>
            </div>

            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <LanguageSwitcher />
              <Link
                href="/dashboard/security/profile"
                className="sd-profile-chip flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 sm:flex-none"
              >
                <span className="sd-profile-avatar shrink-0">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="sd-card-title truncate">{profile.name}</p>
                  <p className="sd-micro truncate">{profile.roleLabel}</p>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 rotate-90 text-slate-400" />
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                title={tc("logout")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition hover:bg-rose-50 sm:h-12 sm:w-12"
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">{tc("logout")}</span>
              </button>
            </div>
          </header>

          <section
            onPointerMove={handleHeroMove}
            style={{ animationDelay: "0.12s" }}
            className="order-2 lg:order-0 sd-luxe-panel grd-glow-border sd-spot-host sd-enter mt-4 rounded-4xl p-4 sm:p-6 shadow-xl"
          >
            <span className="sd-spotlight" aria-hidden="true" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="sd-luxe-float sd-orb-halo hidden h-12 w-12 shrink-0 items-center justify-center rounded-full ring-4 ring-white/80 shadow-lg sm:flex"
                  style={{ "--halo": timeVisual.halo }}
                >
                  <span className={`flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br text-white ${timeVisual.orb}`}>
                    <timeVisual.Icon className="h-6 w-6" />
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="sd-kicker">{t("shiftPulse")}</span>
                  <h2 className="sd-title sd-title-sm sd-reveal sd-stagger-2 mt-0.5">
                    {t(timeVisual.greetingKey)}, <span className="sd-name-live">{greetingName}</span>.
                  </h2>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600">
                <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-2 rounded-full px-3 py-1.5">
                  <CalendarDays className="h-4 w-4 text-indigo-500" />
                  {formattedDate}
                </span>
                <span suppressHydrationWarning className="sd-luxe-pill sd-live-pulse inline-flex items-center gap-2 rounded-full px-3 py-1.5">
                  <Clock3 className="h-4 w-4 text-sky-500" />
                  {formattedTime}
                  <span className="sd-luxe-chip ml-1 rounded-full px-2 py-0.5 text-xs font-bold">{tc("live")}</span>
                </span>
              </div>
            </div>
          </section>

          <section className="order-3 lg:order-0 mt-4 grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-stretch">
            <div className="sd-luxe-panel sd-enter min-w-0 rounded-4xl p-4 sm:p-6 flex flex-col" style={{ animationDelay: "0.2s" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="sd-kicker">{t("quickScan")}</span>
                  <h2 className="sd-title sd-title-sm mt-1">{t("scanGateway")}</h2>
                </div>
                <span className="sd-tag shrink-0 whitespace-nowrap">
                  <span className="grd-radar h-3 w-3" aria-hidden="true" />
                  {t("realtime")}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-4 flex-1">
                <div
                  onPointerMove={handleTilePointerMove}
                  onPointerLeave={handleTilePointerLeave}
                  className="sd-tile sd-luxe-rise h-full"
                  style={{
                    animationDelay: "0.24s",
                    "--tint": "linear-gradient(160deg, rgba(14,165,233,0.13) 0%, rgba(99,102,241,0.09) 100%)",
                    "--glow": "rgba(14,165,233,0.5)",
                    "--tile-border": "rgba(56,189,248,0.5)",
                  }}
                >
                  <div onClick={() => { setScanMode('exit'); setScanError(""); setIsScanning(true); }} className="sd-tile__inner h-full flex flex-col items-center justify-center p-5 text-center cursor-pointer">
                    <span className="sd-tile__glare" aria-hidden="true" />
                    <span
                      className="sd-lift-lg flex h-16 w-16 items-center justify-center rounded-full text-white"
                      style={{
                        background: "linear-gradient(145deg, #0369a1 0%, #38bdf8 55%, #6366f1 100%)",
                        boxShadow: "0 12px 24px -10px rgba(14,165,233,0.55)",
                      }}
                    >
                      <LogOut className="h-8 w-8" />
                    </span>
                    <h3 className="sd-lift-md sd-card-title mt-3 text-base">{t("scanExit")}</h3>
                    <p className="sd-lift-md sd-body mt-1.5 text-xs leading-snug">{t("scanExitDesc")}</p>
                    <button
                      onClick={() => { setScanMode('exit'); setScanError(""); setIsScanning(true); }}
                      className="sd-magnetic mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-white shadow-lg transition-shadow duration-300 hover:shadow-2xl cursor-pointer"
                      style={{ background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)" }}
                      onPointerMove={(e) => {
                        const el = e.currentTarget;
                        const rect = el.getBoundingClientRect();
                        el.style.setProperty("--mag-x", `${(e.clientX - (rect.left + rect.width / 2)) * 0.2}px`);
                        el.style.setProperty("--mag-y", `${(e.clientY - (rect.top + rect.height / 2)) * 0.2}px`);
                      }}
                      onPointerLeave={(e) => {
                        e.currentTarget.style.setProperty("--mag-x", "0px");
                        e.currentTarget.style.setProperty("--mag-y", "0px");
                      }}
                    >
                      <ScanLine className="h-5 w-5" />
                      {t("scanExit")}
                    </button>
                  </div>
                </div>

                <div
                  onPointerMove={handleTilePointerMove}
                  onPointerLeave={handleTilePointerLeave}
                  className="sd-tile sd-luxe-rise h-full"
                  style={{
                    animationDelay: "0.3s",
                    "--tint": "linear-gradient(160deg, rgba(16,185,129,0.13) 0%, rgba(45,212,191,0.09) 100%)",
                    "--glow": "rgba(16,185,129,0.5)",
                    "--tile-border": "rgba(45,212,191,0.5)",
                  }}
                >
                  <div onClick={() => { setScanMode('entry'); setScanError(""); setIsScanning(true); }} className="sd-tile__inner h-full flex flex-col items-center justify-center p-5 text-center cursor-pointer">
                    <span className="sd-tile__glare" aria-hidden="true" />
                    <span
                      className="sd-lift-lg flex h-16 w-16 items-center justify-center rounded-full text-white"
                      style={{
                        background: "linear-gradient(145deg, #047857 0%, #10b981 55%, #2dd4bf 100%)",
                        boxShadow: "0 12px 24px -10px rgba(16,185,129,0.55)",
                      }}
                    >
                      <LogIn className="h-8 w-8" />
                    </span>
                    <h3 className="sd-lift-md sd-card-title mt-3 text-base">{t("scanEntry")}</h3>
                    <p className="sd-lift-md sd-body mt-1.5 text-xs leading-snug">{t("scanEntryDesc")}</p>
                    <button
                      onClick={() => { setScanMode('entry'); setScanError(""); setIsScanning(true); }}
                      className="sd-magnetic mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-xs font-semibold uppercase tracking-[0.15em] text-white shadow-lg transition-shadow duration-300 hover:shadow-2xl cursor-pointer"
                      style={{ background: "linear-gradient(135deg, #10b981 0%, #0d9488 100%)" }}
                      onPointerMove={(e) => {
                        const el = e.currentTarget;
                        const rect = el.getBoundingClientRect();
                        el.style.setProperty("--mag-x", `${(e.clientX - (rect.left + rect.width / 2)) * 0.2}px`);
                        el.style.setProperty("--mag-y", `${(e.clientY - (rect.top + rect.height / 2)) * 0.2}px`);
                      }}
                      onPointerLeave={(e) => {
                        e.currentTarget.style.setProperty("--mag-x", "0px");
                        e.currentTarget.style.setProperty("--mag-y", "0px");
                      }}
                    >
                      <ScanLine className="h-5 w-5" />
                      {t("scanEntry")}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <aside className="sd-luxe-panel sd-luxe-rise mt-0 min-w-0 rounded-[2.5rem] p-5 sm:p-6" style={{ animationDelay: "0.34s" }}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="sd-kicker">{t("shiftSignal")}</span>
                  <h3 className="sd-title sd-title-sm mt-2">{t("studentsStatus")}</h3>
                  <p className="sd-micro mt-1.5">{t("gatesSynced")}</p>
                </div>
                <Link href="/dashboard/security/students" className="sd-tag shrink-0 whitespace-nowrap">
                  {tc("viewAll")}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <div className="mt-5 space-y-3">
                {[
                  {
                    label: t("insideCampus"),
                    note: t("insideCampusNote"),
                    count: counts.inside,
                    chip: "linear-gradient(145deg,#047857 0%,#10b981 100%)",
                    fill: "linear-gradient(90deg,#10b981,#2dd4bf)",
                    glow: "rgba(16,185,129,0.45)",
                    Icon: UserCheck,
                  },
                  {
                    label: t("outsideCampus"),
                    note: t("outsideCampusNote"),
                    count: counts.outside,
                    chip: "linear-gradient(145deg,#b45309 0%,#f59e0b 100%)",
                    fill: "linear-gradient(90deg,#f59e0b,#fbbf24)",
                    glow: "rgba(245,158,11,0.45)",
                    Icon: UserRound,
                  },
                  {
                    label: t("overdue"),
                    note: t("overdueNote"),
                    count: counts.overdue,
                    chip: "linear-gradient(145deg,#be123c 0%,#f43f5e 100%)",
                    fill: "linear-gradient(90deg,#f43f5e,#fb7185)",
                    glow: "rgba(244,63,94,0.45)",
                    Icon: Clock3,
                  },
                ].map((item) => {
                  const barW = totalTracked > 0 ? Math.min(100, Math.max(4, (item.count / totalTracked) * 100)) : 4;
                  return (
                    <div key={item.label} className="sd-stat px-4 py-3.5" style={{ "--stat-glow": item.glow }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
                            style={{ background: item.chip, boxShadow: `0 10px 20px -10px ${item.glow}` }}
                          >
                            <item.Icon className="h-[1.1rem] w-[1.1rem]" />
                          </span>
                          <div className="min-w-0">
                            <p className="sd-card-title leading-snug" style={{ fontSize: "0.88rem" }}>{item.label}</p>
                            <p className="sd-micro mt-0.5" style={{ fontSize: "0.74rem" }}>{item.note}</p>
                          </div>
                        </div>
                        <p
                          className="grd-mono shrink-0 text-2xl font-bold tracking-tight text-transparent bg-clip-text"
                          style={{ backgroundImage: item.fill }}
                        >
                          {item.count}
                        </p>
                      </div>
                      <div className="sd-bar mt-3">
                        <div className="sd-bar__fill" style={{ width: `${barW}%`, background: item.fill, boxShadow: `0 0 10px ${item.glow}` }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50/70 px-4 py-2.5 border border-slate-100">
                <span className="sd-micro text-xs">Total tracked</span>
                <span className="sd-card-title text-sm grd-mono">{totalTracked}</span>
              </div>
            </aside>
          </section>

          <section className="order-5 lg:order-0 mt-6">
            <div className="sd-luxe-panel sd-enter min-w-0 rounded-[2.5rem] p-5 sm:p-6" style={{ animationDelay: "0.44s" }}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="sd-kicker">{t("realtime")}</span>
                  <h2 className="sd-title sd-title-sm mt-1">{t("recentScans")}</h2>
                  <p className="sd-micro mt-0.5">{t("gateLog")}</p>
                </div>
                <Link href="/dashboard/security/history" className="sd-tag shrink-0 whitespace-nowrap">
                  {tc("viewAll")}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {recentScans.length === 0 && (
                  <div className="sd-empty sm:col-span-2">
                    <span className="relative mx-auto flex h-12 w-12 items-center justify-center">
                      <span className="sd-ring" aria-hidden="true" />
                      <span className="sd-ring sd-ring--2" aria-hidden="true" />
                      <ScanLine className="h-5 w-5 text-slate-400" />
                    </span>
                    <p className="mt-3 sd-micro">{t("noScansYet")}</p>
                  </div>
                )}
                {recentScans.map((scan) => (
                  <div key={scan.id} className="sd-row flex-wrap" style={{ "--accent": scan.type === "in" ? "#10b981" : "#38bdf8" }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className="sd-profile-avatar shrink-0"
                        style={{ height: "2.25rem", width: "2.25rem", fontSize: "0.72rem" }}
                      >
                        {scan.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}
                      </span>
                      <div className="min-w-0">
                        <p className="sd-card-title truncate" style={{ fontSize: "0.9rem" }}>{scan.name}</p>
                        <p className="sd-micro truncate mt-0.5">{scan.meta}</p>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <span
                        className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide ${
                          scan.type === "in" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"
                        }`}
                      >
                        {scan.tag}
                      </span>
                      <span className="sd-micro grd-mono whitespace-nowrap">{scan.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {counts.overdue > 0 && (
            <section
              className="order-4 lg:order-0 sd-luxe-panel sd-glow-border sd-enter mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[2.5rem] p-5 sm:p-6"
              style={{ "--tile-border": "rgba(244,63,94,0.5)" }}
            >
              <div className="flex min-w-0 items-center gap-4">
                <span
                  className="sd-orb-halo relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ "--halo": "rgba(244,63,94,0.5)", background: "linear-gradient(145deg, #be123c 0%, #f43f5e 100%)" }}
                >
                  <span className="sd-ring" style={{ borderColor: "rgba(244,63,94,0.4)" }} aria-hidden="true" />
                  <Bell className="h-7 w-7" />
                </span>
                <div className="min-w-0">
                  <span className="sd-kicker text-rose-400">{t("alerts")}</span>
                  <h2 className="sd-title sd-title-sm mt-1">
                    {counts.overdue} {counts.overdue === 1 ? t("studentOverdue") : t("studentsOverduePlural")}
                  </h2>
                  <p className="sd-body mt-1 text-[0.9rem]">{t("overdueAttention")}</p>
                </div>
              </div>
              <Link
                href="/dashboard/security/students?filter=overdue"
                className="sd-btn-glow w-full rounded-2xl px-6 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-lg sm:w-auto"
                style={{ background: "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)" }}
              >
                {t("viewNow")}
              </Link>
            </section>
          )}

        </div>
      </div>

      {!isScanning && !scanResult && <SecurityBottomNav active="Home" />}

      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="sd-enter relative max-h-[92dvh] w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h3 className="sd-card-title flex items-center gap-2 text-lg">
                {t("scanStudentQR")}
                <span className="grd-radar h-3 w-3" aria-hidden="true" />
              </h3>
              <button onClick={() => { setScanError(""); setIsScanning(false); }} className="cursor-pointer rounded-full p-2 transition hover:bg-slate-100">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            {scanError && (
              <p className="mx-4 mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{scanError}</p>
            )}
            <div className="grd-frame grd-sweep relative aspect-square w-full bg-black/5">
              <span className="grd-corner grd-corner--tl" style={{ "--grd-bracket": "rgba(45,212,191,0.85)" }} aria-hidden="true" />
              <span className="grd-corner grd-corner--tr" style={{ "--grd-bracket": "rgba(45,212,191,0.85)" }} aria-hidden="true" />
              <span className="grd-corner grd-corner--bl" style={{ "--grd-bracket": "rgba(45,212,191,0.85)" }} aria-hidden="true" />
              <span className="grd-corner grd-corner--br" style={{ "--grd-bracket": "rgba(45,212,191,0.85)" }} aria-hidden="true" />
              <Scanner
                onScan={handleScan}
                onError={(error) => console.error(error)}
                components={{ audio: false, finder: true }}
              />
            </div>
          </div>
        </div>
      )}

      {scanResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-md sm:p-4">
          <div className="sd-enter relative max-h-[94dvh] w-full max-w-md overflow-y-auto rounded-[1.75rem] bg-white text-center shadow-2xl">
            <button
              onClick={() => { setScanResult(null); setScanPreview(null); }}
              aria-label={tc("cancel")}
              className="absolute top-3 right-3 z-10 cursor-pointer rounded-full bg-white/95 p-2.5 text-slate-600 shadow-lg transition hover:bg-white sm:top-4 sm:right-4"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex h-[clamp(14rem,40dvh,20rem)] w-full items-center justify-center overflow-hidden bg-slate-100">
              {scanResult.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scanResult.photo}
                  alt={scanResult.name || t("unknownStudent")}
                  className="h-full w-full object-cover object-[center_20%]"
                />
              ) : (
                <UserRound className="h-24 w-24 text-slate-400" />
              )}
            </div>

            <div className="flex flex-col items-center p-4 sm:p-5">
              <div className="w-full border-b border-slate-100 pb-4">
                <h2 className="sd-title sd-title-sm">{scanResult.name || t("unknownStudent")}</h2>
                <p className="sd-micro grd-mono mt-1 uppercase tracking-widest">
                  {scanResult.id}
                </p>
              </div>

              <div className="mt-4 mb-4 w-full space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("status")}</span>
                  {scanMode === 'exit' ? (
                    (() => {
                      if (previewLoading) {
                        return (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            {t("checking")}
                          </span>
                        );
                      }
                      if (scanPreview?.exit) {
                        const { allowed, reason } = scanPreview.exit;
                        const label = allowed
                          ? t("approved")
                          : reason === "expired"
                            ? t("expiredPass")
                            : reason === "not-yet-valid"
                              ? t("notYetValidPass")
                              : t("noApprovedOuting");
                        return (
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                            allowed ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                          }`}>
                            {label}
                          </span>
                        );
                      }

                      return (
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
                          {t("unverified")}
                        </span>
                      );
                    })()
                  ) : (
                    (() => {
                      const isOverdue = scanPreview?.punctuality === "Overdue";
                      return (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          isOverdue ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {isOverdue ? t("overdue") : t("onTimeIn")}
                        </span>
                      );
                    })()
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {scanMode === 'exit' ? t("validWindow") : t("loggedTime")}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {scanMode === 'exit'
                      ? (scanPreview?.exit?.pass
                          ? `${formatClock(scanPreview.exit.pass.windowStart)} to ${formatClock(scanPreview.exit.pass.windowEnd)}`
                          : t("na"))
                      : formattedTime
                    }
                  </span>
                </div>
                {scanMode === 'entry' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("allowedReturn")}</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {scanPreview?.activePass?.windowEnd
                        ? formatClock(scanPreview.activePass.windowEnd)
                        : t("na")}
                    </span>
                  </div>
                )}
                {((scanMode === 'exit' && scanPreview?.exit?.passType) || (scanMode === 'entry' && scanPreview?.activePass?.passType)) && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("passType")}</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {(scanMode === 'exit' ? scanPreview.exit.passType : scanPreview.activePass.passType) === 'Leave'
                        ? t("leavePass")
                        : t("outingPass")}
                    </span>
                  </div>
                )}
              </div>

              {logError && (
                <p className="mb-3 w-full rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{logError}</p>
              )}

              {(() => {
                const exitBlocked =
                  scanMode === "exit" && !previewLoading && scanPreview?.exit && !scanPreview.exit.allowed;
                const exitBlockedMsg =
                  scanPreview?.exit?.reason === "expired"
                    ? t("exitBlockedExpired")
                    : scanPreview?.exit?.reason === "not-yet-valid"
                      ? t("exitBlockedNotYetValid")
                      : t("exitBlockedNoPass");

                const entryBlocked =
                  scanMode === "entry" && !previewLoading && scanPreview?.student &&
                  scanPreview.student.campusStatus === "Inside";
                const entryBlockedMsg = t("entryBlockedInside");

                const isBlocked = exitBlocked || entryBlocked;
                const blockedMsg = exitBlocked ? exitBlockedMsg : entryBlockedMsg;

                return (
                  <>
                    {isBlocked && (
                      <p className="mb-3 w-full rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">
                        {blockedMsg}
                      </p>
                    )}
                    <div className="flex gap-3 w-full">
                      <button
                        onClick={() => { setLogError(""); setScanResult(null); setScanPreview(null); }}
                        disabled={logging}
                        className="flex-1 py-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                      >
                        {tc("cancel")}
                      </button>
                      <button
                        onClick={confirmScan}
                        disabled={logging || previewLoading || isBlocked}
                        className={`flex-1 py-3.5 rounded-xl text-sm font-bold text-white shadow-lg transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${
                          scanMode === 'exit'
                            ? "bg-sky-500 shadow-sky-500/30 hover:bg-sky-600"
                            : "bg-emerald-500 shadow-emerald-500/30 hover:bg-emerald-600"
                        }`}
                      >
                        {logging
                          ? t("logging")
                          : exitBlocked
                            ? t("exitDenied")
                            : entryBlocked
                              ? t("entryDenied")
                              : scanMode === 'exit' ? t("logExit") : t("logEntry")}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}

// Gradient stat card with count-up numeral and proportion bar.
function GuardStatCard({ card, value, total }) {
  const [ref, animated] = useCountUp(value);
  const display = Math.round(animated);
  const palette = {
    inside: {
      chip: "linear-gradient(145deg, #047857 0%, #10b981 100%)",
      fill: "linear-gradient(90deg, #10b981, #2dd4bf)",
      glow: "rgba(16,185,129,0.45)",
    },
    outside: {
      chip: "linear-gradient(145deg, #b45309 0%, #f59e0b 100%)",
      fill: "linear-gradient(90deg, #f59e0b, #fbbf24)",
      glow: "rgba(245,158,11,0.45)",
    },
    overdue: {
      chip: "linear-gradient(145deg, #be123c 0%, #f43f5e 100%)",
      fill: "linear-gradient(90deg, #f43f5e, #fb7185)",
      glow: "rgba(244,63,94,0.45)",
    },
  }[card.key];
  const width = total > 0 ? Math.min(100, Math.max(4, (value / total) * 100)) : 4;
  const Icon = card.icon;

  return (
    <div ref={ref} className="sd-stat px-4 py-4" style={{ "--stat-glow": palette.glow }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-md"
            style={{ background: palette.chip, boxShadow: `0 10px 20px -10px ${palette.glow}` }}
          >
            <Icon className="h-[1.1rem] w-[1.1rem]" />
          </span>
          <div className="min-w-0">
            <p className="sd-card-title" style={{ fontSize: "0.88rem" }}>{card.label}</p>
            <p className="sd-micro mt-0.5" style={{ fontSize: "0.75rem" }}>{card.note}</p>
          </div>
        </div>
        <p
          className="grd-mono shrink-0 text-2xl font-bold tracking-tight text-transparent bg-clip-text"
          style={{ backgroundImage: palette.fill }}
        >
          {display}
        </p>
      </div>
      <div className="sd-bar mt-4">
        <div
          className="sd-bar__fill"
          style={{ width: `${width}%`, background: palette.fill, boxShadow: `0 0 12px ${palette.glow}` }}
        />
      </div>
    </div>
  );
}
