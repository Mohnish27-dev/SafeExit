"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "react-qr-code";
import {
  Bell,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Clock3,
  Home,
  House,
  IdCard,
  QrCode,
  Shield,
  ShieldCheck,
  Siren,
  Ticket,
  UserRound,
} from "lucide-react";
import { buildSlug, getFirstName, getStoredUser, setStoredUser } from "@/app/lib/userProfile";

const actions = [
  {
    title: "Generate Outing Ticket",
    description: "Create a new request and get your pass.",
    icon: Ticket,
    tone: "bg-slate-100 text-slate-800",
    arrow: "text-slate-400",
  },
  {
    title: "My Outings",
    description: "View upcoming and past outings.",
    icon: ClipboardList,
    tone: "bg-blue-100 text-blue-700",
    arrow: "text-blue-400",
  },
  {
    title: "SOS Alert",
    description: "Send emergency alert to warden.",
    icon: Siren,
    tone: "bg-rose-100 text-rose-700",
    arrow: "text-rose-600",
  },
];

const outings = [
  { place: "City Library", date: "Today", status: "Approved", time: "05:30 PM" },
  { place: "Medical Store", date: "22 May", status: "Completed", time: "07:10 PM" },
  { place: "Stationery Market", date: "18 May", status: "Completed", time: "06:00 PM" },
];

const defaultProfile = {
  name: "Student",
  roleLabel: "Student",
  subtitle: "Year, Program",
  id: "STU2024CSE102",
  hostel: "Hostel Block A, Room 201",
};

