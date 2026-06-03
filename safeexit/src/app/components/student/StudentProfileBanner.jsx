"use client";

import { User, ShieldCheck, Home, IdCard } from "lucide-react";
import { getInitials } from "@/app/lib/userProfile";

export default function StudentProfileBanner({ display, compact = false }) {
  if (!display?.name) return null;

  return (
    <div className={`sf-profile-banner sf-panel-lift ${compact ? "sf-profile-banner--compact" : ""}`}>
      <div className="sf-profile-avatar flex-shrink-0" aria-hidden>
        {getInitials(display.name) || <User size={compact ? 16 : 20} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="sf-profile-name truncate">{display.name}</p>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
            <ShieldCheck size={10} className="text-emerald-500" />
            Verified
          </span>
        </div>
        
        <p className="sf-profile-meta flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-slate-700">{display.subtitle}</span>
          {!compact && (
            <>
              <span className="sf-profile-dot" aria-hidden>·</span>
              <span className="flex items-center gap-1 text-slate-500">
                <IdCard size={12} className="text-indigo-400" />
                {display.rollNo}
              </span>
            </>
          )}
        </p>

        {!compact && display.hostel && display.hostel !== "—" && (
          <p className="sf-profile-hostel flex items-center gap-1.5 mt-1.5 text-xs">
            <Home size={12} className="text-sky-400 flex-shrink-0" />
            <span className="truncate">{display.hostel}</span>
          </p>
        )}
      </div>
    </div>
  );
}
