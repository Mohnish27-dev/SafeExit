"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  Phone,
  Paperclip,
  Siren,
  Trash2,
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
import CaretakerSelect from "@/app/components/student/CaretakerSelect";
import { isDayScholar } from "@/app/lib/hostels";
import GateQrInstruction from "@/app/components/student/GateQrInstruction";
import SignatureSetupModal from "@/app/components/SignatureSetupModal";
import ApprovalSignature from "@/app/components/ApprovalSignature";
import { isSignatureRequiredError } from "@/app/lib/signatureImage";
import { prepareTicketFile } from "@/app/lib/leaveTicket";
import { formatDepartureTime } from "@/app/lib/leaveDesk";
import { LeaveTicketButton } from "@/app/components/LeaveTicketViewer";
import {
  CAMPUS_TIMEZONE,
  getLeaveSubmissionTimingViolation,
  getMinimumLeaveDateValue,
  isEmergencyLeave,
  LATEST_DEPARTURE_TIME,
  leaveDayCount,
  parseCampusDate,
  parseCampusReturnDate,
} from "@/app/lib/leaveRules.mjs";

const statusConfig = {
  pending: { label: "Pending", color: "text-amber-700", bg: "bg-amber-100", icon: Loader2 },
  // Only on applications filed under the old caretaker-forwards-to-warden flow.
  forwarded: { label: "Pending", color: "text-amber-700", bg: "bg-amber-100", icon: Loader2 },
  approved: { label: "Approved", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2 },
  out: { label: "On Leave", color: "text-sky-700", bg: "bg-sky-100", icon: MapPin },
  rejected: { label: "Rejected", color: "text-rose-700", bg: "bg-rose-100", icon: XCircle },
  cancelled: { label: "Cancelled", color: "text-slate-500", bg: "bg-slate-100", icon: Ban },
  expired: { label: "Expired", color: "text-rose-700", bg: "bg-rose-100", icon: TimerOff },
  returned: { label: "Returned", color: "text-violet-700", bg: "bg-violet-100", icon: CheckCircle2 },
};

// A boy's leave is stored as Approved (the gate needs that), but no one actually reviews it,
// so the student sees it as Received rather than Approved.
const isAutoApproved = (a) => a?.status === "Approved" && a?.decidedByRole === "System";
const statusLabel = (a) =>
  isAutoApproved(a) ? "Received" : statusConfig[(a?.status || "").toLowerCase()]?.label || a?.status;

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

// Leave and return are dates only: no time is collected or shown. The leave QR works at
// any hour of the leave date.
const formatDate = (date) =>
  date.toLocaleDateString("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

// The actual gate scans carry a time of day, unlike the planned leave and return dates.
const formatDateTime = (value) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const getDuration = (leave, ret) => {
  if (!leave || !ret) return null;
  const days = leaveDayCount(leave, ret);
  if (!days) return null;
  return { days, label: `${days} ${days === 1 ? "day" : "days"}` };
};

// Who decided (or revoked) an application, as the student reads it.
const ROLE_NAME = { Caretaker: "Caretaker", Warden: "Warden", ChiefWarden: "Chief Warden" };

const describeSubmitError = (error) => {
  if (error instanceof TypeError) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }
  if (error instanceof SyntaxError) {
    return "The server sent back an unexpected response. Please try again.";
  }
  // A proxy in front of the server refused the request for its size. Only an attached
  // ticket can make it that large, so say so plainly.
  if (error.status === 413) {
    return "Your ticket file is too large to send. Remove it, or attach a smaller file or a screenshot, and submit again.";
  }
  return error.message || "Something went wrong while submitting your application. Please try again.";
};

