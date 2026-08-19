"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Wrench,
  Bell,
  BellOff,
  X,
  LogOut,
  RefreshCcw,
  Loader2,
  MessageSquare,
  User,
  Home,
  DoorClosed,
  Clock,
  CheckCircle2,
  Zap,
  Droplets,
  Sparkles,
  Wifi,
  Armchair,
  MoreHorizontal,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";
import { subscribeToStaffEvents } from "@/app/lib/staffEvents";
import { useRequireAuth, logout } from "@/app/lib/auth";
import { getStoredUser } from "@/app/lib/userProfile";
import AuthLoading from "@/app/components/AuthGate";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import {
  isPushSupported,
  getNotificationPermission,
  subscribePush,
  autoSubscribeIfGranted,
} from "@/app/lib/pushManager";

// Per-category presentation (icon + tint), mirroring the student complaint form.
const CATEGORY_META = {
  Electrical: { icon: Zap, tone: "bg-amber-100 text-amber-600" },
  Plumbing: { icon: Droplets, tone: "bg-sky-100 text-sky-600" },
  Cleaning: { icon: Sparkles, tone: "bg-emerald-100 text-emerald-600" },
  Wifi: { icon: Wifi, tone: "bg-indigo-100 text-indigo-600" },
  Furniture: { icon: Armchair, tone: "bg-orange-100 text-orange-600" },
  Other: { icon: MoreHorizontal, tone: "bg-slate-100 text-slate-600" },
};

const STATUS_TONE = {
  Open: "bg-rose-100 text-rose-700",
  Acknowledged: "bg-sky-100 text-sky-700",
  "In Progress": "bg-amber-100 text-amber-700",
  Resolved: "bg-emerald-100 text-emerald-700",
  Rejected: "bg-slate-100 text-slate-600",
};

