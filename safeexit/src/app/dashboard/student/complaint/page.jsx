"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquareWarning,
  Wrench,
  Zap,
  Droplets,
  Sparkles,
  ShieldAlert,
  MoreHorizontal,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Loader2,
  Clock,
  Calendar,
  Inbox,
  Shield,
  ChevronRight,
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

const categories = [
  {
    value: "Maintenance",
    label: "Maintenance",
    desc: "Furniture, fittings, general repairs",
    color: "text-orange-600",
    selectedBg: "bg-orange-50 border-orange-300",
    icon: Wrench,
  },
  {
    value: "Electrical",
    label: "Electrical",
    desc: "Power, wiring, lights, fans, sockets",
    color: "text-amber-600",
    selectedBg: "bg-amber-50 border-amber-300",
    icon: Zap,
  },
  {
    value: "Plumbing",
    label: "Plumbing",
    desc: "Water supply, leaks, drainage",
    color: "text-sky-700",
    selectedBg: "bg-sky-50 border-sky-300",
    icon: Droplets,
  },
  {
    value: "Cleaning",
    label: "Cleaning",
    desc: "Housekeeping, waste, sanitation",
    color: "text-emerald-600",
    selectedBg: "bg-emerald-50 border-emerald-300",
    icon: Sparkles,
  },
  {
    value: "Security",
    label: "Security",
    desc: "Safety concerns, unauthorized entry",
    color: "text-rose-600",
    selectedBg: "bg-rose-50 border-rose-300",
    icon: ShieldAlert,
  },
  {
    value: "Other",
    label: "Other",
    desc: "Anything else you'd like to report",
    color: "text-slate-600",
    selectedBg: "bg-slate-50 border-slate-300",
    icon: MoreHorizontal,
  },
];

const statusConfig = {
  Open: { label: "Open", color: "text-orange-700", bg: "bg-orange-100", icon: AlertCircle, slug: "open" },
  "In Progress": { label: "In Progress", color: "text-amber-700", bg: "bg-amber-100", icon: Loader2, slug: "in-progress" },
  Resolved: { label: "Resolved", color: "text-emerald-700", bg: "bg-emerald-100", icon: CheckCircle2, slug: "resolved" },
  Rejected: { label: "Rejected", color: "text-rose-700", bg: "bg-rose-100", icon: XCircle, slug: "rejected" },
};

const filters = [
  { key: "all", label: "All" },
  { key: "Open", label: "Open" },
  { key: "In Progress", label: "In Progress" },
  { key: "Resolved", label: "Resolved" },
  { key: "Rejected", label: "Rejected" },
];

const describeSubmitError = (error) => {
  if (error instanceof TypeError) {
    return "We couldn't reach the server. Check your internet connection and try again.";
  }
  if (error instanceof SyntaxError) {
    return "The server sent back an unexpected response. Please try again.";
  }
  return error.message || "Something went wrong while submitting your complaint. Please try again.";
};

