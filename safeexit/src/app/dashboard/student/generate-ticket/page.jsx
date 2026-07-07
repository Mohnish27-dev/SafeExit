"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudentProfile } from "@/app/hooks/useStudentProfile";
import StudentProfileBanner from "@/app/components/student/StudentProfileBanner";
import FeatureHeroStrip from "@/app/components/student/FeatureHeroStrip";
import {
  Ticket,
  MapPin,
  Clock,
  Calendar,
  FileText,
  Phone,
  User,
  Hash,
  Building2,
  Mail,
  Train,
  Plane,
  Car,
  ChevronRight,
  CheckCircle2,
  Shield,
  AlertCircle,
  Loader2,
} from "lucide-react";
import StudentFeatureShell, {
  StudentFeaturePanel,
  StudentFeatureCentered,
} from "@/app/components/student/StudentFeatureShell";
import { apiFetch } from "@/app/lib/api";

const STEPS = ["form", "review", "success"];

const departureTimeOptions = [
  "08:00 AM", "08:30 AM", "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
  "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM",
  "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:30 PM" , "09:00 PM"
];

const returnTimeOptions = [
  "08:30 AM", "09:00 AM", "09:30 AM", "10:00 AM", "10:30 AM",
  "11:00 AM", "11:30 AM", "12:00 PM", "12:30 PM", "01:00 PM", "01:30 PM",
  "02:00 PM", "02:30 PM", "03:00 PM", "03:30 PM", "04:00 PM", "04:30 PM",
  "05:00 PM", "05:30 PM", "06:00 PM", "06:30 PM", "07:00 PM", "07:30 PM", "08:00 PM", "09:00 PM", "09:30 PM"
];

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
  const { display, hydrated } = useStudentProfile();
  const [step, setStep] = useState("form");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    destination: "",
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
  const submitErrorRef = useRef(null);

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

  const set = (key) => (event) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));

  const parseTimeToMinutes = (timeStr) => {
    if (!timeStr) return 0;
    const [time, period] = timeStr.split(" ");
    let [hours, minutes] = time.split(":").map(Number);
    if (period === "PM" && hours !== 12) hours += 12;
    if (period === "AM" && hours === 12) hours = 0;
    return hours * 60 + minutes;
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.destination.trim()) nextErrors.destination = "Destination is required";
    if (!form.timeOut) nextErrors.timeOut = "Departure time is required";
    if (!form.timeReturn) nextErrors.timeReturn = "Return time is required";
    
    if (form.timeOut) {
      const outMins = parseTimeToMinutes(form.timeOut);
      const now = new Date();
      const currentMins = now.getHours() * 60 + now.getMinutes();
      
      if (outMins < currentMins) {
        nextErrors.timeOut = "Departure time cannot be in the past";
      }
      
      if (form.timeReturn) {
        const returnMins = parseTimeToMinutes(form.timeReturn);
        if (outMins >= returnMins) {
          nextErrors.timeReturn = "Return time must be after departure time";
        }
      }
    }

    if (!form.contact || form.contact.length < 10) nextErrors.contact = "Valid contact number required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  // fetch() and JSON parsing throw low-level, browser-specific errors
  // ("Failed to fetch", "NetworkError when attempting to fetch resource.",
  // "Load failed", "Unexpected token < in JSON...") that mean nothing to a
  // student trying to submit an outing pass. This maps them to copy that
  // matches the rest of the form's error tone, while letting a message the
  // server deliberately sent back (from the res.ok check below) through
  // untouched — that one was already written for a human to read.
  const describeSubmitError = (error) => {
    if (error instanceof TypeError) {
      // The only way fetch() itself rejects: offline, DNS failure, CORS
      // block, or the server/API host being unreachable. There's no server
      // response to read a message from either way.
      return "We couldn't reach the server. Check your internet connection and try again.";
    }
    if (error.name === "AbortError") {
      return "The request took too long to respond. Please try again.";
    }
    if (error instanceof SyntaxError) {
      // res.json() failed to parse — the server responded with something
      // that wasn't valid JSON (an HTML error page from a proxy, etc.).
      return "The server sent back an unexpected response. Please try again.";
    }
    return error.message || "Something went wrong while submitting your request. Please try again.";
  };

  const handleReview = () => {
    // validate() replaces the whole errors object each call, so a stale
    // "submit" failure from a previous attempt is naturally dropped here —
    // nothing extra needed to clear it on re-entry to review.
    if (validate()) setStep("review");
  };

  const handleSubmit = async () => {
    setLoading(true);
    // Clear any stale failure from a previous attempt before retrying, so a
    // second click that succeeds doesn't leave a dead error node behind.
    setErrors((prev) => {
      if (!prev.submit) return prev;
      const { submit, ...rest } = prev;
      return rest;
    });
    try {
      const body = {
        destination: form.destination,
        purpose: form.note || "Outing",
        outTime: new Date(`${form.dateOut} ${form.timeOut}`).toISOString(),
        inTime: new Date(`${form.dateReturn} ${form.timeReturn}`).toISOString(),
      };

      // apiFetch parses JSON and throws on non-2xx (message caught below).
      const data = await apiFetch("/outing", {
        method: "POST",
        body: JSON.stringify(body),
      });

      setCreatedOuting(data);
      setLoading(false);
      setStep("success");
    } catch (error) {
      setLoading(false);
      setErrors((prev) => ({
        ...prev,
        submit: describeSubmitError(error),
      }));
    }
  };

  // A failure lands while the student is still on the review screen — pull
  // the notice into view in case the CTA sits below the fold, and hand focus
  // to it so screen readers actually announce the failure instead of it
  // sitting silently under the button.
  useEffect(() => {
    if (step === "review" && errors.submit && submitErrorRef.current) {
      submitErrorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      submitErrorRef.current.focus({ preventScroll: true });
    }
  }, [step, errors.submit]);

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
    // Trust the server's persisted status rather than recomputing the auto-approval
    // rule on the client — the backend is the source of truth the gate scanner
    // actually checks, so the success screen must reflect the same value.
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

          <div className="sf-notice mb-6 text-left">
            {isAutoApproved ? (
              <>
                <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">Your ticket has been auto-approved as your return time is on or before 5:30 PM.</p>
              </>
            ) : (
              <>
                <AlertCircle size={14} className="text-sky-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600">Warden will review your ticket. You will be notified once approved.</p>
              </>
            )}
          </div>

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
        contentClassName="space-y-4"
      >
        <StepBar current="review" />

        {hydrated && <StudentProfileBanner display={display} compact />}

        <StudentFeaturePanel className="p-6 sm:p-7 animate-scale-in" delay={60}>
          <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-5">
            <div className="w-11 h-11 rounded-xl sf-icon-ticket flex items-center justify-center">
              <Ticket size={18} className="text-white" />
            </div>
            <div>
              <p className="font-sora font-bold text-slate-800 text-lg">Outing Pass Request</p>
              <p className="text-xs text-slate-500">Verify all details before submitting</p>
            </div>
          </div>
          
          <div className="space-y-6">
            {/* Identity & Contact credentials section */}
            <div>
              <p className="sf-section-label mb-3">Verified Student Credentials</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                <span className="sf-section-label block mb-2">Additional Note to Warden</span>
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
      </StudentFeatureShell>
    );
  }

  const now = new Date();
  const isPastCutoff = now.getHours() > 19 || (now.getHours() === 19 && now.getMinutes() > 30);

  // if (isPastCutoff && step === "form") {
  //   return (
  //     <StudentFeatureShell
  //       eyebrow="New Request"
  //       title="Generate Outing Ticket"
  //       icon={Ticket}
  //       iconTone="ticket"
  //       onBack={() => router.push("/dashboard/student")}
  //       contentClassName="space-y-5"
  //     >
  //       <StudentFeaturePanel className="p-8 text-center animate-scale-in">
  //         <div className="w-20 h-20 mx-auto bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-6 shadow-lg">
  //           <AlertCircle size={40} />
  //         </div>
  //         <h2 className="font-sora text-2xl font-bold text-slate-800 mb-2">Outing Generation Closed</h2>
  //         <p className="text-slate-600 text-sm mb-8 leading-relaxed max-w-sm mx-auto">
  //           Outing requests for today can only be generated before 7:30 PM. 
  //           Please try again tomorrow.
  //         </p>
  //         <button type="button" onClick={() => router.push("/dashboard/student")} className="sf-btn-primary w-full max-w-sm mx-auto">
  //           Back to Dashboard
  //         </button>
  //       </StudentFeaturePanel>
  //     </StudentFeatureShell>
  //   );
  // }

  return (
    <StudentFeatureShell
      eyebrow="New Request"
      title="Generate Outing Ticket"
      icon={Ticket}
      iconTone="ticket"
      onBack={() => router.push("/dashboard/student")}
      contentClassName="space-y-5"
    >
      <StepBar current="form" />

      <FeatureHeroStrip
        variant="ticket"
        icon={Ticket}
        title="Digital outing pass"
        description="Fill in your trip details — warden approval follows after submit."
      />

      {hydrated && <StudentProfileBanner display={display} />}

      <StudentFeaturePanel className="p-6 sm:p-7 shadow-lg" delay={40}>
        <p className="sf-section-label mb-4">Student Information & Credentials</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

      <StudentFeaturePanel className="p-5 space-y-4" delay={80}>
        <p className="sf-section-label">Outing Details</p>

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

      </StudentFeaturePanel>

      <StudentFeaturePanel className="p-5 space-y-4" delay={120}>
        <p className="sf-section-label">Schedule</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              <Clock size={11} className="inline mr-1 text-sky-500" />
              Departure Time *
            </label>
            <select
              value={form.timeOut}
              onChange={set("timeOut")}
              className={`sf-input ${errors.timeOut ? "sf-input--error" : ""}`}
            >
              <option value="">Select time</option>
              {departureTimeOptions.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
            {errors.timeOut && <p className="text-xs text-rose-500 mt-1">{errors.timeOut}</p>}
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">
              <Clock size={11} className="inline mr-1 text-sky-500" />
              Return Time *
            </label>
            <select
              value={form.timeReturn}
              onChange={set("timeReturn")}
              className={`sf-input ${errors.timeReturn ? "sf-input--error" : ""}`}
            >
              <option value="">Select time</option>
              {returnTimeOptions.map((time) => (
                <option key={time} value={time}>{time}</option>
              ))}
            </select>
            {errors.timeReturn && <p className="text-xs text-rose-500 mt-1">{errors.timeReturn}</p>}
          </div>
        </div>
      </StudentFeaturePanel>



      <StudentFeaturePanel className="p-5 space-y-4" delay={200}>
        <p className="sf-section-label">Contact Information</p>
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
        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">Additional Note</label>
          <textarea
            rows={2}
            placeholder="Any special information for the warden..."
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
