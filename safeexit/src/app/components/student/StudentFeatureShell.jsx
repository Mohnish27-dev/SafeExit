"use client";

import { ArrowLeft } from "lucide-react";

const iconTones = {
  ticket: "sf-icon-ticket",
  outings: "sf-icon-outings",
  emergency: "sf-icon-emergency",
  complaint: "sf-icon-complaint",
  default: "sf-icon-default",
};

export default function StudentFeatureShell({
  eyebrow,
  title,
  icon: Icon,
  iconTone = "default",
  variant = "default",
  onBack,
  headerRight,
  children,
  className = "",
  contentClassName = "",
}) {
  const isEmergency = variant === "emergency";

  return (
    <div
      className={`student-feature-page min-h-screen text-slate-900 ${isEmergency ? "student-feature-page--emergency" : ""} ${className}`}
    >
      <div className="student-feature-bg" aria-hidden>
        <div className={`sf-orb sf-orb-one ${isEmergency ? "sf-orb-one--emergency" : ""}`} />
        <div className={`sf-orb sf-orb-two ${isEmergency ? "sf-orb-two--emergency" : ""}`} />
        <div className={`sf-orb sf-orb-three ${isEmergency ? "sf-orb-three--emergency" : ""}`} />
        <div className="sf-wave" />
        <div className="sf-streaks" />
        <span className="sf-floating-dot w-2 h-2 bg-sky-400 top-[18%] left-[12%]" style={{ animationDelay: "0s" }} />
        <span className="sf-floating-dot w-1.5 h-1.5 bg-indigo-400 top-[35%] right-[15%]" style={{ animationDelay: "1.2s" }} />
        <span className="sf-floating-dot w-2.5 h-2.5 bg-violet-300 bottom-[25%] left-[20%]" style={{ animationDelay: "2.4s" }} />
      </div>

      <header className="sf-header sf-header-animate sticky top-0 z-20">
        <div className="sf-container flex items-center gap-3 px-4 py-3.5 sm:px-6">
          <button
            type="button"
            onClick={onBack}
            className="sf-back-btn"
            aria-label="Go back"
          >
            <ArrowLeft size={16} className="text-slate-600" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="sf-eyebrow">{eyebrow}</p>
            <h1 className="sf-page-title truncate">{title}</h1>
          </div>
          {headerRight ?? (
            Icon && (
              <div className={`sf-header-icon ${iconTones[iconTone] ?? iconTones.default}`}>
                <Icon size={16} />
              </div>
            )
          )}
        </div>
      </header>

      <div className={`relative z-10 sf-content sf-container px-4 py-6 sm:px-6 sm:py-8 ${contentClassName}`}>
        {children}
      </div>
    </div>
  );
}

export function StudentFeaturePanel({ children, className = "", shimmer = false, delay = 0 }) {
  return (
    <div
      className={`sf-panel sf-panel-lift sf-rise ${shimmer ? "sf-shimmer" : ""} ${className}`}
      style={delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}

export function StudentFeatureCentered({ children, className = "" }) {
  return (
    <div className={`student-feature-page student-feature-page--centered min-h-screen ${className}`}>
      <div className="student-feature-bg" aria-hidden>
        <div className="sf-orb sf-orb-one" />
        <div className="sf-orb sf-orb-two" />
        <div className="sf-orb sf-orb-three" />
        <div className="sf-wave" />
      </div>
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-8 sm:px-6">
        <div className="sf-rise w-full max-w-lg">{children}</div>
      </div>
    </div>
  );
}