export default function StudentComplaintPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const { display, hydrated } = useStudentProfile();

  const [tab, setTab] = useState("new");
  const [category, setCategory] = useState(null);
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState(null);

  const [complaints, setComplaints] = useState([]);
  const [loadingComplaints, setLoadingComplaints] = useState(true);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;

    const fetchComplaints = async (background = false) => {
      if (!background) setLoadingComplaints(true);
      try {
        const data = await apiFetch("/complaint/mycomplaints");
        if (cancelled) return;
        setComplaints(data || []);
      } catch {
        if (!cancelled && !background) setComplaints([]);
      } finally {
        if (!cancelled) setLoadingComplaints(false);
      }
    };

    fetchComplaints();
    const interval = setInterval(() => fetchComplaints(true), 15000);
    const onVisible = () => {
      if (document.visibilityState === "visible") fetchComplaints(true);
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

  const validate = () => {
    const nextErrors = {};
    if (!category) nextErrors.category = "Please select a complaint category";
    if (!description.trim() || description.trim().length < 10) {
      nextErrors.description = "Please describe the issue in at least 10 characters";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setErrors((prev) => {
      if (!prev.submit) return prev;
      const { submit, ...rest } = prev;
      return rest;
    });
    try {
      const data = await apiFetch("/complaint", {
        method: "POST",
        body: JSON.stringify({ category, description: description.trim() }),
      });
      setCreated(data);
      setComplaints((prev) => [data, ...prev]);
      setSubmitting(false);
    } catch (error) {
      setSubmitting(false);
      setErrors((prev) => ({ ...prev, submit: describeSubmitError(error) }));
    }
  };

  const resetForm = () => {
    setCreated(null);
    setCategory(null);
    setDescription("");
    setErrors({});
  };

  const filteredComplaints = complaints.filter(
    (c) => filter === "all" || c.status === filter
  );

  const complaintId = created ? `CMP-${String(created._id).slice(-6).toUpperCase()}` : "";

  if (created) {
    return (
      <StudentFeatureCentered>
        <StudentFeaturePanel className="p-8 text-center animate-scale-in">
          <div className="relative inline-block mb-6">
            <div className="w-20 h-20 rounded-full bg-linear-to-br from-orange-100 to-amber-100 flex items-center justify-center mx-auto shadow-lg">
              <CheckCircle2 size={40} className="text-orange-500" />
            </div>
            <div className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-linear-to-br from-orange-500 to-amber-400 flex items-center justify-center animate-bounce-soft shadow-md">
              <MessageSquareWarning size={12} className="text-white" />
            </div>
          </div>
          <p className="sf-eyebrow mb-1">Complaint Filed</p>
          <h2 className="font-sora text-2xl font-bold text-slate-800 mb-1">We&rsquo;ve got it</h2>
          <p className="text-slate-500 text-sm mb-6">
            Your complaint has been sent to the warden for review.
          </p>

          <div className="rounded-2xl p-6 mb-6 text-left space-y-3 bg-linear-to-br from-slate-50 to-orange-50/50 border border-slate-100 shadow-sm">
            {[
              { label: "Complaint ID", value: complaintId, highlight: true },
              { label: "Category", value: created.category },
              {
                label: "Filed",
                value: new Date(created.createdAt || Date.now()).toLocaleString("en-US", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              },
            ].map(({ label, value, highlight }) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">{label}</span>
                <span className={`text-base font-bold ${highlight ? "text-orange-600" : "text-slate-700"}`}>
                  {value}
                </span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1.5 border-t border-slate-100">
              <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Status</span>
              <span className="text-xs font-bold text-orange-800 bg-linear-to-r from-orange-100 to-orange-50 rounded-full px-3.5 py-1.5 border border-orange-200 shadow-xs">
                Open
              </span>
            </div>
          </div>

          <div className="sf-notice mb-6 text-left">
            <AlertCircle size={14} className="text-sky-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600">
              Your warden will review this shortly. Track its progress under &ldquo;My Complaints&rdquo;.
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
              View My Complaints
            </button>
            <button type="button" onClick={() => router.push("/dashboard/student")} className="sf-btn-primary w-full">
              Back to Dashboard
            </button>
          </div>
        </StudentFeaturePanel>
      </StudentFeatureCentered>
    );
  }

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <StudentFeatureShell
      eyebrow="Hostel Support"
      title="Complaints"
      icon={MessageSquareWarning}
      iconTone="complaint"
      onBack={() => router.push("/dashboard/student")}
      contentClassName="space-y-5"
    >
      <FeatureHeroStrip
        variant="complaint"
        icon={MessageSquareWarning}
        title="Raise a complaint"
        description="Report maintenance, safety, or hostel issues directly to your warden."
      />

      {hydrated && <StudentProfileBanner display={display} compact />}

      <div className="flex gap-2 sf-rise sf-stagger-1">
        <button
          type="button"
          onClick={() => setTab("new")}
          className={`sf-filter-pill flex-1 justify-center ${tab === "new" ? "sf-filter-pill--active" : "sf-filter-pill--idle"}`}
        >
          New Complaint
        </button>
        <button
          type="button"
          onClick={() => setTab("mine")}
          className={`sf-filter-pill flex-1 justify-center ${tab === "mine" ? "sf-filter-pill--active" : "sf-filter-pill--idle"}`}
        >
          My Complaints{complaints.length ? ` (${complaints.length})` : ""}
        </button>
      </div>

      {tab === "new" ? (
        <>
          <StudentFeaturePanel className="p-6 sm:p-7 animate-scale-in" delay={60}>
            <p className="sf-section-label mb-4">Select Category *</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {categories.map(({ value, label, desc, color, selectedBg, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setCategory(value)}
                  className={`sf-alert-type p-4 sf-panel-lift ${
                    category === value ? `sf-alert-type--selected ${selectedBg} border-2` : ""
                  }`}
                >
                  <div
                    className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
                      category === value ? "bg-white" : "bg-slate-100"
                    }`}
                  >
                    <Icon size={18} className={category === value ? color : "text-slate-400"} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-extrabold tracking-tight ${category === value ? color : "text-slate-800"}`}>
                      {label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5 font-medium leading-relaxed">{desc}</p>
                  </div>
                  {category === value && <CheckCircle2 size={18} className={color} />}
                </button>
              ))}
            </div>
            {errors.category && <p className="text-xs text-rose-500 mt-3">{errors.category}</p>}
          </StudentFeaturePanel>

          <StudentFeaturePanel className="p-6 sm:p-7" delay={100}>
            <p className="sf-section-label mb-4">Describe the Issue *</p>
            <textarea
              rows={4}
              placeholder="Tell us what's wrong, when it started, and any other useful detail..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={`sf-input resize-none text-base ${errors.description ? "sf-input--error" : ""}`}
            />
            {errors.description && <p className="text-xs text-rose-500 mt-1">{errors.description}</p>}
            {display.room && display.room !== "—" && (
              <p className="text-xs text-slate-400 mt-3">
                This will be filed against your registered room:{" "}
                <span className="font-bold text-slate-600">{display.room}</span>
              </p>
            )}
          </StudentFeaturePanel>

          {errors.submit && (
            <div role="alert" className="sf-notice sf-notice--danger animate-notice-in">
              <AlertCircle size={14} className="text-rose-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-bold text-rose-700">Submission failed</p>
                <p className="text-xs text-rose-600 mt-0.5">{errors.submit}</p>
              </div>
            </div>
          )}

          <div className="sf-notice sf-rise sf-stagger-3">
            <Shield size={15} className="text-orange-600 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-600 leading-relaxed">
              Complaints are visible only to your warden and hostel admin, and are tracked until resolved.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="sf-btn-primary w-full sf-rise sf-stagger-4"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Submitting...
              </>
            ) : (
              <>
                Submit Complaint
                <ChevronRight size={16} />
              </>
            )}
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

          {loadingComplaints ? (
            <StudentFeaturePanel className="p-10 text-center" delay={80}>
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-3">
                <Loader2 size={24} className="text-slate-400 animate-spin" />
              </div>
              <p className="font-sora font-semibold text-slate-700">Loading your complaints…</p>
            </StudentFeaturePanel>
          ) : filteredComplaints.length === 0 ? (
            <StudentFeaturePanel className="p-10 text-center" delay={80}>
              <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-3">
                <Inbox size={24} className="text-slate-400" />
              </div>
              <p className="font-sora font-semibold text-slate-700">No complaints found</p>
              <p className="text-sm text-slate-500 mt-1">
                {complaints.length === 0 ? "File a new complaint to get started." : "Try a different filter."}
              </p>
            </StudentFeaturePanel>
          ) : (
            <div className="space-y-3">
              {filteredComplaints.map((c, index) => {
                const category = categories.find((cat) => cat.value === c.category);
                const sc = statusConfig[c.status] || statusConfig.Open;
                const StatusIcon = sc.icon;
                const CategoryIcon = category?.icon || MoreHorizontal;

                return (
                  <div
                    key={c._id}
                    className={`sf-outing-card sf-outing-card--${sc.slug} sf-rise sf-panel-lift rounded-2xl bg-white p-5 sm:p-6`}
                    style={{ animationDelay: `${100 + index * 50}ms` }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-11 h-11 rounded-2xl bg-linear-to-br from-orange-100 to-amber-100 flex items-center justify-center shrink-0 shadow-xs">
                          <CategoryIcon size={18} className="text-orange-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-sora font-extrabold text-slate-800 text-base leading-snug">
                            {c.category}
                          </p>
                          <p className="text-sm text-slate-600 mt-1 leading-relaxed">{c.description}</p>
                        </div>
                      </div>
                      <span
                        className={`flex items-center gap-1.5 text-xs font-bold rounded-full px-3 py-1.5 shadow-xs border shrink-0 ${sc.bg} ${sc.color} border-current/20`}
                      >
                        <StatusIcon size={12} className={sc.label === "In Progress" ? "animate-spin" : ""} />
                        {sc.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-5 mt-4 pt-4 border-t border-slate-100/90">
                      <div className="flex items-center gap-2">
                        <Calendar size={13} className="text-slate-400" />
                        <span className="text-xs font-semibold text-slate-650">
                          {new Date(c.createdAt).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock size={13} className="text-slate-400" />
                        <span className="text-xs font-semibold text-slate-650">
                          {new Date(c.createdAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    </div>

                    {c.resolutionComments && (
                      <div className="mt-4 pt-3 border-t border-slate-100 flex items-start gap-2.5">
                        <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-slate-600">
                          <span className="font-bold text-slate-700">Warden&rsquo;s note: </span>
                          {c.resolutionComments}
                        </p>
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
