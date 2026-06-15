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
  ShieldAlert
} from "lucide-react";
import Image from "next/image";

export default function WardenDashboardPage() {
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = now
    ? now.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })
    : "19 May 2024";

  const formattedTime = now
    ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "09:41:23 AM";

  const pendingRequests = [
    { id: 1, name: "Ananya Verma", branch: "2nd Year, CSE", roll: "STU2024CSE102", out: "06:15 PM", return: "08:30 PM", initials: "AV" },
    { id: 2, name: "Riya Patel", branch: "3rd Year, ECE", roll: "STU2023ECE089", out: "06:45 PM", return: "09:00 PM", initials: "RP" },
    { id: 3, name: "Neha Joshi", branch: "2nd Year, IT", roll: "STU2024IT045", out: "07:00 PM", return: "09:30 PM", initials: "NJ" },
    { id: 4, name: "Kunal Verma", branch: "2nd Year, ME", roll: "STU2024ME011", out: "07:20 PM", return: "10:00 PM", initials: "KV" }
  ];

  const autoApproved = [
    { id: 1, name: "Sneha Reddy", outSince: "04:10 PM", initials: "SR" },
    { id: 2, name: "Aarav Sharma", outSince: "04:25 PM", initials: "AS" },
    { id: 3, name: "Manav Singh", outSince: "04:40 PM", initials: "MS" },
    { id: 4, name: "Pooja Singh", outSince: "05:00 PM", initials: "PS" },
  ];

  const complaints = [
    { id: 1, title: "Water leakage in Room 201", by: "Riya Patel", time: "19 May, 08:30 AM", status: "New", tone: "bg-rose-100 text-rose-500", icon: AlertCircle, statusTone: "bg-rose-100 text-rose-600" },
    { id: 2, title: "Mess food quality issue", by: "Neha Joshi", time: "19 May, 07:45 AM", status: "New", tone: "bg-orange-100 text-orange-500", icon: AlertTriangle, statusTone: "bg-rose-100 text-rose-600" },
    { id: 3, title: "Wi-Fi not working in Block B", by: "Ananya Verma", time: "19 May, 07:15 AM", status: "Resolved", tone: "bg-emerald-100 text-emerald-500", icon: MessageSquare, statusTone: "bg-emerald-100 text-emerald-700" },
  ];

  return (
    <main className="min-h-screen bg-[#F8F9FE] text-slate-900 pb-24 font-sans">
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#4F25C8] text-white">
              <User className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[#4F25C8]">SafeExit</h1>
              <p className="text-xs text-slate-500">Warden Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 overflow-hidden rounded-full bg-slate-200 border border-slate-300">
              <div className="w-full h-full bg-slate-300 flex items-center justify-center text-slate-500 text-sm font-semibold">WP</div>
            </div>
            <div className="hidden sm:block text-right">
              <p className="font-bold text-sm text-slate-900">Warden Priya</p>
              <p className="text-xs text-slate-500">Chief Warden</p>
            </div>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </header>

        {/* Greeting Section */}
        <section className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F3EFFF] text-[#4F25C8]">
              <Clock className="h-7 w-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Good Morning, Priya! 👋</h2>
              <p className="text-sm text-slate-500 mt-0.5">Here&apos;s what&apos;s happening in the hostel today.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 text-xs font-semibold text-slate-600 sm:items-end">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-slate-400" />
              <span>{formattedDate}</span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" />
              <span>{formattedTime}</span>
              <span className="ml-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Live</span>
            </div>
          </div>
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F3EFFF] text-[#4F25C8] mb-2">
              <ClipboardList className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">18</p>
            <p className="text-xs text-slate-500 mb-3 font-medium">Pending Approval</p>
            <button className="text-xs font-bold text-[#4F25C8] flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-2">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">32</p>
            <p className="text-xs text-slate-500 mb-3 font-medium">Auto Approved</p>
            <button className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-100 text-orange-500 mb-2">
              <User className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">21</p>
            <p className="text-xs text-slate-500 mb-3 font-medium">Out Now</p>
            <button className="text-xs font-bold text-orange-500 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex flex-col items-center text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-100 text-rose-500 mb-2">
              <Bell className="h-5 w-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900">07</p>
            <p className="text-xs text-slate-500 font-medium">Overdue</p>
            <p className="text-[9px] text-rose-500 mb-2">Not returned</p>
            <button className="text-xs font-bold text-rose-500 flex items-center gap-1">
              View all <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </section>

        {/* Pending Approval List */}
        <section className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-slate-900">Pending Approval <span className="text-slate-500 font-medium">(After 5:30 PM)</span></h2>
            <button className="text-xs font-bold text-[#4F25C8]">View All</button>
          </div>
          
          <div className="space-y-4">
            {pendingRequests.map((req) => (
              <div key={req.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                    {req.initials}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{req.name}</p>
                    <p className="text-[11px] text-slate-500">{req.branch}</p>
                    <p className="text-[11px] text-slate-500 uppercase">{req.roll}</p>
                  </div>
                </div>
                
                <div className="flex-1 min-w-[140px] text-xs space-y-1">
                  <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                    <span className="text-slate-500">Outing Time:</span>
                    <span className="font-semibold text-slate-800">{req.out}</span>
                  </div>
                  <div className="flex items-center justify-between sm:justify-start sm:gap-2">
                    <span className="text-slate-500">Return Time:</span>
                    <span className="font-semibold text-slate-800">{req.return}</span>
                  </div>

                </div>

                <div className="flex sm:flex-col gap-2 w-full sm:w-auto shrink-0">
                  <button className="flex-1 sm:w-[100px] flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500 px-3 py-1.5 text-xs font-bold text-emerald-600 hover:bg-emerald-50 transition-colors">
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button className="flex-1 sm:w-[100px] flex items-center justify-center gap-1.5 rounded-lg border border-rose-500 px-3 py-1.5 text-xs font-bold text-rose-500 hover:bg-rose-50 transition-colors">
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
          
          <button className="w-full mt-4 py-3 text-sm font-bold text-[#4F25C8] flex items-center justify-center gap-2 hover:bg-[#F3EFFF] rounded-xl transition-colors">
            View all pending requests <ArrowRight className="h-4 w-4" />
          </button>
        </section>

        {/* Not Returned List */}
        <section className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-slate-900">Students Not Inside Before 5:30 PM <span className="text-slate-500 font-medium">(Auto Approved)</span></h2>
            <button className="text-xs font-bold text-[#4F25C8]">View All</button>
          </div>
          
          <div className="flex overflow-x-auto gap-3 pb-2 -mx-2 px-2 snap-x">
            {autoApproved.map((student) => (
              <div key={student.id} className="snap-start shrink-0 w-[130px] rounded-xl border border-slate-100 p-3 flex flex-col items-center text-center bg-slate-50/50">
                <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600 mb-2">
                  {student.initials}
                </div>
                <p className="text-xs font-bold text-slate-900 leading-tight mb-1">{student.name}</p>
                <p className="text-[10px] text-slate-500">Out Since</p>
                <p className="text-xs font-bold text-slate-800 mb-2">{student.outSince}</p>
                <span className="bg-orange-100 text-orange-600 text-[9px] font-bold px-2 py-1 rounded-md w-full">
                  Not Returned
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Recent Complaints */}
        <section className="bg-white rounded-[24px] p-5 shadow-sm border border-slate-100 mb-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-bold text-slate-900">Recent Complaints</h2>
            <button className="text-xs font-bold text-[#4F25C8]">View All</button>
          </div>
          
          <div className="space-y-4">
            {complaints.map((comp) => (
              <div key={comp.id} className="flex items-start gap-3 pb-4 border-b border-slate-100 last:border-0 last:pb-0">
                <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 ${comp.tone}`}>
                  <comp.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate">{comp.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">Reported by: {comp.by} • {comp.time}</p>
                </div>
                <div className="shrink-0">
                  <span className={`text-[10px] font-bold px-3 py-1 rounded-md ${comp.statusTone}`}>
                    {comp.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-t border-slate-100 px-6 py-3 pb-safe">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <button className="flex flex-col items-center gap-1 text-[#4F25C8]">
            <Home className="h-6 w-6" />
            <span className="text-[10px] font-bold">Home</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <ClipboardList className="h-6 w-6" />
            <span className="text-[10px] font-semibold">Requests</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors relative">
            <MessageSquare className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">3</span>
            <span className="text-[10px] font-semibold">Complaints</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <User className="h-6 w-6" />
            <span className="text-[10px] font-semibold">Profile</span>
          </button>
        </div>
      </nav>
    </main>
  );
}
