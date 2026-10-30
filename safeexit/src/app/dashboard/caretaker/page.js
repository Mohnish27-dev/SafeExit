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
  Users,
  X,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Wifi,
  Armchair,
  ScrollText,
  AlarmClock,
  PlaneTakeoff,
  RefreshCw,
  CheckCircle2,
  Compass,
} from "lucide-react";
import ProfileView from "./components/ProfileView";
import MovementLogsView from "./components/MovementLogsView";
import SOSAlertsView from "./components/SOSAlertsView";
import OverdueStudentsView from "./components/OverdueStudentsView";
import DelayNoticesView from "./components/DelayNoticesView";
import DelayNoticeToast from "./components/DelayNoticeToast";
import HostelResidentsView from "./components/HostelResidentsView";
import HostelOnLeaveRoster from "./components/HostelOnLeaveRoster";
import HostelActiveOutingsRoster from "./components/HostelActiveOutingsRoster";
import HostelStudentsDirectory from "./components/HostelStudentsDirectory";
import StaffLeaveDesk from "@/app/components/staff/StaffLeaveDesk";
import { useLeaveDesk } from "@/app/lib/leaveDesk";
import { genderForHostel, getTranslatedHostelName, formatStaffDisplayName } from "@/app/lib/hostels";
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

function CaretakerStatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  accentColor = "emerald",
  badgeText,
  badgeVariant = "neutral",
  actionHint,
  isActiveTab = false,
  activeIndicatorText = "Active ↓",
  onClick,
}) {
  const [ref, animated] = useCountUp(value);

  const THEMES = {
    emerald: {
      border: "border-emerald-200/90 hover:border-emerald-400/90",
      activeRing: "ring-2 ring-emerald-500 shadow-lg shadow-emerald-500/15",
      topBar: "from-emerald-500 via-teal-400 to-emerald-600",
      iconBg: "from-emerald-600 to-teal-500 text-white shadow-emerald-600/25",
      numberText: "text-emerald-700",
      sublabelDot: "bg-emerald-500",
      cardBg: "from-white to-emerald-50/30",
    },
    violet: {
      border: "border-violet-200/90 hover:border-violet-400/90",
      activeRing: "ring-2 ring-violet-500 shadow-lg shadow-violet-500/15",
      topBar: "from-violet-600 via-purple-400 to-fuchsia-500",
      iconBg: "from-violet-600 to-fuchsia-600 text-white shadow-violet-600/25",
      numberText: "text-violet-700",
      sublabelDot: "bg-violet-500",
      cardBg: "from-white to-violet-50/30",
    },
    sky: {
      border: "border-sky-200/90 hover:border-sky-400/90",
      activeRing: "ring-2 ring-sky-500 shadow-lg shadow-sky-500/15",
      topBar: "from-sky-500 via-cyan-400 to-blue-500",
      iconBg: "from-sky-600 to-cyan-500 text-white shadow-sky-600/25",
      numberText: "text-sky-700",
      sublabelDot: "bg-sky-500",
      cardBg: "from-white to-sky-50/30",
    },
    rose: {
      border: "border-rose-200/90 hover:border-rose-400/90",
      activeRing: "ring-2 ring-rose-500 shadow-lg shadow-rose-500/15",
      topBar: "from-rose-500 via-red-400 to-rose-600",
      iconBg: "from-rose-600 to-red-500 text-white shadow-rose-600/25",
      numberText: "text-rose-700",
      sublabelDot: "bg-rose-500",
      cardBg: "from-white to-rose-50/30",
    },
    indigo: {
      border: "border-indigo-200/90 hover:border-indigo-400/90",
      activeRing: "ring-2 ring-indigo-500 shadow-lg shadow-indigo-500/15",
      topBar: "from-indigo-600 via-blue-400 to-indigo-500",
      iconBg: "from-indigo-600 to-blue-500 text-white shadow-indigo-600/25",
      numberText: "text-indigo-700",
      sublabelDot: "bg-indigo-500",
      cardBg: "from-white to-indigo-50/30",
    },
    amber: {
      border: "border-amber-200/90 hover:border-amber-400/90",
      activeRing: "ring-2 ring-amber-500 shadow-lg shadow-amber-500/15",
      topBar: "from-amber-500 via-orange-400 to-red-500",
      iconBg: "from-amber-500 to-orange-600 text-white shadow-amber-600/25",
      numberText: "text-amber-700",
      sublabelDot: "bg-amber-500",
      cardBg: "from-white to-amber-50/30",
    },
  };

  const theme = THEMES[accentColor] || THEMES.emerald;

  const BADGE_STYLES = {
    success: "bg-emerald-50 text-emerald-800 border-emerald-200/90 font-bold",
    alert: "bg-rose-100 text-rose-800 border-rose-300 font-extrabold animate-pulse",
    purple: "bg-violet-50 text-violet-800 border-violet-200/90 font-bold",
    sky: "bg-sky-50 text-sky-800 border-sky-200/90 font-bold",
    neutral: "bg-slate-100 text-slate-700 border-slate-200 font-bold",
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl p-4 sm:p-4.5 transition-all duration-300 border shadow-sm hover:shadow-xl bg-gradient-to-b ${theme.cardBg} ${theme.border} ${
        isActiveTab ? `${theme.activeRing} shadow-md` : ""
      } ${onClick ? "cursor-pointer hover:-translate-y-1 active:scale-[0.98]" : ""}`}
    >
      {/* Top ambient color accent line */}
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.topBar}`} />

      {/* Top Header: Label + Modern Icon Badge */}
      <div>
        <div className="flex items-start justify-between gap-2 pt-0.5">
          <div className="min-w-0 pr-1">
            <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-snug line-clamp-1">
              {label}
            </h4>
            {isActiveTab && (
              <span className="inline-block mt-0.5 text-[10px] font-extrabold text-indigo-600">
                {activeIndicatorText}
              </span>
            )}
          </div>
          {Icon && (
            <div
              className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md ring-1 ring-white/80 transition-transform duration-300 group-hover:scale-110 ${theme.iconBg}`}
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          )}
        </div>

        {/* Big Number & Contextual Badge */}
        <div className="mt-3 flex items-baseline justify-between gap-2 flex-wrap">
          <p
            ref={ref}
            className={`text-3xl sm:text-4xl font-black tracking-tight ${theme.numberText}`}
          >
            {Number.isFinite(animated) ? Math.round(animated) : (Number(value) || 0)}
          </p>

          {badgeText && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] sm:text-[11px] border shadow-2xs ${
                BADGE_STYLES[badgeVariant] || BADGE_STYLES.neutral
              }`}
            >
              {badgeVariant === "alert" && (
                <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-ping" />
              )}
              {badgeText}
            </span>
          )}
        </div>

        {/* High-visibility Context Sublabel */}
        {sublabel && (
          <div className="mt-2.5 flex items-center gap-1.5 min-w-0">
            <span className={`h-2 w-2 rounded-full shrink-0 ${theme.sublabelDot}`} />
            <p className="text-[11px] sm:text-xs font-semibold text-slate-600 leading-tight truncate">
              {sublabel}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Action Hint */}
      {actionHint && (
        <div className="mt-3.5 pt-2.5 border-t border-slate-100/90 flex items-center justify-between text-[11px] sm:text-xs font-bold text-slate-500 group-hover:text-slate-900 transition-colors">
          <span className="truncate pr-1">{actionHint}</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all text-xs font-black shadow-2xs group-hover:translate-x-0.5">
            →
          </span>
        </div>
      )}
    </div>
  );
}

