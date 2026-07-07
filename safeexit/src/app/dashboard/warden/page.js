"use client";

import { useCallback, useEffect, useState } from "react";
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
import ProfileView from "./components/ProfileView";
import ComplaintsView from "./components/ComplaintsView";
import AutoApprovedView from "./components/AutoApprovedView";
import RequestsView from "./components/RequestsView";
import { apiFetch, getApiBase } from "@/app/lib/api";

const initials = (name = "") =>
  name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

const formatTime = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
    : "—";

// Map a backend OutingRequest (with populated student) to the pending-card shape.
const mapPending = (o) => ({
  id: o._id,
  name: o.student?.name || "Unknown Student",
  branch: [o.student?.year, o.student?.department].filter(Boolean).join(", ") || "—",
  roll: o.student?.studentId || "",
  destination: o.destination || "",
  out: formatTime(o.outTime),
  return: formatTime(o.inTime),
  initials: initials(o.student?.name),
});

// Complaint category → icon/tone styling used by the complaint cards.
const complaintTone = (category) => {
  switch (category) {
    case "Electrical":
      return { tone: "bg-amber-100 text-amber-500", icon: AlertTriangle };
    case "Plumbing":
      return { tone: "bg-sky-100 text-sky-500", icon: AlertCircle };
    case "Security":
      return { tone: "bg-rose-100 text-rose-500", icon: ShieldAlert };
    default:
      return { tone: "bg-orange-100 text-orange-500", icon: AlertCircle };
  }
};

const statusToneFor = (status) =>
  status === "Resolved"
    ? "bg-emerald-100 text-emerald-600"
    : status === "In Progress"
    ? "bg-amber-100 text-amber-600"
    : "bg-rose-100 text-rose-600";