export default function StudentDashboardPage() {
  const [profile, setProfile] = useState(defaultProfile);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const storedProfile = getStoredUser();
    if (!storedProfile?.name) return;

    const normalizedSubtitle =
      storedProfile.role === "student" && storedProfile.subtitle === "2nd Year, CSE"
        ? "Year, Program"
        : storedProfile.subtitle;

    if (normalizedSubtitle !== storedProfile.subtitle) {
      setStoredUser({
        ...storedProfile,
        subtitle: normalizedSubtitle,
      });
    }

    setProfile((prev) => ({
      ...prev,
      ...storedProfile,
      roleLabel: storedProfile.roleLabel || prev.roleLabel,
      subtitle: normalizedSubtitle || prev.subtitle,
      id: storedProfile.id || prev.id,
      hostel: storedProfile.hostel || prev.hostel,
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

  const qrValue = useMemo(() => {
    const slug = buildSlug(profile.name);
    return `SAFEEXIT:${profile.id}:${slug}`;
  }, [profile.id, profile.name]);

  const formattedDate = useMemo(
    () => now.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }),
    [now]
  );

  const formattedTime = useMemo(
    () => now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    [now]
  );

  const stats = [
    { label: "Week outings", value: "4", tone: "from-cyan-500/15 via-transparent to-transparent" },
    { label: "On-time returns", value: "98%", tone: "from-emerald-500/15 via-transparent to-transparent" },
    { label: "Next check-in", value: "7:30 PM", tone: "from-indigo-500/15 via-transparent to-transparent" },
  ];

  const timeline = [
    { title: "Outing approved", meta: "City Library · 05:30 PM", tone: "bg-emerald-100 text-emerald-700" },
    { title: "Gate scan recorded", meta: "North Gate · 05:40 PM", tone: "bg-sky-100 text-sky-700" },
    { title: "Return reminder", meta: "Due by 07:30 PM", tone: "bg-amber-100 text-amber-700" },
  ];

  return (
    <main className="min-h-screen student-dashboard-luxe text-slate-900">
      <div className="relative overflow-hidden">
        <div className="sd-luxe-orb sd-luxe-orb-one" />
        <div className="sd-luxe-orb sd-luxe-orb-two" />
        <div className="sd-luxe-orb sd-luxe-orb-three" />
        <div className="sd-luxe-wave" />
        <div className="sd-luxe-streaks" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel sd-luxe-rise flex flex-wrap items-center justify-between gap-4 rounded-[2.5rem] px-5 py-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="sd-luxe-badge flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
                <Shield className="h-7 w-7" />
              </div>
              <div>
                <p className="sd-eyebrow">Personal Hub</p>
                <h1 className="sd-title sd-reveal sd-stagger-1">
                  Student Dashboard
                </h1>
                <p className="sd-subtitle">SafeExit Passport</p>
              </div>
            </div>

            <div className="sd-luxe-card sd-luxe-tilt flex items-center gap-3 rounded-2xl px-4 py-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-800">
                <UserRound className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-900">{profile.name}</p>
                <p className="text-sm text-slate-500">{profile.subtitle}</p>
              </div>
              <ChevronRight className="h-5 w-5 rotate-90 text-slate-400" />
            </div>
          </header>

          <section className="sd-luxe-panel sd-luxe-rise mt-6 rounded-[2.5rem] p-6 shadow-xl">
            <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-5">
                <div className="sd-luxe-float flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white text-slate-900 ring-8 ring-white/80">
                  <Clock3 className="h-10 w-10" />
                </div>
                <div>
                  <p className="sd-eyebrow">Daily Pulse</p>
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2">
                    Good Morning, {greetingName}.
                  </h2>
                  <p className="sd-body mt-2">
                    Your SafeExit pass is active. Enjoy the day.
                  </p>
                </div>
              </div>
              <div className="grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-1">
                <span className="sd-luxe-pill inline-flex items-center gap-3 rounded-full px-4 py-2">
                  <CalendarDays className="h-5 w-5 text-slate-500" />
                  {formattedDate}
                </span>
                <span className="sd-luxe-pill inline-flex items-center gap-3 rounded-full px-4 py-2">
                  <Clock3 className="h-5 w-5 text-slate-500" />
                  {formattedTime}
                  <span className="sd-luxe-chip ml-auto rounded-full px-3 py-1 text-xs font-semibold">Live</span>
                </span>
              </div>
            </div>
          </section>

          <section className="sd-luxe-panel sd-luxe-rise mt-6 rounded-[2.5rem] p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="sd-eyebrow">Quick Actions</p>
                <h2 className="sd-title sd-title-sm sd-reveal sd-stagger-2">Everything at a glance</h2>
              </div>
              <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-bold">Updated</span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {actions.map((action) => (
                <button
                  key={action.title}
                  className="sd-luxe-card sd-luxe-shimmer sd-luxe-rise sd-luxe-tilt group flex min-h-64 flex-col items-center justify-between rounded-[2rem] p-6 text-center transition hover:-translate-y-1"
                >
                  <span className={`flex h-24 w-24 items-center justify-center rounded-full ${action.tone}`}>
                    <action.icon className="h-11 w-11" />
                  </span>
                  <span>
                    <span className="sd-card-title block">{action.title}</span>
                    <span className="sd-body mt-3 block">
                      {action.description}
                    </span>
                  </span>
                  <ChevronRight className={`h-9 w-9 transition group-hover:translate-x-1 ${action.arrow}`} />
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="sd-luxe-panel rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="sd-title sd-title-sm sd-reveal sd-stagger-3">Your SafeExit Pass</h2>
                <span className="sd-luxe-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold">
                  <ShieldCheck className="h-5 w-5" />
                  Valid
                </span>
              </div>
              <div className="mt-6 grid gap-6 md:grid-cols-[260px_1fr]">
                <div className="sd-luxe-card sd-luxe-tilt flex items-center justify-center rounded-3xl p-5">
                  <QRCode value={qrValue} className="h-full w-full" />
                </div>
                <div className="flex flex-col justify-center">
                  <h3 className="sd-title sd-title-md">{profile.name}</h3>
                  <div className="sd-body mt-5 space-y-4">
                    <p className="flex items-center gap-3"><IdCard className="h-5 w-5" /> {profile.id}</p>
                    <p className="flex items-center gap-3"><House className="h-5 w-5" /> {profile.hostel}</p>
                    <p className="flex items-center gap-3"><ShieldCheck className="h-5 w-5" /> Valid for all outings</p>
                  </div>
                  <button className="mt-6 inline-flex w-fit items-center gap-3 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-700 to-cyan-500 px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:-translate-y-0.5">
                    <QrCode className="h-6 w-6" />
                    Show QR Code
                  </button>
                </div>
              </div>
            </div>

            <div className="sd-luxe-panel rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="sd-title sd-title-sm sd-reveal sd-stagger-3">Recent Outings</h2>
                <button className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">View All</button>
              </div>
              <div className="mt-5 space-y-3">
                {outings.map((outing) => (
                  <div key={`${outing.place}-${outing.date}`} className="sd-luxe-card sd-luxe-rise sd-luxe-tilt flex items-center justify-between gap-3 rounded-2xl px-4 py-3">
                    <div>
                      <p className="sd-card-title text-slate-900">{outing.place}</p>
                      <p className="sd-micro">{outing.date} at {outing.time}</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {outing.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="sd-luxe-panel rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="sd-eyebrow">Weekly Pulse</p>
                  <h2 className="sd-title sd-title-sm sd-reveal sd-stagger-2">Activity Stats</h2>
                </div>
                <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-semibold">Live</span>
              </div>
              <div className="mt-5 space-y-4">
                {stats.map((stat) => (
                  <div key={stat.label} className="sd-luxe-card sd-luxe-tilt rounded-2xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      <p className="sd-micro">{stat.label}</p>
                      <p className="text-xl font-bold text-slate-900">{stat.value}</p>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100">
                      <div className={`sd-luxe-progress h-full rounded-full bg-gradient-to-r ${stat.tone}`} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sd-luxe-panel rounded-[2.5rem] p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-eyebrow">Timeline</p>
                  <h2 className="sd-title sd-title-sm sd-reveal sd-stagger-2">Today’s Movement</h2>
                </div>
                <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-semibold">Auto sync</span>
              </div>
              <div className="mt-5 space-y-4">
                {timeline.map((event) => (
                  <div key={event.title} className="sd-luxe-card sd-luxe-rise sd-luxe-tilt flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-3">
                    <div>
                      <p className="sd-card-title text-slate-900">{event.title}</p>
                      <p className="sd-micro">{event.meta}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${event.tone}`}>Active</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <nav className="sd-luxe-panel mt-6 grid grid-cols-4 rounded-[2rem] p-3 backdrop-blur">
            {[
              { label: "Home", icon: Home, active: true },
              { label: "My Outings", icon: ClipboardList },
              { label: "Notifications", icon: Bell },
              { label: "Profile", icon: UserRound },
            ].map((item) => (
              <button
                key={item.label}
                className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold uppercase tracking-[0.18em] ${
                  item.active ? "bg-white text-slate-900" : "text-slate-500"
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
