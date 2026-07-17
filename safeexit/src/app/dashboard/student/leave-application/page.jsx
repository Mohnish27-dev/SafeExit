"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  MapPin,
  Clock,
  Calendar,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  ChevronRight,
  Inbox,
  Ban,
  TimerOff,
  Eye,
  FileSignature,
  Home,
  PenLine,
} from "lucide-react";
import StudentFeatureShell, {
  StudentFeaturePanel,
  StudentFeatureCentered,
} from "@/app/components/student/StudentFeatureShell";
import StudentProfileBanner from "@/app/components/student/StudentProfileBanner";
import FeatureHeroStrip from "@/app/components/student/FeatureHeroStrip";
import { useStudentProfile } from "@/app/hooks/useStudentProfile";
import { apiFetch } from "@/app/lib/api";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";

const MIN_LEAD_HOURS = 24;

// UX-only mirror of the backend's isBeforeEveningCurfew rule.
const EVENING_CURFEW_HOUR = 17;
const EVENING_CURFEW_MINUTE = 30;
const isBeforeEveningCurfew = (date) =>
  date.getHours() < EVENING_CURFEW_HOUR ||
  (date.getHours() === EVENING_CURFEW_HOUR && date.getMinutes() <= EVENING_CURFEW_MINUTE);

const statusConfig = {
  pending: { label: "Pending", color: "text-amber-700", bg: "bg-amber-100", icon: Loader2 },
  approved: { label: "Approved", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  out: { label: "On Leave", color: "text-sky-700", bg: "bg-sky-100", icon: MapPin },
  rejected: { label: "Rejected", color: "text-rose-700", bg: "bg-rose-100", icon: XCircle },
  cancelled: { label: "Cancelled", color: "text-slate-500", bg: "bg-slate-100", icon: Ban },
  expired: { label: "Expired", color: "text-rose-700", bg: "bg-rose-100", icon: TimerOff },
  returned: { label: "Returned", color: "text-violet-700", bg: "bg-violet-100", icon: CheckCircle2 },
};

const filters = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "out", label: "On Leave" },
  { key: "rejected", label: "Rejected" },
  { key: "returned", label: "Returned" },
  { key: "expired", label: "Expired" },
  { key: "cancelled", label: "Cancelled" },
];

// datetime-local values are local wall-clock strings — convert in local time, not UTC.
const toLocalInputValue = (date) => {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
};

const formatDateTime = (date) =>
  `${date.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })} at ${date.toLocaleTimeString(
    "en-US",
    { hour: "2-digit", minute: "2-digit" }
  )}`;

const getDuration = (leave, ret) => {
  if (!leave || !ret) return null;
  const ms = ret.getTime() - leave.getTime();
  if (ms <= 0) return null;
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  return { days, hours, label: `${days}d ${hours}h` };
};

const describeSubmitError = (error) => {
  if (error instanceof TypeError) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }
  if (error instanceof SyntaxError) {
    return "The server sent back an unexpected response. Please try again.";
  }
  return error.message || "Something went wrong while submitting your application. Please try again.";
};

