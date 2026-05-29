"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  Clock3,
  History,
  Home,
  LogIn,
  LogOut,
  ScanLine,
  Shield,
  ShieldCheck,
  UserCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { getFirstName, getStoredUser } from "@/app/lib/userProfile";

const statusCards = [
  {
    label: "Inside Campus",
    value: "142",
    note: "Students currently in",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: UserCheck,
  },
  {
    label: "Outside Campus",
    value: "68",
    note: "Students out on outing",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    icon: UserRound,
  },
  {
    label: "Overdue",
    value: "12",
    note: "Not yet returned",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
    icon: Clock3,
  },
];

const recentScans = [
  { name: "Ananya Verma", meta: "2nd Year, CSE - STU2024CSE102", tag: "Entry (IN)", time: "09:15 AM", type: "in" },
  { name: "Rohan Singh", meta: "3rd Year, ECE - STU2023ECE089", tag: "Exit (OUT)", time: "08:45 AM", type: "out" },
  { name: "Priya Sharma", meta: "2nd Year, IT - STU2024IT045", tag: "Entry (IN)", time: "08:20 AM", type: "in" },
  { name: "Kunal Mehta", meta: "4th Year, ME - STU2022ME011", tag: "Exit (OUT)", time: "08:05 AM", type: "out" },
];

const defaultProfile = {
  name: "Security Guard",
  roleLabel: "Security Guard",
};

export default function SecurityDashboardPage() {
  const [profile, setProfile] = useState(defaultProfile);
  const [now, setNow] = useState(() => new Date());

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
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const greetingName = useMemo(() => {
    const firstName = getFirstName(profile.name);
    return firstName || profile.name;
  }, [profile.name]);

  const formattedDate = useMemo(
    () => now.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }),
    [now]
  );

  const formattedTime = useMemo(
    () => now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [now]
  );

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
                <p className="text-xs font-semibold uppercase tracking-[0.4em] text-slate-400">Live Command</p>
                <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">SafeExit Control</h1>
                <p className="text-sm font-medium text-slate-500">Security Guard Operations</p>
              </div>
            </div>

            <div className="dash-card flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-700">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{profile.name}</p>
                <p className="text-sm font-medium text-slate-500">{profile.roleLabel}</p>
              </div>
              <ChevronRight className="h-5 w-5 rotate-90 text-slate-400" />
            </div>
          </header>

          <section className="dash-surface dash-animate-rise dash-stagger-2 mt-6 rounded-[2.5rem] p-6 shadow-xl">
            <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-5">
                <div className="dash-animate-float flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-cyan-100 text-indigo-700 ring-8 ring-white/70">
                  <Clock3 className="h-10 w-10" />
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-400">Shift Pulse</p>
                  <h2 className="font-display text-3xl font-bold tracking-tight text-slate-900">
                    Good Morning, {greetingName}.
                  </h2>
                  <p className="mt-2 text-lg font-normal text-slate-600">
                    Live gates synced. Your patrol window is active.
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
                  <span className="dash-chip ml-auto rounded-full px-3 py-1 text-xs font-semibold">Live</span>
                </span>
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="dash-surface dash-animate-rise dash-stagger-3 rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Quick Scan</p>
                  <h2 className="font-display text-2xl font-bold tracking-tight">Scan Gateway</h2>
                </div>
                <span className="dash-chip rounded-full px-3 py-1 text-xs font-semibold">Realtime</span>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-2">
                <div className="dash-card-strong dash-animate-shimmer rounded-[2.25rem] p-6 text-center">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <LogIn className="h-12 w-12" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-emerald-700">Scan Entry</h3>
                  <p className="mx-auto mt-3 max-w-sm text-base font-normal leading-relaxed text-slate-600">
                    Validate every student check-in with a single QR scan.
                  </p>
                  <button className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:-translate-y-0.5">
                    <ScanLine className="h-6 w-6" />
                    Start Entry
                  </button>
                </div>

                <div className="dash-card-strong dash-animate-shimmer rounded-[2.25rem] p-6 text-center">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    <LogOut className="h-12 w-12" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-sky-700">Scan Exit</h3>
                  <p className="mx-auto mt-3 max-w-sm text-base font-normal leading-relaxed text-slate-600">
                    Approve exits instantly and sync safe return windows.
                  </p>
                  <button className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:-translate-y-0.5">
                    <ScanLine className="h-6 w-6" />
                    Start Exit
                  </button>
                </div>
              </div>
            </div>

            <aside className="dash-card dash-animate-rise rounded-[2.5rem] p-6 shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">Shift Signal</p>
              <h3 className="font-display mt-3 text-2xl font-bold">Zone Readiness</h3>
              <p className="mt-2 text-sm text-slate-500">
                Main gate and hostel blocks are synced. One checkpoint needs attention.
              </p>
              <div className="mt-5 space-y-3">
                {[
                  { label: "Main gate", status: "Online", tone: "bg-emerald-100 text-emerald-700" },
                  { label: "Hostel block A", status: "Online", tone: "bg-emerald-100 text-emerald-700" },
                  { label: "Hostel block B", status: "Offline", tone: "bg-rose-100 text-rose-700" },
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
                <h2 className="font-display text-2xl font-bold tracking-tight">Students Status</h2>
                <button className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">View All</button>
              </div>
              <div className="mt-5 space-y-4">
                {statusCards.map((card) => (
                  <div key={card.label} className={`rounded-3xl border p-5 ${card.tone}`}>
                    <div className="flex items-center gap-4">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/80">
                        <card.icon className="h-6 w-6" />
                      </span>
                      <div>
                        <p className="text-3xl font-bold leading-none text-slate-900">{card.value}</p>
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
                <h2 className="font-display text-2xl font-bold tracking-tight">Recent Scans</h2>
                <button className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">View All</button>
              </div>
              <div className="mt-4 space-y-3">
                {recentScans.map((scan) => (
                  <div key={`${scan.name}-${scan.time}`} className="dash-outline flex flex-wrap items-center justify-between gap-4 rounded-2xl px-4 py-3">
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

          <section className="dash-animate-rise mt-6 flex flex-wrap items-center justify-between gap-4 rounded-[2.5rem] border border-rose-200/70 bg-rose-50/80 p-6 shadow-lg">
            <div className="flex items-center gap-4">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <Bell className="h-7 w-7" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-rose-400">Alerts</p>
                <h2 className="font-display text-xl font-bold">2 Students Overdue</h2>
                <p className="text-sm text-slate-600">Immediate attention required for delayed returns.</p>
              </div>
            </div>
            <button className="dash-chip rounded-2xl bg-rose-500 px-6 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-lg">
              View Now
            </button>
          </section>

          <nav className="dash-card mt-6 grid grid-cols-4 rounded-[2rem] p-3 shadow-xl backdrop-blur">
            {[
              { label: "Home", icon: Home, active: true },
              { label: "Students", icon: UsersRound },
              { label: "History", icon: History },
              { label: "Profile", icon: UserRound },
            ].map((item) => (
              <button
                key={item.label}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold uppercase tracking-[0.18em] ${
                  item.active ? "bg-indigo-100 text-indigo-700" : "text-slate-500"
                }`}
              >
                <item.icon className="h-6 w-6" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </div>
    </main>
  );
}
