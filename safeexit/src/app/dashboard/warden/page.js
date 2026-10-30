"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Home,
  CalendarDays,
  Siren,
  MessageSquare,
  User,
  LogOut,
  ShieldAlert,
  Sparkles,
  Clock,
  ArrowRight,
  X,
  AlertTriangle,
  Bell,
  BellOff,
  Building2,
  Mail,
  Phone,
  ShieldCheck,
  ScrollText,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/app/lib/api";
import { subscribeToStaffEvents } from "@/app/lib/staffEvents";
import { useRequireAuth, logout } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import SignatureCard from "@/app/components/SignatureCard";
import StaffLeaveDesk from "@/app/components/staff/StaffLeaveDesk";
import { useLeaveDesk } from "@/app/lib/leaveDesk";
import { genderForHostel } from "@/app/lib/hostels";
import {
  isPushSupported,
  getNotificationPermission,
  subscribePush,
  autoSubscribeIfGranted,
} from "@/app/lib/pushManager";
import SOSAlertsView from "../caretaker/components/SOSAlertsView";
// Wardens get the same read-only movement log as caretakers; /scan already scopes by managedHostel.
import MovementLogsView from "../caretaker/components/MovementLogsView";
import OverdueStudentsView from "../caretaker/components/OverdueStudentsView";
import DelayNoticesView from "../caretaker/components/DelayNoticesView";
import DelayNoticeToast from "../caretaker/components/DelayNoticeToast";

const initials = (name = "") =>
  name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";

