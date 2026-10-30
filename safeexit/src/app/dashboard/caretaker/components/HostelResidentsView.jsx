"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Users,
  Search,
  RefreshCw,
  Phone,
  PhoneCall,
  Home,
  Compass,
  PlaneTakeoff,
  AlarmClock,
  CheckCircle2,
  AlertTriangle,
  Siren,
  CalendarDays,
  Clock3,
  ShieldCheck,
  DoorOpen,
  X,
  FileText,
} from "lucide-react";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import { getTranslatedHostelName } from "@/app/lib/hostels";
import HostelOnLeaveRoster from "./HostelOnLeaveRoster";
import HostelActiveOutingsRoster from "./HostelActiveOutingsRoster";

const STATUS_THEMES = {
  Inside: {
    badge: "bg-emerald-50 text-emerald-800 border-emerald-200 ring-emerald-500/20",
    dot: "bg-emerald-500",
    cardBorder: "border-slate-200/90 hover:border-emerald-300",
    avatarBg: "from-emerald-500 to-teal-500",
  },
  Outside: {
    badge: "bg-sky-50 text-sky-800 border-sky-200 ring-sky-500/20",
    dot: "bg-sky-500",
    cardBorder: "border-slate-200/90 hover:border-sky-300",
    avatarBg: "from-sky-500 to-indigo-500",
  },
  OnLeave: {
    badge: "bg-purple-50 text-purple-800 border-purple-200 ring-purple-500/20",
    dot: "bg-purple-500",
    cardBorder: "border-slate-200/90 hover:border-purple-300",
    avatarBg: "from-purple-500 to-violet-600",
  },
  Overdue: {
    badge: "bg-rose-50 text-rose-800 border-rose-200 ring-rose-500/20 animate-pulse",
    dot: "bg-rose-500",
    cardBorder: "border-rose-300 ring-1 ring-rose-200 bg-rose-50/20 hover:border-rose-400",
    avatarBg: "from-rose-500 to-red-600",
  },
};