// Map a backend Complaint (with populated student) to the report-card shape.
const mapReport = (c) => {
  const { tone, icon } = complaintTone(c.category);
  return {
    id: c._id,
    title: c.description || c.category,
    by: c.student?.name || "Unknown Student",
    time: c.createdAt
      ? new Date(c.createdAt).toLocaleString("en-US", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
      : "—",
    status: c.status || "Open",
    tone,
    icon,
    statusTone: statusToneFor(c.status),
  };
};

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
      const raw = typeof window !== "undefined" && sessionStorage.getItem("safeexit:user");
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

  // Lists are loaded from the backend; approve/reject/resolve mutate the server
  // and then update these so the UI reflects changes immediately.
  const [pending, setPending] = useState([]);
  const [approved, setApproved] = useState([]);
  const [reports, setReports] = useState([]);

  const [loadingRequests, setLoadingRequests] = useState(true);
  const [loadingReports, setLoadingReports] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [reportsError, setReportsError] = useState("");

  // Pending outing requests awaiting warden action.
  const loadRequests = useCallback(async () => {
    setLoadingRequests(true);
    setRequestsError("");
    try {
      const data = await apiFetch("/outing/pending");
      setPending(data.map(mapPending));
    } catch (err) {
      setRequestsError(err.message || "Could not load requests");
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  // All complaints for the recent-reports and complaints views.
  const loadReports = useCallback(async () => {
    setLoadingReports(true);
    setReportsError("");
    try {
      const data = await apiFetch("/complaint");
      const open = data.filter((c) => c.status !== "Resolved");
      setReports(open.map(mapReport));
    } catch (err) {
      setReportsError(err.message || "Could not load complaints");
    } finally {
      setLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
    loadReports();
  }, [loadRequests, loadReports]);

  // Live updates: a new outing request (or an approval/rejection from another
  // warden/guard) pushes an event over SSE so the pending list refetches
  // instantly instead of requiring a manual refresh while this tab is open.
  useEffect(() => {
    const source = new EventSource(`${getApiBase()}/outing/stream`, { withCredentials: true });
    source.addEventListener("outing:changed", () => {
      loadRequests();
    });
    return () => source.close();
  }, [loadRequests]);

  // Safety net in case the SSE connection is silently dropped (proxies,
  // flaky networks) — a low-frequency background poll keeps data fresh.
  useEffect(() => {
    const interval = setInterval(loadRequests, 30000);
    return () => clearInterval(interval);
  }, [loadRequests]);

  function openPanel(key) {
    setActivePanel(key);
  }

  const [activePanel, setActivePanel] = useState(null);
  const [view, setView] = useState("home");

  function closePanel() {
    setActivePanel(null);
  }

  async function approveRequest(id) {
    const req = pending.find((p) => p.id === id);
    if (!req) return;
    // Optimistically move the card, then persist to the backend.
    setPending((p) => p.filter((r) => r.id !== id));
    setApproved((a) => [{ id: req.id, name: req.name, outSince: req.out, initials: req.initials }, ...a]);
    try {
      await apiFetch(`/outing/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Approved" }),
      });
    } catch (err) {
      // Roll back on failure.
      setApproved((a) => a.filter((r) => r.id !== id));
      setPending((p) => [req, ...p]);
      setRequestsError(err.message || "Could not approve request");
    }
  }

  async function rejectRequest(id) {
    const req = pending.find((p) => p.id === id);
    if (!req) return;
    setPending((p) => p.filter((r) => r.id !== id));
    try {
      await apiFetch(`/outing/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Rejected" }),
      });
    } catch (err) {
      setPending((p) => [req, ...p]);
      setRequestsError(err.message || "Could not reject request");
    }
  }

  async function resolveReport(id) {
    const rep = reports.find((r) => r.id === id);
    if (!rep) return;
    setReports((r) => r.filter((item) => item.id !== id));
    try {
      await apiFetch(`/complaint/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "Resolved" }),
      });
    } catch (err) {
      setReports((r) => [rep, ...r]);
      setReportsError(err.message || "Could not resolve complaint");
    }
  }

  function toggleAutoRule() {
    // demo placeholder
    alert('Toggled auto-approval rule (demo)');
  }

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

          {view === 'home' && (
            <>
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
                <button key={a.title} onClick={() => openPanel(a.title === 'Manage Requests' ? 'manage' : (a.title === 'Safety Alerts' ? 'alerts' : 'auto'))} style={{ animationDelay: `${0.08 + idx * 0.06}s` }} className="sd-luxe-card sd-action-card sd-luxe-shimmer sd-card-hover sd-animate-pop group flex flex-col items-start gap-4 rounded-4xl p-6 text-left">
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
                {pending.map((req, i) => (
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
                        <button onClick={() => approveRequest(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 text-white font-bold shadow hover:-translate-y-0.5 transition-transform">
                          <Check className="h-4 w-4" /> Approve
                        </button>
                        <button onClick={() => rejectRequest(req.id)} className="flex items-center gap-2 rounded-2xl px-4 py-2 border border-rose-300 text-rose-600 font-bold hover:bg-rose-50 transition-colors">
                          <X className="h-4 w-4" /> Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <AutoApprovedView approved={approved} compact={true} onViewAll={() => setView('approved')} onClear={() => setApproved([])} />
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
                    <p className="text-xl font-bold text-slate-900">{pending.length}</p>
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
                {loadingReports ? (
                  <p className="text-sm text-slate-500">Loading complaints…</p>
                ) : reportsError ? (
                  <p className="text-sm font-semibold text-rose-600">{reportsError}</p>
                ) : reports.length === 0 ? (
                  <p className="text-sm text-slate-500">No open complaints.</p>
                ) : (
                  reports.map((comp, i) => (
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
                  ))
                )}
              </div>
            </div>
              </section>
            </>
          )}

          {view === 'requests' && (
            <RequestsView
              pending={pending}
              approveRequest={approveRequest}
              rejectRequest={rejectRequest}
              loading={loadingRequests}
              error={requestsError}
              onRefresh={loadRequests}
            />
          )}

          {view === 'approved' && (
            <AutoApprovedView approved={approved} compact={false} onBack={() => setView('home')} onClear={() => setApproved([])} pageSize={6} />
          )}

          {view === 'profile' && <ProfileView user={user} displayName={displayName} />}
          {view === 'complaints' && <ComplaintsView reports={reports} resolveReport={resolveReport} setReports={setReports} />}

          <nav className="sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid grid-cols-4 gap-1 rounded-4xl p-2 sm:p-3 backdrop-blur">
            <button onClick={() => setView('home')} className={`sd-nav-link ${view === 'home' ? 'sd-nav-link--active' : ''}`}><Home className="h-6 w-6" />Home</button>
            <button onClick={() => setView('requests')} className={`sd-nav-link ${view === 'requests' ? 'sd-nav-link--active' : ''}`}><ClipboardList className="h-6 w-6" />Requests</button>
            <button onClick={() => setView('complaints')} className={`sd-nav-link ${view === 'complaints' ? 'sd-nav-link--active' : ''}`}>
              <span className="relative inline-flex">
                <MessageSquare className="h-6 w-6" />
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">3</span>
              </span>
              Complaints
            </button>
            <button onClick={() => setView('profile')} className={`sd-nav-link ${view === 'profile' ? 'sd-nav-link--active' : ''}`}><User className="h-6 w-6" />Profile</button>
          </nav>
        </div>
      </div>

      {activePanel && (
        <div className="fixed inset-0 z-60 flex">
          <div onClick={closePanel} className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
          <aside className="relative ml-auto w-full max-w-md h-full bg-white shadow-2xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold">{activePanel === 'manage' ? 'Manage Requests' : activePanel === 'alerts' ? 'Safety Alerts' : 'Auto Approvals'}</h3>
              <button onClick={closePanel} className="p-2 rounded-md text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>

            {activePanel === 'manage' && (
              <div className="space-y-4">
                {pending.length === 0 ? <p className="text-sm text-slate-500">No pending requests</p> : pending.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                    <div>
                      <p className="font-bold">{r.name}</p>
                      <p className="text-xs text-slate-500">{r.branch} • {r.roll}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => approveRequest(r.id)} className="px-3 py-1 rounded bg-indigo-600 text-white">Approve</button>
                      <button onClick={() => rejectRequest(r.id)} className="px-3 py-1 rounded border text-rose-600">Reject</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'alerts' && (
              <div className="space-y-4">
                {reports.length === 0 ? <p className="text-sm text-slate-500">No reports</p> : reports.map((rep) => (
                  <div key={rep.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border">
                    <div>
                      <p className="font-bold">{rep.title}</p>
                      <p className="text-xs text-slate-500">{rep.by} • {rep.time}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => resolveReport(rep.id)} className="px-3 py-1 rounded bg-emerald-600 text-white">Resolve</button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activePanel === 'auto' && (
              <div className="space-y-4">
                <p className="text-sm text-slate-600">Auto-approval rules allow low-risk passes to be approved automatically.</p>
                <div className="flex items-center gap-3">
                  <button onClick={toggleAutoRule} className="px-4 py-2 rounded bg-indigo-600 text-white">Toggle Rule</button>
                  <button onClick={() => setApproved((a) => [{ id: Date.now(), name: 'Demo Student', outSince: 'Now', initials: 'DS' }, ...a])} className="px-4 py-2 rounded border">Add Demo Approved</button>
                </div>
                <div className="mt-4">
                  <h4 className="font-bold">Recently Auto-Approved</h4>
                  <div className="mt-2 space-y-2">
                    {approved.map((s) => (
                      <div key={s.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-bold text-sm">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.outSince}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-t border-slate-100 px-6 py-3 pb-4 md:hidden">
        <div className="mx-auto max-w-md flex items-center justify-between">
          <button onClick={() => setView('home')} className="flex flex-col items-center gap-1 text-indigo-700"><Home className="h-6 w-6" /><span className="text-[10px] font-bold">Home</span></button>
          <button onClick={() => setView('requests')} className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"><ClipboardList className="h-6 w-6" /><span className="text-[10px] font-semibold">Requests</span></button>
          <button onClick={() => setView('complaints')} className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors">
            <span className="relative inline-flex">
              <MessageSquare className="h-6 w-6" />
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white border-2 border-white">3</span>
            </span>
            <span className="text-[10px] font-semibold">Complaints</span>
          </button>
          <button onClick={() => setView('profile')} className="flex flex-col items-center gap-1 text-slate-400 hover:text-slate-600 transition-colors"><User className="h-6 w-6" /><span className="text-[10px] font-semibold">Profile</span></button>
        </div>
      </nav>
    </main>
  );
}
