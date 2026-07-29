"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudentProfile } from "@/app/hooks/useStudentProfile";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import StudentProfileBanner from "@/app/components/student/StudentProfileBanner";
import FeatureHeroStrip from "@/app/components/student/FeatureHeroStrip";
import {
  Ticket,
  MapPin,
  Clock,
  Phone,
  User,
  Hash,
  Mail,
  ChevronRight,
  CheckCircle2,
  Shield,
  AlertCircle,
  Loader2,
  XCircle,
} from "lucide-react";
import StudentFeatureShell, {
  StudentFeaturePanel,
  StudentFeatureCentered,
} from "@/app/components/student/StudentFeatureShell";
import { apiFetch } from "@/app/lib/api";
import CaretakerSelect from "@/app/components/student/CaretakerSelect";
import GateQrInstruction from "@/app/components/student/GateQrInstruction";
import SignatureSetupModal from "@/app/components/SignatureSetupModal";
import { isSignatureRequiredError } from "@/app/lib/signatureImage";

const STEPS = ["form", "review", "success"];

// Time checks use the campus clock, not the browser's, matching the backend.
const CAMPUS_TIMEZONE = "Asia/Kolkata";

// Minute-of-day (0..1439) in campus TZ; mirrors backend minutesOfDayInTimeZone.
const nowMinutesInCampusTZ = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  return hour * 60 + minute;
};

// UX-only mirror of backend outingRules policies — keep values in sync. Minutes since midnight.
const OUTING_POLICIES = {
  femaleNearby: { departStart: 6 * 60, departEnd: 18 * 60 + 30, returnDeadline: 20 * 60, requiresCaretaker: false },
  femaleMarket: { departStart: 6 * 60, departEnd: 15 * 60, returnDeadline: 17 * 60 + 30, requiresCaretaker: true },
  general: { departStart: 6 * 60, departEnd: 20 * 60 - 1, returnDeadline: 20 * 60, requiresCaretaker: false },
};

// Females: Nearby/Market; everyone else: 'General'. Mirrors backend normalizeOutingType.
const resolveOutingPolicy = (gender, outingType) => {
  if (gender === "Female") return outingType === "Market" ? OUTING_POLICIES.femaleMarket : OUTING_POLICIES.femaleNearby;
  return OUTING_POLICIES.general;
};

// "1110" minutes -> "6:30 PM" for window/return labels.
const clockLabel = (minutes) => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