const formatTime = (value, dateLocale) =>
  value
    ? new Date(value).toLocaleString(dateLocale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "—";

export default function DepartmentDashboardPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("department");
  const { t } = useTranslation("department");
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();

  const [user, setUser] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  // Refresh from server so managedDepartment is current even for older sessions.
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

  const department = user?.managedDepartment || "";

  const loadComplaints = useCallback(async () => {
    setError("");
    try {
      const data = await apiFetch("/complaint");
      // The dashboard only handles work that's still open.
      setComplaints((data || []).filter((c) => c.status !== "Resolved" && c.status !== "Rejected"));
    } catch (err) {
      setError(err.message || t("couldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadComplaints();
  }, [loadComplaints]);

  // Live updates via SSE, with a 30s poll as a safety net.
  useEffect(() => {
    return subscribeToStaffEvents({
      "complaint:created": loadComplaints,
      "complaint:updated": loadComplaints,
    });
  }, [loadComplaints]);

  useEffect(() => {
    const interval = setInterval(loadComplaints, 30000);
    return () => clearInterval(interval);
  }, [loadComplaints]);

  // Department may only progress a complaint — never resolve it.
  const updateStatus = async (id, status) => {
    const prev = complaints;
    setBusyId(id);
    setComplaints((list) => list.map((c) => (c._id === id ? { ...c, status } : c)));
    try {
      await apiFetch(`/complaint/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      setComplaints(prev);
      setError(err.message || t("couldNotUpdate"));
    } finally {
      setBusyId(null);
    }
  };

  const handleLogout = () => logout(router, { role: "department" });

  // Push notification banner state; null until permission API is checked.
  const [pushPermission, setPushPermission] = useState(null);
  const [pushBannerDismissed, setPushBannerDismissed] = useState(false);
  const [pushEnabling, setPushEnabling] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) {
      setPushPermission("unsupported");
      return;
    }
    const perm = getNotificationPermission();
    setPushPermission(perm);
    if (perm === "granted") autoSubscribeIfGranted();
  }, []);

  const handleEnablePush = async () => {
    setPushEnabling(true);
    const result = await subscribePush();
    setPushEnabling(false);
    setPushPermission(result.success ? "granted" : getNotificationPermission());
  };

  if (!checked || !authorized) return <AuthLoading />;

  const displayName = (user && (user.name || user.displayName)) || t("departmentFallback");
  const DeptIcon = (department && CATEGORY_META[department]?.icon) || Wrench;

  return (
    <main className="min-h-screen sd-canvas sd-grain text-slate-900 pb-16">
      <div className="relative overflow-hidden">
        <div className="sd-aura sd-aura--a" aria-hidden="true" />
        <div className="sd-aura sd-aura--b" aria-hidden="true" />
        <div className="sd-aura sd-aura--c" aria-hidden="true" />

        <div className="relative z-[1] mx-auto flex w-full max-w-4xl flex-col px-4 py-6 sm:px-6">
          {/* Header */}
          <header className="flex items-center justify-between gap-3 rounded-3xl border border-white/80 bg-white/90 px-4 py-4 shadow-sm backdrop-blur sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-700 via-indigo-600 to-cyan-400 text-white shadow-lg">
                <DeptIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">{t("desk")}</p>
                <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">
                  {department
                    ? t("complaintsFor").replace("{department}", t(department))
                    : t("complaints")}
                </h1>
                <p className="truncate text-xs text-slate-500">{displayName}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <LanguageSwitcher className="hidden sm:inline-flex" />
              <button
                onClick={loadComplaints}
                title={tc("refresh")}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50"
              >
                <RefreshCcw className="h-5 w-5" />
              </button>
              <button
                onClick={handleLogout}
                title={tc("logout")}
                className="flex h-10 w-10 items-center justify-center rounded-2xl border border-rose-200 bg-white text-rose-600 shadow-sm transition hover:bg-rose-50"
              >
                <LogOut className="h-5 w-5" />
              </button>
            </div>
          </header>

          {/* The switcher needs a home on narrow screens too. */}
          <div className="mt-3 flex justify-end sm:hidden">
            <LanguageSwitcher />
          </div>

          {!department && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-amber-800">
              <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="font-bold">{t("noDepartment")}</p>
                <p className="text-sm">{t("noDepartmentHint")}</p>
              </div>
            </div>
          )}

          {/* Push notification banners */}
          {pushPermission === "default" && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50/80 px-5 py-4 text-indigo-800 shadow-sm">
              <Bell className="h-5 w-5 shrink-0 animate-bounce text-indigo-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t("enablePush")}</p>
                <p className="text-sm text-indigo-700">{t("enablePushHint")}</p>
              </div>
              <button
                onClick={handleEnablePush}
                disabled={pushEnabling}
                className="shrink-0 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md transition hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
              >
                {pushEnabling ? t("enabling") : t("enable")}
              </button>
              <button onClick={() => setPushBannerDismissed(true)} className="shrink-0 rounded-xl p-2 text-indigo-400 transition hover:bg-indigo-100" title={t("dismiss")}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {pushPermission === "denied" && !pushBannerDismissed && (
            <div className="mt-4 flex items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 px-5 py-4 text-rose-800 shadow-sm">
              <BellOff className="h-5 w-5 shrink-0 text-rose-500" />
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t("notificationsBlocked")}</p>
                <p className="text-sm text-rose-700">{t("notificationsBlockedHint")}</p>
              </div>
              <button onClick={() => setPushBannerDismissed(true)} className="shrink-0 rounded-xl p-2 text-rose-400 transition hover:bg-rose-100" title={t("dismiss")}>
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Pending complaints */}
          <section className="mt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">{t("pendingComplaints")}</h2>
              <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-indigo-100 px-2 text-xs font-bold text-indigo-700">
                {complaints.length}
              </span>
            </div>

            {error && (
              <p className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p>
            )}

            <div className="mt-4 space-y-3">
              {loading ? (
                <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
                  <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                  <p className="text-sm font-semibold">{t("loadingComplaints")}</p>
                </div>
              ) : complaints.length === 0 ? (
                <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-100 bg-white py-16 text-slate-500">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100">
                    <MessageSquare className="h-7 w-7 text-slate-400" />
                  </div>
                  <p className="font-semibold text-slate-700">{t("allClear")}</p>
                  <p className="text-sm text-slate-500">{t("noPending")}</p>
                </div>
              ) : (
                complaints.map((c) => {
                  const meta = CATEGORY_META[c.category] || CATEGORY_META.Other;
                  const CatIcon = meta.icon;
                  const busy = busyId === c._id;
                  return (
                    <div key={c._id} className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${meta.tone}`}>
                            <CatIcon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900">{t(c.category)}</p>
                            <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.description}</p>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${STATUS_TONE[c.status] || STATUS_TONE.Open}`}>
                          {t(c.status)}
                        </span>
                      </div>

                      {/* Limited student info: name, room, hostel — nothing more. */}
                      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 pt-3 text-xs font-semibold text-slate-600">
                        <span className="inline-flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {c.student?.name || t("unknownStudent")}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <DoorClosed className="h-3.5 w-3.5 text-slate-400" />
                          {t("room")} {c.roomNumber || c.student?.roomNumber || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Home className="h-3.5 w-3.5 text-slate-400" />
                          {c.student?.hostelName || "—"}
                        </span>
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          {formatTime(c.createdAt, dateLocale)}
                        </span>
                      </div>

                      {/* Progress actions only — resolving is the student's call. */}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          onClick={() => updateStatus(c._id, "Acknowledged")}
                          disabled={busy || c.status === "Acknowledged"}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2 text-xs font-bold text-sky-700 transition hover:bg-sky-100 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" /> {t("acknowledge")}
                        </button>
                        <button
                          onClick={() => updateStatus(c._id, "In Progress")}
                          disabled={busy || c.status === "In Progress"}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          <Loader2 className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> {t("markInProgress")}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