export default function HostelResidentsView({
  students = [],
  loadingStudents = false,
  onLeaveStudents = [],
  loadingOnLeave = false,
  activeOutings = [],
  loadingOutings = false,
  onRefresh,
  hostelName = "Kadambini",
  activeFilter = "all",
  onFilterChange,
  onBack,
}) {
  const { t, locale } = useTranslation("caretaker");
  const { t: tc } = useTranslation("common");
  const displayHostel = getTranslatedHostelName(hostelName, locale);

  const [currentFilter, setCurrentFilter] = useState(activeFilter || "all");
  const [search, setSearch] = useState("");
  // "roster" mode for leave/outings gives detailed gate pass info; "cards" gives unified directory cards.
  const [viewMode, setViewMode] = useState("roster");

  // Keep internal filter in sync if parent changes activeFilter (e.g. from card clicks)
  const filter = activeFilter || currentFilter;

  const handleSelectFilter = (f) => {
    setCurrentFilter(f);
    if (onFilterChange) onFilterChange(f);
  };

  // Concise status badge text so cards never overflow on small phone screens
  const statusShortLabels = {
    Inside: locale === "hi" ? "उपस्थित" : "Inside",
    Outside: locale === "hi" ? "आउटिंग" : "Outing",
    OnLeave: locale === "hi" ? "लीव" : "On Leave",
    Overdue: locale === "hi" ? "ओवरड्यू" : "Overdue",
  };

  const counts = useMemo(() => {
    const c = { all: students.length, inside: 0, outside: 0, onleave: 0, overdue: 0 };
    for (const s of students) {
      const st = s.campusStatus || "Inside";
      if (st === "Inside") c.inside++;
      else if (st === "Outside") c.outside++;
      else if (st === "OnLeave") c.onleave++;
      else if (st === "Overdue") c.overdue++;
    }
    return c;
  }, [students]);

  // Map students by ID or Roll to join with active leave / outing pass data
  const leaveMap = useMemo(() => {
    const map = new Map();
    for (const l of onLeaveStudents) {
      const s = l.student || {};
      const key = String(s.id || s._id || s.rollNumber || s.studentId || "");
      if (key) map.set(key, l);
    }
    return map;
  }, [onLeaveStudents]);

  const outingMap = useMemo(() => {
    const map = new Map();
    for (const o of activeOutings) {
      const s = o.student || {};
      const key = String(s.id || s._id || s.rollNumber || s.studentId || "");
      if (key) map.set(key, o);
    }
    return map;
  }, [activeOutings]);

  const visibleStudents = useMemo(() => {
    return students.filter((s) => {
      const st = s.campusStatus || "Inside";
      if (filter === "inside" && st !== "Inside") return false;
      if (filter === "outside" && st !== "Outside") return false;
      if (filter === "onleave" && st !== "OnLeave") return false;
      if (filter === "overdue" && st !== "Overdue") return false;

      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      const matchBasic =
        (s.name || "").toLowerCase().includes(q) ||
        (s.studentId || "").toLowerCase().includes(q) ||
        (s.roomNumber || "").toLowerCase().includes(q) ||
        (s.department || "").toLowerCase().includes(q) ||
        (s.year || "").toLowerCase().includes(q) ||
        (s.phoneNumber || "").toLowerCase().includes(q) ||
        (s.guardianPhoneNumber || "").toLowerCase().includes(q);

      if (matchBasic) return true;

      // Also search destination or reason if student is on leave or outing
      const leave = leaveMap.get(String(s.id || s._id || s.studentId || ""));
      if (leave && ((leave.destination || "").toLowerCase().includes(q) || (leave.reason || "").toLowerCase().includes(q))) {
        return true;
      }
      const outing = outingMap.get(String(s.id || s._id || s.studentId || ""));
      if (outing && ((outing.destination || "").toLowerCase().includes(q) || (outing.purpose || "").toLowerCase().includes(q))) {
        return true;
      }
      return false;
    });
  }, [students, filter, search, leaveMap, outingMap]);

  // Use the same residents for cards and pass details, including the search.
  // In particular, the Outside tab must exclude overdue students.
  const { visibleLeaves, visibleOutings } = useMemo(() => {
    const key = (student) => String(student?.id || student?._id || student?.studentId || student?.rollNumber || "");
    const ids = new Set(visibleStudents.map(key));
    return {
      visibleLeaves: onLeaveStudents.filter((leave) => ids.has(key(leave.student))),
      visibleOutings: activeOutings.filter((outing) => ids.has(key(outing.student))),
    };
  }, [visibleStudents, onLeaveStudents, activeOutings]);

  const filterTabs = [
    {
      key: "all",
      label: t("tabAllResidents") || "All Residents",
      count: counts.all,
      icon: Users,
      color: "bg-indigo-600 text-white shadow-indigo-500/25",
      badgeActive: "bg-white/20 text-white",
      badgeInactive: "bg-slate-100 text-slate-700",
    },
    {
      key: "inside",
      label: t("insideHostel") || "Inside Hostel",
      count: counts.inside,
      icon: Home,
      color: "bg-emerald-600 text-white shadow-emerald-500/25",
      badgeActive: "bg-white/20 text-white",
      badgeInactive: "bg-emerald-100 text-emerald-800",
    },
    {
      key: "outside",
      label: t("tabOnOutingMobile") || "On Outing",
      count: counts.outside,
      icon: Compass,
      color: "bg-sky-600 text-white shadow-sky-500/25",
      badgeActive: "bg-white/20 text-white",
      badgeInactive: "bg-sky-100 text-sky-800",
    },
    {
      key: "onleave",
      label: t("tabOnLeaveMobile") || "On Leave",
      count: counts.onleave,
      icon: PlaneTakeoff,
      color: "bg-violet-600 text-white shadow-violet-500/25",
      badgeActive: "bg-white/20 text-white",
      badgeInactive: "bg-violet-100 text-violet-800",
    },
    {
      key: "overdue",
      label: t("overdueStudents") || "Overdue",
      count: counts.overdue,
      icon: AlarmClock,
      color: "bg-rose-600 text-white shadow-rose-500/25",
      badgeActive: "bg-white/20 text-white",
      badgeInactive: counts.overdue > 0 ? "bg-rose-100 text-rose-800 font-extrabold animate-pulse" : "bg-slate-100 text-slate-700",
    },
  ];

  const isLoading = loadingStudents || loadingOnLeave || loadingOutings;

  return (
    <div id="hostel-residents" className="space-y-4 sm:space-y-6 sd-enter pb-16 w-full max-w-full overflow-hidden">
      {/* Top Header & Navigation Bar */}
      <div className="flex items-center justify-between gap-2.5 bg-white/95 backdrop-blur-md p-3 sm:p-5 rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-bold transition-all active:scale-95 cursor-pointer shrink-0 border border-slate-200 shadow-2xs"
              title={t("backToDashboard") || "Back to Dashboard"}
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden xs:inline">{t("backToDashboard") || "Back"}</span>
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold truncate">
              <span className="font-bold text-indigo-700 truncate">{displayHostel}</span>
              <span>•</span>
              <span className="truncate">{counts.all} {t("tabResidentsMobile") || "residents"}</span>
            </div>
            <h2 className="text-sm sm:text-xl font-black text-slate-900 tracking-tight truncate">
              {t("studentMovementTitle") || "Resident Directory"}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] sm:text-xs font-bold text-emerald-800 border border-emerald-200">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="hidden xs:inline">{t("gateSynced") || "Gate Synced"}</span>
            <span className="xs:hidden">{tc("live") || "Live"}</span>
          </span>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1 rounded-full bg-white p-1.5 sm:px-3 sm:py-1.5 text-xs font-bold text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 active:scale-95 transition disabled:opacity-50 cursor-pointer"
              title={tc("refresh") || "Refresh"}
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 ${isLoading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{tc("refresh") || "Refresh"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs Row - smooth native horizontal scroll on mobile */}
      <div className="relative w-full max-w-full">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth p-1.5 sm:p-2 rounded-2xl bg-white/90 backdrop-blur-md border border-slate-200/80 shadow-xs touch-pan-x">
          {filterTabs.map((tab) => {
            const isSelected = filter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleSelectFilter(tab.key)}
                className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 whitespace-nowrap cursor-pointer active:scale-95 ${
                  isSelected
                    ? `${tab.color} scale-[1.01] shadow-md`
                    : "bg-slate-50/90 text-slate-700 border border-slate-200/80 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <tab.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black shrink-0 ${
                    isSelected ? tab.badgeActive : tab.badgeInactive
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search Bar & Pass Detail Toggle (when on Leave or Outing) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3 bg-white/80 backdrop-blur-md p-2.5 sm:p-3 rounded-2xl border border-slate-200/70">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchDirectoryPlaceholder") || "Search resident by name, roll, room or phone…"}
            className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 text-slate-800"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 text-xs font-semibold text-slate-500">
          {/* Sub-view switcher when filtered to On Leave or Outings */}
          {(filter === "onleave" || filter === "outside") && (
            <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200 text-xs font-bold">
              <button
                type="button"
                onClick={() => setViewMode("roster")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  viewMode === "roster" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] sm:text-xs">
                  <FileText className="h-3 w-3" />
                  {t("viewPassDetails") || "Pass Details"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                  viewMode === "cards" ? "bg-white text-slate-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <span className="flex items-center gap-1 text-[11px] sm:text-xs">
                  <Users className="h-3 w-3" />
                  {t("viewResidentCards") || "Cards"}
                </span>
              </button>
            </div>
          )}

          <span className="text-[11px] sm:text-xs font-semibold text-slate-500 whitespace-nowrap">
            {filter === "onleave" && viewMode === "roster"
              ? `${visibleLeaves.length} ${t("tabOnLeaveMobile") || "on leave"}`
              : filter === "outside" && viewMode === "roster"
              ? `${visibleOutings.length} ${t("tabOnOutingMobile") || "outings"}`
              : `${visibleStudents.length} ${t("tabResidentsMobile") || "students"}`}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      {/* Mode A: Specialized Leave Roster when filter is "onleave" and viewMode is "roster" */}
      {filter === "onleave" && viewMode === "roster" ? (
        <HostelOnLeaveRoster
          leaves={visibleLeaves}
          loading={loadingOnLeave || loadingStudents}
          onRefresh={onRefresh}
          hostelName={displayHostel}
        />
      ) : filter === "outside" && viewMode === "roster" ? (
        <HostelActiveOutingsRoster
          outings={visibleOutings}
          loading={loadingOutings || loadingStudents}
          onRefresh={onRefresh}
          hostelName={displayHostel}
        />
      ) : (
        /* Mode B: Unified Student Cards Directory */
        <div className="w-full max-w-full">
          {isLoading && students.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 bg-white/60 rounded-3xl border border-slate-200/60">
              <RefreshCw className="h-8 w-8 animate-spin text-indigo-500" />
              <p className="mt-3 text-xs font-bold uppercase tracking-wider text-slate-500">
                {tc("loading") || "Loading resident roster…"}
              </p>
            </div>
          ) : visibleStudents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center rounded-3xl bg-white/80 border border-dashed border-slate-300 shadow-xs">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                <CheckCircle2 className="h-7 w-7" />
              </div>
              <h4 className="mt-3 text-base font-bold text-slate-800">
                {search ? t("noMatchingStudents") || "No students match your search" : t("noResidentsFound") || "No residents in this view"}
              </h4>
              <p className="mt-1 text-xs text-slate-500 max-w-sm">
                {search
                  ? t("searchDifferentPrompt") || "Try searching with a different roll number, room number, or name."
                  : filter === "inside"
                  ? "All registered students in this hostel are accounted for."
                  : filter === "overdue"
                  ? "No students are currently overdue. Everyone returned on time!"
                  : t("noResidentsFoundDesc") || "No students match the current status filter."}
              </p>
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="mt-4 px-4 py-1.5 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                >
                  {tc("clearAll") || "Clear search"}
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:gap-3.5 sm:grid-cols-2 lg:grid-cols-3 w-full max-w-full">
              {visibleStudents.map((s) => {
                const st = s.campusStatus || "Inside";
                const theme = STATUS_THEMES[st] || STATUS_THEMES.Inside;
                const leave = leaveMap.get(String(s.id || s._id || s.studentId || ""));
                const outing = outingMap.get(String(s.id || s._id || s.studentId || ""));

                return (
                  <div
                    key={s._id || s.id}
                    className={`w-full max-w-full overflow-hidden rounded-2xl border bg-white p-3.5 sm:p-4.5 shadow-xs transition-all hover:shadow-md flex flex-col justify-between ${theme.cardBorder}`}
                  >
                    <div>
                      {/* Top Header: Avatar, Name, Roll, and Concise Status Badge */}
                      <div className="flex items-start justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className={`flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-xl font-black text-white bg-linear-to-br shadow-xs text-xs sm:text-sm ${theme.avatarBg}`}>
                            {(s.name || "?")[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h4 className="font-bold text-sm text-slate-900 truncate" title={s.name}>
                              {s.name}
                            </h4>
                            <p className="text-xs text-slate-500 font-medium truncate">
                              Roll: <span className="font-mono text-slate-700 font-bold">{s.studentId || "—"}</span>
                            </p>
                          </div>
                        </div>

                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ring-1 shrink-0 ${theme.badge}`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} />
                          <span>{statusShortLabels[st] || st}</span>
                        </span>
                      </div>

                      {/* Room & Academic Info Box */}
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-slate-50/90 p-2 sm:p-2.5 rounded-xl border border-slate-100 min-w-0">
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                            {t("room") || "Room"}
                          </span>
                          <span className="font-bold text-slate-800 truncate block">
                            {s.roomNumber ? `${t("room") || "Room"} ${s.roomNumber}` : t("notSpecified") || "Unassigned"}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block truncate">
                            {tc("department") || "Department"}
                          </span>
                          <span className="font-semibold text-slate-700 truncate block">
                            {s.department || "Engineering"} {s.year ? `• Y${s.year}` : ""}
                          </span>
                        </div>
                      </div>

                      {/* Contextual Movement Pass Details if outside or on leave */}
                      {st === "OnLeave" && leave && (
                        <div className="mt-2.5 rounded-xl bg-purple-50/70 p-2 sm:p-2.5 border border-purple-100 text-xs min-w-0">
                          <div className="flex items-center justify-between gap-1 text-purple-900 font-bold min-w-0">
                            <span className="truncate">→ {leave.destination || "Home"}</span>
                            {leave.isEmergency && (
                              <span className="inline-flex items-center gap-1 rounded bg-rose-600 px-1.5 py-0.2 text-[9px] font-extrabold text-white uppercase shrink-0">
                                <Siren className="h-2.5 w-2.5" /> Emergency
                              </span>
                            )}
                          </div>
                          {leave.returnDate && (
                            <p className="text-[11px] text-purple-700 mt-0.5 truncate">
                              Return: {new Date(leave.returnDate).toLocaleDateString(locale === "hi" ? "hi-IN" : "en-US", { month: "short", day: "numeric" })}
                            </p>
                          )}
                        </div>
                      )}

                      {st === "Outside" && outing && (
                        <div className="mt-2.5 rounded-xl bg-sky-50/70 p-2 sm:p-2.5 border border-sky-100 text-xs min-w-0">
                          <div className="flex items-center justify-between gap-1 text-sky-900 font-bold min-w-0">
                            <span className="truncate">{outing.destination || outing.purpose || "Market Outing"}</span>
                            <span className="text-[10px] text-sky-700 bg-sky-100 px-1.5 py-0.2 rounded font-semibold shrink-0">
                              {outing.outingType || "Outing"}
                            </span>
                          </div>
                        </div>
                      )}

                      {st === "Overdue" && (
                        <div className="mt-2.5 rounded-xl bg-rose-50 p-2 sm:p-2.5 border border-rose-200 text-xs flex items-center gap-2 text-rose-800 font-bold min-w-0">
                          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 animate-bounce" />
                          <span className="truncate">{t("overdueDesc") || "Curfew return deadline missed!"}</span>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Footer with Direct Call Buttons (Responsive & Wrap-Proof) */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100/90 flex flex-col gap-2">
                      {/* Student Phone */}
                      <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-600 truncate">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="font-mono font-medium truncate">{s.phoneNumber || t("noParentPhone") || "No phone"}</span>
                        </div>

                        {s.phoneNumber && (
                          <a
                            href={`tel:${s.phoneNumber}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 active:scale-95 transition shrink-0 cursor-pointer shadow-2xs"
                            title={t("callStudentOuting") || "Call Student"}
                          >
                            <PhoneCall className="h-3 w-3 text-indigo-600" />
                            <span>{locale === "hi" ? "छात्र" : "Call"}</span>
                          </a>
                        )}
                      </div>

                      {/* Guardian Phone (if provided) */}
                      {s.guardianPhoneNumber && (
                        <div className="flex items-center justify-between gap-2 text-xs min-w-0">
                          <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-slate-500 truncate">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                              {locale === "hi" ? "पालक:" : "Guardian:"}
                            </span>
                            <span className="font-mono truncate">{s.guardianPhoneNumber}</span>
                          </div>

                          <a
                            href={`tel:${s.guardianPhoneNumber}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 transition shrink-0 cursor-pointer shadow-2xs"
                            title={t("callParentOuting") || "Call Parent"}
                          >
                            <PhoneCall className="h-3 w-3 text-slate-500" />
                            <span>{locale === "hi" ? "पालक" : "Parent"}</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