// "14:30" (input value, 24h) -> "02:30 PM" (stored form value)
const from24Hour = (hhmm) => {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return "";
  const period = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${String(hour12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${period}`;
};

// "02:30 PM" (stored form value) -> "14:30" (input value, 24h)
const to24Hour = (timeStr) => {
  if (!timeStr) return "";
  const [time, period] = timeStr.split(" ");
  let [hours, minutes] = time.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return "";
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

function StepBar({ current }) {
  const idx = STEPS.indexOf(current);
  return (
    <div className="sf-step-bar sf-rise">
      {STEPS.map((step, i) => (
        <div
          key={step}
          className={`sf-step-segment ${
            i < idx ? "sf-step-segment--done" : i === idx ? "sf-step-segment--active" : ""
          }`}
        />
      ))}
    </div>
  );
}

export default function GenerateTicket() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const { display, hydrated } = useStudentProfile();
  const [step, setStep] = useState("form");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    destination: "",
    outingType: "Nearby", 
    dateOut: "",
    timeOut: "",
    dateReturn: "",
    timeReturn: "",
    contact: "",
    parentContact: "",
    note: "",
  });
  const [errors, setErrors] = useState({});
  const [createdOuting, setCreatedOuting] = useState(null);
  const [targetCaretakerId, setTargetCaretakerId] = useState("");
  // The signature is captured once (onboarding or profile) and stamped by the server.
  // These only drive the read-only confirmation strip and the one-time setup fallback
  // for accounts that predate that flow.
  const [mySignature, setMySignature] = useState(null);
  const [needsSignature, setNeedsSignature] = useState(false);
  // True only when the setup modal was opened by a rejected submit, so signing resumes
  // that submit. When the modal was opened pre-emptively on entering review, signing
  // must not fire a submit the student never asked for.
  const resumeSubmitRef = useRef(false);

  const [activeOuting, setActiveOuting] = useState(null);
  const [checkingActive, setCheckingActive] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const submitErrorRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/outing/myrequests");
        if (cancelled) return;
        const active = Array.isArray(data)
          ? data.find((o) => ["Pending", "Forwarded", "Approved", "Out"].includes(o.status))
          : null;
        setActiveOuting(active || null);
      } catch {
        // If the check fails, fall through to the form — the backend is the gate.
      } finally {
        if (!cancelled) setCheckingActive(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCancelActive = async () => {
    if (!activeOuting || cancelling) return;
    setCancelling(true);
    try {
      await apiFetch(`/outing/${activeOuting._id}/cancel`, { method: "PATCH" });
      setActiveOuting(null);
    } catch {
      // leave the block visible; user can navigate to My Outings
    } finally {
      setCancelling(false);
    }
  };

  const handleCancelCreated = async () => {
    if (!createdOuting || cancelling) return;
    setCancelling(true);
    try {
      await apiFetch(`/outing/${createdOuting._id}/cancel`, { method: "PATCH" });
      router.push("/dashboard/student/my-outings");
    } catch {
      // stay on the success screen; user can retry or view My Outings
    } finally {
      setCancelling(false);
    }
  };

  useEffect(() => {
    if (!hydrated) return;
    const digits = String(display.mobile || "").replace(/\D/g, "");
    
    const today = new Date();
    const formattedDate = today.toLocaleDateString("en-US", {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    setForm((prev) => ({ 
      ...prev, 
      contact: digits.length >= 10 ? digits.slice(-10) : prev.contact,
      dateOut: prev.dateOut || formattedDate,
      dateReturn: prev.dateReturn || formattedDate
    }));
  }, [hydrated, display.mobile]);

  // Gender picks the rule set; UX-only — the backend re-derives from the trusted user doc.
  const gender = display.gender;
  const isFemale = gender === "Female";
  const activePolicy = resolveOutingPolicy(gender, form.outingType);

  const set = (key) => (event) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));

  // Store <input type="time"> values as "hh:mm AM/PM".
  const setTime = (key) => (event) =>
    setForm((value) => ({ ...value, [key]: from24Hour(event.target.value) }));

  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [time, period] = timeStr.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const buildTodayISOFromMinutes = (totalMinutes) => {
    const when = new Date();
    when.setHours(Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
    return when.toISOString();
  };

  const buildTodayISO = (timeStr) => buildTodayISOFromMinutes(parseTimeToMinutes(timeStr));

  const validate = () => {
    const nextErrors = {};
    if (!form.destination.trim()) nextErrors.destination = "Destination is required";
    if (!form.timeOut) nextErrors.timeOut = "Departure time is required";

    if (form.timeOut) {
      const outMins = parseTimeToMinutes(form.timeOut);
      // "Past" is judged on the campus clock (IST), matching the backend.
      const currentMins = nowMinutesInCampusTZ();

      if (outMins < currentMins) {
        nextErrors.timeOut = "Departure time cannot be in the past";
      } else if (outMins < activePolicy.departStart || outMins > activePolicy.departEnd) {
        nextErrors.timeOut = `Departure must be between ${clockLabel(activePolicy.departStart)} and ${clockLabel(activePolicy.departEnd)}`;
      }
    }

    if (!form.contact || form.contact.length < 10) nextErrors.contact = "Valid contact number required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };
  const describeSubmitError = (error) => {
    if (error instanceof TypeError) {
      // fetch() itself rejected: offline / DNS / CORS / host unreachable.
      return "We couldn't reach the server. Check your internet connection and try again.";
    }
    if (error.name === "AbortError") {
      return "The request took too long to respond. Please try again.";
    }
    if (error instanceof SyntaxError) {
      // Response wasn't valid JSON (e.g. proxy HTML error page).
      return "The server sent back an unexpected response. Please try again.";
    }
    return error.message || "Something went wrong while submitting your request. Please try again.";
  };

  const handleReview = () => {
    if (validate()) {
      // Stamp the policy-fixed return time so review/success show the server's deadline.
      setForm((value) => ({
        ...value,
        timeReturn: clockLabel(activePolicy.returnDeadline),
        dateReturn: value.dateReturn || value.dateOut,
      }));
      setStep("review");
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    // Clear stale submit failure before retrying.
    setErrors((prev) => {
      if (!prev.submit) return prev;
      const { submit, ...rest } = prev;
      return rest;
    });
    try {
      const body = {
        destination: form.destination,
        purpose: form.note || "Outing",
        // Return time is NOT sent — the server fixes it from policy.
        outingType: isFemale ? form.outingType : "General",
        outTime: buildTodayISO(form.timeOut),
        // No signature in the body — the server stamps the student's saved one.
        // Only caretaker-gated outings route to a chosen caretaker; server ignores it otherwise.
        ...(activePolicy.requiresCaretaker && targetCaretakerId ? { targetCaretakerId } : {}),
      };

      const data = await apiFetch("/outing", {
        method: "POST",
        body: JSON.stringify(body),
      });

      setCreatedOuting(data);
      setLoading(false);
      setStep("success");
    } catch (error) {
      setLoading(false);
      // Not a form error — the account has no saved signature yet. The server rejects
      // before creating anything, so capturing one and retrying is safe.
      if (isSignatureRequiredError(error)) {
        resumeSubmitRef.current = true;
        setNeedsSignature(true);
        return;
      }
      setErrors((prev) => ({
        ...prev,
        submit: describeSubmitError(error),
      }));
    }
  };

  // Pull the saved signature when the review step opens, so it can be shown above the
  // submit button. Also pre-opens the setup modal for accounts that never captured one,
  // instead of letting them press Submit and bounce off a 428.
  useEffect(() => {
    if (step !== "review" || mySignature) return;
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
    if (step === "review" && errors.submit && submitErrorRef.current) {
      submitErrorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      submitErrorRef.current.focus({ preventScroll: true });
    }
  }, [step, errors.submit]);

  if (!checked || !authorized || checkingActive) return <AuthLoading />;

  if (activeOuting && step !== "success") {
    const activeTicketId = `SE-${String(activeOuting._id).slice(-6).toUpperCase()}`;
    const isOut = activeOuting.status === "Out";
    const isForwarded = activeOuting.status === "Forwarded";
    const statusLabel = isOut ? "Outside" : isForwarded ? "With warden" : activeOuting.status;

    return (
      <StudentFeatureCentered>
        <StudentFeaturePanel className="p-8 text-center animate-scale-in">
          <div className="w-20 h-20 rounded-full bg-linear-to-br from-amber-100 to-orange-100 flex items-center justify-center mx-auto mb-6 shadow-lg">
            <AlertCircle size={40} className="text-amber-500" />
          </div>
          <p className="sf-eyebrow mb-1">One pass at a time</p>
          <h2 className="font-sora text-2xl font-bold sf-gradient-text mb-1">
            You already have an active outing
          </h2>
          <p className="text-slate-500 text-sm mb-6">
            {isOut
              ? "You're currently marked outside campus. Log your entry at the gate before requesting a new outing."
              : isForwarded
              ? "Your request is with the warden for a decision. Wait for the outcome or cancel it before generating a new outing ticket."
              : "Complete that journey or cancel your current request before generating a new outing ticket."}
          </p>

          <div className="rounded-2xl p-6 mb-6 text-left space-y-4 bg-linear-to-br from-slate-50 to-amber-50/50 border border-slate-100 shadow-sm">
            {[
              { label: "Ticket ID", value: activeTicketId, highlight: true },
              { label: "Destination", value: activeOuting.destination },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</span>
                <span className={`text-base font-bold ${highlight ? "sf-gradient-text" : "text-slate-700"}`}>{value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Status</span>
              <span className="text-xs font-bold text-amber-800 bg-linear-to-r from-amber-100 to-amber-50 rounded-full px-3.5 py-1.5 border border-amber-200 shadow-xs">
                {statusLabel}
              </span>
            </div>
          </div>

          {activeOuting.status === "Approved" && (
            <GateQrInstruction ready showAction className="mb-6" />
          )}

          <button
            type="button"
            onClick={() => router.push("/dashboard/student/my-outings")}
            className="sf-btn-primary w-full mb-3"
          >
            View My Outings
          </button>
          {!isOut && (
            <button
              type="button"
              onClick={handleCancelActive}
              disabled={cancelling}
              className="sf-btn-danger w-full mb-3 disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {cancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
              {cancelling ? "Cancelling…" : "Cancel Outing"}
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push("/dashboard/student")}
            className="sf-btn-secondary w-full"
          >
            Back to Dashboard
          </button>
        </StudentFeaturePanel>
      </StudentFeatureCentered>
    );
  }

  const destLabel = form.destination;
  const ticketId = createdOuting ? `SE-${String(createdOuting._id).slice(-6).toUpperCase()}` : "SE-" + Math.random().toString(36).substring(2, 8).toUpperCase();

  const studentFields = [
    {
      icon: User,
      label: "Full Name",
      val: display.name,
      badge: "Identity",
      desc: "Registered name of student",
      theme: "from-indigo-500 to-indigo-600 bg-indigo-50/50 text-indigo-700 border-indigo-100",
      iconColor: "text-indigo-600",
    },
    {
      icon: Hash,
      label: "Roll Number",
      val: display.rollNo,
      badge: "ID Number",
      desc: "Unique college roll identifier",
      theme: "from-amber-500 to-amber-600 bg-amber-50/50 text-amber-700 border-amber-100",
      iconColor: "text-amber-600",
    },
    {
      icon: Mail,
      label: "College Email",
      val: display.email,
      badge: "Official Mail",
      desc: "Official university email address",
      theme: "from-sky-500 to-sky-600 bg-sky-50/50 text-sky-700 border-sky-100",
      iconColor: "text-sky-600",
    },
    {
      icon: Phone,
      label: "Registered Mobile",
      val: display.mobile,
      badge: "Contact",
      desc: "Registered mobile number",
      theme: "from-emerald-500 to-emerald-600 bg-emerald-50/50 text-emerald-700 border-emerald-100",
      iconColor: "text-emerald-600",
    },
  ];

  if (step === "success") {
    const isAutoApproved = createdOuting?.status === "Approved";

    return (
      <StudentFeatureCentered>
        <StudentFeaturePanel className="sf-success-ticket p-8 text-center animate-scale-in">
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 rounded-full bg-linear-to-br from-emerald-100 to-teal-100 flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 size={40} className="text-emerald-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-linear-to-br from-indigo-500 to-cyan-400 flex items-center justify-center animate-bounce-soft shadow-md">
              <Ticket size={12} className="text-white" />
            </div>
          </div>
          <p className="sf-eyebrow mb-1">Pass Issued</p>
          <h2 className="font-sora text-2xl font-bold sf-gradient-text mb-1">Ticket Generated</h2>
          <p className="text-slate-500 text-sm mb-6">
            {display.name}&rsquo;s outing request has been submitted{isAutoApproved ? " and auto-approved" : " for approval"}.
          </p>

          <div className="rounded-2xl p-6 mb-6 text-left space-y-4 bg-linear-to-br from-slate-50 to-sky-50/60 border border-slate-100 shadow-sm">
            {[
              { label: "Ticket ID", value: ticketId, highlight: true },
              { label: "Destination", value: destLabel },
              { label: "Departure", value: `${form.dateOut} · ${form.timeOut}` },
              { label: "Return", value: `${form.dateReturn} · ${form.timeReturn}` },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</span>
                <span className={`text-base font-bold ${highlight ? "sf-gradient-text" : "text-slate-700"}`}>{value}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Status</span>
              {isAutoApproved ? (
                <>
                  <span className="text-xs font-bold text-emerald-800 bg-linear-to-r from-emerald-100 to-emerald-50 rounded-full px-3.5 py-1.5 border border-emerald-200 shadow-xs">
                    Approved
                  </span>
                  <div className="h-2" />
                  <button type="button" onClick={() => router.push("/dashboard/student/my-outings")} className="sf-btn-secondary w-full">
                    View My Outings
                  </button>
                </>
              ) : (
                <span className="text-xs font-bold text-amber-800 bg-linear-to-r from-amber-100 to-amber-50 rounded-full px-3.5 py-1.5 border border-amber-200 shadow-xs">
                  Pending Approval
                </span>
              )}
            </div>
          </div>

          {isAutoApproved ? (
            <GateQrInstruction ready showAction className="mb-6" />
          ) : (
            <GateQrInstruction className="mb-6" />
          )}

          <button
            type="button"
            onClick={handleCancelCreated}
            disabled={cancelling}
            className="sf-btn-danger w-full mb-3 disabled:opacity-45 disabled:cursor-not-allowed"
          >
            {cancelling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
            {cancelling ? "Cancelling…" : "Cancel Outing"}
          </button>
          <button type="button" onClick={() => router.push("/dashboard/student")} className="sf-btn-primary w-full">
            Back to Dashboard
          </button>
        </StudentFeaturePanel>
      </StudentFeatureCentered>
    );
  }

  if (step === "review") {
    return (
      <StudentFeatureShell
        eyebrow="Step 2 of 2"
        title="Confirm Outing Details"
        icon={Ticket}
        iconTone="ticket"
        onBack={() => setStep("form")}
        contentClassName="space-y-3 sm:space-y-4"
      >
        <StepBar current="review" />

        {hydrated && <StudentProfileBanner display={display} compact />}

        <StudentFeaturePanel className="p-4 sm:p-7 animate-scale-in" delay={60}>
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4 sm:pb-4 sm:mb-5">
            <div className="w-11 h-11 rounded-xl sf-icon-ticket flex items-center justify-center">
              <Ticket size={18} className="text-white" />
            </div>
            <div>
              <p className="font-sora font-bold text-slate-800 text-lg">Outing Pass Request</p>
              <p className="text-xs text-slate-500">Verify all details before submitting</p>
            </div>
          </div>

          <div className="space-y-4 sm:space-y-6">
            {/* Identity & Contact credentials section */}
            <div>
              <p className="sf-section-label mb-3">Verified Student Credentials</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                {[
                  { label: "Roll Number", value: display.rollNo, icon: Hash, border: "border-l-4 border-amber-400 bg-amber-50/30" },
                  { label: "Official Email", value: display.email, icon: Mail, border: "border-l-4 border-sky-400 bg-sky-50/30" },
                  { label: "Reg. Mobile", value: display.mobile, icon: Phone, border: "border-l-4 border-emerald-400 bg-emerald-50/30" },
                ].map(({ label, value, icon: Icon, border }) => (
                  <div key={label} className={`rounded-xl p-3 border border-slate-100/80 ${border} flex items-start gap-2.5`}>
                    <Icon size={14} className="mt-0.5 text-slate-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{label}</p>
                      <p className="text-xs font-bold text-slate-800 truncate mt-0.5">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Outing details section */}
            <div className="border-t border-slate-100/80 pt-5">
              <p className="sf-section-label mb-3">Trip Information</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
                {[
                  { label: "Student Name", value: display.name },
                  { label: "Room / Hostel", value: `${display.room} · ${display.hostel}` },
                  { label: "Destination", value: destLabel, highlight: true },
                  { label: "Departure Time", value: `${form.dateOut} at ${form.timeOut}` },
                  { label: "Return Time", value: `${form.dateReturn} at ${form.timeReturn}` },
                  { label: "Primary Contact", value: form.contact },
                  { label: "Parent's Contact", value: form.parentContact || "Not provided" },
                ].map(({ label, value, highlight }) => (
                  <div key={label} className="flex justify-between items-center gap-3 py-1.5 border-b border-slate-50 last:border-0 sm:border-0 sm:py-0">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
                    <span className={`text-sm font-bold text-right ${highlight ? "text-indigo-600 bg-indigo-50/80 px-2 py-0.5 rounded" : "text-slate-800"}`}>
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {form.note && (
              <div className="pt-4 border-t border-slate-100/80">
                <span className="sf-section-label block mb-2">Additional Note to Caretaker</span>
                <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3.5 border border-slate-100/60 leading-relaxed">{form.note}</p>
              </div>
            )}
          </div>
        </StudentFeaturePanel>

        {errors.submit && (
          <div
            ref={submitErrorRef}
            tabIndex={-1}
            role="alert"
            className="sf-notice sf-notice--danger animate-notice-in"
          >
            <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-bold text-rose-700">Submission failed</p>
              <p className="text-xs text-rose-600 mt-0.5">{errors.submit}</p>
            </div>
          </div>
        )}

        <div className="sf-notice sf-notice--warn">
          <Shield size={14} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800">
            By submitting, you confirm the information above is accurate. False information may result in disciplinary action.
          </p>
        </div>

        {mySignature && (
          <StudentFeaturePanel className="p-4 sm:p-5" delay={80}>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              Signing as {display.name}
            </p>
            {/* White background so the transparent PNG reads correctly. */}
            <div className="rounded-2xl border border-slate-200 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mySignature} alt="Your signature" className="mx-auto h-14 w-auto" />
            </div>
            <p className="mt-1.5 text-[11px] text-slate-400">
              Your saved signature is attached automatically.
            </p>
          </StudentFeaturePanel>
        )}

        <div className="flex gap-3 sf-rise sf-stagger-3">
          <button type="button" onClick={() => setStep("form")} className="sf-btn-secondary flex-1">
            Edit Details
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading}
            className="sf-btn-primary flex-1"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Submitting...
              </>
            ) : errors.submit ? (
              "Try Again"
            ) : (
              "Submit Request"
            )}
          </button>
        </div>

        <SignatureSetupModal
          open={needsSignature}
          dismissible={false}
          title="Add your signature"
          description="Your signature goes on every outing pass. You only set this up once."
          onSaved={(sig) => {
            setMySignature(sig);
            setNeedsSignature(false);
            if (resumeSubmitRef.current) {
              resumeSubmitRef.current = false;
              handleSubmit();
            }
          }}
        />
      </StudentFeatureShell>
    );
  }

  return (
    <StudentFeatureShell
      eyebrow="New Request"
      title="Generate Outing Ticket"
      icon={Ticket}
      iconTone="ticket"
      onBack={() => router.push("/dashboard/student")}
      contentClassName="space-y-3 sm:space-y-5"
    >
      <StepBar current="form" />

      {/* Decorative intro — desktop only */}
      <div className="hidden sm:block">
        <FeatureHeroStrip
          variant="ticket"
          icon={Ticket}
          title="Digital outing pass"
          description="Fill in your trip details — caretaker approval follows after submit."
        />
      </div>

      {hydrated && <StudentProfileBanner display={display} compact />}

      {/* Full credentials panel — desktop only */}
      <StudentFeaturePanel className="hidden md:block p-6 sm:p-7 shadow-lg" delay={40}>
        <p className="sf-section-label mb-4">Student Information & Credentials</p>
        <div className="grid grid-cols-2 gap-4">
          {studentFields.map(({ icon: Icon, label, val, badge, desc, theme }) => (
            <div
              key={label}
              className="flex items-start gap-4 rounded-2xl p-4.5 bg-white border border-slate-100/90 shadow-xs transition-all duration-300 sf-panel-lift"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${theme.split(" ")[0]} ${theme.split(" ")[1]} flex items-center justify-center shadow-md shadow-slate-200 shrink-0 text-white`}>
                <Icon size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="sf-info-grid-label !text-slate-400 !font-semibold m-0">{label}</p>
                  <span className={`text-[9px] font-bold rounded-full px-2 py-0.5 border ${theme.split(" ").slice(2).join(" ")}`}>
                    {badge}
                  </span>
                </div>
                <p className="sf-info-grid-value truncate !text-slate-800 !font-bold text-base mt-0.5">{val}</p>
                <p className="text-[11px] text-slate-400 font-medium mt-1 leading-normal">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </StudentFeaturePanel>

      <StudentFeaturePanel className="p-4 sm:p-5 space-y-3 sm:space-y-4" delay={80}>
        <p className="sf-section-label">Outing Details</p>

        {isFemale && (
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              <Ticket size={11} className="inline mr-1 text-sky-500" />
              Outing Type *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "Nearby", title: "Nearby", desc: "Walk to a café / to eat" },
                { key: "Market", title: "Local Market", desc: "Trip to the city market" },
              ].map((opt) => {
                const selected = form.outingType === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setForm((v) => ({ ...v, outingType: opt.key }))}
                    className={`text-left rounded-2xl p-3.5 border transition-all ${
                      selected
                        ? "border-sky-400 bg-sky-50/70 shadow-xs ring-1 ring-sky-200"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <p className={`text-sm font-bold ${selected ? "text-sky-700" : "text-slate-700"}`}>{opt.title}</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5 leading-normal">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
            <div className="sf-notice sf-notice--warn mt-3">
              <AlertCircle size={13} className="text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                {form.outingType === "Market"
                  ? "Local market outings need caretaker approval. Leave between 6:00 AM and 3:00 PM; you must return by 5:30 PM."
                  : "Nearby outings are auto-approved. Leave between 6:00 AM and 6:30 PM; you must return by 8:00 PM."}
              </p>
            </div>
          </div>
        )}


        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">
            <MapPin size={11} className="inline mr-1 text-sky-500" />
            Destination *
          </label>
          <input
            type="text"
            placeholder="Enter destination name"
            value={form.destination}
            onChange={set("destination")}
            className={`sf-input ${errors.destination ? "sf-input--error" : ""}`}
          />
          {errors.destination && <p className="text-xs text-rose-500 mt-1">{errors.destination}</p>}
        </div>

        {activePolicy.requiresCaretaker && (
          <CaretakerSelect value={targetCaretakerId} onChange={setTargetCaretakerId} />
        )}

      </StudentFeaturePanel>

      <StudentFeaturePanel className="p-4 sm:p-5 space-y-3 sm:space-y-4" delay={120}>
        <p className="sf-section-label">Schedule</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              <Clock size={11} className="inline mr-1 text-sky-500" />
              Departure Time *
            </label>
            <input
              type="time"
              value={to24Hour(form.timeOut)}
              onChange={setTime("timeOut")}
              className={`sf-input ${errors.timeOut ? "sf-input--error" : ""}`}
            />
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Allowed: {clockLabel(activePolicy.departStart)} – {clockLabel(activePolicy.departEnd)}
            </p>
            {errors.timeOut && <p className="text-xs text-rose-500 mt-1">{errors.timeOut}</p>}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              <Clock size={11} className="inline mr-1 text-sky-500" />
              Return By (fixed)
            </label>
            {/* Return time is set by the college rule, not chosen by the student. */}
            <div className="sf-input flex items-center bg-slate-50 text-slate-700 font-semibold cursor-not-allowed">
              {clockLabel(activePolicy.returnDeadline)}
            </div>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              Caretaker is alerted if you are not back by this time.
            </p>
          </div>
        </div>
      </StudentFeaturePanel>



      <StudentFeaturePanel className="p-4 sm:p-5 space-y-3 sm:space-y-4" delay={200}>
        <p className="sf-section-label">Contact Information</p>
        <div className="grid grid-cols-1 gap-3 sm:gap-4 min-[420px]:grid-cols-2">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              <Phone size={11} className="inline mr-1 text-sky-500" />
              Your Mobile Number *
            </label>
            <input
              type="tel"
              maxLength={10}
              placeholder="10-digit mobile number"
              value={form.contact}
              onChange={set("contact")}
              className={`sf-input ${errors.contact ? "sf-input--error" : ""}`}
            />
            {errors.contact && <p className="text-xs text-rose-500 mt-1">{errors.contact}</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              <Phone size={11} className="inline mr-1 text-sky-500" />
              Parent / Guardian Contact
            </label>
            <input
              type="tel"
              maxLength={10}
              placeholder="Optional"
              value={form.parentContact}
              onChange={set("parentContact")}
              className="sf-input"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">Additional Note</label>
          <textarea
            rows={2}
            placeholder="Any special information for the caretaker..."
            value={form.note}
            onChange={set("note")}
            className="sf-input resize-none"
          />
        </div>
      </StudentFeaturePanel>

      <div className="sf-notice sf-rise sf-stagger-3">
        <Shield size={15} className="text-sky-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          Your contact number is securely stored and only accessible to authorized college staff.
        </p>
      </div>

      <button type="button" onClick={handleReview} className="sf-btn-primary w-full sf-rise sf-stagger-4">
        Review & Continue
        <ChevronRight size={16} />
      </button>

      <div className="h-4" />
    </StudentFeatureShell>
  );
}