export default function LeaveApplicationPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const { display, hydrated } = useStudentProfile();

  const [tab, setTab] = useState("new");
  const [step, setStep] = useState("form");

  const [form, setForm] = useState({ destination: "", reason: "", leaveDate: "", returnDate: "" });
  const [acknowledged, setAcknowledged] = useState(false);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const [applications, setApplications] = useState([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchApplications = async (background = false) => {
      if (!background) setLoadingApplications(true);
      try {
        const data = await apiFetch("/leave/myrequests");
        if (cancelled) return;
        setApplications(data || []);
      } catch {
        if (!cancelled && !background) setApplications([]);
      } finally {
        if (!cancelled) setLoadingApplications(false);
      }
    };

    fetchApplications();
    const interval = setInterval(() => fetchApplications(true), 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchApplications(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const leaveDateObj = form.leaveDate ? new Date(form.leaveDate) : null;
  const returnDateObj = form.returnDate ? new Date(form.returnDate) : null;
  const duration = useMemo(
    () => getDuration(form.leaveDate ? new Date(form.leaveDate) : null, form.returnDate ? new Date(form.returnDate) : null),
    [form.leaveDate, form.returnDate]
  );

  const earliestAllowed = useMemo(() => new Date(Date.now() + MIN_LEAD_HOURS * 60 * 60 * 1000), []);
  const minLeaveInputValue = toLocalInputValue(earliestAllowed);

  const validate = () => {
    const nextErrors = {};
    if (!form.destination.trim()) nextErrors.destination = "Destination is required";
    if (!form.reason.trim() || form.reason.trim().length < 10) {
      nextErrors.reason = "Please describe the reason for leave in at least 10 characters";
    }
    if (!form.leaveDate) {
      nextErrors.leaveDate = "Leave date & time is required";
    } else if (leaveDateObj.getTime() < earliestAllowed.getTime()) {
      nextErrors.leaveDate = `Applications must be submitted at least ${MIN_LEAD_HOURS} hours in advance. Earliest allowed: ${formatDateTime(
        earliestAllowed
      )}`;
    } else if (!isBeforeEveningCurfew(leaveDateObj)) {
      nextErrors.leaveDate = "Leave departure must be on or before 5:30 PM — a leave pass is only valid until 5:30 PM on the departure day. Please choose an earlier leave time.";
    }
    if (!form.returnDate) {
      nextErrors.returnDate = "Return date & time is required";
    } else if (leaveDateObj && returnDateObj.getTime() <= leaveDateObj.getTime()) {
      nextErrors.returnDate = "Return date must be after the leave date";
    }
    if (!acknowledged) {
      nextErrors.acknowledged = "You must acknowledge this before continuing";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleReview = () => {
    if (validate()) setStep("letter");
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setErrors((prev) => {
      if (!prev.submit) return prev;
      const { submit, ...rest } = prev;
      return rest;
    });
    try {
      const data = await apiFetch("/leave", {
        method: "POST",
        body: JSON.stringify({
          destination: form.destination.trim(),
          reason: form.reason.trim(),
          leaveDate: leaveDateObj.toISOString(),
          returnDate: returnDateObj.toISOString(),
          acknowledgement: true,
        }),
      });
      setCreated(data);
      setApplications((prev) => [data, ...prev]);
      setSubmitting(false);
      setStep("success");
    } catch (error) {
      setSubmitting(false);
      setErrors((prev) => ({ ...prev, submit: describeSubmitError(error) }));
    }
  };

  const resetForm = () => {
    setCreated(null);
    setForm({ destination: "", reason: "", leaveDate: "", returnDate: "" });
    setAcknowledged(false);
    setErrors({});
    setStep("form");
  };

  const handleCancel = async (id) => {
    setCancelling(true);
    try {
      await apiFetch(`/leave/${id}/cancel`, { method: "PATCH" });
      setApplications((prev) =>
        prev.map((a) => (a._id === id ? { ...a, status: "Cancelled" } : a))
      );
      setConfirmCancel(null);
    } catch (err) {
      console.error("Failed to cancel leave application:", err);
    } finally {
      setCancelling(false);
    }
  };

  const filteredApplications = applications.filter(
    (a) => filter === "all" || (a.status || "").toLowerCase() === filter
  );

  const applicationId = created ? `LV-${String(created._id).slice(-6).toUpperCase()}` : "";

  if (created && step === "success") {
    return (
      <StudentFeatureCentered>
        <StudentFeaturePanel className="p-8 text-center animate-scale-in">
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 rounded-full bg-linear-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 size={40} className="text-violet-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-linear-to-br from-violet-500 to-fuchsia-400 flex items-center justify-center animate-bounce-soft shadow-md">
              <CalendarDays size={12} className="text-white" />
            </div>
          </div>
          <p className="sf-eyebrow mb-1">Application Submitted</p>
          <h2 className="font-sora text-2xl font-bold text-slate-800 mb-1">Sent to your warden</h2>
          <p className="text-slate-500 text-sm mb-6">
            Your leave application has been sent for approval. Please wait for confirmation before making travel plans.
          </p>

          <div className="rounded-2xl p-6 mb-6 text-left space-y-3 bg-linear-to-br from-slate-50 to-violet-50/50 border border-slate-100 shadow-sm">
            {[
              { label: "Application ID", value: applicationId, highlight: true },
              { label: "Destination", value: created.destination },
              { label: "Leave Window", value: formatDateTime(new Date(created.leaveDate)) },
              { label: "Return By", value: formatDateTime(new Date(created.returnDate)) },
              ...(duration ? [{ label: "Duration", value: duration.label }] : []),
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex justify-between items-center gap-3">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</span>
                <span className={`text-base font-bold text-right ${highlight ? "text-violet-600" : "text-slate-700"}`}>
                  {value}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Status</span>
              <span className="text-xs font-bold text-amber-800 bg-linear-to-r from-amber-100 to-amber-50 rounded-full px-3.5 py-1.5 border border-amber-200 shadow-xs">
                Pending Approval
              </span>
            </div>
          </div>

          <div className="sf-notice mb-6 text-left">
            <AlertCircle size={14} className="text-sky-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">
              Leave applications are never auto-approved. Track its progress under &ldquo;My Applications&rdquo;.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setTab("mine");
              }}
              className="sf-btn-secondary w-full"
            >
              View My Applications
            </button>
            <button type="button" onClick={() => router.push("/dashboard/student")} className="sf-btn-primary w-full">
              Back to Dashboard
            </button>
          </div>
        </StudentFeaturePanel>
      </StudentFeatureCentered>
    );
  }

  if (tab === "new" && step === "letter") {
    const today = new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" });

    return (
      <StudentFeatureShell
        eyebrow="Step 2 of 2"
        title="Review Your Letter"
        icon={FileSignature}
        iconTone="leave"
        onBack={() => setStep("form")}
        contentClassName="space-y-4"
      >
        <div className="sf-step-bar sf-rise">
          <div className="sf-step-segment sf-step-segment--done" />
          <div className="sf-step-segment sf-step-segment--active" />
        </div>

        {hydrated && <StudentProfileBanner display={display} compact />}

        <StudentFeaturePanel className="p-0 overflow-hidden animate-scale-in" delay={60}>
          <div className="sf-letter-paper">
            <p>To,</p>
            <p>The Warden,</p>
            <p>{display.hostel || "Hostel Administration"}</p>
            <p className="mt-4 font-bold">Subject: Application for Leave — {form.destination}</p>
            <p className="mt-4">Respected Sir/Madam,</p>
            <p className="mt-3">
              I, <strong>{display.name}</strong>, a resident of Room {display.room}, {display.hostel}
              {display.subtitle ? ` (${display.subtitle})` : ""}, Roll No. {display.rollNo}, would like to
              request leave to visit <strong>{form.destination}</strong> from{" "}
              <strong>{leaveDateObj ? formatDateTime(leaveDateObj) : "—"}</strong> to{" "}
              <strong>{returnDateObj ? formatDateTime(returnDateObj) : "—"}</strong>.
            </p>
            <p className="mt-3">
              <strong>Reason:</strong> {form.reason}
            </p>
            <p className="mt-3">
              I hereby acknowledge that the college/hostel administration shall not be responsible for my
              safety, whereabouts, or well-being during this leave period, and that I am undertaking this
              journey at my own responsibility.
            </p>
            <p className="mt-5">Yours sincerely,</p>
            <p className="mt-1 font-bold">{display.name}</p>
            <p>{display.rollNo}</p>
            <p>{today}</p>
          </div>
        </StudentFeaturePanel>

        <div className="flex items-center gap-3 sf-rise sf-stagger-1">
          {duration && (
            <span className="flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 shadow-xs border bg-violet-100 text-violet-700 border-violet-200">
              <Clock size={12} /> Trip duration: {duration.label}
            </span>
          )}
          <span className="flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 shadow-xs border bg-sky-100 text-sky-700 border-sky-200">
            <CalendarDays size={12} /> Departs {leaveDateObj ? formatDateTime(leaveDateObj) : "—"}
          </span>
        </div>

        {errors.submit && (
          <div role="alert" className="sf-notice sf-notice--danger animate-notice-in">
            <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-rose-700">Submission failed</p>
              <p className="text-xs text-rose-600 mt-0.5">{errors.submit}</p>
            </div>
          </div>
        )}

        <div className="flex gap-3 sf-rise sf-stagger-2">
          <button type="button" onClick={() => setStep("form")} className="sf-btn-secondary flex-1">
            Edit Details
          </button>
          <button type="button" onClick={handleSubmit} disabled={submitting} className="sf-btn-primary flex-1">
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Submitting...
              </>
            ) : (
              "Submit Application"
            )}
          </button>
        </div>

        <div className="h-4" />
      </StudentFeatureShell>
    );
  }

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <StudentFeatureShell
      eyebrow="Multi-Day Leave"
      title="Leave Application"
      icon={CalendarDays}
      iconTone="leave"
      onBack={() => router.push("/dashboard/student")}
      contentClassName="space-y-5"
    >
      <FeatureHeroStrip
        variant="leave"
        icon={CalendarDays}
        title="Apply for leave"
        description="Festivals, home visits, or multi-day trips — send a formal application to your warden at least 24 hours ahead."
      />

      {hydrated && <StudentProfileBanner display={display} compact />}

      <div className="flex gap-2 sf-rise sf-stagger-1">
        <button
          type="button"
          onClick={() => setTab("new")}
          className={`sf-filter-pill flex-1 justify-center ${tab === "new" ? "sf-filter-pill--active" : "sf-filter-pill--idle"}`}
        >
          New Application
        </button>
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`sf-filter-pill flex-1 justify-center ${tab === "mine" ? "sf-filter-pill--active" : "sf-filter-pill--idle"}`}
        >
          My Applications{applications.length ? ` (${applications.length})` : ""}
        </button>
      </div>

      {tab === "new" ? (
        <>
          <StudentFeaturePanel className="p-6 sm:p-7 animate-scale-in" delay={60}>
            <p className="sf-section-label mb-4">Trip Details</p>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  <Home size={11} className="inline mr-1 text-violet-500" />
                  Destination *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Bihta — Home, or Patna for temple visit"
                  value={form.destination}
                  onChange={set("destination")}
                  className={`sf-input ${errors.destination ? "sf-input--error" : ""}`}
                />
                {errors.destination && <p className="text-xs text-rose-500 mt-1">{errors.destination}</p>}
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  <PenLine size={11} className="inline mr-1 text-violet-500" />
                  Reason for Leave *
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Visiting home for Diwali celebrations with family"
                  value={form.reason}
                  onChange={set("reason")}
                  className={`sf-input resize-none ${errors.reason ? "sf-input--error" : ""}`}
                />
                {errors.reason && <p className="text-xs text-rose-500 mt-1">{errors.reason}</p>}
              </div>
            </div>
          </StudentFeaturePanel>

          <StudentFeaturePanel className="p-6 sm:p-7" delay={100}>
            <p className="sf-section-label mb-4">Schedule</p>
            <div className="sf-notice sf-notice--danger mb-4">
              <ShieldAlert size={14} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 leading-relaxed">
                Your leave pass is valid <strong>only until 5:30 PM</strong> on the departure day. You must
                leave at your approved time and on or before <strong>5:30 PM</strong> — after 5:30 PM the pass
                expires and you can no longer leave on it. Please choose a departure time on or before 5:30 PM.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  <Calendar size={11} className="inline mr-1 text-violet-500" />
                  Leave Date & Time *
                </label>
                <input
                  type="datetime-local"
                  min={minLeaveInputValue}
                  value={form.leaveDate}
                  onChange={set("leaveDate")}
                  className={`sf-input ${errors.leaveDate ? "sf-input--error" : ""}`}
                />
                {errors.leaveDate && <p className="text-xs text-rose-500 mt-1">{errors.leaveDate}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  <Calendar size={11} className="inline mr-1 text-violet-500" />
                  Return Date & Time *
                </label>
                <input
                  type="datetime-local"
                  min={form.leaveDate || minLeaveInputValue}
                  value={form.returnDate}
                  onChange={set("returnDate")}
                  className={`sf-input ${errors.returnDate ? "sf-input--error" : ""}`}
                />
                {errors.returnDate && <p className="text-xs text-rose-500 mt-1">{errors.returnDate}</p>}
              </div>
            </div>
            {duration && (
              <div className="mt-4 flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 shadow-xs border bg-violet-100 text-violet-700 border-violet-200">
                  <Clock size={12} /> Trip duration: {duration.label}
                </span>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-3">
              Applications must be submitted at least {MIN_LEAD_HOURS} hours before the leave date.
            </p>
          </StudentFeaturePanel>

          <StudentFeaturePanel className="p-5" delay={140}>
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-violet-600 shrink-0"
              />
              <span className="text-xs text-amber-800 leading-relaxed">
                <ShieldAlert size={13} className="inline mr-1 -mt-0.5 text-amber-600" />
                I understand and acknowledge that during my leave period, the college/hostel administration
                is <strong>not responsible</strong> for my safety, whereabouts, or well-being, and that I am
                undertaking this trip at my own responsibility.
              </span>
            </label>
            {errors.acknowledged && <p className="text-xs text-rose-500 mt-2">{errors.acknowledged}</p>}
          </StudentFeaturePanel>

          <div className="sf-notice sf-rise sf-stagger-3">
            <ShieldAlert size={15} className="text-violet-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              This application is reviewed by your warden and never auto-approved — submit early so there is
              time to review it.
            </p>
          </div>

          <button
            type="button"
            onClick={handleReview}
            className="sf-btn-primary w-full sf-rise sf-stagger-4"
          >
            Review Letter
            <ChevronRight size={16} />
          </button>

          <div className="h-4" />
        </>
      ) : (
        <>
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

          {loadingApplications ? (
            <StudentFeaturePanel className="p-10 text-center" delay={80}>
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-3">
                <Loader2 size={24} className="text-slate-400 animate-spin" />
              </div>
              <p className="font-sora font-semibold text-slate-700">Loading your applications…</p>
            </StudentFeaturePanel>
          ) : filteredApplications.length === 0 ? (
            <StudentFeaturePanel className="p-10 text-center" delay={80}>
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-3">
                <Inbox size={24} className="text-slate-400" />
              </div>
              <p className="font-sora font-semibold text-slate-700">No applications found</p>
              <p className="text-sm text-slate-500 mt-1">
                {applications.length === 0 ? "Submit a new leave application to get started." : "Try a different filter."}
              </p>
            </StudentFeaturePanel>
          ) : (
            <div className="space-y-3">
              {filteredApplications.map((a, index) => {
                const statusKey = (a.status || "Pending").toLowerCase();
                const sc = statusConfig[statusKey] || statusConfig.pending;
                const StatusIcon = sc.icon;
                const isExpanded = expanded === a._id;
                const leave = new Date(a.leaveDate);
                const ret = new Date(a.returnDate);
                const dur = getDuration(leave, ret);

                return (
                  <div
                    key={a._id}
                    className={`sf-outing-card sf-outing-card--${statusKey} sf-rise sf-panel-lift`}
                    style={{ animationDelay: `${100 + index * 50}ms` }}
                  >
                    <button
                      type="button"
                      className="w-full text-left p-5 sm:p-6"
                      onClick={() => setExpanded(isExpanded ? null : a._id)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-linear-to-br from-violet-100 to-fuchsia-100 flex items-center justify-center shrink-0 shadow-xs">
                            <MapPin size={20} className="text-violet-600" />
                          </div>
                          <div>
                            <p className="font-sora font-extrabold text-slate-800 text-lg sm:text-xl leading-snug">
                              {a.destination}
                            </p>
                            <p className="text-xs text-violet-500 mt-2 font-mono tracking-wider bg-violet-50/50 w-fit px-2 py-0.5 rounded border border-violet-100/50 font-semibold">
                              LV-{String(a._id).slice(-6).toUpperCase()}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-3 shrink-0">
                          <span
                            className={`flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 shadow-xs border ${sc.bg} ${sc.color} border-current/20`}
                          >
                            <StatusIcon size={12} className={statusKey === "pending" ? "animate-spin" : ""} />
                            {sc.label}
                          </span>
                          <Eye
                            size={16}
                            className={`transition-all duration-300 ${isExpanded ? "text-violet-600 scale-110" : "text-slate-350"}`}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-5 mt-4.5 pt-4 border-t border-slate-100/90 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Calendar size={13} className="text-slate-400" />
                          <span className="text-xs font-semibold text-slate-650">{formatDateTime(leave)}</span>
                        </div>
                        {dur && (
                          <div className="flex items-center gap-2">
                            <Clock size={13} className="text-slate-400" />
                            <span className="text-xs font-semibold text-slate-650">{dur.label}</span>
                          </div>
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 sm:px-6 sm:pb-6 pt-0 animate-fade-in">
                        <div className="rounded-2xl p-5 space-y-3.5 bg-linear-to-br from-slate-50 to-violet-50/40 border border-slate-100/80 shadow-inner">
                          {[
                            { label: "Reason", value: a.reason },
                            { label: "Departure", value: formatDateTime(leave) },
                            { label: "Expected Return", value: formatDateTime(ret) },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between items-start gap-3 py-0.5">
                              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider shrink-0">{label}</span>
                              <span className="text-sm font-bold text-slate-700 text-right">{value}</span>
                            </div>
                          ))}
                          {a.remarks && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2.5">
                              <AlertCircle size={14} className="text-slate-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-slate-600">
                                <span className="font-bold text-slate-700">Warden&rsquo;s note: </span>
                                {a.remarks}
                              </p>
                            </div>
                          )}
                          {statusKey === "pending" && (
                            <div className="mt-3 pt-3 border-t border-amber-100 flex items-start gap-2.5">
                              <Loader2 size={15} className="text-amber-500 shrink-0 mt-0.5 animate-spin" />
                              <p className="text-xs font-semibold text-amber-705">Awaiting warden approval. You will be notified.</p>
                            </div>
                          )}
                          {statusKey === "expired" && (
                            <div className="mt-3 pt-3 border-t border-rose-100 flex items-start gap-2.5">
                              <TimerOff size={15} className="text-rose-500 shrink-0 mt-0.5" />
                              <p className="text-xs font-semibold text-rose-600">Leave date passed before this application was acted on. File a new one if still needed.</p>
                            </div>
                          )}
                          {statusKey === "cancelled" && (
                            <div className="mt-3 pt-3 border-t border-slate-200 flex items-start gap-2.5">
                              <Ban size={15} className="text-slate-400 shrink-0 mt-0.5" />
                              <p className="text-xs font-semibold text-slate-500">You cancelled this leave application.</p>
                            </div>
                          )}
                          {(statusKey === "approved" || statusKey === "pending") && (
                            <div className="mt-4 pt-3 border-t border-slate-100">
                              {confirmCancel === a._id ? (
                                <div className="flex flex-col gap-2">
                                  <p className="text-xs font-semibold text-slate-600">Are you sure you want to cancel this application?</p>
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={cancelling}
                                      onClick={(e) => { e.stopPropagation(); handleCancel(a._id); }}
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
                                      Keep Application
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); setConfirmCancel(a._id); }}
                                  className="w-full py-2.5 rounded-xl border border-rose-200 text-rose-600 text-xs font-bold hover:bg-rose-50 transition cursor-pointer flex items-center justify-center gap-2"
                                >
                                  <Ban size={13} />
                                  Cancel Application
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

          <div className="h-4" />
        </>
      )}
    </StudentFeatureShell>
  );
}
