"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Siren,
  Shield,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Users,
  Radio,
  HeartPulse,
  Lock,
  Eye,
  X,
} from "lucide-react";
import StudentFeatureShell, {
  StudentFeaturePanel,
  StudentFeatureCentered,
} from "@/app/components/student/StudentFeatureShell";
import StudentProfileBanner from "@/app/components/student/StudentProfileBanner";
import FeatureHeroStrip from "@/app/components/student/FeatureHeroStrip";
import { useStudentProfile } from "@/app/hooks/useStudentProfile";
import { apiFetch } from "@/app/lib/api";

const alertTypes = [
  {
    type: "harassment",
    label: "Harassment / Threat",
    desc: "Being followed, threatened, or harassed",
    color: "text-rose-600",
    selectedBg: "bg-rose-50 border-rose-300",
    icon: Shield,
  },
  {
    type: "medical",
    label: "Medical Emergency",
    desc: "Injury, illness, or urgent health issue",
    color: "text-orange-600",
    selectedBg: "bg-orange-50 border-orange-300",
    icon: HeartPulse,
  },
  {
    type: "unsafe",
    label: "Unsafe Location",
    desc: "Stranded or in an unsafe environment",
    color: "text-amber-600",
    selectedBg: "bg-amber-50 border-amber-300",
    icon: AlertTriangle,
  },
  {
    type: "stalking",
    label: "Online Stalking",
    desc: "Data misuse, contact info leaked, DMs from strangers",
    color: "text-sky-700",
    selectedBg: "bg-sky-50 border-sky-300",
    icon: Eye,
  },
  {
    type: "other",
    label: "Other Emergency",
    desc: "Any other situation requiring immediate help",
    color: "text-slate-600",
    selectedBg: "bg-slate-50 border-slate-300",
    icon: Radio,
  },
];

const contacts = [
  { name: "Warden Mrs. Priya Singh", role: "Hostel Warden", phone: "+91 98001 12345", available: true },
  { name: "Campus Security", role: "Security Desk", phone: "+91 98001 99999", available: true },
  { name: "College Administration", role: "Admin Office", phone: "+91 98001 11111", available: false },
];

