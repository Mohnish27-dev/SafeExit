"use client";

import useCountUp from "@/app/hooks/useCountUp";
import {
  Home,
  PlaneTakeoff,
  Compass,
  Clock,
  Users,
  ArrowRight,
} from "lucide-react";

function WardenStatCard({
  label,
  value,
  sublabel,
  icon: Icon,
  accentColor = "emerald",
  badgeText,
  badgeVariant = "neutral",
  actionHint,
  onClick,
  className = "",
}) {
  const [ref, animated] = useCountUp(value);

  const THEMES = {
    emerald: {
      border: "border-emerald-200/90 hover:border-emerald-400/90",
      topBar: "from-emerald-500 via-teal-400 to-emerald-600",
      iconBg: "from-emerald-600 to-teal-500 text-white shadow-emerald-600/25",
      numberText: "text-emerald-700",
      sublabelDot: "bg-emerald-500",
      cardBg: "from-white to-emerald-50/30",
    },
    violet: {
      border: "border-violet-200/90 hover:border-violet-400/90",
      topBar: "from-violet-600 via-purple-400 to-fuchsia-500",
      iconBg: "from-violet-600 to-fuchsia-600 text-white shadow-violet-600/25",
      numberText: "text-violet-700",
      sublabelDot: "bg-violet-500",
      cardBg: "from-white to-violet-50/30",
    },
    sky: {
      border: "border-sky-200/90 hover:border-sky-400/90",
      topBar: "from-sky-500 via-cyan-400 to-blue-500",
      iconBg: "from-sky-600 to-cyan-500 text-white shadow-sky-600/25",
      numberText: "text-sky-700",
      sublabelDot: "bg-sky-500",
      cardBg: "from-white to-sky-50/30",
    },
    rose: {
      border: "border-rose-200/90 hover:border-rose-400/90",
      topBar: "from-rose-500 via-red-400 to-rose-600",
      iconBg: "from-rose-600 to-red-500 text-white shadow-rose-600/25",
      numberText: "text-rose-700",
      sublabelDot: "bg-rose-500",
      cardBg: "from-white to-rose-50/30",
    },
    indigo: {
      border: "border-indigo-200/90 hover:border-indigo-400/90",
      topBar: "from-indigo-600 via-blue-400 to-indigo-500",
      iconBg: "from-indigo-600 to-blue-500 text-white shadow-indigo-600/25",
      numberText: "text-indigo-700",
      sublabelDot: "bg-indigo-500",
      cardBg: "from-white to-indigo-50/30",
    },
  };

  const theme = THEMES[accentColor] || THEMES.emerald;

  const BADGE_STYLES = {
    success: "bg-emerald-50 text-emerald-800 border-emerald-200/90 font-bold",
    alert: "bg-rose-100 text-rose-800 border-rose-300 font-extrabold animate-pulse",
    purple: "bg-violet-50 text-violet-800 border-violet-200/90 font-bold",
    sky: "bg-sky-50 text-sky-800 border-sky-200/90 font-bold",
    neutral: "bg-slate-100 text-slate-700 border-slate-200 font-bold",
  };

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`group relative flex flex-col justify-between overflow-hidden rounded-3xl p-4 sm:p-4.5 transition-all duration-300 border shadow-sm hover:shadow-xl bg-gradient-to-b ${
        theme.cardBg
      } ${theme.border} ${
        onClick ? "cursor-pointer hover:-translate-y-1 active:scale-[0.98]" : ""
      } ${className}`}
    >
      {/* Top ambient color accent line */}
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${theme.topBar}`} />

      {/* Top Header: Label + Modern Icon Badge */}
      <div>
        <div className="flex items-start justify-between gap-2 pt-0.5">
          <div className="min-w-0 pr-1">
            <h4 className="text-xs sm:text-sm font-bold text-slate-800 leading-snug line-clamp-1">
              {label}
            </h4>
          </div>
          {Icon && (
            <div
              className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br shadow-md ring-1 ring-white/80 transition-transform duration-300 group-hover:scale-110 ${theme.iconBg}`}
            >
              <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          )}
        </div>

        {/* Big Number & Contextual Badge */}
        <div className="mt-3 flex items-baseline justify-between gap-2 flex-wrap">
          <p
            ref={ref}
            className={`text-3xl sm:text-4xl font-black tracking-tight ${theme.numberText}`}
          >
            {Number.isFinite(animated) ? Math.round(animated) : Number(value) || 0}
          </p>

          {badgeText && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] sm:text-[11px] border shadow-2xs ${
                BADGE_STYLES[badgeVariant] || BADGE_STYLES.neutral
              }`}
            >
              {badgeVariant === "alert" && (
                <span className="h-1.5 w-1.5 rounded-full bg-rose-600 animate-ping" />
              )}
              {badgeText}
            </span>
          )}
        </div>

        {/* High-visibility Context Sublabel */}
        {sublabel && (
          <div className="mt-2.5 flex items-center gap-1.5 min-w-0">
            <span className={`h-2 w-2 rounded-full shrink-0 ${theme.sublabelDot}`} />
            <p className="text-[11px] sm:text-xs font-semibold text-slate-600 leading-tight truncate">
              {sublabel}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Action Hint */}
      {actionHint && (
        <div className="mt-3.5 pt-2.5 border-t border-slate-100/90 flex items-center justify-between text-[11px] sm:text-xs font-bold text-slate-500 group-hover:text-slate-900 transition-colors">
          <span className="truncate pr-1">{actionHint}</span>
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500 group-hover:bg-indigo-600 group-hover:text-white transition-all text-xs font-black shadow-2xs group-hover:translate-x-0.5">
            →
          </span>
        </div>
      )}
    </div>
  );
}

export default function HostelOccupancyStats({
  stats,
  hostelName = "Hostel",
  onSelectView,
}) {
  const total = stats?.total || 0;
  const inside = stats?.inside || 0;
  const outside = stats?.outside || 0;
  const onLeave = stats?.onLeave || 0;
  const overdue = stats?.overdue || 0;

  const occupancyPct = total > 0 ? Math.round((inside / total) * 100) : 0;

  return (
    <section className="sd-enter mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3.5 px-1">
        <div>
          <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Users className="h-5 w-5 text-indigo-600" />
            Live Hostel Occupancy
          </h3>
          <p className="text-xs font-semibold text-slate-500">
            Real-time campus counts for {hostelName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/95 backdrop-blur-md px-3.5 py-1.5 text-xs font-bold text-slate-800 border border-slate-200/90 shadow-xs">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            Gate Synced
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-3.5 xl:gap-4">
        {/* 1. Inside Hostel */}
        <WardenStatCard
          accentColor="emerald"
          label="Inside Hostel"
          value={inside}
          sublabel={`In rooms · ${hostelName}`}
          icon={Home}
          badgeText={total > 0 ? `${occupancyPct}% Occupancy` : "Safe Inside"}
          badgeVariant="success"
          actionHint="View movement logs"
          onClick={() => onSelectView?.("logs")}
        />

        {/* 2. On Approved Leave */}
        <WardenStatCard
          accentColor="violet"
          label="On Leave"
          value={onLeave}
          sublabel={onLeave > 0 ? "Scanned out on leave" : "No students on leave"}
          icon={PlaneTakeoff}
          badgeText={onLeave > 0 ? `${onLeave} Away` : "None Away"}
          badgeVariant={onLeave > 0 ? "purple" : "neutral"}
          actionHint="Open leave desk"
          onClick={() => onSelectView?.("leave")}
        />

        {/* 3. On Day Pass / Outing */}
        <WardenStatCard
          accentColor="sky"
          label="On Outing"
          value={outside}
          sublabel={outside > 0 ? "Regular outing pass" : "No active outings"}
          icon={Compass}
          badgeText={outside > 0 ? `${outside} Outside` : "None Out"}
          badgeVariant={outside > 0 ? "sky" : "neutral"}
          actionHint="Check active movements"
          onClick={() => onSelectView?.("logs")}
        />

        {/* 4. Overdue Students */}
        <WardenStatCard
          accentColor="rose"
          label="Overdue"
          value={overdue}
          sublabel={overdue > 0 ? "Missed return deadline" : "All curfew met"}
          icon={Clock}
          badgeText={overdue > 0 ? "Curfew Missed!" : "All On Time"}
          badgeVariant={overdue > 0 ? "alert" : "success"}
          actionHint="Open overdue list"
          onClick={() => onSelectView?.("overdue")}
        />

        {/* 5. Total Hostel Roll */}
        <WardenStatCard
          accentColor="indigo"
          label="Total Students"
          value={total}
          sublabel={`Registered in ${hostelName}`}
          icon={Users}
          badgeText="Hostel Roll"
          badgeVariant="neutral"
          actionHint="Review hostel logs"
          onClick={() => onSelectView?.("logs")}
          className="col-span-2 sm:col-span-1"
        />
      </div>
    </section>
  );
}

