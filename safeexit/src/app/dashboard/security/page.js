"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Scanner } from '@yudiel/react-qr-scanner';
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  LogIn,
  LogOut,
  ScanLine,
  Shield,
  ShieldCheck,
  UserCheck,
  UserRound,
  X,
} from "lucide-react";
import { getFirstName, getStoredUser } from "@/app/lib/userProfile";
import { apiFetch } from "@/app/lib/api";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SecurityBottomNav from "./components/SecurityBottomNav";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

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

export default function SecurityDashboardPage() {
  const { t } = useTranslation("security");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();
  const { checked, authorized } = useRequireAuth("security");

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
  // Start null so the server render and the first client render agree (no
  // Date on the server). The mount effect below fills it in and starts ticking.
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

  // Pull the latest gate movements for the Recent Scans list, and derive the
  // Inside/Outside/Overdue counts from the student roster. campusStatus is the
  // authoritative per-student location (written on every scan), and the backend
  // overlays a live 'Overdue' status onto students out past their return window —
  // so the counts (and the overdue alert) update on their own each poll cycle,
  // without waiting for a return scan.
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
      try {
        const parsed = JSON.parse(result[0].rawValue);
        
        // Fetch full profile from API if available
        try {
          const res = await fetch(`/api/profile?rollNo=${encodeURIComponent(parsed.id)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.profile && data.profile.photo) {
              parsed.photo = data.profile.photo;
            }
          }
        } catch(e) {
          console.error("Failed to fetch photo from API");
        }

        setScanResult(parsed);
        setIsScanning(false);

        setScanPreview(null);
        setPreviewLoading(true);
        try {
          const params = new URLSearchParams();
          if (parsed.sid) params.set("sid", parsed.sid);
          if (parsed.id) params.set("studentId", parsed.id);
          const preview = await apiFetch(`/scan/preview?${params.toString()}`);
          setScanPreview(preview);
        } catch (e) {
          console.error("Failed to load scan preview:", e);
        } finally {
          setPreviewLoading(false);
        }
      } catch (err) {
        console.error("Invalid QR code:", err);
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

  // Gate the guard console on a valid security session; redirects to
  // /login/security when the token is missing or belongs to another role.
  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen dashboard-neo text-slate-900">
      <div className="relative overflow-hidden">
        <div className="dash-orb dash-orb-one" />
        <div className="dash-orb dash-orb-two" />
        <div className="dash-orb dash-orb-three" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="dash-surface dash-animate-rise dash-stagger-1 flex flex-wrap items-center justify-between gap-4 rounded-[2.25rem] px-5 py-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="dash-glow flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-500 text-white shadow-lg">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">{t("liveCommand")}</p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{t("controlTitle")}</h1>
                <p className="text-sm font-medium text-slate-500">{t("guardOps")}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Link
                href="/dashboard/security/profile"
                className="dash-card flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3 transition hover:opacity-90"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-slate-900">{profile.name}</p>
                  <p className="text-sm font-medium text-slate-500">{profile.roleLabel}</p>
                </div>
                <ChevronRight className="h-5 w-5 rotate-90 text-slate-400" />
              </Link>
            </div>
          </header>

          <section className="dash-surface dash-animate-rise dash-stagger-2 mt-6 rounded-[2.5rem] p-6 shadow-xl">
            <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-5">
                <div className="dash-animate-float flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-cyan-100 text-indigo-700 ring-8 ring-white/70">
                  <Clock3 className="h-10 w-10" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">{t("shiftPulse")}</p>
                  <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
                    {t("goodMorning")} {greetingName}.
                  </h2>
                  <p className="mt-2 text-lg font-normal text-slate-600">
                    {t("gatesSynced")}
                  </p>
                </div>
              </div>
              <div className="grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-1">
                <span className="dash-pill inline-flex items-center gap-3 rounded-full px-4 py-2">
                  <CalendarDays className="h-5 w-5 text-slate-500" />
                  {formattedDate}
                </span>
                <span className="dash-pill inline-flex items-center gap-3 rounded-full px-4 py-2">
                  <Clock3 className="h-5 w-5 text-slate-500" />
                  {formattedTime}
                  <span className="dash-chip ml-auto rounded-full px-3 py-1 text-xs font-semibold">{tc("live")}</span>
                </span>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="dash-surface dash-animate-rise dash-stagger-3 rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">{t("quickScan")}</p>
                  <h2 className="font-display text-2xl font-bold tracking-tight">{t("scanGateway")}</h2>
                </div>
                <span className="dash-chip rounded-full px-3 py-1 text-xs font-semibold">{t("realtime")}</span>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="dash-card-strong dash-animate-shimmer rounded-[2.25rem] p-6 text-center">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    <LogOut className="h-12 w-12" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-sky-700">{t("scanExit")}</h3>
                  <p className="mx-auto mt-3 max-w-sm text-base font-normal leading-relaxed text-slate-600">
                    {t("scanExitDesc")}
                  </p>
                  <button 
                    onClick={() => { setScanMode('exit'); setIsScanning(true); }}
                    className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:-translate-y-0.5 cursor-pointer"
                  >
                    <ScanLine className="h-6 w-6" />
                    {t("scanExit")}
                  </button>
                </div>

                <div className="dash-card-strong dash-animate-shimmer rounded-[2.25rem] p-6 text-center">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <LogIn className="h-12 w-12" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-emerald-700">{t("scanEntry")}</h3>
                  <p className="mx-auto mt-3 max-w-sm text-base font-normal leading-relaxed text-slate-600">
                    {t("scanEntryDesc")}
                  </p>
                  <button
                    onClick={() => { setScanMode('entry'); setIsScanning(true); }}
                    className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:-translate-y-0.5 cursor-pointer"
                  >
                    <ScanLine className="h-6 w-6" />
                    {t("scanEntry")}
                  </button>
                </div>
              </div>
            </div>

            <aside className="dash-card dash-animate-rise rounded-[2.5rem] p-6 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">{t("shiftSignal")}</p>
              <h3 className="font-display mt-3 text-2xl font-bold">{t("zoneReadiness")}</h3>
              <p className="mt-2 text-sm text-slate-500">
                {t("zoneReadinessDesc")}
              </p>
              <div className="mt-5 space-y-3">
                {[
                  { label: t("mainGate"), status: tc("online"), tone: "bg-emerald-100 text-emerald-700" },
                  { label: t("hostelBlockA"), status: tc("online"), tone: "bg-emerald-100 text-emerald-700" },
                  { label: t("hostelBlockB"), status: tc("offline"), tone: "bg-rose-100 text-rose-700" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="dash-outline flex items-center justify-between rounded-2xl px-3 py-2"
                  >
                    <span className="text-xs font-semibold text-slate-600">{item.label}</span>
                    <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase ${item.tone}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="dash-card rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold tracking-tight">{t("studentsStatus")}</h2>
                <Link href="/dashboard/security/students" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:text-indigo-600 transition">{tc("viewAll")}</Link>
              </div>
              <div className="mt-5 space-y-4">
                {statusCards.map((card) => (
                  <div key={card.key} className={`rounded-3xl border p-5 ${card.tone}`}>
                    <div className="flex items-center gap-4">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80">
                        <card.icon className="h-6 w-6" />
                      </span>
                      <div>
                        <p className="text-3xl font-bold leading-none text-slate-900">{counts[card.key]}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-800">{card.label}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-600">{card.note}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="dash-card rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-2xl font-bold tracking-tight">{t("recentScans")}</h2>
                <Link href="/dashboard/security/history" className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 hover:text-indigo-600 transition">{tc("viewAll")}</Link>
              </div>
              <div className="mt-4 space-y-3">
                {recentScans.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                    {t("noScansYet")}
                  </p>
                )}
                {recentScans.map((scan) => (
                  <div key={scan.id} className="dash-outline flex flex-wrap items-center justify-between gap-4 rounded-2xl px-4 py-3">
                    <div className="flex items-center gap-4">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-600">
                        {scan.name.split(" ").map((part) => part[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{scan.name}</p>
                        <p className="text-xs text-slate-500">{scan.meta}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${scan.type === "in" ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}>
                        {scan.tag}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">{scan.time}</span>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {counts.overdue > 0 && (
          <section className="dash-animate-rise mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[2.5rem] border border-rose-200/70 bg-rose-50/80 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <Bell className="h-7 w-7" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-400">{t("alerts")}</p>
                <h2 className="font-display text-xl font-bold">{counts.overdue} {counts.overdue === 1 ? t("studentOverdue") : t("studentsOverduePlural")}</h2>
                <p className="text-sm text-slate-600">{t("overdueAttention")}</p>
              </div>
            </div>
            <Link href="/dashboard/security/students?filter=overdue" className="dash-chip rounded-2xl bg-rose-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-lg hover:bg-rose-600 transition">
              {t("viewNow")}
            </Link>
          </section>
          )}

          <SecurityBottomNav active="Home" />
        </div>
      </div>

      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold">{t("scanStudentQR")}</h3>
              <button onClick={() => setIsScanning(false)} className="p-2 rounded-full hover:bg-slate-100 transition cursor-pointer">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>
            <div className="bg-black/5 relative w-full aspect-square">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="relative w-full max-w-sm bg-white rounded-[2rem] p-6 text-center shadow-2xl animate-scale-in">
            <button 
              onClick={() => { setScanResult(null); setScanPreview(null); }}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-slate-100 transition cursor-pointer text-slate-400"
            >
              <X className="h-5 w-5" />
            </button>
            
            <div className="mt-4 flex flex-col items-center">
              <div className="relative h-24 w-24 rounded-full border-4 border-white shadow-xl overflow-hidden mb-4 bg-slate-100 flex items-center justify-center">
                {scanResult.photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={scanResult.photo} alt={scanResult.name} className="h-full w-full object-cover" />
                ) : (
                  <UserRound className="h-12 w-12 text-slate-400" />
                )}
              </div>
              
              <h2 className="font-display text-2xl font-bold text-slate-900">{scanResult.name || t("unknownStudent")}</h2>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1 mb-6">
                {scanResult.id}
              </p>

              <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("status")}</span>
                  {scanMode === 'exit' ? (
                    (() => {
                      if (previewLoading) {
                        return (
                          <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-500">
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
