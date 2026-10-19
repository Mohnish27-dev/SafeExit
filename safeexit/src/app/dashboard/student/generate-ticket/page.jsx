"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  CalendarDays,
  Camera,
  Clock,
  ClipboardList,
  DoorOpen,
  LogIn,
  QrCode,
  ShieldCheck,
} from "lucide-react";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";
import { useStudentProfile } from "@/app/hooks/useStudentProfile";
import StudentProfileBanner from "@/app/components/student/StudentProfileBanner";
import FeatureHeroStrip from "@/app/components/student/FeatureHeroStrip";
import StudentFeatureShell, { StudentFeaturePanel } from "@/app/components/student/StudentFeatureShell";
import StudentQrModal from "@/app/components/student/StudentQrModal";
import { apiFetch } from "@/app/lib/api";
import { CAMPUS_TIMEZONE, OUTING_RETURN_LABEL } from "@/app/lib/outingRules.mjs";

// Outings have no request, approval or destination any more. The student shows their QR at
// the main gate; the exit scan starts the outing and the entry scan ends it. This page only
// explains that, and shows the trip in progress if there is one. (The route keeps its old
// name so existing links and installed home-screen shortcuts still land here.)

// "2026-10-15T14:30:00Z" -> "8:00 PM" on the campus clock.
const campusClock = (value) =>
  value
    ? new Date(value).toLocaleTimeString("en-US", {
        timeZone: CAMPUS_TIMEZONE,
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

const STEPS = [
  {
    icon: QrCode,
    title: "Open your QR",
    desc: "Tap “Show my QR” below, or use the QR on your college ID card.",
  },
  {
    icon: DoorOpen,
    title: "Show it at the main gate",
    desc: "The guard scans it and your exit is logged. No form, no approval.",
  },
  {
    icon: LogIn,
    title: `Be back by ${OUTING_RETURN_LABEL}`,
    desc: "Show the same QR when you return to log your entry.",
  },
];

export default function GoingOutPage() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const { profile, display, hydrated } = useStudentProfile();
  const [showQrModal, setShowQrModal] = useState(false);

  // The trip in progress, if any — newest-first, so the first 'Out' row is it.
  const [current, setCurrent] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/outing/myrequests");
        if (cancelled) return;
        setCurrent(Array.isArray(data) ? data.find((o) => o.status === "Out") || null : null);
      } catch {
        // Best-effort: the page still explains how to go out.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  if (!checked || !authorized) return <AuthLoading />;

  return (
    <StudentFeatureShell
      eyebrow="Outing"
      title="Going Out"
      icon={DoorOpen}
      iconTone="ticket"
      onBack={() => router.push("/dashboard/student")}
      contentClassName="space-y-3 sm:space-y-5"
    >
      <div className="hidden sm:block">
        <FeatureHeroStrip
          variant="ticket"
          icon={DoorOpen}
          title="No pass to request"
          description={`Show your QR at the main gate and go. Just be back by ${OUTING_RETURN_LABEL}.`}
        />
      </div>

      {hydrated && <StudentProfileBanner display={display} compact />}

      {loaded && current && (
        <StudentFeaturePanel className="p-4 sm:p-5" delay={40}>
          <div className={`sf-notice ${current.isOverdue ? "sf-notice--danger" : ""}`} role="status">
            {current.isOverdue ? (
              <AlertCircle size={15} className="text-rose-600 shrink-0 mt-0.5" />
            ) : (
              <Clock size={15} className="text-sky-600 shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <p className={`text-xs font-bold ${current.isOverdue ? "text-rose-700" : "text-slate-700"}`}>
                {current.isOverdue ? "Your return is overdue" : "You're out right now"}
              </p>
              <p className={`text-xs mt-0.5 leading-relaxed ${current.isOverdue ? "text-rose-600" : "text-slate-600"}`}>
                Left at {campusClock(current.actualOutTime || current.outTime)} · back by{" "}
                {campusClock(current.inTime)}. Show your QR at the gate when you return.
              </p>
              {current.isOverdue && (
                <Link
                  href="/dashboard/student/delay-notice"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-rose-700 hover:text-rose-900 transition-colors"
                >
                  <Clock size={13} />
                  Report a delay
                </Link>
              )}
            </div>
          </div>
        </StudentFeaturePanel>
      )}

      <StudentFeaturePanel className="p-4 sm:p-5 space-y-3 sm:space-y-4" delay={80}>
        <p className="sf-section-label">How to go out</p>
        <ol className="space-y-3">
          {STEPS.map(({ icon: Icon, title, desc }, i) => (
            <li key={title} className="flex items-start gap-3">
              <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl sf-icon-ticket text-white">
                <Icon size={18} />
                <span className="absolute -right-1 -top-1 flex h-4.5 w-4.5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-indigo-700 shadow">
                  {i + 1}
                </span>
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-800">{title}</p>
                <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="sf-notice">
          <ShieldCheck size={14} className="text-sky-600 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Same rule for everyone — nearby or market. Your caretaker is alerted if you are not
            back by {OUTING_RETURN_LABEL}; running late? Report a delay from your dashboard.
          </p>
        </div>
      </StudentFeaturePanel>

      <button
        type="button"
        onClick={() => setShowQrModal(true)}
        className="sf-btn-primary w-full cursor-pointer py-3.5 text-sm font-extrabold uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-sky-500/25 active:scale-[0.98] transition-all"
      >
        <QrCode size={18} className="animate-pulse" />
        Show My QR
      </button>

      {/* Convenience tip right on the page */}
      <div className="flex items-start gap-2.5 rounded-2xl bg-amber-50/90 border border-amber-200/80 p-3 text-left shadow-xs">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-xs mt-0.5">
          <Camera size={13} />
        </div>
        <p className="text-[11px] text-amber-900/90 leading-relaxed">
          <strong className="text-amber-950 font-bold">Pro Tip:</strong> Tap &ldquo;Show My QR&rdquo; and save a screenshot to your photo gallery. You can show it directly to the guard at the main gate without opening the app every time!
        </p>
      </div>

      <Link href="/dashboard/student/my-outings" className="sf-btn-secondary w-full">
        <ClipboardList size={16} />
        My Outings
      </Link>

      <div className="sf-notice">
        <CalendarDays size={14} className="text-violet-600 shrink-0 mt-0.5" />
        <p className="text-[11px] text-slate-600 leading-relaxed">
          Staying away overnight or longer?{" "}
          <Link href="/dashboard/student/leave-application" className="font-bold text-violet-700 hover:text-violet-900">
            Apply for leave
          </Link>{" "}
          instead — leave still needs approval.
        </p>
      </div>

      <StudentQrModal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        profile={profile}
      />

      <div className="h-4" />
    </StudentFeatureShell>
  );
}