export default function SOSAlert() {
  const router = useRouter();
  const { display, hydrated } = useStudentProfile();
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [stage, setStage] = useState("idle");
  const [alertId, setAlertId] = useState("");

  const [sendError, setSendError] = useState("");

  const handleSend = async () => {
    setStage("sending");
    setSendError("");
    try {
      // Persist the alert so wardens / admins see it live in their console.
      const alert = await apiFetch("/sos", {
        method: "POST",
        body: JSON.stringify({ type: selected, note }),
      });
      setAlertId("SOS-" + String(alert._id).slice(-6).toUpperCase());
      setStage("sent");
    } catch (err) {
      // Don't trap the student on the spinner if the network blips — still confirm
      // locally, but record that the dispatch could not be saved.
      setSendError(err.message || "Could not reach the server");
      setAlertId("SOS-" + Math.random().toString(36).substring(2, 8).toUpperCase());
      setStage("sent");
    }
  };

  if (stage === "sent") {
    return (
      <StudentFeatureCentered className="student-feature-page--emergency">
        <StudentFeaturePanel className="p-8 text-center animate-scale-in border-rose-100">
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 rounded-full bg-linear-to-br from-rose-100 to-pink-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={40} className="text-rose-500" />
            </div>
            <div className="sos-glow absolute inset-0 rounded-full opacity-30" />
          </div>
          <p className="sf-eyebrow text-rose-500 mb-1">Alert Dispatched</p>
          <h2 className="font-sora text-2xl font-bold sf-gradient-text--danger mb-2">Help is on the way</h2>
          <p className="text-slate-500 text-sm mb-6">Your emergency alert has been sent to all designated contacts.</p>

          <div className="rounded-2xl p-4 mb-4 text-left space-y-2.5 bg-linear-to-br from-rose-50 to-pink-50 border border-rose-100">
            {[
              { label: "Alert ID", value: alertId, highlight: true },
              { label: "Type", value: alertTypes.find((a) => a.type === selected)?.label },
              { label: "Time", value: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) },
              { label: "Notified", value: "Warden + Security", success: true },
            ].map(({ label, value, highlight, success }) => (
              <div key={label} className="flex justify-between">
                <span className="text-xs text-slate-400 font-semibold">{label}</span>
                <span
                  className={`text-sm font-bold ${
                    highlight ? "text-rose-600" : success ? "text-emerald-600" : "text-slate-700"
                  }`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>

          <div className="sf-notice sf-notice--warn mb-6 text-left">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">Stay in a safe location. Warden and security will reach you shortly.</p>
          </div>

          {sendError && (
            <div className="sf-notice sf-notice--warn mb-6 text-left border-rose-200 bg-rose-50">
              <AlertTriangle size={14} className="text-rose-600 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-700">
                Alert shown locally, but could not be saved to the server ({sendError}). Please call your contacts directly.
              </p>
            </div>
          )}

          <div className="space-y-2 mb-6">
            {contacts
              .filter((c) => c.available)
              .map((c) => (
                <a
                  key={c.phone}
                  href={`tel:${c.phone}`}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white/90 hover:bg-white transition-all hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-700">{c.name}</p>
                    <p className="text-xs text-slate-400">{c.role}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-sky-600">{c.phone}</span>
                    <Phone size={13} className="text-sky-500" />
                  </div>
                </a>
              ))}
          </div>

          <button type="button" onClick={() => router.push("/dashboard/student")} className="sf-btn-danger w-full">
            Back to Dashboard
          </button>
        </StudentFeaturePanel>
      </StudentFeatureCentered>
    );
  }

  if (stage === "confirm") {
    return (
      <StudentFeatureCentered className="student-feature-page--emergency">
        <StudentFeaturePanel className="p-8 text-center animate-scale-in">
          <div className="relative inline-block mb-4">
            <div className="w-20 h-20 rounded-full bg-rose-100 flex items-center justify-center mx-auto sos-glow">
              <Siren size={36} className="text-rose-500" />
            </div>
          </div>
          <h2 className="font-sora text-xl font-bold text-slate-800 mb-2">Confirm SOS Alert</h2>
          <p className="text-sm text-slate-500 mb-4">This will immediately notify your warden and campus security.</p>
          <div className="rounded-xl p-3 mb-6 border border-rose-200 bg-linear-to-br from-rose-50 to-pink-50">
            <p className="text-sm font-semibold text-rose-700">
              {alertTypes.find((a) => a.type === selected)?.label}
            </p>
            {note && <p className="text-xs text-slate-500 mt-1 italic">&ldquo;{note}&rdquo;</p>}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={() => setStage("idle")} className="sf-btn-secondary flex-1">
              <X size={14} />
              Cancel
            </button>
            <button type="button" onClick={handleSend} className="sf-btn-danger flex-1 sf-btn-danger--pulse">
              <Siren size={14} />
              Send SOS
            </button>
          </div>
        </StudentFeaturePanel>
      </StudentFeatureCentered>
    );
  }

  if (stage === "sending") {
    return (
      <StudentFeatureCentered className="student-feature-page--emergency">
        <div className="text-center animate-fade-in">
          <div className="relative w-24 h-24 mx-auto mb-6">
            <div className="absolute inset-0 rounded-full bg-rose-200 animate-pulse-ring" />
            <div className="absolute inset-0 rounded-full bg-rose-100 flex items-center justify-center">
              <Siren size={36} className="text-rose-500 animate-bounce-soft" />
            </div>
          </div>
          <h2 className="font-sora text-xl font-bold text-slate-800 mb-2">Sending Alert...</h2>
          <p className="text-sm text-slate-500">Notifying warden and security personnel</p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <Loader2 size={16} className="animate-spin text-rose-500" />
            <span className="text-sm text-slate-500">Please wait</span>
          </div>
        </div>
      </StudentFeatureCentered>
    );
  }

  return (
    <StudentFeatureShell
      eyebrow="Emergency"
      title="SOS Alert"
      icon={Siren}
      iconTone="emergency"
      variant="emergency"
      onBack={() => router.push("/dashboard/student")}
      contentClassName="space-y-5"
    >
      <FeatureHeroStrip
        variant="emergency"
        icon={Siren}
        title="Emergency SOS System"
        description="Your alert instantly notifies warden and campus security with your profile details."
      />

      {hydrated && <StudentProfileBanner display={display} compact />}

      <StudentFeaturePanel className="p-6 sm:p-7 animate-scale-in" delay={60}>
        <p className="sf-section-label mb-4">Select Alert Type *</p>
        <div className="space-y-3">
          {alertTypes.map(({ type, label, desc, color, selectedBg, icon: Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => setSelected(type)}
              className={`sf-alert-type p-4 sm:p-5 sf-panel-lift ${selected === type ? `sf-alert-type--selected ${selectedBg} border-2` : ""}`}
            >
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                  selected === type ? "bg-white" : "bg-slate-100"
                }`}
              >
                <Icon size={20} className={selected === type ? color : "text-slate-400"} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-base font-extrabold tracking-tight ${selected === type ? color : "text-slate-800"}`}>{label}</p>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 font-medium leading-relaxed">{desc}</p>
              </div>
              {selected === type && <CheckCircle2 size={20} className={color} />}
            </button>
          ))}
        </div>
      </StudentFeaturePanel>

      <StudentFeaturePanel className="p-6 sm:p-7" delay={100}>
        <p className="sf-section-label mb-4">Additional Details</p>
        <textarea
          rows={3}
          placeholder="Briefly describe the situation (optional but helpful)..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="sf-input resize-none focus:border-rose-300 focus:shadow-[0_0_0_3px_rgba(244,63,94,0.15)] text-base"
        />
      </StudentFeaturePanel>

      <StudentFeaturePanel className="p-6 sm:p-7" delay={140}>
        <div className="flex items-center gap-2.5 mb-4">
          <Users size={16} className="text-slate-500" />
          <p className="sf-section-label">Emergency Contacts</p>
        </div>
        <div className="space-y-3">
          {contacts.map((c) => (
            <div
              key={c.phone}
              className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-linear-to-r from-slate-50/80 to-white hover:shadow-xs transition-shadow"
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-2.5 h-2.5 rounded-full ${c.available ? "bg-emerald-400 animate-pulse" : "bg-slate-350"}`} />
                <div>
                  <p className="text-base font-bold text-slate-850">{c.name}</p>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">{c.role}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`text-[10px] font-bold rounded-full px-2.5 py-1 border ${
                    c.available ? "bg-emerald-100 text-emerald-700 border-emerald-200" : "bg-slate-100 text-slate-400 border-slate-200"
                  }`}
                >
                  {c.available ? "Available" : "Offline"}
                </span>
                <a
                  href={`tel:${c.phone}`}
                  className="w-10 h-10 rounded-xl bg-linear-to-br from-sky-100 to-indigo-100 flex items-center justify-center hover:scale-105 transition-transform shadow-xs"
                >
                  <Phone size={15} className="text-sky-650" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </StudentFeaturePanel>

      <div className="sf-notice sf-rise sf-stagger-3 p-4.5 border-sky-200/80 bg-linear-to-br from-sky-50 to-indigo-50/50">
        <Lock size={15} className="text-sky-600 shrink-0 mt-0.5" />
        <p className="text-xs sm:text-sm text-slate-650 leading-relaxed">
          SOS alerts include your name, room number, and timestamp. No personal contact details are exposed to guards.
        </p>
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={() => setStage("confirm")}
        className={`sf-btn-danger w-full py-4 text-base sm:text-lg uppercase tracking-wider font-extrabold shadow-lg shadow-rose-200/50 border border-rose-350 transition-all duration-300 ${selected ? "sf-btn-danger--pulse" : ""}`}
      >
        <Siren size={22} className={selected ? "animate-bounce-soft" : ""} />
        Send Emergency Alert
      </button>

      {!selected && (
        <p className="text-center text-xs text-slate-400 sf-rise">Please select an alert type to continue</p>
      )}

      <div className="h-4" />
    </StudentFeatureShell>
  );
}