export default function LeaveApplicationPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const { profile, display, hydrated } = useStudentProfile();

  const [tab, setTab] = useState("new");
  const [step, setStep] = useState("form");

  const [form, setForm] = useState({
    destination: "",
    reason: "",
    parentPhone: "",
    leaveDate: "",
    expectedDepartureTime: "",
    returnDate: "",
  });
  // Optional: { dataUrl, name, isPdf } once a file is picked and prepared.
  const [ticket, setTicket] = useState(null);
  const [preparingTicket, setPreparingTicket] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  // Captured once (onboarding or profile) and stamped by the server; these only drive
  // the letter's rendered signature and the one-time setup fallback for older accounts.
  const [mySignature, setMySignature] = useState(null);
  const [needsSignature, setNeedsSignature] = useState(false);
  // Set only when a rejected submit opened the modal, so signing resumes that submit
  // rather than firing one the student never asked for.
  const resumeSubmitRef = useRef(false);
  const [targetCaretakerId, setTargetCaretakerId] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const [applications, setApplications] = useState([]);
  const [loadingApplications, setLoadingApplications] = useState(true);
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  // Why the last cancel failed, e.g. the gate took the student Out a moment earlier.
  const [cancelError, setCancelError] = useState("");

  // Pull the saved signature when the letter step opens, so it renders in the letter.
  // Also pre-opens the setup modal for accounts that never captured one, rather than
  // letting the student press Submit and bounce off a 428.
  useEffect(() => {
    if (step !== "letter" || mySignature) return;
    let cancelled = false;
    apiFetch("/auth/profile")
      .then((me) => {
        if (cancelled) return;
        if (me?.signature) setMySignature(me.signature);
        else setNeedsSignature(true);
      })
      .catch(() => {
        /* best-effort: the submit attempt is the authoritative check */
      });
    return () => {
      cancelled = true;
    };
  }, [step, mySignature]);

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
  // Digits only, at most ten: pasted "+91 98765-43210" keeps its last ten digits.
  const setParentPhone = (event) => {
    const digits = event.target.value.replace(/\D/g, "");
    setForm((prev) => ({ ...prev, parentPhone: digits.slice(-10) }));
  };

  const handleTicket = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // picking the same file again should still fire onChange
    if (!file) return;
    setPreparingTicket(true);
    const result = await prepareTicketFile(file);
    setPreparingTicket(false);
    setErrors((prev) => ({ ...prev, ticket: result.error || undefined }));
    if (!result.error) setTicket(result);
  };

  // Mirrors the backend rule: one live leave at a time (Pending/Forwarded/Approved/Out).
  // A student must finish the current trip (Returned) or let it end before applying again.
  const activeLeave = useMemo(
    () => applications.find((a) => ["pending", "forwarded", "approved", "out"].includes((a.status || "").toLowerCase())),
    [applications]
  );
  const activeLeaveStatus = (activeLeave?.status || "").toLowerCase();

  const isFemale = display.gender === "Female";
  const leaveDateObj = parseCampusDate(form.leaveDate);
  // A girl applying on the departure day itself: accepted, but flagged for every approver.
  const isEmergency = Boolean(leaveDateObj) && isEmergencyLeave(display.gender, leaveDateObj);
  const departureLabel = formatDepartureTime(form.expectedDepartureTime);
  const returnDateObj = parseCampusReturnDate(form.returnDate);
  const duration = useMemo(
    () => getDuration(parseCampusDate(form.leaveDate), parseCampusReturnDate(form.returnDate)),
    [form.leaveDate, form.returnDate]
  );

  const minLeaveDateValue = getMinimumLeaveDateValue();
  const timingGuidance = isFemale
    ? "Apply by the day before you leave. An application on the leave day itself is treated as an emergency."
    : "You can apply any time up to and including the leave day; your leave is recorded as soon as you submit.";

  const validate = () => {
    const nextErrors = {};
    const timingViolation = leaveDateObj
      ? getLeaveSubmissionTimingViolation(display.gender, leaveDateObj)
      : null;
    if (!form.destination.trim()) nextErrors.destination = "Destination is required";
    if (!form.reason.trim() || form.reason.trim().length < 10) {
      nextErrors.reason = "Please describe the reason for leave in at least 10 characters";
    }
    if (!/^[0-9]{10}$/.test(form.parentPhone)) {
      nextErrors.parentPhone = "Enter your parent's 10-digit mobile number";
    }
    if (!form.leaveDate) {
      nextErrors.leaveDate = "Leave date is required";
    } else if (!leaveDateObj) {
      nextErrors.leaveDate = "Leave date must be valid";
    } else if (timingViolation === "DEPARTURE_NOT_FUTURE") {
      nextErrors.leaveDate = "The leave date cannot be in the past";
    }
    if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(form.expectedDepartureTime)) {
      nextErrors.expectedDepartureTime = "Enter the time you expect to leave";
    } else if (form.expectedDepartureTime > LATEST_DEPARTURE_TIME) {
      nextErrors.expectedDepartureTime = "Choose a time of 5:30 PM or earlier";
    }
    if (!form.returnDate) {
      nextErrors.returnDate = "Return date is required";
    } else if (!returnDateObj) {
      nextErrors.returnDate = "Return date must be valid";
    } else if (leaveDateObj && returnDateObj.getTime() <= leaveDateObj.getTime()) {
      nextErrors.returnDate = "Return date must be on or after the leave date";
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
          parentPhone: form.parentPhone,
          leaveDate: leaveDateObj.toISOString(),
          expectedDepartureTime: form.expectedDepartureTime,
          ...(ticket ? { ticket: ticket.dataUrl } : {}),
          returnDate: returnDateObj.toISOString(),
          acknowledgement: true,
          // No signature in the body — the server stamps the student's saved one.
          ...(targetCaretakerId ? { targetCaretakerId } : {}),
        }),
      });
      setCreated(data);
      setApplications((prev) => [data, ...prev]);
      setSubmitting(false);
      setStep("success");
    } catch (error) {
      setSubmitting(false);
      // Not a form error — no saved signature yet. The server rejects before creating
      // anything, so capturing one and retrying is safe.
      if (isSignatureRequiredError(error)) {
        resumeSubmitRef.current = true;
        setNeedsSignature(true);
        return;
      }
      setErrors((prev) => ({ ...prev, submit: describeSubmitError(error) }));
    }
  };

  const resetForm = () => {
    setCreated(null);
    setForm({ destination: "", reason: "", parentPhone: "", leaveDate: "", expectedDepartureTime: "", returnDate: "" });
    setTicket(null);
    setAcknowledged(false);
    setTargetCaretakerId("");
    setErrors({});
    setStep("form");
  };

  const handleCancel = async (id) => {
    if (!id || cancelling) return false;
    setCancelling(true);
    setCancelError("");
    try {
      const cancelledApplication = await apiFetch(`/leave/${id}/cancel`, { method: "PATCH" });
      setApplications((prev) =>
        prev.map((a) => (a._id === id ? { ...a, ...cancelledApplication, status: "Cancelled" } : a))
      );
      setConfirmCancel(null);
      return true;
    } catch (err) {
      setCancelError(describeSubmitError(err));
      // The row may have moved on (rejected, or the gate took the student Out): show it as
      // it is now rather than leaving a Cancel button that can only fail again.
      apiFetch("/leave/myrequests")
        .then((data) => setApplications(data || []))
        .catch(() => {});
      return false;
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelCreated = async () => {
    if (!(await handleCancel(created?._id))) return;
    resetForm();
    setTab("mine");
  };

  const filteredApplications = applications.filter(
    (a) => filter === "all" || (a.status || "").toLowerCase() === filter
  );

  const applicationId = created ? `LV-${String(created._id).slice(-6).toUpperCase()}` : "";

  // Reached only by URL: the dashboard hides leave from day scholars, and the server refuses
  // their applications. Say so instead of offering a form that cannot be submitted.
  if (checked && authorized && isDayScholar(profile)) {
    return (
      <StudentFeatureShell
        eyebrow="Multi-Day Leave"
        title="Leave Application"
        icon={CalendarDays}
        iconTone="leave"
        onBack={() => router.push("/dashboard/student")}
      >
        <StudentFeaturePanel className="p-6 text-center">
          <p className="text-sm font-bold text-slate-800">Day scholars do not apply for leave.</p>
          <p className="mt-2 text-sm text-slate-600">
            You live at home, so the gate only logs when you arrive and leave. If you have moved
            into a hostel, update &quot;Where do you live?&quot; in your profile during the update window.
          </p>
        </StudentFeaturePanel>
      </StudentFeatureShell>
    );
  }

  if (created && step === "success") {
    const autoApproved = created.status === "Approved";
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
          <p className="sf-eyebrow mb-1">{autoApproved ? "Application Received" : "Application Submitted"}</p>
          <h2 className="font-sora text-2xl font-bold text-slate-800 mb-1">
            {autoApproved ? "Leave application received" : "Sent for approval"}
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            {autoApproved
              ? "Your leave application has been received. Your caretaker, hostel wardens, the chief warden and the admin have been informed. Staff can still revoke it with a reason before you leave, so check this page before you travel."
              : "Your application has gone to your caretaker, your hostel wardens and the chief warden together. Your caretaker may call your parent before approving. Please wait for approval before making travel plans."}
          </p>
          {created.isEmergency && (
            <div className="sf-notice sf-notice--danger mb-6 text-left">
              <Siren size={14} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700 leading-relaxed">
                You applied on the leave day itself, so this is marked as an <strong>emergency</strong> for the staff.
              </p>
            </div>
          )}

          <div className="rounded-2xl p-6 mb-6 text-left space-y-3 bg-linear-to-br from-slate-50 to-violet-50/50 border border-slate-100 shadow-sm">
            {[
              { label: "Application ID", value: applicationId, highlight: true },
              { label: "Destination", value: created.destination },
              { label: "Parent's Mobile", value: created.parentPhone || "—" },
              { label: "Leave Date", value: formatDate(new Date(created.leaveDate)) },
              ...(created.expectedDepartureTime
                ? [{ label: "Leaving Around", value: formatDepartureTime(created.expectedDepartureTime) }]
                : []),
              { label: "Return By", value: formatDate(new Date(created.returnDate)) },
              ...(duration ? [{ label: "Duration", value: duration.label }] : []),
              ...(created.ticketMime ? [{ label: "Ticket", value: "Attached" }] : []),
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
              {autoApproved ? (
                <span className="text-xs font-bold text-emerald-800 bg-linear-to-r from-emerald-100 to-emerald-50 rounded-full px-3.5 py-1.5 border border-emerald-200 shadow-xs">
                  Received
                </span>
              ) : (
                <span className="text-xs font-bold text-amber-800 bg-linear-to-r from-amber-100 to-amber-50 rounded-full px-3.5 py-1.5 border border-amber-200 shadow-xs">
                  Pending Approval
                </span>
              )}
            </div>
          </div>

          <GateQrInstruction ready={autoApproved} showAction={autoApproved} className="mb-6" />

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
            <button
              type="button"
              onClick={handleCancelCreated}
              disabled={cancelling}
              className="sf-btn-danger w-full disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {cancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              {cancelling ? "Cancelling…" : "Cancel Leave"}
            </button>
            {cancelError && <p role="alert" className="text-xs font-semibold text-rose-600">{cancelError}</p>}
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
              <strong>{leaveDateObj ? formatDate(leaveDateObj) : "—"}</strong> to{" "}
              <strong>{returnDateObj ? formatDate(returnDateObj) : "—"}</strong>.
              {departureLabel && <> I expect to leave at around <strong>{departureLabel}</strong> on the leave date.</>}
            </p>
            <p className="mt-3">
              <strong>Reason:</strong> {form.reason}
            </p>
            {ticket && <p className="mt-3">A copy of my travel ticket is attached.</p>}
            <p className="mt-3">
              My parent can be reached at <strong>{form.parentPhone}</strong> during this leave.
            </p>
            <p className="mt-3">
              I hereby acknowledge that the college/hostel administration shall not be responsible for my
              safety, whereabouts, or well-being during this leave period, and that I am undertaking this
              journey at my own responsibility.
            </p>
            <p className="mt-5">Yours sincerely,</p>
            {mySignature && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={mySignature}
                alt="Your signature"
                className="mt-1.5 h-14 w-auto"
              />
            )}
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
            <CalendarDays size={12} /> Departs {leaveDateObj ? formatDate(leaveDateObj) : "—"}
            {departureLabel ? ` · ~${departureLabel}` : ""}
          </span>
          {isEmergency && (
            <span className="flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 shadow-xs border bg-rose-600 text-white border-rose-600">
              <Siren size={12} /> Emergency
            </span>
          )}
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
            ) : isFemale ? (
              "Submit Application"
            ) : (
              "Submit Application"
            )}
          </button>
        </div>

        <SignatureSetupModal
          open={needsSignature}
          dismissible={false}
          title="Add your signature"
          description="Your signature goes on every leave application. You only set this up once."
          onSaved={(sig) => {
            setMySignature(sig);
            setNeedsSignature(false);
            if (resumeSubmitRef.current) {
              resumeSubmitRef.current = false;
              handleSubmit();
            }
          }}
        />

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
        description={`Festivals, home visits, or multi-day trips — ${timingGuidance}`}
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

      {tab === "new" && activeLeave ? (
        <StudentFeaturePanel className="p-6 sm:p-7 animate-scale-in text-center" delay={60}>
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert size={30} className="text-amber-600" />
          </div>
          <h3 className="font-sora text-lg font-bold text-slate-800 mb-1.5">
            You already have an active leave
          </h3>
          <p className="text-sm text-slate-500 mb-5">
            {activeLeave.status === "Out"
              ? "You're currently on leave. Once you return and get scanned back in at the gate, you can apply for new leave."
              : isAutoApproved(activeLeave)
              ? "Your leave application has been received. Complete that trip and return to campus — or cancel it — before applying again."
              : activeLeave.status === "Approved"
              ? "Your leave pass is approved. Complete that trip and return to campus — or cancel it — before applying again."
              : "Your leave application is awaiting approval from your caretaker, warden or chief warden. Wait for the outcome, or cancel it, before applying again."}
          </p>
          <div className="rounded-2xl p-4 mb-5 text-left bg-slate-50 border border-slate-100 space-y-1.5">
            <div className="flex justify-between gap-3">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Destination</span>
              <span className="text-sm font-bold text-slate-700 text-right">{activeLeave.destination}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Status</span>
              <span className="text-sm font-bold text-violet-600 text-right">
                {statusLabel(activeLeave)}
              </span>
            </div>
          </div>
          {activeLeaveStatus === "approved" && (
            <GateQrInstruction ready showAction className="mb-5" />
          )}
          <button type="button" onClick={() => setTab("mine")} className="sf-btn-primary w-full">
            View My Applications
          </button>
          {cancelError && (
            <p role="alert" className="mt-3 text-xs font-semibold text-rose-600">{cancelError}</p>
          )}
          {activeLeaveStatus !== "out" && (
            <button
              type="button"
              onClick={() => handleCancel(activeLeave._id)}
              disabled={cancelling}
              className="sf-btn-danger w-full mt-3 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {cancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              {cancelling ? "Cancelling…" : "Cancel Leave"}
            </button>
          )}
        </StudentFeaturePanel>
      ) : tab === "new" ? (
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
                  placeholder="e.g. Bihta — Home, or Patna"
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

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  <Phone size={11} className="inline mr-1 text-violet-500" />
                  Parent&apos;s Mobile Number *
                </label>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  placeholder="10-digit number, e.g. 9876543210"
                  value={form.parentPhone}
                  onChange={setParentPhone}
                  className={`sf-input ${errors.parentPhone ? "sf-input--error" : ""}`}
                />
                {errors.parentPhone && <p className="text-xs text-rose-500 mt-1">{errors.parentPhone}</p>}
              </div>

              <CaretakerSelect value={targetCaretakerId} onChange={setTargetCaretakerId} />
            </div>
          </StudentFeaturePanel>

          <StudentFeaturePanel className="p-6 sm:p-7" delay={100}>
            <p className="sf-section-label mb-4">Schedule</p>
            <div className="sf-notice sf-notice--warn mb-4">
              <ShieldAlert size={14} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900 leading-relaxed">
                Once approved, your leave works <strong>only on the leave date</strong>, at any time that day —
                the departure time below is only an estimate for the staff. At the main gate, show your{" "}
                <strong>Leave QR</strong> (not the Outing QR). If you do not leave on that date, the leave
                expires at midnight and you must apply again.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  <Calendar size={11} className="inline mr-1 text-violet-500" />
                  Leave Date *
                </label>
                <input
                  type="date"
                  min={minLeaveDateValue}
                  value={form.leaveDate}
                  onChange={set("leaveDate")}
                  className={`sf-input ${errors.leaveDate ? "sf-input--error" : ""}`}
                />
                {errors.leaveDate && <p className="text-xs text-rose-500 mt-1">{errors.leaveDate}</p>}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  <Clock size={11} className="inline mr-1 text-violet-500" />
                  Expected Departure Time *
                </label>
                <input
                  type="time"
                  max={LATEST_DEPARTURE_TIME}
                  value={form.expectedDepartureTime}
                  onChange={set("expectedDepartureTime")}
                  className={`sf-input ${errors.expectedDepartureTime ? "sf-input--error" : ""}`}
                />
                {errors.expectedDepartureTime ? (
                  <p className="text-xs text-rose-500 mt-1">{errors.expectedDepartureTime}</p>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Up to 5:30 PM. Only an estimate — your Leave QR works at the gate all day.
                  </p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                  <Calendar size={11} className="inline mr-1 text-violet-500" />
                  Return Date *
                </label>
                <input
                  type="date"
                  min={form.leaveDate || minLeaveDateValue}
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
            {isEmergency && (
              <div className="sf-notice sf-notice--danger mt-4">
                <Siren size={14} className="text-rose-600 shrink-0 mt-0.5" />
                <p className="text-xs text-rose-700 leading-relaxed">
                  You are applying on the leave day itself, so this will be marked as an <strong>emergency</strong>.
                  Girls are expected to apply by the day before.
                </p>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-3">{timingGuidance}</p>
          </StudentFeaturePanel>

          <StudentFeaturePanel className="p-6 sm:p-7" delay={120}>
            <div className="flex items-center gap-2 mb-1">
              <p className="sf-section-label">Travel Ticket</p>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                Optional
              </span>
            </div>
            <p className="text-xs text-slate-500 mb-4"> If you have one,
              attach your train/bus/flight ticket as proof of travel (photo, screenshot or PDF up to 700 KB).
            </p>
            {ticket ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                  <Paperclip size={14} className="text-violet-500 shrink-0" />
                  <span className="truncate">{ticket.name || (ticket.isPdf ? "Ticket.pdf" : "Ticket photo")}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setTicket(null)}
                  className="flex items-center gap-1 text-xs font-bold text-rose-600 hover:text-rose-700"
                >
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            ) : (
              <label className={`sf-btn-secondary w-full cursor-pointer ${preparingTicket ? "opacity-60 pointer-events-none" : ""}`}>
                {preparingTicket ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />}
                {preparingTicket ? "Preparing…" : "Attach ticket"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={handleTicket}
                  className="hidden"
                />
              </label>
            )}
            {errors.ticket && <p className="text-xs text-rose-500 mt-2">{errors.ticket}</p>}
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
              {isFemale
                ? "Your application goes to your caretaker, your hostel wardens and the chief warden together, and any of them can approve it. Your caretaker may call your parent first — submit early so there is time."
                : "Your leave is recorded as soon as you submit. Your caretaker, hostel wardens, the chief warden and the admin are informed, and staff can revoke it with a reason before you leave."}
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
                {key === "approved" && !isFemale ? "Received" : label}
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
                const sc = a.revokedAt
                  ? { ...statusConfig.rejected, label: "Revoked", icon: Ban }
                  : isAutoApproved(a)
                  ? { ...statusConfig.approved, label: "Received" }
                  : statusConfig[statusKey] || statusConfig.pending;
                const decidedBy = ROLE_NAME[a.decidedByRole] || "";
                const autoApproved = a.decidedByRole === "System";
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
                            <StatusIcon size={12} className={sc.icon === Loader2 ? "animate-spin" : ""} />
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
                          <span className="text-xs font-semibold text-slate-650">{formatDate(leave)}</span>
                        </div>
                        {a.isEmergency && (
                          <span className="flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-bold text-rose-700">
                            <Siren size={11} /> Emergency
                          </span>
                        )}
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
                            ...(a.parentPhone ? [{ label: "Parent's Mobile", value: a.parentPhone }] : []),
                            {
                              label: "Departure",
                              value: a.expectedDepartureTime
                                ? `${formatDate(leave)} · ~${formatDepartureTime(a.expectedDepartureTime)}`
                                : formatDate(leave),
                            },
                            { label: "Expected Return", value: formatDate(ret) },
                            // From the gate scans: when they really left and came back.
                            ...(a.actualOutTime ? [{ label: "Left Campus", value: formatDateTime(a.actualOutTime) }] : []),
                            ...(a.actualInTime
                              ? [{ label: "Returned to Campus", value: formatDateTime(a.actualInTime) }]
                              : a.actualOutTime && statusKey === "out"
                              ? [{ label: "Returned to Campus", value: "Not yet" }]
                              : []),
                          ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between items-start gap-3 py-0.5">
                              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider shrink-0">{label}</span>
                              <span className="text-sm font-bold text-slate-700 text-right">{value}</span>
                            </div>
                          ))}
                          {a.ticketMime && (
                            <div className="flex justify-between items-center gap-3 py-0.5">
                              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider shrink-0">Ticket</span>
                              <LeaveTicketButton id={a._id} ticketMime={a.ticketMime} />
                            </div>
                          )}
                          {a.remarks && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2.5">
                              <AlertCircle size={14} className="text-slate-500 shrink-0 mt-0.5" />
                              <p className="text-xs text-slate-600">
                                <span className="font-bold text-slate-700">
                                  {a.revokedAt ? `Revoked by the ${decidedBy || "staff"}:` : `${decidedBy || "Staff"}’s note:`}{" "}
                                </span>
                                {a.remarks}
                              </p>
                            </div>
                          )}

                          {autoApproved ? (
                            <div className="pt-3 mt-1 border-t border-emerald-100">
                              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
                                <CheckCircle2 size={12} /> Received on submission
                              </p>
                            </div>
                          ) : (
                            <ApprovalSignature
                              kind="leave"
                              id={a._id}
                              hasWarden={a.hasWardenSignature}
                              hasCaretaker={a.hasCaretakerSignature}
                              signer={a.decidedByRole === "ChiefWarden" ? "chief warden" : undefined}
                            />
                          )}
                          {(statusKey === "pending" || statusKey === "forwarded") && (
                            <div className="mt-3 pt-3 border-t border-amber-100 flex items-start gap-2.5">
                              <Loader2 size={15} className="text-amber-500 shrink-0 mt-0.5 animate-spin" />
                              <p className="text-xs font-semibold text-amber-700">
                                Awaiting approval from your caretaker, warden or chief warden. You will be notified.
                              </p>
                            </div>
                          )}
                          {statusKey === "approved" && (
                            <GateQrInstruction ready showAction className="mt-3" />
                          )}
                          {statusKey === "expired" && (
                            <div className="mt-3 pt-3 border-t border-rose-100 flex items-start gap-2.5">
                              <TimerOff size={15} className="text-rose-500 shrink-0 mt-0.5" />
                              <p className="text-xs font-semibold text-rose-600">
                                {a.decision === "Approved"
                                  ? "You did not leave on the leave date, so this leave expired at midnight. File a new one if you still need to go."
                                  : "Leave date passed before this application was acted on. File a new one if still needed."}
                              </p>
                            </div>
                          )}
                          {statusKey === "cancelled" && (
                            <div className="mt-3 pt-3 border-t border-slate-200 flex items-start gap-2.5">
                              <Ban size={15} className="text-slate-400 shrink-0 mt-0.5" />
                              <p className="text-xs font-semibold text-slate-500">You cancelled this leave application.</p>
                            </div>
                          )}
                          {(statusKey === "approved" || statusKey === "pending" || statusKey === "forwarded") && (
                            <div className="mt-4 pt-3 border-t border-slate-100">
                              {confirmCancel === a._id ? (
                                <div className="flex flex-col gap-2">
                                  <p className="text-xs font-semibold text-slate-600">Are you sure you want to cancel this application?</p>
                                  {cancelError && (
                                    <p role="alert" className="text-xs font-semibold text-rose-600">{cancelError}</p>
                                  )}
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
