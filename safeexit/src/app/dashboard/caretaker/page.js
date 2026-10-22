"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  BellOff,
  CalendarDays,
  Clock,
  Home,
  MessageSquare,
  User,
  X,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Siren,
  Sparkles,
  Wifi,
  Armchair,
  ScrollText,
  AlarmClock,
} from "lucide-react";
import ProfileView from "./components/ProfileView";
import MovementLogsView from "./components/MovementLogsView";
import SOSAlertsView from "./components/SOSAlertsView";
import OverdueStudentsView from "./components/OverdueStudentsView";
import DelayNoticesView from "./components/DelayNoticesView";
import DelayNoticeToast from "./components/DelayNoticeToast";
import StaffLeaveDesk from "@/app/components/staff/StaffLeaveDesk";
import { useLeaveDesk } from "@/app/lib/leaveDesk";
import { genderForHostel } from "@/app/lib/hostels";
import { apiFetch } from "@/app/lib/api";
import { subscribeToStaffEvents } from "@/app/lib/staffEvents";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import useCountUp from "@/app/hooks/useCountUp";
import {
  isPushSupported,
  getNotificationPermission,
  subscribePush,
  autoSubscribeIfGranted,
} from "@/app/lib/pushManager";

const initials = (name = "") =>
  name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

// managedGender maps to the hostel the caretaker oversees.
const HOSTEL_LABEL = { Male: "Boys' Hostel", Female: "Girls' Hostel" };

// Module scope so these aren't recreated every render.
const handleTilePointerMove = (e) => {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  el.style.setProperty("--mx", `${px * 100}%`);
  el.style.setProperty("--my", `${py * 100}%`);
  el.style.setProperty("--ry", `${(px - 0.5) * 9}deg`);
  el.style.setProperty("--rx", `${(0.5 - py) * 9}deg`);
};

const handleTilePointerLeave = (e) => {
  e.currentTarget.style.setProperty("--rx", "0deg");
  e.currentTarget.style.setProperty("--ry", "0deg");
};

function CaretakerStat({ label, value, fill, glow }) {
  const [ref, animated] = useCountUp(value);
  return (
    <div ref={ref} className="sd-stat px-4 py-7 text-center" style={{ "--stat-glow": glow }}>
      <p className="sd-micro">{label}</p>
      <p
        className="mt-2 text-5xl font-bold italic tracking-tight text-transparent bg-clip-text"
        style={{ backgroundImage: fill }}
      >
        {Math.round(animated)}
      </p>
    </div>
  );
}