export default function WardenDashboardPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("warden");

  const [now, setNow] = useState(null);
  const [user, setUser] = useState(null);
  const [view, setView] = useState("home");

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => {
    try {
      const raw = typeof window !== "undefined" && sessionStorage.getItem("safeexit:user");
      if (raw) setUser(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    }, 0);
    return () => clearTimeout(initial);
  }, []);

  // Refresh from server so managedHostel is current even for older sessions.
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

  // Deep link from push notifications (?view=leave etc.); consumed once.
  useEffect(() => {
    const initial = setTimeout(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("view");
    if (target && ["leave", "sos", "overdue", "delays", "logs", "profile"].includes(target)) {
      setView(target);
      window.history.replaceState({}, "", window.location.pathname);
    }
    }, 0);
    return () => clearTimeout(initial);
  }, []);

  // Outings need no approval (the gate scan creates them). Girls' leave reaches the
  // wardens at the same moment it reaches the caretaker and the chief warden, and boys'
  // leave arrives auto-approved (lib/leaveDesk.js).
  const leaveDesk = useLeaveDesk("Warden");
  const leavePending = leaveDesk.pending;
  const [sosCount, setSosCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  // Students who reported they'll be late. Separate from overdueCount because a
  // student can file *before* their deadline passes — they aren't overdue yet.
  const [delayCount, setDelayCount] = useState(0);

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
    const initial = setTimeout(() => {
    loadSosCount();
    loadOverdueCount();
    loadDelayCount();
    }, 0);
    return () => clearTimeout(initial);
  }, [authorized, loadSosCount, loadOverdueCount, loadDelayCount]);

  useEffect(() => {
    const initial = setTimeout(() => {
    return subscribeToStaffEvents({
      "delay:created": loadDelayCount,
      "delay:updated": loadDelayCount,
    });
  }, [loadDelayCount]);

  // SSE: refresh the affected queues + history when the backend broadcasts a change.
  useEffect(() => {
    return subscribeToStaffEvents({
      "outing:changed": () => { loadOverdueCount(); },
    });
  }, [loadOverdueCount]);

  useEffect(() => {
    return subscribeToStaffEvents({
      "sos:created": loadSosCount,
      "sos:updated": loadSosCount,
    });
  }, [loadSosCount]);

  // Poll as a safety net in case an SSE connection is silently dropped.
  useEffect(() => {
    const id = setInterval(() => { loadSosCount(); loadOverdueCount(); }, 30000);
    return () => clearInterval(id);
  }, [loadSosCount, loadOverdueCount]);

  // Hydrated by the /auth/profile refresh this dashboard already runs on mount.
  const mySignature = user?.signature || null;

  // ---- Push notifications ----
  const [pushPermission, setPushPermission] = useState(null);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) { setPushPermission("unsupported"); return; }
    const perm = getNotificationPermission();
    setPushPermission(perm);
    if (perm === "granted") autoSubscribeIfGranted();
    }, 0);
    return () => clearTimeout(initial);
  }, []);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    const result = await subscribePush();
    setPushEnabling(false);
    setPushPermission(result.success ? "granted" : getNotificationPermission());
  };

  const displayName = (user && (user.name || user.displayName)) || "Warden";
  const managedHostel = user?.managedHostel;
  const isConfigured = Boolean(managedHostel);
  const handleLogout = () => logout(router, { role: "warden" });

  const formattedDate = now ? now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" }) : "—";
  const formattedTime = now ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  if (!checked || !authorized) return <AuthLoading />;

  const navItems = [
    { key: "home", label: "Home", icon: Home },
    { key: "leave", label: "Leave", icon: CalendarDays, badge: leavePending.length },
    { key: "sos", label: "Alerts", icon: Siren, badge: sosCount },
    { key: "overdue", label: "Overdue", icon: Clock, badge: overdueCount },
    { key: "delays", label: "Delays", icon: MessageSquare, badge: delayCount },
    { key: "logs", label: "Logs", icon: ScrollText },
    { key: "profile", label: "Profile", icon: User },
  ];

  // Four comfortably tappable phone tabs. Profile lives behind the header avatar,
  // movement logs remain available from the full-width home shortcut, and delay
  // notices surface via the "needs your attention" tile whenever any are pending.
  const mobileNavItems = navItems.filter((n) => !["profile", "logs", "delays"].includes(n.key));

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
                <p className="sd-eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Warden Hub</p>
                <h1 className="sd-title sd-reveal sd-stagger-1 truncate"><span className="sd-gradient-text text-gradient-primary">Warden Dashboard</span></h1>
                <p className="sd-subtitle hidden sm:block">Decide leave applications and oversee your hostel.</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">
              <div className="sd-luxe-card sd-profile-chip hidden items-center gap-3 rounded-2xl px-4 py-3 min-w-55 lg:flex">
                <div className="sd-profile-avatar bg-linear-to-br from-indigo-600 to-cyan-400 text-white flex h-12 w-12 items-center justify-center rounded-xl font-bold">{initials(displayName)}</div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900 text-base truncate">{displayName}</p>
                  {managedHostel ? (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-bold text-indigo-700">{managedHostel}</span>
                  ) : (
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">No hostel assigned</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setView("profile")}
                className="sd-profile-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-600 to-cyan-400 text-sm font-bold text-white lg:hidden"
                title="Profile"
              >
                {initials(displayName)}
              </button>
              <button
                type="button"
                onClick={handleLogout}
                title="Logout"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-rose-200 bg-white/80 text-rose-600 shadow-sm transition hover:bg-rose-50 sm:h-12 sm:w-12"
              >
                <LogOut className="h-5 w-5" />
                <span className="sr-only">Logout</span>
              </button>
            </div>
          </header>

          {user && !isConfigured && (
            <div className="mt-6 flex items-start gap-3 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800 shadow-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-bold">Your hostel isn&apos;t configured yet</p>
                <p className="text-sm">Until an admin assigns you to a hostel, you won&apos;t see any leave applications or alerts. Please contact the admin.</p>
              </div>
            </div>
          )}

          {pushPermission === "default" && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-indigo-200 bg-indigo-50/80 px-5 py-4 text-indigo-800 shadow-sm backdrop-blur-sm sd-enter">
              <Bell className="mt-0.5 h-5 w-5 shrink-0 text-indigo-500 animate-bounce" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Enable push notifications</p>
                <p className="text-sm text-indigo-700">Get alerted the moment a student of your hostel applies for leave — even when this app is closed.</p>
              </div>
              <button onClick={handleEnablePush} disabled={pushEnabling} className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95 disabled:opacity-60">
                {pushEnabling ? "Enabling…" : "Enable"}
              </button>
              <button onClick={() => setPushBannerDismissed(true)} className="shrink-0 rounded-xl p-2 text-indigo-400 transition hover:bg-indigo-100" title="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {pushPermission === "denied" && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-3xl border border-rose-200 bg-rose-50/80 px-5 py-4 text-rose-800 shadow-sm backdrop-blur-sm sd-enter">
              <BellOff className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">Notifications blocked</p>
                <p className="text-sm text-rose-700">You won&apos;t receive alerts for leave applications. Open your browser settings and allow notifications for this site.</p>
              </div>
              <button onClick={() => setPushBannerDismissed(true)} className="shrink-0 rounded-xl p-2 text-rose-400 transition hover:bg-rose-100" title="Dismiss">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {view === "home" && (
            <>
              {(() => {
                const attention = [
                  sosCount > 0 && { key: "sos", label: "Safety Alerts", count: sosCount, icon: Siren, onClick: () => setView("sos") },
                  overdueCount > 0 && { key: "overdue", label: "Overdue Students", count: overdueCount, icon: Clock, onClick: () => setView("overdue") },
                  delayCount > 0 && { key: "delays", label: "Delay Notices", count: delayCount, icon: MessageSquare, onClick: () => setView("delays") },
                  leavePending.length > 0 && { key: "leave", label: "Leave to Decide", count: leavePending.length, icon: CalendarDays, onClick: () => setView("leave") },
                ].filter(Boolean);
                if (attention.length === 0) return null;
                return (
                  <section className="sd-enter mt-4">
                    <div className="flex items-center gap-2 px-1">
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-rose-500" />
                      </span>
                      <p className="sd-eyebrow">Needs attention</p>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:gap-2.5 lg:grid-cols-4">
                      {attention.map((a) => (
                        <button key={a.key} onClick={a.onClick} className="wd-attn flex items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left shadow-md transition hover:-translate-y-0.5 active:scale-95 sm:gap-3 sm:px-4 sm:py-3">
                          <span className="wd-attn__icon flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white sm:h-10 sm:w-10">
                            <a.icon className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold sm:text-sm">{a.label}</span>
                            <span className="block text-[11px] font-semibold text-slate-500 sm:text-xs">{a.count} pending</span>
                          </span>
                          <ArrowRight className="hidden h-4 w-4 shrink-0 opacity-60 sm:block" />
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })()}

              <section className="sd-luxe-panel sd-glow-border sd-enter mt-6 rounded-4xl p-5 sm:p-7 shadow-xl">
                <div className="grid items-center gap-4 sm:gap-6 lg:grid-cols-[1.2fr_auto]">
                  <div className="flex flex-wrap items-center gap-3 sm:gap-5">
                    <div className="sd-luxe-float hidden h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-white to-sky-50 ring-8 ring-white/80 shadow-lg sm:flex">
                      <Clock className="h-10 w-10 text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="sd-kicker">Daily pulse</p>
                      <h2 className="sd-title sd-title-md mt-1 sm:mt-2">Welcome, <span className="sd-name-live">Warden</span></h2>
                      <p className="sd-body mt-2 hidden max-w-md sm:block">Girls&apos; leave applications reach you, the caretaker and the chief warden together — whoever acts first decides. Boys&apos; leave is auto-approved and you can revoke it. Outings need no approval — the gate logs them.</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm font-semibold text-slate-600 sm:grid sm:grid-cols-2 sm:gap-3 lg:grid-cols-1">
                    <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-2 rounded-full px-3 py-2 sm:gap-3 sm:px-4 sm:py-2.5">
                      <CalendarDays className="h-4 w-4 text-indigo-500 sm:h-5 sm:w-5" /> {formattedDate}
                    </span>
                    <span suppressHydrationWarning className="sd-luxe-pill inline-flex flex-1 items-center gap-2 rounded-full px-3 py-2 sm:flex-none sm:gap-3 sm:px-4 sm:py-2.5">
                      <Clock className="h-4 w-4 text-sky-500 sm:h-5 sm:w-5" /> {formattedTime}
                      <span className="sd-luxe-chip ml-auto rounded-full px-3 py-1 text-xs font-bold">Live</span>
                    </span>
                  </div>
                </div>
              </section>

              {/* Three tiles: one row from lg, and the last one widens to close the
                  odd slot on tablets instead of leaving a gap. */}
              <section className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  { label: "Leave to Decide", value: leavePending.length, icon: CalendarDays, onClick: () => setView("leave"), fill: "from-violet-500 to-fuchsia-400" },
                  { label: "Overdue Students", value: overdueCount, icon: Clock, onClick: () => setView("overdue"), fill: "from-amber-500 to-orange-400" },
                  { label: "Active Alerts", value: sosCount, icon: Siren, onClick: () => setView("sos"), fill: "from-rose-500 to-orange-400" },
                ].map((s, i, arr) => (
                  <button
                    key={s.label}
                    onClick={s.onClick}
                    className={`sd-luxe-panel sd-enter flex items-center gap-4 rounded-3xl p-5 text-left shadow-lg transition hover:-translate-y-0.5 ${
                      i === arr.length - 1 ? "sm:col-span-2 lg:col-span-1" : ""
                    }`}
                    style={{ animationDelay: `${0.1 + i * 0.05}s` }}
                  >
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br ${s.fill} text-white shadow`}>
                      <s.icon className="h-6 w-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-2xl font-bold text-slate-900">{s.value}</span>
                      <span className="block truncate text-xs font-semibold text-slate-500">{s.label}</span>
                    </span>
                  </button>
                ))}
              </section>

              {/* Direct entry to the movement log — no more digging through "More". */}
              <button
                onClick={() => setView("logs")}
                className="sd-luxe-panel sd-enter mt-4 flex w-full items-center gap-4 rounded-3xl p-5 text-left shadow-lg transition hover:-translate-y-0.5"
                style={{ animationDelay: "0.3s" }}
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-linear-to-br from-teal-500 to-emerald-400 text-white shadow">
                  <ScrollText className="h-6 w-6" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-slate-900">Movement Logs</span>
                  <span className="block truncate text-xs font-semibold text-slate-500">See who&apos;s in and out of your hostel</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-slate-400" />
              </button>
            </>
          )}

          {view === "leave" && (
            <StaffLeaveDesk
              desk={leaveDesk}
              scope={genderForHostel(managedHostel)}
              mySignature={mySignature}
              onSignatureSaved={(signature) => setUser((u) => ({ ...(u || {}), signature }))}
            />
          )}

          {view === "sos" && <SOSAlertsView onCountChange={setSosCount} />}

          {view === "overdue" && <OverdueStudentsView onCountChange={setOverdueCount} />}
          {view === "delays" && <DelayNoticesView onCountChange={setDelayCount} />}

          {view === "logs" && <MovementLogsView />}

          {view === "profile" && (
            <section className="sd-luxe-panel sd-enter mx-auto mt-6 w-full max-w-3xl rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center gap-4">
                <span className="sd-profile-avatar flex h-16 w-16 items-center justify-center bg-linear-to-br from-indigo-700 via-indigo-600 to-cyan-400 text-lg font-bold text-white shadow-lg">
                  {initials(displayName)}
                </span>
                <div className="min-w-0">
                  <p className="sd-card-title text-xl">{displayName}</p>
                  <p className="sd-tag mt-1.5"><ShieldCheck className="h-3.5 w-3.5" /> {user?.roleLabel || "Warden"}</p>
                </div>
              </div>
              <div className="mt-6 space-y-3">
                {managedHostel && (
                  <div className="sd-row" style={{ "--accent": "#6366f1" }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex items-center gap-3"><Building2 className="h-4 w-4 text-slate-400" /><span className="sd-card-title text-[0.88rem]">{managedHostel}</span></div>
                  </div>
                )}
                {user?.email && (
                  <div className="sd-row" style={{ "--accent": "#0ea5e9" }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex min-w-0 items-center gap-3"><Mail className="h-4 w-4 shrink-0 text-slate-400" /><span className="sd-card-title truncate text-[0.88rem]">{user.email}</span></div>
                  </div>
                )}
                {user?.phoneNumber && (
                  <div className="sd-row" style={{ "--accent": "#2dd4bf" }}>
                    <span className="sd-row__accent" aria-hidden="true" />
                    <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-slate-400" /><span className="sd-card-title text-[0.88rem]">{user.phoneNumber}</span></div>
                  </div>
                )}
                <SignatureCard
                  signature={mySignature}
                  onSaved={(signature) => setUser((u) => ({ ...(u || {}), signature }))}
                />
              </div>
              <button type="button" onClick={handleLogout} className="sd-magnetic mt-8 flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-rose-50 px-5 py-4 text-sm font-bold uppercase tracking-[0.2em] text-rose-600 shadow-sm transition hover:bg-rose-100">
                <LogOut className="h-5 w-5" /> Logout
              </button>
            </section>
          )}

          {/* Desktop nav */}
          <nav className="sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid grid-cols-8 gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur">
            {navItems.map((n) => (
              <button key={n.key} onClick={() => setView(n.key)} className={`sd-navx ${view === n.key ? "sd-navx--active" : ""}`}>
                <span className="sd-navx__icon relative">
                  <n.icon className="h-5 w-5" />
                  {n.badge > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{n.badge}</span>}
                </span>
                {n.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Mobile nav — one column per mobileNavItems entry; Profile lives behind the header avatar */}
      <nav className="sd-mobile-bottom-nav sd-luxe-panel sd-glow-border fixed inset-x-2 bottom-3 z-60 grid grid-cols-5 gap-0.5 rounded-[1.75rem] p-1.5 md:hidden">
        {mobileNavItems.map((n) => (
          <button key={n.key} onClick={() => setView(n.key)} className={`sd-navx ${view === n.key ? "sd-navx--active" : ""}`}>
            <span className="sd-navx__icon relative">
              <n.icon className="h-5 w-5" />
              {n.badge > 0 && <span className="absolute -top-2 -right-2 h-4 min-w-4 px-1 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">{n.badge}</span>}
            </span>
            <span className="text-[9px]">{n.label}</span>
          </button>
        ))}
      </nav>

      {/* Live "student is running late" popup — refetches on the /delay stream. */}
      <DelayNoticeToast onView={() => setView("delays")} />
    </main>
  );
}
