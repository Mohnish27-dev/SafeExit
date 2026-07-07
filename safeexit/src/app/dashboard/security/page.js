"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Scanner } from '@yudiel/react-qr-scanner';
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
  X,
} from "lucide-react";
import { getFirstName, getStoredUser } from "@/app/lib/userProfile";
import { apiFetch } from "@/app/lib/api";

const statusCards = [
  {
    key: "inside",
    label: "Inside Campus",
    note: "Latest gate scan was an entry",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
    icon: UserCheck,
  },
  {
    key: "outside",
    label: "Outside Campus",
    note: "Latest gate scan was an exit",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
    icon: UserRound,
  },
  {
    key: "overdue",
    label: "Overdue",
    note: "Returned late / not yet back",
    tone: "border-rose-200 bg-rose-50 text-rose-700",
    icon: Clock3,
  },
];

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

const checkIsOverdue = (returnTimeStr) => {
  if (!returnTimeStr) return false;
  try {
    const [time, period] = returnTimeStr.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    const nowTime = new Date();
    const returnDate = new Date();
    returnDate.setHours(hours, minutes, 0, 0);
    
    return nowTime > returnDate;
  } catch(e) {
    return false;
  }
};

export default function SecurityDashboardPage() {
  const [profile, setProfile] = useState(defaultProfile);
  // Start null so the server render and the first client render agree (no
  // Date on the server). The mount effect below fills it in and starts ticking.
  const [now, setNow] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  // Authoritative pre-confirm preview from the backend (entry scans): the real
  // active pass + the punctuality the log will record. Preferred over the QR's
  // own window, which can be stale/absent and mislabel a late entry "On-Time".
  const [scanPreview, setScanPreview] = useState(null);
  const [scanMode, setScanMode] = useState(null);
  const [scans, setScans] = useState([]);
  const [counts, setCounts] = useState({ inside: 0, outside: 0, overdue: 0 });
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState("");

  // Pull the latest gate movements and derive each student's current status from
  // their most recent scan (logs are returned newest-first by the backend).
  const loadScans = useCallback(async () => {
    try {
      const logs = await apiFetch("/scan?limit=100");
      setScans(logs);

      const seen = new Set();
      const tally = { inside: 0, outside: 0, overdue: 0 };
      for (const log of logs) {
        const sid = log.student?._id || log.student?.studentId;
        if (!sid || seen.has(sid)) continue; // only the most recent scan per student
        seen.add(sid);
        if (log.direction === "IN") tally.inside += 1;
        else if (log.punctuality === "Overdue") tally.overdue += 1;
        else tally.outside += 1;
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
      // Punctuality is intentionally not sent: the server recomputes it against
      // the real pass, so a client guess would be ignored anyway. Keeping it out
      // makes it explicit that the gate is the source of truth.
      await apiFetch("/scan", {
        method: "POST",
        body: JSON.stringify({
          // _id resolves reliably; roll number is the fallback for older QRs.
          student: scanResult.sid,
          studentId: scanResult.id,
          direction,
        }),
      });
      setScanResult(null);
      setScanPreview(null);
      await loadScans();
    } catch (err) {
      setLogError(err.message || "Could not log this scan");
    } finally {
      setLogging(false);
    }
  };

  const recentScans = useMemo(
    () =>
      scans.slice(0, 8).map((log) => {
        const st = log.student || {};
        const meta = [st.year, st.department].filter(Boolean).join(", ");
        return {
          id: log._id,
          name: st.name || "Unknown Student",
          meta: [meta, st.studentId].filter(Boolean).join(" - ") || "—",
          tag: log.direction === "IN" ? "Entry (IN)" : "Exit (OUT)",
          time: new Date(log.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          type: log.direction === "IN" ? "in" : "out",
        };
      }),
    [scans]
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

        // For an entry, ask the backend what the scan will actually record so the
        // dialog shows the authoritative punctuality (judged against the real pass)
        // rather than the QR's possibly-stale window. Failure is non-fatal — the
        // dialog falls back to the QR window if this doesn't resolve.
        setScanPreview(null);
        if (scanMode === "entry") {
          try {
            const params = new URLSearchParams();
            if (parsed.sid) params.set("sid", parsed.sid);
            if (parsed.id) params.set("studentId", parsed.id);
            const preview = await apiFetch(`/scan/preview?${params.toString()}`);
            setScanPreview(preview);
          } catch (e) {
            console.error("Failed to load scan preview:", e);
          }
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
    () => (now ? now.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" }) : ""),
    [now]
  );

  const formattedTime = useMemo(
    () => (now ? now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : ""),
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
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                    <LogOut className="h-12 w-12" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-sky-700">Scan Exit</h3>
                  <p className="mx-auto mt-3 max-w-sm text-base font-normal leading-relaxed text-slate-600">
                    Approve exits instantly and sync safe return windows.
                  </p>
                  <button 
                    onClick={() => { setScanMode('exit'); setIsScanning(true); }}
                    className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-sky-500 to-indigo-500 px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:-translate-y-0.5 cursor-pointer"
                  >
                    <ScanLine className="h-6 w-6" />
                    Scan Exit
                  </button>
                </div>

                <div className="dash-card-strong dash-animate-shimmer rounded-[2.25rem] p-6 text-center">
                  <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <LogIn className="h-12 w-12" />
                  </div>
                  <h3 className="mt-5 text-2xl font-bold text-emerald-700">Scan Entry</h3>
                  <p className="mx-auto mt-3 max-w-sm text-base font-normal leading-relaxed text-slate-600">
                    Validate every student check-in with a single QR scan.
                  </p>
                  <button 
                    onClick={() => { setScanMode('entry'); setIsScanning(true); }}
                    className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-white shadow-lg transition hover:-translate-y-0.5 cursor-pointer"
                  >
                    <ScanLine className="h-6 w-6" />
                    Scan Entry
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
                <h2 className="font-display text-2xl font-bold tracking-tight">Recent Scans</h2>
                <button className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">View All</button>
              </div>
              <div className="mt-4 space-y-3">
                {recentScans.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-400">
                    No scans yet. Logged entries and exits will appear here.
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

          <nav className="dash-card mt-6 hidden md:grid grid-cols-4 rounded-[2rem] p-3 shadow-xl backdrop-blur">
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

      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
          <div className="relative w-full max-w-md bg-white rounded-3xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h3 className="font-display text-lg font-bold">Scan Student QR</h3>
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
              
              <h2 className="font-display text-2xl font-bold text-slate-900">{scanResult.name || "Unknown Student"}</h2>
              <p className="text-sm font-semibold text-slate-500 uppercase tracking-widest mt-1 mb-6">
                {scanResult.id}
              </p>

              <div className="w-full bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-4 mb-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Status</span>
                  {scanMode === 'exit' ? (
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                      scanResult.recentTicket?.status === "Approved" 
                        ? "bg-emerald-100 text-emerald-700" 
                        : "bg-amber-100 text-amber-700"
                    }`}>
                      {scanResult.recentTicket?.status || "N/A"}
                    </span>
                  ) : (
                    (() => {
                      // Prefer the backend's authoritative verdict; fall back to the
                      // QR window only if the preview call didn't resolve.
                      let isOverdue;
                      if (scanPreview?.punctuality) {
                        isOverdue = scanPreview.punctuality === "Overdue";
                      } else {
                        const validWindow = scanResult.recentTicket?.validWindow || "";
                        const returnTimeStr = validWindow.split(" to ")[1];
                        isOverdue = checkIsOverdue(returnTimeStr);
                      }
                      return (
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          isOverdue ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                        }`}>
                          {isOverdue ? "Overdue" : "On-Time IN"}
                        </span>
                      );
                    })()
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    {scanMode === 'exit' ? "Valid Window" : "Logged Time"}
                  </span>
                  <span className="text-sm font-semibold text-slate-800">
                    {scanMode === 'exit' 
                      ? (scanResult.recentTicket?.validWindow || "N/A")
                      : formattedTime
                    }
                  </span>
                </div>
                {scanMode === 'entry' && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Allowed Return</span>
                    <span className="text-sm font-semibold text-slate-800">
                      {scanPreview?.activeOuting?.inTime
                        ? formatClock(scanPreview.activeOuting.inTime)
                        : (scanResult.recentTicket?.validWindow?.split(" to ")[1] || "N/A")}
                    </span>
                  </div>
                )}
              </div>

              {logError && (
                <p className="mb-3 w-full rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600">{logError}</p>
              )}

              <div className="flex gap-3 w-full">
                <button
                  onClick={() => { setLogError(""); setScanResult(null); setScanPreview(null); }}
                  disabled={logging}
                  className="flex-1 py-3.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmScan}
                  disabled={logging}
                  className={`flex-1 py-3.5 rounded-xl text-sm font-bold text-white shadow-lg transition cursor-pointer disabled:opacity-60 ${
                    scanMode === 'exit'
                      ? "bg-sky-500 shadow-sky-500/30 hover:bg-sky-600"
                      : "bg-emerald-500 shadow-emerald-500/30 hover:bg-emerald-600"
                  }`}
                >
                  {logging ? "Logging…" : scanMode === 'exit' ? "Log Exit" : "Log Entry"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
