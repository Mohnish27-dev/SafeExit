"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  MapPin,
  Clock,
  Calendar,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  RotateCcw,
  Eye,
  AlertCircle,
  Ticket,
  LogOut,
  TimerOff,
  Ban,
  ArrowUpRight,
  BellRing,
} from "lucide-react";
import StudentFeatureShell, { StudentFeaturePanel } from "@/app/components/student/StudentFeatureShell";
import StudentProfileBanner from "@/app/components/student/StudentProfileBanner";
import FeatureHeroStrip from "@/app/components/student/FeatureHeroStrip";
import GateQrInstruction from "@/app/components/student/GateQrInstruction";
import { useStudentProfile } from "@/app/hooks/useStudentProfile";
import { getFirstName } from "@/app/lib/userProfile";
import { apiFetch } from "@/app/lib/api";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";

const statusConfig = {
  approved: { label: "Approved", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  out: { label: "Outside", color: "text-sky-700", bg: "bg-sky-100", icon: LogOut },
  overdue: { label: "Overdue", color: "text-rose-700", bg: "bg-rose-100", icon: BellRing },
  pending: { label: "Pending", color: "text-amber-700", bg: "bg-amber-100", icon: Loader2 },
  // Caretaker escalated it — the hostel warden decides this one.
  forwarded: { label: "With warden", color: "text-teal-700", bg: "bg-teal-100", icon: ArrowUpRight },
  returned: { label: "Returned", color: "text-slate-600", bg: "bg-slate-100", icon: RotateCcw },
  rejected: { label: "Rejected", color: "text-rose-700", bg: "bg-rose-100", icon: XCircle },
  expired: { label: "Expired", color: "text-rose-700", bg: "bg-rose-100", icon: TimerOff },
  cancelled: { label: "Cancelled", color: "text-slate-500", bg: "bg-slate-100", icon: Ban },
  // UI-derived status for a 'Returned' trip closed late (returnPunctuality 'Overdue').
  "returned-late": { label: "Returned late", color: "text-rose-700", bg: "bg-rose-100", icon: AlertCircle },
};

// statusConfig key for an outing; promotes late returns to "returned-late".
const badgeKeyFor = (outing) =>
  outing.status === "returned" && outing.returnPunctuality === "Overdue"
    ? "returned-late"
    : outing.status;

const filters = [
  { key: "all", label: "All" },
  { key: "approved", label: "Approved" },
  { key: "out", label: "Outside" },
  { key: "overdue", label: "Overdue" },
  { key: "pending", label: "Pending" },
  { key: "forwarded", label: "With warden" },
  { key: "returned", label: "Returned" },
  { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" },
  { key: "cancelled", label: "Cancelled" },
];

const statAccents = {
  Total: "linear-gradient(90deg, #0f172a, #4338ca)",
  Approved: "linear-gradient(90deg, #059669, #34d399)",
  Pending: "linear-gradient(90deg, #d97706, #fbbf24)",
  Returned: "linear-gradient(90deg, #475569, #94a3b8)",
};

export default function MyOutings() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const { display, hydrated } = useStudentProfile();
  const [outings, setOutings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null); // _id of outing being confirmed
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;

    // background=true skips the full-page loader on silent refreshes.
    const fetchOutings = async (background = false) => {
      if (!background) setLoading(true);
      try {
        const data = await apiFetch("/outing/myrequests");
        if (cancelled) return;
        const fmtTime = (v) => v ? new Date(v).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : null;
        const fmtDate = (v) => v ? new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
        const mapped = data.map((o) => ({
          _id: o._id,
          id: `SE-${String(o._id).slice(-6).toUpperCase()}`,
          destination: o.destination,
          dateOut: fmtDate(o.outTime),
          timeOut: fmtTime(o.outTime),
          dateReturn: fmtDate(o.inTime),
          timeReturn: fmtTime(o.inTime),
          status: o.isOverdue ? "overdue" : (o.status || "Pending").toLowerCase(),
          returnPunctuality: o.returnPunctuality || null,
          actualOutTime: fmtTime(o.actualOutTime),
          actualInTime: fmtTime(o.actualInTime),
          caretakerSignature: o.caretakerSignature || null,
          wardenSignature: o.wardenSignature || null,
        }));
        setOutings(mapped);
      } catch (err) {
        if (!cancelled && !background) setOutings([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchOutings();

    // Poll + focus refetch so gate scans reflect without a reload.
    const interval = setInterval(() => fetchOutings(true), 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchOutings(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [hydrated]);

  const handleCancel = async (outingId) => {
    setCancelling(true);
    try {
      await apiFetch(`/outing/${outingId}/cancel`, { method: "PATCH" });
      setOutings((prev) =>
        prev.map((o) => (o._id === outingId ? { ...o, status: "cancelled" } : o))
      );
      setConfirmCancel(null);
    } catch (err) {
      console.error("Failed to cancel outing:", err);
    } finally {
      setCancelling(false);
    }
  };

  const filtered = outings.filter((outing) => {
    const matchFilter = filter === "all" || outing.status === filter;
    const matchSearch =
      outing.destination.toLowerCase().includes(search.toLowerCase()) ||
      outing.id.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const stats = {
    total: outings.length,
    approved: outings.filter((outing) => outing.status === "approved").length,
    pending: outings.filter((outing) => outing.status === "pending").length,
    returned: outings.filter((outing) => outing.status === "returned").length,
  };

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <StudentFeatureShell
      eyebrow="Passport History"
      title={hydrated ? `${getFirstName(display.name)}'s Outings` : "My Outings"}
      icon={ClipboardList}
      iconTone="outings"
      onBack={() => router.push("/dashboard/student")}
      contentClassName="space-y-5"
    >
      <FeatureHeroStrip
        variant="outings"
        icon={ClipboardList}
        title={hydrated ? `${getFirstName(display.name)}'s outing history` : "Your outing history"}
        description="Track approvals, returns, and ticket status in one place."
      />

      {hydrated && <StudentProfileBanner display={display} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sf-rise sf-stagger-1">
        {[
          { label: "Total", value: stats.total, color: "text-slate-800" },
          { label: "Approved", value: stats.approved, color: "text-emerald-600" },
          { label: "Pending", value: stats.pending, color: "text-amber-600" },
          { label: "Returned", value: stats.returned, color: "text-slate-600" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="sf-stat-card"
            style={{ "--sf-stat-accent": statAccents[label] }}
          >
            <p className={`sf-stat-value ${color}`}>{value}</p>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      <StudentFeaturePanel className="px-4 py-2.5 flex items-center gap-3" delay={80}>
        <Search size={15} className="text-slate-400 shrink-0" />
        <input
          type="text"
          placeholder="Search destination or ticket ID..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="flex-1 bg-transparent text-base text-slate-700 placeholder-slate-400 outline-none"
        />
        {search && (
          <button type="button" onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
            <XCircle size={14} />
          </button>
        )}
      </StudentFeaturePanel>

      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide sf-rise sf-stagger-2">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`sf-filter-pill ${filter === key ? "sf-filter-pill--active" : "sf-filter-pill--idle"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <StudentFeaturePanel className="p-10 text-center" delay={120}>
          <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-3">
            <Loader2 size={24} className="text-slate-400 animate-spin" />
          </div>
          <p className="font-sora font-semibold text-slate-700">Loading outings…</p>
        </StudentFeaturePanel>
      ) : filtered.length === 0 ? (
        <StudentFeaturePanel className="p-10 text-center" delay={120}>
          <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-3">
            <ClipboardList size={24} className="text-slate-400" />
          </div>
          <p className="font-sora font-semibold text-slate-700">No outings found</p>
          <p className="text-sm text-slate-500 mt-1">Try adjusting your search or filter.</p>
        </StudentFeaturePanel>
      ) : (
        <div className="space-y-3">
          {filtered.map((outing, index) => {
            const sc = statusConfig[badgeKeyFor(outing)];
            const StatusIcon = sc.icon;
            const isExpanded = expanded === outing.id;

            return (
              <div
                key={outing.id}
                className={`sf-outing-card sf-outing-card--${outing.status} sf-rise sf-panel-lift`}
                style={{ animationDelay: `${140 + index * 50}ms` }}
              >
                <button
                  type="button"
                  className="w-full text-left p-5 sm:p-6"
                  onClick={() => setExpanded(isExpanded ? null : outing.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-sky-100 to-indigo-100 flex items-center justify-center shrink-0 shadow-xs">
                        <MapPin size={20} className="text-sky-600" />
                      </div>
                      <div>
                        <p className="font-sora font-extrabold text-slate-800 text-lg sm:text-xl leading-snug">{outing.destination}</p>
                        <p className="text-xs text-indigo-500 mt-2 font-mono tracking-wider bg-indigo-50/50 w-fit px-2 py-0.5 rounded border border-indigo-100/50 font-semibold">{outing.id}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-3 shrink-0">
                      <span className={`flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 shadow-xs border ${sc.bg.replace("bg-", "border-").replace("100", "200")} ${sc.bg} ${sc.color}`}>
                        <StatusIcon size={12} className={outing.status === "pending" ? "animate-spin" : ""} />
                        {sc.label}
                      </span>
                      <Eye
                        size={16}
                        className={`transition-all duration-300 ${isExpanded ? "text-sky-600 scale-110" : "text-slate-350"}`}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-5 mt-4.5 pt-4 border-t border-slate-100/90">
                    <div className="flex items-center gap-2">
                      <Calendar size={13} className="text-slate-400" />
                      <span className="text-xs font-semibold text-slate-650">{outing.dateOut}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={13} className="text-slate-400" />
                      <span className="text-xs font-semibold text-slate-650">
                        {outing.timeOut} → {outing.timeReturn}
                      </span>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-0 animate-fade-in">
                    <div className="rounded-2xl p-5 space-y-3.5 bg-linear-to-br from-slate-50 to-sky-50/40 border border-slate-100/80 shadow-inner">
                      {[
                        { label: "Departure Date & Time", value: `${outing.dateOut} at ${outing.timeOut}` },
                        { label: "Expected Return Date & Time", value: `${outing.dateReturn} at ${outing.timeReturn}` },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center py-0.5">
                          <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</span>
                          <span className="text-sm font-bold text-slate-700">{value}</span>
                        </div>
                      ))}
                      {(outing.actualOutTime || outing.actualInTime) && (
                        <div className="pt-3 mt-1 border-t border-slate-100 space-y-2.5">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gate Scan Times</p>
                          {outing.actualOutTime && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Scanned Out</span>
                              <span className="text-sm font-bold text-sky-700">{outing.actualOutTime}</span>
                            </div>
                          )}
                          {outing.actualInTime && (
                            <div className="flex justify-between items-center py-0.5">
                              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Scanned In</span>
                              <span className="text-sm font-bold text-emerald-700">{outing.actualInTime}</span>
                            </div>
                          )}
                        </div>
                      )}
                      {(outing.wardenSignature || outing.caretakerSignature) && (
                        <div className="pt-3 mt-1 border-t border-emerald-100">
                          <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                            <CheckCircle2 size={12} /> Approved &amp; signed by {outing.wardenSignature ? "warden" : "caretaker"}
                          </p>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={outing.wardenSignature || outing.caretakerSignature}
                            alt={outing.wardenSignature ? "Warden signature" : "Caretaker signature"}
                            className="mt-2 h-16 w-auto rounded-lg border border-slate-200 bg-white p-1"
                          />
                        </div>
                      )}
                      {outing.status === "rejected" && (
                        <div className="mt-3 pt-3 border-t border-rose-100 flex items-start gap-2.5">
                          <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                          <p className="text-xs font-semibold text-rose-600">Request was rejected. Contact your caretaker for details.</p>
                        </div>
                      )}
                      {outing.status === "pending" && (
                        <div className="mt-3 pt-3 border-t border-amber-100 flex items-start gap-2.5">
                          <Loader2 size={15} className="text-amber-500 shrink-0 mt-0.5 animate-spin" />
                          <p className="text-xs font-semibold text-amber-705">Awaiting caretaker approval. You will be notified.</p>
                        </div>
                      )}
                      {outing.status === "forwarded" && (
                        <div className="mt-3 pt-3 border-t border-teal-100 flex items-start gap-2.5">
                          <ArrowUpRight size={15} className="text-teal-600 shrink-0 mt-0.5" />
                          <p className="text-xs font-semibold text-teal-700">Escalated to the warden for a decision. You will be notified.</p>
                        </div>
                      )}
                      {outing.status === "approved" && (
                        <GateQrInstruction ready showAction className="mt-3" />
                      )}
                      {outing.status === "expired" && (
                        <div className="mt-3 pt-3 border-t border-rose-100 flex items-start gap-2.5">
                          <TimerOff size={15} className="text-rose-500 shrink-0 mt-0.5" />
                          <p className="text-xs font-semibold text-rose-600">Departure time passed before this pass could be used. This request has expired — file a new one to go out.</p>
                        </div>
                      )}
                      {outing.status === "cancelled" && (
                        <div className="mt-3 pt-3 border-t border-slate-200 flex items-start gap-2.5">
                          <Ban size={15} className="text-slate-400 shrink-0 mt-0.5" />
                          <p className="text-xs font-semibold text-slate-500">You cancelled this outing request.</p>
                        </div>
                      )}
                      {(outing.status === "out" || outing.status === "overdue") && (
                        <div className={`mt-3 pt-3 border-t ${outing.status === "overdue" ? "border-rose-100" : "border-teal-100"}`}>
                          <p className="text-xs font-semibold text-slate-600 flex items-start gap-2">
                            <Clock size={14} className={outing.status === "overdue" ? "text-rose-600 shrink-0 mt-0.5" : "text-teal-600 shrink-0 mt-0.5"} />
                            {outing.status === "overdue"
                              ? "Your expected return time has passed. Please inform the hostel now."
                              : "Held up and won't make it back in time?"}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push("/dashboard/student/delay-notice");
                            }}
                            className={`mt-2.5 w-full py-2.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center justify-center gap-2 ${
                              outing.status === "overdue"
                                ? "border-rose-200 text-rose-700 hover:bg-rose-50"
                                : "border-teal-200 text-teal-700 hover:bg-teal-50"
                            }`}
                          >
                            <Clock size={13} />
                            Inform authorities I&apos;ll be late
                          </button>
                        </div>
                      )}
                      {(outing.status === "approved" || outing.status === "pending" || outing.status === "forwarded") && (
                        <div className="mt-4 pt-3 border-t border-slate-100">
                          {confirmCancel === outing._id ? (
                            <div className="flex flex-col gap-2">
                              <p className="text-xs font-semibold text-slate-600">Are you sure you want to cancel this pass?</p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={cancelling}
                                  onClick={(e) => { e.stopPropagation(); handleCancel(outing._id); }}
                                  className="flex-1 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold shadow-sm hover:bg-rose-600 transition disabled:opacity-60 cursor-pointer"
                                >
                                  {cancelling ? "Cancelling…" : "Yes, Cancel"}
                                </button>
                                <button
                                  type="button"
                                  disabled={cancelling}
                                  onClick={(e) => { e.stopPropagation(); setConfirmCancel(null); }}
                                  className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                                >
                                  Keep Pass
                                </button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setConfirmCancel(outing._id); }}
                              className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-50 transition cursor-pointer flex items-center justify-center gap-2"
                            >
                              <Ban size={13} />
                              Cancel Pass
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="sf-notice sf-rise sf-stagger-4">
        <Ticket size={14} className="text-sky-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          Digital outing tickets replace manual register entries. Your data is protected and only visible to authorized college staff.
        </p>
      </div>

      <div className="h-4" />
    </StudentFeatureShell>
  );
}
