"use client";

import { useEffect, useState } from "react";
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

const destinations = [
  "City Library",
  "Apollo Hospital",
  "Railway Station",
  "Bus Stand",
  "Shopping Mall",
  "Home Town",
  "Bank / ATM",
  "Medical Shop",
  "Other",
];

const transportModes = [
  { icon: Train, label: "Train", value: "train" },
  { icon: Plane, label: "Flight", value: "flight" },
  { icon: Car, label: "Cab / Bus", value: "cab" },
];

const STEPS = ["form", "review", "success"];

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
    customDest: "",
    purpose: "",
    dateOut: "",
    timeOut: "",
    dateReturn: "",
    timeReturn: "",
    transport: "",
    contact: "",
    parentContact: "",
    note: "",
  });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!hydrated) return;
    const digits = String(display.mobile || "").replace(/\D/g, "");
    if (digits.length >= 10) {
      setForm((prev) => ({ ...prev, contact: digits.slice(-10) }));
    }
  }, [hydrated, display.mobile]);

  const set = (key) => (event) =>
    setForm((value) => ({ ...value, [key]: event.target.value }));

  const validate = () => {
    const nextErrors = {};
    if (!form.destination) nextErrors.destination = "Destination is required";
    if (form.destination === "Other" && !form.customDest) nextErrors.customDest = "Please specify destination";
    if (!form.purpose.trim()) nextErrors.purpose = "Purpose is required";
    if (!form.dateOut) nextErrors.dateOut = "Departure date is required";
    if (!form.timeOut) nextErrors.timeOut = "Departure time is required";
    if (!form.dateReturn) nextErrors.dateReturn = "Return date is required";
    if (!form.timeReturn) nextErrors.timeReturn = "Return time is required";
    if (!form.contact || form.contact.length < 10) nextErrors.contact = "Valid contact number required";
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleReview = () => {
    if (validate()) setStep("review");
  };

  const handleSubmit = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 2000));
    setLoading(false);
    setStep("success");
  };

  const destLabel = form.destination === "Other" ? form.customDest : form.destination;
  const ticketId = "SE-" + Math.random().toString(36).substring(2, 8).toUpperCase();

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
            {display.name}&rsquo;s outing request has been submitted for approval.
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
              <span className="text-xs font-bold text-amber-800 bg-linear-to-r from-amber-100 to-amber-50 rounded-full px-3.5 py-1.5 border border-amber-200 shadow-xs">
                Pending Approval
              </span>
            </div>
          </div>

          <div className="sf-notice mb-6 text-left">
            <AlertCircle size={14} className="text-sky-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">Warden will review your ticket. You will be notified once approved.</p>
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
                  { label: "Purpose", value: form.purpose },
                  { label: "Departure Time", value: `${form.dateOut} at ${form.timeOut}` },
                  { label: "Return Time", value: `${form.dateReturn} at ${form.timeReturn}` },
                  { label: "Transport Mode", value: form.transport || "Not specified" },
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
            ) : (
              "Submit Request"
            )}
          </button>
        </div>
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
          <select
            value={form.destination}
            onChange={set("destination")}
            className={`sf-input ${errors.destination ? "sf-input--error" : ""}`}
          >
            <option value="">Select destination</option>
            {destinations.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          {errors.destination && <p className="text-xs text-rose-500 mt-1">{errors.destination}</p>}
        </div>

        {form.destination === "Other" && (
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1.5">Specify Destination *</label>
            <input
              type="text"
              placeholder="Enter destination name"
              value={form.customDest}
              onChange={set("customDest")}
              className={`sf-input ${errors.customDest ? "sf-input--error" : ""}`}
            />
            {errors.customDest && <p className="text-xs text-rose-500 mt-1">{errors.customDest}</p>}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-slate-600 block mb-1.5">
            <FileText size={11} className="inline mr-1 text-sky-500" />
            Purpose of Outing *
          </label>
          <input
            type="text"
            placeholder="e.g. Medical appointment, Travel home..."
            value={form.purpose}
            onChange={set("purpose")}
            className={`sf-input ${errors.purpose ? "sf-input--error" : ""}`}
          />
          {errors.purpose && <p className="text-xs text-rose-500 mt-1">{errors.purpose}</p>}
        </div>
      </StudentFeaturePanel>

      <StudentFeaturePanel className="p-5 space-y-4" delay={120}>
        <p className="sf-section-label">Schedule</p>
        <div className="grid grid-cols-2 gap-3">
          {[
            { key: "dateOut", label: "Departure Date", icon: Calendar, type: "date", err: errors.dateOut },
            { key: "timeOut", label: "Departure Time", icon: Clock, type: "time", err: errors.timeOut },
            { key: "dateReturn", label: "Return Date", icon: Calendar, type: "date", err: errors.dateReturn },
            { key: "timeReturn", label: "Return Time", icon: Clock, type: "time", err: errors.timeReturn },
          ].map(({ key, label, icon: Icon, type, err }) => (
            <div key={key}>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5">
                <Icon size={11} className="inline mr-1 text-sky-500" />
                {label} *
              </label>
              <input
                type={type}
                value={form[key]}
                onChange={set(key)}
                className={`sf-input ${err ? "sf-input--error" : ""}`}
              />
              {err && <p className="text-xs text-rose-500 mt-1">{err}</p>}
            </div>
          ))}
        </div>
      </StudentFeaturePanel>

      <StudentFeaturePanel className="p-5 space-y-3" delay={160}>
        <p className="sf-section-label">Mode of Transport</p>
        <div className="grid grid-cols-3 gap-2">
          {transportModes.map(({ icon: Icon, label, value }) => (
            <button
              key={value}
              type="button"
              onClick={() => setForm((v) => ({ ...v, transport: value }))}
              className={`sf-transport-btn ${form.transport === value ? "sf-transport-btn--selected" : ""}`}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
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
