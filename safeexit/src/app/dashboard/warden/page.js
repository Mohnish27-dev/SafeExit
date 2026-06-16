"use client";

import { useEffect, useState } from "react";
import {
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Clock,
  Home,
  MessageSquare,
  User,
  X,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ShieldAlert,
  Sparkles,
  Users,
} from "lucide-react";

export default function WardenDashboardPage() {
  const [now, setNow] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // load stored profile from localStorage if available
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem("safeexit:user");
      if (raw) {
        const parsed = JSON.parse(raw);
        setUser(parsed);
      }
    } catch (e) {
      // ignore
    }
  }, []);

  const formattedDate = now ? now.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "short" }) : "Loading...";
  const formattedTime = now ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "Loading...";

  const pendingRequests = [
    { id: 1, name: "Ananya Verma", branch: "2nd Year, CSE", roll: "STU2024CSE102", out: "06:15 PM", return: "08:30 PM", initials: "AV" },
    { id: 2, name: "Riya Patel", branch: "3rd Year, ECE", roll: "STU2023ECE089", out: "06:45 PM", return: "09:00 PM", initials: "RP" },
    { id: 3, name: "Neha Joshi", branch: "2nd Year, IT", roll: "STU2024IT045", out: "07:00 PM", return: "09:30 PM", initials: "NJ" },
  ];

  const autoApproved = [
    { id: 1, name: "Sneha Reddy", outSince: "04:10 PM", initials: "SR" },
    { id: 2, name: "Aarav Sharma", outSince: "04:25 PM", initials: "AS" },
    { id: 3, name: "Manav Singh", outSince: "04:40 PM", initials: "MS" },
  ];

  const complaints = [
    { id: 1, title: "Water leakage in Room 201", by: "Riya Patel", time: "19 May, 08:30 AM", status: "New", tone: "bg-rose-100 text-rose-500", icon: AlertCircle, statusTone: "bg-rose-100 text-rose-600" },
    { id: 2, title: "Mess food quality issue", by: "Neha Joshi", time: "19 May, 07:45 AM", status: "New", tone: "bg-orange-100 text-orange-500", icon: AlertTriangle, statusTone: "bg-rose-100 text-rose-600" },
  ];

  const displayName = (user && (user.name || user.displayName)) || "Warden Priya";
  const firstName = displayName.split(" ")[0] || displayName;

  return (
    <main className="min-h-screen student-dashboard-luxe text-slate-900 pb-28">
      <div className="relative overflow-hidden">
        <div className="sd-luxe-orb sd-luxe-orb-one" />
        <div className="sd-luxe-orb sd-luxe-orb-two" />
        <div className="sd-luxe-orb sd-luxe-orb-three" />
        <div className="sd-luxe-wave" />
        <div className="sd-luxe-streaks" />

        <div className="relative mx-auto flex w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
          <header className="sd-luxe-panel sd-luxe-rise flex items-center justify-between gap-4 rounded-4xl px-5 py-4 shadow-xl">
            <div className="flex items-center gap-4">
              <div className="sd-luxe-badge sd-luxe-float flex h-14 w-14 items-center justify-center rounded-2xl text-white shadow-lg">
                <ShieldAlert className="h-7 w-7" />
              </div>
              <div>
                <p className="sd-eyebrow flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Warden Hub</p>
                <h1 className="sd-title sd-reveal sd-stagger-1"><span className="sd-gradient-text text-gradient-primary">Warden Dashboard</span></h1>
                <p className="sd-subtitle">Manage passes, complaints & hostel safety</p>
              </div>
            </div>

            <div className="sd-luxe-card sd-profile-chip sd-luxe-tilt flex items-center gap-3 rounded-2xl px-4 py-3 min-w-55">
              <div className="sd-profile-avatar bg-linear-to-br from-indigo-600 to-cyan-400 text-white flex h-12 w-12 items-center justify-center rounded-xl font-bold">{(user && ((user.name && user.name.split(' ').map(n=>n[0]).slice(0,2).join('')) || user.initials)) || 'WP'}</div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-slate-900 text-base">{displayName}</p>
                <p className="text-sm text-slate-500">{(user && (user.roleLabel || user.role)) || 'Chief Warden'}</p>
              </div>
            </div>
          </header>

          <section className="sd-luxe-panel sd-luxe-rise sd-stagger-2 mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
            <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_auto]">
              <div className="flex flex-wrap items-center gap-5">
                <div className="sd-luxe-float flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-white to-sky-50 text-slate-900 ring-8 ring-white/80 shadow-lg">
                  <Clock className="h-10 w-10 text-indigo-600" />
                </div>
                <div>
                  <p className="sd-eyebrow">Daily Pulse</p>
                  <h2 className="sd-title sd-title-md sd-reveal sd-stagger-2">Good day, <span className="text-gradient-secondary">{firstName}</span>.</h2>
                  <p className="sd-body mt-2 max-w-md">Overview of active passes, pending approvals and hotspot alerts. Use quick actions to respond swiftly.</p>
                </div>
              </div>
              <div className="grid gap-3 text-sm font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-1">
                <span suppressHydrationWarning className="sd-luxe-pill inline-flex items-center gap-3 rounded-full px-4 py-2.5">
                  <CalendarDays className="h-5 w-5 text-indigo-500" />
                  {formattedDate}
                </span>
                <span suppressHydrationWarning className="sd-luxe-pill sd-live-pulse inline-flex items-center gap-3 rounded-full px-4 py-2.5">
                  <Clock className="h-5 w-5 text-sky-500" />
                  {formattedTime}
                  <span className="sd-luxe-chip ml-auto rounded-full px-3 py-1 text-xs font-bold">Live</span>
                </span>
              </div>
            </div>
          </section>

          <section className="sd-luxe-panel sd-luxe-rise sd-stagger-3 mt-6 rounded-4xl p-6 sm:p-7 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sd-eyebrow">Quick Actions</p>
                <h2 className="sd-title sd-title-sm">Respond faster</h2>
              </div>
              <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-bold animate-pulse">Auto Rules ON</span>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-3 sd-stagger">
              {[{
                title: 'Manage Requests',
                desc: 'Approve or reject outing requests with one tap.',
                icon: Users,
                tone: 'from-indigo-600',
              },{
                title: 'Safety Alerts',
                desc: 'View SOS, complaints and flag critical incidents.',
                icon: ShieldAlert,
                tone: 'from-emerald-600',
              },{
                title: 'Auto Approvals',
                desc: 'Manage rules that auto-approve low-risk passes.',
                icon: Sparkles,
                tone: 'from-sky-600',
              }].map((a, idx) => (
                <button key={a.title} style={{ animationDelay: `${0.08 + idx * 0.06}s` }} className="sd-luxe-card sd-action-card sd-luxe-shimmer sd-card-hover sd-animate-pop group flex flex-col items-start gap-4 rounded-4xl p-6 text-left">
                  <div className="rounded-full bg-white p-3 inline-flex items-center justify-center"><a.icon className="h-6 w-6 text-indigo-600" /></div>
                  <div>
                    <div className="sd-card-title">{a.title}</div>
                    <div className="sd-body mt-2">{a.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-4 rounded-4xl p-6 sm:p-7 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="sd-title sd-title-sm">Pending Approval</h2>
                <span className="sd-luxe-chip inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-indigo-800 bg-indigo-50 border border-indigo-200">After 5:30 PM</span>
              </div>
              <div className="mt-6 space-y-3">
                {pendingRequests.map((req, i) => (
                  <div key={req.id} className="sd-luxe-card sd-luxe-rise sd-luxe-tilt flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5" style={{ animationDelay: `${0.12 + i * 0.06}s` }}>
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-linear-to-br from-indigo-400 to-cyan-400 flex items-center justify-center text-white font-bold">{req.initials}</div>
                      <div>
                        <p className="sd-card-title text-slate-900 text-base">{req.name}</p>
                        <p className="sd-micro mt-0.5">{req.branch} • <span className="font-mono">{req.roll}</span></p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right mr-2">
                        <p className="text-xs text-slate-500">Out</p>
                        <p className="font-semibold text-slate-900">{req.out}</p>
                      </div>
                      <div className="flex sm:flex-col gap-2">
                        <button className="flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 text-white font-bold shadow hover:-translate-y-0.5 transition-transform">
                          <Check className="h-4 w-4" /> Approve
                        </button>
                        <button className="flex items-center gap-2 rounded-2xl px-4 py-2 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors">
                          <X className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="sd-luxe-panel sd-luxe-rise sd-stagger-5 rounded-4xl p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <h2 className="sd-title sd-title-sm">Auto Approved</h2>
                <button className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors">View All →</button>
              </div>
              <div className="mt-5 overflow-x-auto flex gap-3 pb-2 -mx-3 px-3 snap-x sd-stagger">
                {autoApproved.map((s, i) => (
                  <div key={s.id} style={{ animationDelay: `${0.06 + i * 0.06}s` }} className="snap-start shrink-0 w-35 sd-card-soft rounded-xl p-3 flex flex-col items-center text-center sd-card-hover sd-animate-fade-up">
                    <div className="h-12 w-12 rounded-full bg-linear-to-br from-indigo-400 to-emerald-400 flex items-center justify-center text-white mb-2 font-bold">{s.initials}</div>
                    <p className="text-xs font-bold text-slate-900 leading-tight mb-1">{s.name}</p>
                    <p className="text-[10px] text-slate-500">Out Since</p>
                    <p className="text-xs font-bold text-slate-800 mb-2">{s.outSince}</p>
                    <span className="bg-orange-100 text-orange-600 text-[10px] font-bold px-2 py-1 rounded-md w-full">Not Returned</span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="mt-6 grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <div className="sd-luxe-panel sd-luxe-rise rounded-4xl p-6 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <p className="sd-eyebrow">Activity</p>
                  <h2 className="sd-title sd-title-sm">Live Stats</h2>
                </div>
                <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-semibold">Auto sync</span>
              </div>
              <div className="mt-5 space-y-4">
                <div className="sd-luxe-card sd-luxe-tilt rounded-2xl px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <p className="sd-micro">Pending requests</p>
                    <p className="text-xl font-bold text-slate-900">{pendingRequests.length}</p>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="sd-luxe-progress h-full rounded-full bg-linear-to-r from-indigo-500 via-sky-400 to-transparent" style={{ width: '48%' }} />
                  </div>
                </div>
                <div className="sd-luxe-card sd-luxe-tilt rounded-2xl px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <p className="sd-micro">Out Now</p>
                    <p className="text-xl font-bold text-slate-900">21</p>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="sd-luxe-progress h-full rounded-full bg-linear-to-r from-amber-400 via-orange-300 to-transparent" style={{ width: '62%' }} />
                  </div>
                </div>
              </div>
            </div>

            <div className="sd-luxe-panel sd-luxe-rise rounded-4xl p-6 shadow-xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sd-eyebrow">Complaints</p>
                  <h2 className="sd-title sd-title-sm">Recent Reports</h2>
                </div>
                <span className="sd-luxe-chip rounded-full px-3 py-1 text-xs font-semibold">Priority</span>
              </div>
              <div className="mt-5 space-y-4">
                {complaints.map((comp, i) => (
                  <div key={comp.id} className="sd-luxe-card sd-timeline-item sd-luxe-rise sd-luxe-tilt flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5" style={{ animationDelay: `${0.08 + i * 0.06}s` }}>
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${comp.tone}`}>
                      <comp.icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="sd-card-title text-slate-900">{comp.title}</p>
                      <p className="sd-micro">{comp.by} • {comp.time}</p>
                    </div>
                    <div className="shrink-0">
                      <span className={`text-[10px] font-bold px-3 py-1 rounded-md ${comp.statusTone}`}>{comp.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <nav className="sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid grid-cols-4 gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur">
            <button className="sd-nav-link sd-nav-link--active"><Home className="h-6 w-6" />Home</button>
            <button className="sd-nav-link"><ClipboardList className="h-6 w-6" />Requests</button>
            <button className="sd-nav-link">
              <span className="relative inline-flex">
                <MessageSquare className="h-6 w-6" />
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">3</span>
              </span>
              Complaints
            </button>
            <button className="sd-nav-link"><User className="h-6 w-6" />Profile</button>
          </nav>
        </div>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-t border-slate-100 px-6 py-3 pb-4 md:hidden">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <button className="flex flex-col items-center gap-1 text-indigo-700"><Home className="h-6 w-6" /><span className="text-[10px] font-bold">Home</span></button>
          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"><ClipboardList className="h-6 w-6" /><span className="text-[10px] font-semibold">Requests</span></button>
          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <span className="relative inline-flex">
              <MessageSquare className="h-6 w-6" />
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">3</span>
            </span>
            <span className="text-[10px] font-semibold">Complaints</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"><User className="h-6 w-6" /><span className="text-[10px] font-semibold">Profile</span></button>
        </div>
      </nav>
    </main>
  );
}