export default function CaretakerDashboardPage() {
  const { t, locale } = useTranslation("caretaker");
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

  // Refresh from server so managedHostel/managedGender are current even for older sessions.
  useEffect(() => {
    if (!authorized) return;
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
  }, [authorized]);

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

  // Students who told us they'll be late.
  const [delayCount, setDelayCount] = useState(0);

  // Comprehensive hostel occupancy stats
  const [hostelStats, setHostelStats] = useState({
    outNow: 0,
    total: 0,
    inside: 0,
    outside: 0,
    onLeave: 0,
    overdue: 0,
    hostel: "",
  });

  // Active on-leave students roster for this caretaker's hostel
  const [onLeaveStudents, setOnLeaveStudents] = useState([]);
  const [loadingOnLeave, setLoadingOnLeave] = useState(false);

  // Active outings roster for this caretaker's hostel
  const [activeOutings, setActiveOutings] = useState([]);
  const [loadingOutings, setLoadingOutings] = useState(false);

  // All registered students for this caretaker's hostel
  const [hostelStudents, setHostelStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [rosterErrors, setRosterErrors] = useState({});


  // Active filter for the dedicated Student Movement / Residents view
  const [residentsFilter, setResidentsFilter] = useState("all");

  const openResidentsView = (filterKey = "all") => {
    setResidentsFilter(filterKey);
    setView("residents");
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const loadDelayCount = useCallback(async () => {
    try {
      const data = await apiFetch("/delay?status=Pending");
      setDelayCount(Array.isArray(data) ? data.length : 0);
    } catch {
      /* best-effort */
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    const initial = setTimeout(loadDelayCount, 0);
    const interval = setInterval(loadDelayCount, 30000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [authorized, loadDelayCount]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "delay:created": loadDelayCount,
      "delay:updated": loadDelayCount,
    });
  }, [loadDelayCount]);

  // Scope resolution: caretaker access is bound directly to their assigned hostel via login.
  const managedHostel = user?.managedHostel;
  const activeHostel = String(managedHostel || '').trim();
  const displayHostelName = getTranslatedHostelName(activeHostel, locale);
  const effectiveDisplayName = (user && (user.name || user.displayName)) || `${activeHostel} Caretaker`;
  const displayUserName = formatStaffDisplayName(effectiveDisplayName, locale);
  const isConfigured = Boolean(activeHostel);

  const loadLiveStats = useCallback(async () => {
    try {
      const data = await apiFetch('/caretaker/stats?detailed=true');
      setHostelStats({
        outNow: Number(data?.outNow) || 0,
        total: Number(data?.total) || 0,
        inside: Number(data?.inside) || 0,
        outside: Number(data?.outside) || 0,
        onLeave: Number(data?.onLeave) || 0,
        overdue: Number(data?.overdue) || 0,
        hostel: data?.hostel || "",
      });
      setRosterErrors((errors) => ({ ...errors, stats: false }));
    } catch {
      setRosterErrors((errors) => ({ ...errors, stats: true }));
    }
  }, []);

  const loadOnLeaveStudents = useCallback(async () => {
    setLoadingOnLeave(true);
    try {
      const data = await apiFetch('/caretaker/on-leave');
      setOnLeaveStudents(Array.isArray(data) ? data : []);
      setRosterErrors((errors) => ({ ...errors, leaves: false }));
    } catch {
      setRosterErrors((errors) => ({ ...errors, leaves: true }));
    } finally {
      setLoadingOnLeave(false);
    }
  }, []);

  const loadHostelStudents = useCallback(async () => {
    setLoadingStudents(true);
    try {
      const data = await apiFetch('/caretaker/students');
      setHostelStudents(Array.isArray(data) ? data : []);
      setRosterErrors((errors) => ({ ...errors, students: false }));
    } catch {
      setRosterErrors((errors) => ({ ...errors, students: true }));
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const loadActiveOutings = useCallback(async () => {
    setLoadingOutings(true);
    try {
      const data = await apiFetch('/caretaker/active-outings');
      setActiveOutings(Array.isArray(data) ? data : []);
      setRosterErrors((errors) => ({ ...errors, outings: false }));
    } catch {
      setRosterErrors((errors) => ({ ...errors, outings: true }));
    } finally {
      setLoadingOutings(false);
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
    if (!authorized) return;
    const initial = setTimeout(loadSosCount, 0);
    const interval = setInterval(loadSosCount, 30000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [authorized, loadSosCount]);

  useEffect(() => {
    if (!authorized) return;
    const initial = setTimeout(loadOverdueCount, 0);
    const interval = setInterval(loadOverdueCount, 30000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [authorized, loadOverdueCount]);

  useEffect(() => {
    if (!authorized) return;
    const refresh = () => {
      loadLiveStats();
      loadOnLeaveStudents();
      loadActiveOutings();
      loadHostelStudents();
    };
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 20000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, [authorized, activeHostel, loadLiveStats, loadOnLeaveStudents, loadActiveOutings, loadHostelStudents]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "sos:created": loadSosCount,
      "sos:updated": loadSosCount,
    });
  }, [loadSosCount]);

  // Outing scan or return scan immediately moves the caretaker's counters and live on-leave roster.
  useEffect(() => {
    return subscribeToStaffEvents({
      "outing:changed": () => {
        loadOverdueCount();
        loadLiveStats();
        loadOnLeaveStudents();
        loadActiveOutings();
        loadHostelStudents();
      },
      "leave:created": () => {
        loadLiveStats();
        loadOnLeaveStudents();
      },
      "leave:decided": () => {
        loadLiveStats();
        loadOnLeaveStudents();
      },
      "leave:updated": () => {
        loadLiveStats();
        loadOnLeaveStudents();
      },
    });
  }, [loadOverdueCount, loadLiveStats, loadOnLeaveStudents, loadActiveOutings, loadHostelStudents]);

  const [view, setView] = useState("home");

  // Push-notification & deep link (?view=sos, ?view=residents&filter=inside, etc.)
  useEffect(() => {
    const initial = setTimeout(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("view");
    const targetFilter = params.get("filter");
    if (targetFilter && ["all", "inside", "outside", "onleave", "overdue"].includes(targetFilter)) {
      setResidentsFilter(targetFilter);
    }
    if (target && ["sos", "overdue", "delays", "leave", "on-leave", "residents", "profile", "logs"].includes(target)) {
      if (target === "on-leave") {
        setResidentsFilter("onleave");
        setView("residents");
      } else {
        setView(target);
      }
      window.history.replaceState({}, "", window.location.pathname);
    }
    }, 0);
    return () => clearTimeout(initial);
  }, []);

  const displayName = (user && (user.name || user.displayName)) || t("chiefCaretaker");

  const navTabs = [
    { key: "home", icon: Home, label: tc("home"), short: t("navHome") },
    {
      key: "residents",
      icon: Users,
      label: t("residentsDirectory") || "Residents",
      short: t("tabResidentsMobile") || "Residents",
      count: hostelStudents.length,
      countClass: "bg-indigo-600",
    },
    {
      key: "leave",
      icon: CalendarDays,
      label: t("leaveApplications"),
      short: t("navLeave"),
      count: leavePending.length,
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
    const initial = setTimeout(() => {
      if (!isPushSupported()) {
        setPushPermission('unsupported');
        return;
      }
      const perm = getNotificationPermission();
      setPushPermission(perm);
      if (perm === 'granted') autoSubscribeIfGranted();
    }, 0);
    return () => clearTimeout(initial);
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
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-36 sm:pb-40">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="sd-luxe-panel sd-glow-border sd-enter flex items-center justify-between gap-2.5 rounded-4xl px-3 py-2.5 shadow-xl sm:gap-4 sm:px-5 sm:py-4">
            <div className="flex min-w-0 items-center gap-2.5 sm:gap-4">
              <div className="sd-luxe-badge sd-luxe-float flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-lg sm:h-14 sm:w-14">
                <ShieldAlert className="h-5 w-5 sm:h-7 sm:w-7" />
              </div>
              <div className="min-w-0">
                <p className="sd-eyebrow hidden xs:flex items-center gap-1.5 sm:gap-2">
                  <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-indigo-400" /> {t("hub")}
                </p>
                <h1 className="sd-title sd-reveal sd-stagger-1 text-sm xs:text-base sm:text-xl lg:text-2xl font-black text-slate-900 leading-tight">
                  <span className="sd-gradient-text text-gradient-primary">
                    {t("dashboardTitle")}
                  </span>
                </h1>
                <p className="sd-subtitle hidden sm:block">{t("dashboardSubtitle")}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <LanguageSwitcher />
              <div className="sd-luxe-card sd-profile-chip sd-luxe-tilt hidden items-center gap-3 rounded-2xl px-4 py-3 min-w-55 lg:flex">
                <div className="sd-profile-avatar bg-linear-to-br from-indigo-600 to-cyan-400 text-white flex h-12 w-12 items-center justify-center rounded-xl font-bold">
                  {(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || (activeHostel === 'Kautilya' ? 'KT' : `${activeHostel[0]}C`)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-base">{displayUserName}</p>
                  {displayHostelName ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">
                      {displayHostelName}
                    </span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
                      No hostel assigned
                    </span>
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
                {(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || (activeHostel === 'Kautilya' ? 'KT' : `${activeHostel[0]}C`)}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title={tc("logout")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition hover:bg-rose-50 sm:h-12 sm:w-12 cursor-pointer"
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
                <p className="text-sm">Ask an admin to assign your hostel so your student directory and live rosters can load.</p>
              </div>
            </div>
          )}

          {Object.values(rosterErrors).some(Boolean) && (
            <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm font-semibold text-rose-800">
              {t('liveDataUnavailable')}
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
                className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                {pushEnabling ? 'Enabling…' : 'Enable'}
              </button>
              <button
                onClick={() => setPushBannerDismissed(true)}
                className="shrink-0 rounded-xl p-2 text-indigo-400 transition hover:bg-indigo-100 cursor-pointer"
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
                className="shrink-0 rounded-xl p-2 text-rose-400 transition hover:bg-rose-100 cursor-pointer"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {view === 'home' && (
            <>
              {/* Needs-attention strip */}
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
                    onClick: () => openResidentsView('overdue'),
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
                          className={`wd-attn ${a.className} flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left shadow-md transition hover:-translate-y-0.5 active:scale-95 sm:gap-3 sm:px-4 sm:py-3 cursor-pointer`}
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

              {/* Daily Pulse Banner */}
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
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="sd-kicker">{t("dailyPulse")}</p>
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2.5 py-0.5 text-[11px] font-bold text-violet-700">
                          <Sparkles className="h-3 w-3 text-violet-600" />
                          {displayHostelName} {t("greetingName")}
                        </span>
                      </div>
                      <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2 mt-1 sm:mt-2">
                        {t("greeting")} <span className="sd-name-live">{displayHostelName} {t("greetingName")}</span>
                      </h2>
                      <p className="sd-body mt-2 hidden max-w-lg sm:block">
                        {t("pulseBannerDesc", { hostel: displayHostelName })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-nowrap overflow-x-auto no-scrollbar py-0.5 text-xs sm:text-sm font-semibold text-slate-600">
                    <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-1.5 sm:gap-2.5 rounded-full px-3 py-1.5 sm:px-3.5 sm:py-2 shrink-0 whitespace-nowrap">
                      <CalendarDays className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-500 shrink-0" />
                      <span>{formattedDate}</span>
                    </span>
                    <span suppressHydrationWarning className="sd-luxe-pill sd-live-pulse inline-flex items-center gap-1.5 sm:gap-2.5 rounded-full px-3 py-1.5 sm:px-3.5 sm:py-2 shrink-0 whitespace-nowrap">
                      <Clock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sky-500 shrink-0" />
                      <span>{formattedTime}</span>
                      <span className="sd-luxe-chip rounded-full px-2 py-0.5 text-[9.5px] sm:text-xs font-bold">{tc("live")}</span>
                    </span>
                  </div>
                </div>
              </section>

              {/* Hostel Movement & Occupancy Pulse Grid (6 Stat Cards with Safety Alerts) */}
              <section className="mt-6 sd-enter" style={{ animationDelay: "0.16s" }}>
                {/* Header with live sync radar, quick breakdown and refresh */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 px-1">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-200/80 shadow-2xs">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                        </span>
                        {t("liveHostelPulse")}
                      </span>
                      <span className="text-xs font-bold text-slate-300">•</span>
                      <span className="text-xs font-bold text-slate-600">
                        {t("insideSummary", { inside: hostelStats.inside })} · {t("awaySummary", { away: hostelStats.outNow })}
                        {sosCount > 0 && (
                          <span className="text-rose-600 font-extrabold ml-1.5 animate-pulse">
                            · {t("activeSosSummary", { count: sosCount })}
                          </span>
                        )}
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1.5">
                      {displayHostelName} {t("movementStatus")}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        loadLiveStats();
                        loadOnLeaveStudents();
                        loadActiveOutings();
                        loadHostelStudents();
                        loadSosCount();
                        loadOverdueCount();
                      }}
                      title={tc("refresh")}
                      className="inline-flex items-center gap-1.5 rounded-full bg-white/95 backdrop-blur-md px-3.5 py-1.5 text-xs font-bold text-slate-700 border border-slate-200/90 shadow-xs hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition cursor-pointer"
                    >
                      <RefreshCw className="h-3.5 w-3.5 text-slate-500" />
                      <span>{tc("refresh")}</span>
                    </button>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-md px-3.5 py-1.5 text-xs font-bold text-slate-800 border border-slate-200/90 shadow-xs">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                      </span>
                      {t("gateSynced")}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-3.5 xl:gap-4">
                  {/* 1. Inside Hostel */}
                  <CaretakerStatCard
                    accentColor="emerald"
                    label={t("insideHostel")}
                    value={hostelStats.inside}
                    sublabel={t("inRooms", { hostel: displayHostelName })}
                    icon={Home}
                    badgeText={hostelStats.total > 0 ? t("occupancyPct", { percent: Math.round(((hostelStats.inside || 0) / hostelStats.total) * 100) }) : t("safeInside")}
                    badgeVariant="success"
                    actionHint={t("actionResidents")}
                    isActiveTab={view === "residents" && residentsFilter === "inside"}
                    activeIndicatorText={t("activeIndicator")}
                    onClick={() => openResidentsView("inside")}
                  />

                  {/* 2. On Approved Leave */}
                  <CaretakerStatCard
                    accentColor="violet"
                    label={t("onLeave")}
                    value={onLeaveStudents.length}
                    sublabel={onLeaveStudents.length > 0 ? t("scannedOutLeave") : t("noStudentsOnLeave")}
                    icon={PlaneTakeoff}
                    badgeText={onLeaveStudents.length > 0 ? t("countAway", { count: onLeaveStudents.length }) : t("noneAway")}
                    badgeVariant={onLeaveStudents.length > 0 ? "purple" : "neutral"}
                    actionHint={t("actionLeaveRoster")}
                    isActiveTab={view === "residents" && residentsFilter === "onleave"}
                    activeIndicatorText={t("activeIndicator")}
                    onClick={() => openResidentsView("onleave")}
                  />

                  {/* 3. On Day Pass / Outing */}
                  <CaretakerStatCard
                    accentColor="sky"
                    label={t("onOuting")}
                    value={hostelStats.outside}
                    sublabel={hostelStats.outside > 0 ? t("regularOutingPass") : t("noOutingsNow")}
                    icon={Compass}
                    badgeText={hostelStats.outside > 0 ? t("countOutside", { count: hostelStats.outside }) : t("noneOut")}
                    badgeVariant={hostelStats.outside > 0 ? "sky" : "neutral"}
                    actionHint={t("actionTrackOutings")}
                    isActiveTab={view === "residents" && residentsFilter === "outside"}
                    activeIndicatorText={t("activeIndicator")}
                    onClick={() => openResidentsView("outside")}
                  />

                  {/* 4. Overdue */}
                  <CaretakerStatCard
                    accentColor="rose"
                    label={t("overdueTitle")}
                    value={hostelStats.overdue}
                    sublabel={hostelStats.overdue > 0 ? t("curfewMissedSublabel") : t("allOnTimeSublabel")}
                    icon={AlarmClock}
                    badgeText={hostelStats.overdue > 0 ? t("curfewMissed") : t("allOnTime")}
                    badgeVariant={hostelStats.overdue > 0 ? "alert" : "success"}
                    actionHint={t("actionOverdueView")}
                    isActiveTab={view === "residents" && residentsFilter === "overdue"}
                    activeIndicatorText={t("activeIndicator")}
                    onClick={() => openResidentsView("overdue")}
                  />

                  {/* 5. Total Hostel Capacity */}
                  <CaretakerStatCard
                    accentColor="indigo"
                    label={t("totalStudents")}
                    value={hostelStats.total}
                    sublabel={t("hostelRegistered", { hostel: displayHostelName })}
                    icon={Users}
                    badgeText={t("hostelRoll")}
                    badgeVariant="neutral"
                    actionHint={t("actionFullRoster")}
                    isActiveTab={view === "residents" && residentsFilter === "all"}
                    activeIndicatorText={t("activeIndicator")}
                    onClick={() => openResidentsView("all")}
                  />

                  {/* 6. Safety Alerts (SOS) */}
                  <CaretakerStatCard
                    accentColor={sosCount > 0 ? "rose" : "amber"}
                    label={t("safetyAlerts")}
                    value={sosCount}
                    sublabel={sosCount > 0 ? t("sosEmergencyActive") : t("sosQuietStatus")}
                    icon={Siren}
                    badgeText={sosCount > 0 ? t("activeSosBadge", { count: sosCount }) : t("allSafe")}
                    badgeVariant={sosCount > 0 ? "alert" : "success"}
                    actionHint={t("actionSosDesk")}
                    isActiveTab={view === 'sos'}
                    activeIndicatorText={t("activeIndicator")}
                    onClick={() => setView('sos')}
                  />
                </div>
              </section>
            </>
          )}

          {(view === 'residents' || view === 'on-leave') && (
            <HostelResidentsView
              students={hostelStudents}
              loadingStudents={loadingStudents}
              onLeaveStudents={onLeaveStudents}
              loadingOnLeave={loadingOnLeave}
              activeOutings={activeOutings}
              loadingOutings={loadingOutings}
              onRefresh={() => {
                loadLiveStats();
                loadHostelStudents();
                loadOnLeaveStudents();
                loadActiveOutings();
                loadOverdueCount();
                loadSosCount();
              }}
              hostelName={displayHostelName}
              activeFilter={view === 'on-leave' ? 'onleave' : residentsFilter}
              onFilterChange={(f) => {
                setResidentsFilter(f);
                if (view === 'on-leave') setView('residents');
              }}
              onBack={() => setView('home')}
            />
          )}

          {view === 'sos' && <SOSAlertsView onCountChange={setSosCount} />}
          {view === 'overdue' && <OverdueStudentsView onCountChange={setOverdueCount} />}
          {view === 'delays' && <DelayNoticesView onCountChange={setDelayCount} />}
          {view === 'profile' && (
            <ProfileView
              user={user}
              displayName={displayUserName}
              onLogout={handleLogout}
              onSignatureSaved={(signature) => setUser((u) => ({ ...(u || {}), signature }))}
            />
          )}
          {view === 'leave' && (
            <StaffLeaveDesk
              desk={leaveDesk}
              scope={genderForHostel(activeHostel) || user?.managedGender}
              mySignature={user?.signature || null}
              onSignatureSaved={(signature) => setUser((u) => ({ ...(u || {}), signature }))}
            />
          )}

          {view === 'logs' && <MovementLogsView />}

          {/* Desktop Navigation bar */}
          <nav
            className="sd-luxe-panel sd-luxe-rise mt-8 hidden gap-1 rounded-4xl p-2 backdrop-blur sm:p-3 md:grid shadow-xl"
            style={{ gridTemplateColumns: `repeat(${navTabs.length}, minmax(0, 1fr))` }}
          >
            {navTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setView(tab.key)}
                className={`sd-navx ${view === tab.key ? "sd-navx--active" : ""} cursor-pointer`}
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

      {/* Mobile Bottom Navigation bar */}
      <nav
        className="sd-mobile-bottom-nav sd-luxe-panel sd-glow-border fixed inset-x-2 bottom-3 z-50 grid gap-0 rounded-[1.75rem] p-1.5 md:hidden shadow-2xl backdrop-blur-lg bg-white/95"
        style={{ gridTemplateColumns: `repeat(${navTabs.length}, minmax(0, 1fr))` }}
      >
        {navTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setView(tab.key)}
            className={`sd-navx sd-navx--dense ${view === tab.key ? "sd-navx--active" : ""} cursor-pointer`}
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

      {/* Live "student is running late" popup */}
      <DelayNoticeToast onView={() => setView("delays")} />
    </main>
  );
}