export default function CaretakerDashboardPage() {
  const { t } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("caretaker");

  const [now, setNow] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && sessionStorage.getItem("safeexit:user");
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  // Refresh from server so managedHostel/managedGender are current even for older sessions.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await apiFetch("/auth/profile");
        if (!cancelled) setUser((u) => ({ ...(u || {}), ...profile }));
      } catch {
        /* best-effort */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const formattedDate = now ? now.toLocaleDateString(dateLocale, { weekday: "short", day: "2-digit", month: "short" }) : tc("loading");
  const formattedTime = now ? now.toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : tc("loading");

  // Girls' applications to decide and boys' auto-approved leave, shared with the hostel's
  // wardens and the chief warden (lib/leaveDesk.js). Owned here so the badges stay live.
  const leaveDesk = useLeaveDesk("Caretaker");
  const leavePending = leaveDesk.pending;

  // Kept live independently of the SOS view so the badge shows on every tab.
  const [sosCount, setSosCount] = useState(0);

  // Students still out past their outing return time; kept live for the badge.
  const [overdueCount, setOverdueCount] = useState(0);

  // Students who told us they'll be late. Tracked separately from overdueCount
  // because a student can file *before* their deadline passes — they aren't
  // overdue yet, so the overdue list would never surface them.
  const [delayCount, setDelayCount] = useState(0);

  const loadDelayCount = useCallback(async () => {
    try {
      const data = await apiFetch("/delay?status=Pending");
      setDelayCount(Array.isArray(data) ? data.length : 0);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch from the API, a client-only external source.
    loadDelayCount();
    const interval = setInterval(loadDelayCount, 30000);
    return () => clearInterval(interval);
  }, [loadDelayCount]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "delay:created": loadDelayCount,
      "delay:updated": loadDelayCount,
    });
  }, [loadDelayCount]);

  // Numeric occupancy only — the API never sends student identities to this card.
  const [studentsOut, setStudentsOut] = useState(0);

  const loadLiveStats = useCallback(async () => {
    try {
      const data = await apiFetch("/caretaker/stats");
      const count = Number(data?.outNow);
      setStudentsOut(Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0);
    } catch {
      /* best-effort */
    }
  }, []);

  const loadSosCount = useCallback(async () => {
    try {
      const data = await apiFetch("/sos?status=Active");
      setSosCount(data.length);
    } catch {
      /* best-effort */
    }
  }, []);

  const loadOverdueCount = useCallback(async () => {
    try {
      const data = await apiFetch("/outing/overdue");
      setOverdueCount(data.length);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    loadSosCount();
    const interval = setInterval(loadSosCount, 30000);
    return () => clearInterval(interval);
  }, [loadSosCount]);

  useEffect(() => {
    loadOverdueCount();
    const interval = setInterval(loadOverdueCount, 30000);
    return () => clearInterval(interval);
  }, [loadOverdueCount]);

  useEffect(() => {
    loadLiveStats();
    const interval = setInterval(loadLiveStats, 30000);
    return () => clearInterval(interval);
  }, [loadLiveStats]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "sos:created": loadSosCount,
      "sos:updated": loadSosCount,
    });
  }, [loadSosCount]);

  // Outings need no approval — the gate scan creates them — so the outing channel only
  // moves the overdue badge and the "Out Now" counter.
  useEffect(() => {
    return subscribeToStaffEvents({
      "outing:changed": () => {
        loadOverdueCount();
        loadLiveStats();
      },
    });
  }, [loadOverdueCount, loadLiveStats]);

  const [view, setView] = useState("home");

  // Push-notification deep link (?view=sos etc.); param consumed once and stripped.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("view");
    if (target && ["sos", "overdue", "delays", "leave", "profile"].includes(target)) {
      setView(target);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const displayName = (user && (user.name || user.displayName)) || t("chiefCaretaker");

  // Unset scope means no students; show the "not configured" banner.
  const managedGender = user?.managedGender;
  const managedHostel = user?.managedHostel;
  // Prefer the specific hostel name; fall back to the generic label for legacy caretakers.
  const hostelLabel = managedHostel || HOSTEL_LABEL[managedGender];
  const isConfigured = Boolean(managedHostel || managedGender);

  // Single source of truth for both nav bars. They used to be hand-written twice, which
  // is how the phone bar drifted to four tabs while the desktop one carried seven —
  // Delay Notices, Movement Logs and Profile were simply unreachable on a phone. Both
  // bars now map this list; `short` is the phone label, since the full ones need three
  // lines in a ~50px column. Badge colour differs for delays (amber, informational)
  // versus leave/SOS (rose, needs action).
  const navTabs = [
    { key: "home", icon: Home, label: tc("home"), short: t("navHome") },
    {
      key: "delays",
      icon: Clock,
      label: t("delayNotices"),
      short: t("navDelays"),
      count: delayCount,
      countClass: "bg-amber-500",
    },
    {
      key: "leave",
      icon: CalendarDays,
      label: t("leaveApplications"),
      short: t("navLeave"),
      count: leavePending.length,
      countClass: "bg-rose-500",
    },
    {
      key: "sos",
      icon: Siren,
      label: t("safetyAlerts"),
      short: t("navAlerts"),
      count: sosCount,
      countClass: "bg-rose-500",
    },
    { key: "logs", icon: ScrollText, label: t("movementLogs"), short: t("navLogs") },
    { key: "profile", icon: User, label: tc("profile"), short: t("navProfile") },
  ].filter(Boolean);

  const handleLogout = () => logout(router, { role: "caretaker" });

  // Push notification banner state; null until permission API is checked.
  const [pushPermission, setPushPermission] = useState(null);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setPushPermission('unsupported');
      return;
    }
    const perm = getNotificationPermission();
    setPushPermission(perm);

    // Re-subscribe silently in case the subscription expired.
    if (perm === 'granted') {
      autoSubscribeIfGranted();
    }
  }, []);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    const result = await subscribePush();
    setPushEnabling(false);
    if (result.success) {
      setPushPermission('granted');
    } else {
      setPushPermission(getNotificationPermission());
    }
  };

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-28">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel sd-glow-border sd-enter flex items-center justify-between gap-3 rounded-4xl px-4 py-3.5 shadow-xl sm:gap-4 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <div className="sd-luxe-badge sd-luxe-float flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg sm:h-14 sm:w-14">
                <ShieldAlert className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <div className="min-w-0">
                <p className="sd-eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-indigo-400" /> {t("hub")}</p>
                <h1 className="sd-title sd-reveal sd-stagger-1 truncate"><span className="sd-gradient-text text-gradient-primary">{t("dashboardTitle")}</span></h1>
                <p className="sd-subtitle hidden sm:block">{t("dashboardSubtitle")}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <LanguageSwitcher />
              <div className="sd-luxe-card sd-profile-chip sd-luxe-tilt hidden items-center gap-3 rounded-2xl px-4 py-3 min-w-55 lg:flex">
                <div className="sd-profile-avatar bg-linear-to-br from-indigo-600 to-cyan-400 text-white flex h-12 w-12 items-center justify-center rounded-xl font-bold">{(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || 'WP'}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-base">{displayName}</p>
                  {hostelLabel ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">{hostelLabel}</span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">No hostel assigned</span>
                  )}
                </div>
              </div>
              {/* Compact avatar on small screens */}
              <button
                type="button"
                onClick={() => setView('profile')}
                className="sd-profile-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-cyan-400 text-sm font-bold text-white lg:hidden"
                title={tc("profile")}
              >
                {(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || 'WP'}
              </button>
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

          {user && !isConfigured && (
            <div className="mt-6 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 shadow-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-bold">Your hostel isn&apos;t configured yet</p>
                <p className="text-sm">Until an admin assigns you to a hostel, you won&apos;t see any student requests, leave applications, or alerts. Please contact the admin.</p>
              </div>
            </div>
          )}

          {/* Push notification permission banner */}
          {pushPermission === 'default' && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-indigo-200 bg-indigo-50/80 px-5 py-4 text-indigo-800 shadow-sm backdrop-blur-sm sd-enter" style={{ animationDelay: '0.15s' }}>
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500 animate-bounce" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Enable push notifications</p>
                <p className="text-sm text-indigo-700">Get instant alerts for leave applications, overdue returns, and emergencies — even when this app is closed.</p>
              </div>
              <button
                onClick={handleEnablePush}
                disabled={pushEnabling}
                className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
              >
                {pushEnabling ? 'Enabling…' : 'Enable'}
              </button>
              <button
                onClick={() => setPushBannerDismissed(true)}
                className="shrink-0 rounded-xl p-2 text-indigo-400 transition hover:bg-indigo-100"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {pushPermission === 'denied' && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50/80 px-5 py-4 text-rose-800 shadow-sm backdrop-blur-sm sd-enter" style={{ animationDelay: '0.15s' }}>
              <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Notifications blocked</p>
                <p className="text-sm text-rose-700">You won&apos;t receive alerts for new student requests. To enable them, open your browser settings and allow notifications for this site.</p>
              </div>
              <button
                onClick={() => setPushBannerDismissed(true)}
                className="shrink-0 rounded-xl p-2 text-rose-400 transition hover:bg-rose-100"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {view === 'home' && (
            <>
              {/* Needs-attention strip; rendered only when something needs action */}
              {(() => {
                const attention = [
                  sosCount > 0 && {
                    key: 'sos',
                    label: t("safetyAlerts"),
                    count: sosCount,
                    icon: Siren,
                    className: 'wd-attn--sos',
                    onClick: () => setView('sos'),
                  },
                  overdueCount > 0 && {
                    key: 'overdue',
                    label: t("overdueStudents"),
                    count: overdueCount,
                    icon: AlarmClock,
                    className: 'wd-attn--sos',
                    onClick: () => setView('overdue'),
                  },
                  delayCount > 0 && {
                    key: 'delays',
                    label: t("delayNotices"),
                    count: delayCount,
                    icon: Clock,
                    className: 'wd-attn--leave',
                    onClick: () => setView('delays'),
                  },
                  leavePending.length > 0 && {
                    key: 'leave',
                    label: t("leaveApplications"),
                    count: leavePending.length,
                    icon: CalendarDays,
                    className: 'wd-attn--leave',
                    onClick: () => setView('leave'),
                  },
                ].filter(Boolean);

                if (attention.length === 0) return null;

                return (
                  <section className="sd-enter mt-4" style={{ animationDelay: '0.08s' }}>
                    <div className="flex items-center gap-2 px-1">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                      </span>
                      <p className="sd-eyebrow">{t("needsAttention")}</p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
                      {attention.map((a) => (
                        <button
                          key={a.key}
                          onClick={a.onClick}
                          className={`wd-attn ${a.className} flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left shadow-md transition hover:-translate-y-0.5 active:scale-95 sm:gap-3 sm:px-4 sm:py-3`}
                        >
                          <span className="wd-attn__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white sm:h-10 sm:w-10">
                            <a.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold sm:text-sm">{a.label}</span>
                            <span className="wd-attn__count block text-[11px] font-semibold sm:text-xs">{a.count} {t("pendingShort")}</span>
                          </span>
                          <ArrowRight className="hidden h-4 w-4 shrink-0 opacity-60 sm:block" />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })()}

              <section
                onPointerMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  e.currentTarget.style.setProperty("--spot-x", `${e.clientX - r.left}px`);
                  e.currentTarget.style.setProperty("--spot-y", `${e.clientY - r.top}px`);
                }}
                style={{ animationDelay: "0.12s" }}
                className="sd-luxe-panel sd-glow-border sd-spot-host sd-enter mt-6 rounded-4xl p-5 sm:p-7 shadow-xl"
              >
            <span className="sd-spotlight" aria-hidden="true" />
            <div className="grid items-center gap-4 sm:gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                <div className="sd-luxe-float sd-orb-halo hidden h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-white to-sky-50 text-slate-900 ring-8 ring-white/80 shadow-lg sm:flex" style={{ "--halo": "rgba(99,102,241,0.45)" }}>
                  <Clock className="h-10 w-10 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <p className="sd-kicker">{t("dailyPulse")}</p>
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2 mt-1 sm:mt-2">{t("greeting")} <span className="sd-name-live">Caretaker</span>.</h2>
                  {/* Desktop-only overview text */}
                  <p className="sd-body mt-2 hidden max-w-md sm:block">{t("overviewText")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-1">
                <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-2 rounded-full px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
                  <CalendarDays className="h-4 w-4 text-indigo-500 sm:h-5 sm:w-5" />
                  {formattedDate}
                </span>
                <span suppressHydrationWarning className="sd-luxe-pill sd-live-pulse inline-flex flex-1 items-center gap-2 rounded-full px-3 py-2 sm:flex-none sm:gap-3 sm:px-4 sm:py-2.5">
                  <Clock className="h-4 w-4 text-sky-500 sm:h-5 sm:w-5" />
                  {formattedTime}
                  <span className="sd-luxe-chip ml-auto rounded-full px-3 py-1 text-xs font-bold">{tc("live")}</span>
                </span>
              </div>
            </div>
              </section>

              <section className="sd-luxe-panel sd-enter mt-6 rounded-4xl p-5 sm:p-7 shadow-xl" style={{ animationDelay: "0.2s" }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sd-kicker">{t("quickActions")}</p>
                <h2 className="sd-title sd-title-sm mt-2">{t("respondFaster")}</h2>
              </div>
            </div>
            {/* Phones: two-up compact launchers. From lg all four tiles sit side by side —
                the same equal-tile row the student dashboard uses. */}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-2 sm:gap-5 lg:grid-cols-4">
              {(() => {
                const safetyAction = {
                  title: t("safetyAlerts"),
                  desc: t("safetyAlertsDesc"),
                  icon: Siren,
                  badgeBg: "linear-gradient(145deg, #9f1239 0%, #f43f5e 100%)",
                  tint: "linear-gradient(160deg, rgba(244,63,94,0.14) 0%, rgba(251,113,133,0.08) 100%)",
                  glow: "rgba(244,63,94,0.45)",
                  border: "rgba(251,113,133,0.5)",
                  badge: sosCount,
                  onClick: () => setView('sos'),
                };
                const leaveAction = {
                  title: t("leaveApplications"),
                  desc: t("leaveApplicationsDesc"),
                  icon: CalendarDays,
                  badgeBg: "linear-gradient(145deg, #6d28d9 0%, #d946ef 100%)",
                  tint: "linear-gradient(160deg, rgba(139,92,246,0.14) 0%, rgba(217,70,239,0.08) 100%)",
                  glow: "rgba(139,92,246,0.45)",
                  border: "rgba(196,132,252,0.5)",
                  badge: leavePending.length,
                  onClick: () => setView('leave'),
                };
                const logsAction = {
                  title: t("movementLogs"),
                  desc: t("movementLogsDesc"),
                  icon: ScrollText,
                  badgeBg: "linear-gradient(145deg, #4338ca 0%, #38bdf8 100%)",
                  tint: "linear-gradient(160deg, rgba(67,56,202,0.14) 0%, rgba(56,189,248,0.08) 100%)",
                  glow: "rgba(67,56,202,0.45)",
                  border: "rgba(129,140,248,0.5)",
                  onClick: () => setView('logs'),
                };
                const overdueAction = {
                  title: t("overdueTitle"),
                  desc: t("overdueDesc"),
                  icon: AlarmClock,
                  badgeBg: "linear-gradient(145deg, #9f1239 0%, #fb7185 100%)",
                  tint: "linear-gradient(160deg, rgba(244,63,94,0.14) 0%, rgba(251,113,133,0.08) 100%)",
                  glow: "rgba(244,63,94,0.45)",
                  border: "rgba(251,113,133,0.5)",
                  badge: overdueCount,
                  onClick: () => setView('overdue'),
                };
                // Outings need no approval, so every caretaker leads with Leave.
                return [leaveAction, safetyAction, overdueAction, logsAction];
              })().map((a, idx) => {
                const badgeStyle = { background: a.badgeBg, boxShadow: `0 14px 26px -12px ${a.glow}` };
                const countBubble = a.badge ? (
                  <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[11px] font-bold text-white animate-pulse">{a.badge}</span>
                ) : null;
                return (
                <button
                  key={idx}
                  onClick={a.onClick}
                  onPointerMove={handleTilePointerMove}
                  onPointerLeave={handleTilePointerLeave}
                  style={{
                    animationDelay: `${0.08 + idx * 0.08}s`,
                    "--tint": a.tint,
                    "--glow": a.glow,
                    "--tile-border": a.border,
                  }}
                  className="sd-tile sd-qa sd-luxe-rise group block h-full text-left"
                >
                  {/* One shape at every size — badge top-left, copy pinned to the bottom by
                      mt-auto: a compact two-up card on phones, a row of equal tiles at lg.
                      Same structure as the student dashboard's quick actions. The sm:
                      reserves keep the wide tiles' titles and copy on a shared baseline. */}
                  <div className="sd-tile__inner flex h-full flex-col items-start p-3.5 sm:min-h-52 sm:p-5">
                    <span className="sd-tile__glare" aria-hidden="true" />
                    <span className="sd-act sd-lift-lg relative shrink-0 shadow-lg" style={badgeStyle}>
                      <a.icon className="h-6 w-6" />
                      {countBubble}
                    </span>
                    <div className="sd-lift-md mt-auto w-full min-w-0 pt-4 sm:pt-6">
                      <span className="sd-act-rule mb-2 hidden sm:mb-3 sm:block" aria-hidden="true" />
                      {/* No `block` alongside the clamps — line-clamp supplies display:-webkit-box
                          and `block` would override it, dropping the clamp entirely. */}
                      <span className="sd-card-title line-clamp-2 leading-snug sm:min-h-11">
                        {a.title}
                      </span>
                      <span className="sd-body sd-act-desc mt-1 line-clamp-3 sm:mt-1.5 sm:min-h-21">
                        {a.desc}
                      </span>
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
              </section>

              <section className="mt-6">
            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-4 rounded-4xl p-5 sm:p-7 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-eyebrow">{t("leaveApplications")}</p>
                  <h2 className="sd-title sd-title-sm">{t("pendingLeaveApprovals")}</h2>
                </div>
                <span className="sd-luxe-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-violet-800 bg-violet-50 border border-violet-200">
                  <CalendarDays className="h-4 w-4" /> {leavePending.length}
                </span>
              </div>
              <p className="sd-micro mt-1 text-slate-500">{t("leaveOnlyNote")}</p>
              <div className="mt-6 space-y-3">
                {leaveDesk.loading ? (
                  <p className="text-sm text-slate-500">{t("loadingLeave")}</p>
                ) : leaveDesk.error ? (
                  <p className="text-sm font-semibold text-rose-600">{leaveDesk.error}</p>
                ) : leavePending.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 py-8 text-slate-500">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100">
                      <CalendarDays className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="font-semibold text-slate-700">{t("noPendingLeave")}</p>
                    <p className="text-sm text-slate-500">{t("noLeaveYet")}</p>
                  </div>
                ) : (
                  leavePending.map((req, i) => (
                  <div key={req.id} className="sd-luxe-card sd-luxe-rise sd-luxe-tilt flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between" style={{ animationDelay: `${0.12 + i * 0.06}s` }}>
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-full bg-linear-to-br from-violet-500 to-fuchsia-400 flex items-center justify-center text-white font-bold">{req.initials}</div>
                      <div className="min-w-0">
                        <p className="sd-card-title text-slate-900 text-base">
                          {req.name}
                          {req.isEmergency && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-white">
                              <Siren className="h-3 w-3" /> {t("emergency")}
                            </span>
                          )}
                        </p>
                        <p className="sd-micro mt-0.5">{req.room}{req.roll ? <> • <span className="font-mono">{req.roll}</span></> : null}</p>
                        <p className="sd-micro mt-0.5 text-slate-500">{t("destination")} {req.destination}</p>
                      </div>
                    </div>

                    <button onClick={() => setView('leave')} className="flex items-center justify-center gap-2 rounded-2xl px-3 py-2.5 bg-linear-to-r from-violet-700 via-violet-600 to-fuchsia-500 text-sm text-white font-bold shadow hover:-translate-y-0.5 transition-transform sm:px-4 sm:py-2">
                      <ArrowRight className="h-4 w-4 shrink-0" /> {t("reviewInLeave")}
                    </button>
                  </div>
                  ))
                )}
              </div>
            </div>
              </section>
              <section className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="sd-luxe-panel sd-enter rounded-4xl p-5 sm:p-6 shadow-xl" style={{ animationDelay: "0.3s" }}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="sd-kicker">{t("activity")}</p>
                  <h2 className="sd-title sd-title-sm mt-2">{t("liveStats")}</h2>
                </div>
                <span className="sd-tag">{tc("autoSync")}</span>
              </div>
              <div className="mt-5">
                <CaretakerStat
                  label={t("outNow")}
                  value={studentsOut}
                  fill="linear-gradient(90deg, #f59e0b, #fb923c)"
                  glow="rgba(245,158,11,0.45)"
                />
              </div>
            </div>
              </section>
            </>
          )}

          {view === 'sos' && <SOSAlertsView onCountChange={setSosCount} />}
          {view === 'overdue' && <OverdueStudentsView onCountChange={setOverdueCount} />}
          {view === 'delays' && <DelayNoticesView onCountChange={setDelayCount} />}
          {view === 'profile' && (
            <ProfileView
              user={user}
              displayName={displayName}
              onLogout={handleLogout}
              onSignatureSaved={(signature) => setUser((u) => ({ ...(u || {}), signature }))}
            />
          )}
          {view === 'leave' && (
            <StaffLeaveDesk
              desk={leaveDesk}
              scope={genderForHostel(user?.managedHostel) || user?.managedGender}
              mySignature={user?.signature || null}
              onSignatureSaved={(signature) => setUser((u) => ({ ...(u || {}), signature }))}
            />
          )}

          {view === 'logs' && <MovementLogsView />}

          {/* Desktop bar — one column per tab in `navTabs`, so no empty track. */}
          <nav
            className="sd-luxe-panel sd-luxe-rise mt-6 hidden gap-1 rounded-4xl p-2 backdrop-blur sm:p-3 md:grid"
            style={{ gridTemplateColumns: `repeat(${navTabs.length}, minmax(0, 1fr))` }}
          >
            {navTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`sd-navx ${view === tab.key ? "sd-navx--active" : ""}`}
              >
                <span className="sd-navx__icon relative">
                  <tab.icon className="h-5 w-5" />
                  {tab.count > 0 && (
                    <span
                      className={`absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-bold text-white ${tab.countClass}`}
                    >
                      {tab.count}
                    </span>
                  )}
                </span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Mobile bar — the same tabs as the desktop one, from the same `navTabs` list, so
          Delay Notices, Movement Logs and Profile are reachable on a phone too. Seven
          columns (six for the boys' set) is tight, hence the short labels and the
          sd-navx--dense sizing; the badge sits inside the icon so it can't be clipped by
          the column edge. */}
      <nav
        className="sd-mobile-bottom-nav sd-luxe-panel sd-glow-border fixed inset-x-2 bottom-3 z-50 grid gap-0 rounded-[1.75rem] p-1.5 md:hidden"
        style={{ gridTemplateColumns: `repeat(${navTabs.length}, minmax(0, 1fr))` }}
      >
        {navTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`sd-navx sd-navx--dense ${view === tab.key ? "sd-navx--active" : ""}`}
          >
            <span className="sd-navx__icon relative">
              <tab.icon className="h-5 w-5" />
              {tab.count > 0 && (
                <span
                  className={`absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full border border-white px-0.5 text-[9px] font-bold leading-none text-white ${tab.countClass}`}
                >
                  {tab.count}
                </span>
              )}
            </span>
            <span className="sd-navx__label">{tab.short}</span>
          </button>
        ))}
      </nav>

      {/* Live "student is running late" popup — refetches on the /delay stream. */}
      <DelayNoticeToast onView={() => setView("delays")} />
    </main>
  );
}
