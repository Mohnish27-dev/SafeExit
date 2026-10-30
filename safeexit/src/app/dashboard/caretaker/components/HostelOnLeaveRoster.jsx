"use client";

import { useState } from "react";
import {
  CalendarDays,
  MapPin,
  Phone,
  PhoneCall,
  Search,
  RefreshCw,
  Clock,
  User,
  AlertCircle,
  Siren,
  Sparkles,
  PlaneTakeoff,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import { getTranslatedHostelName } from "@/app/lib/hostels";

export default function HostelOnLeaveRoster({
  leaves = [],
  loading = false,
  onRefresh,
  hostelName = "Kadambini",
}) {
  const { t, locale } = useTranslation("caretaker");
  const displayHostel = getTranslatedHostelName(hostelName, locale);
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();
  const [search, setSearch] = useState("");

  const filteredLeaves = leaves.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const s = item.student || {};
    return (
      (s.name || "").toLowerCase().includes(q) ||
      (s.rollNumber || s.studentId || "").toLowerCase().includes(q) ||
      (s.roomNumber || "").toLowerCase().includes(q) ||
      (item.destination || "").toLowerCase().includes(q) ||
      (item.reason || "").toLowerCase().includes(q)
    );
  });

  const formatDate = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(dateLocale, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString(dateLocale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getReturnStatus = (returnDateStr) => {
    if (!returnDateStr) return null;
    const returnDate = new Date(returnDateStr);
    const now = new Date();
    const diffHours = (returnDate - now) / (1000 * 60 * 60);

    if (diffHours < 0) {
      return {
        label: t("returnOverdueBadge"),
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20",
        urgent: true,
      };
    } else if (diffHours < 24) {
      return {
        label: t("expectedTodayBadge"),
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20",
        urgent: false,
      };
    } else {
      const days = Math.ceil(diffHours / 24);
      return {
        label: t("returnInDays", {
          days,
          unit: days === 1 ? t("dayUnit") : t("daysUnit"),
        }),
        badgeClass: "bg-violet-50 text-violet-700 border-violet-200 ring-violet-500/20",
        urgent: false,
      };
    }
  };

  return (
    <div className="sd-luxe-panel sd-glow-border sd-enter rounded-3xl p-4 sm:p-6 shadow-xl border border-white/80 bg-white/90 backdrop-blur-md">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20">
              <PlaneTakeoff className="h-4 w-4" />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-violet-600">
              {t("hostelBadgeTitle", { hostel: displayHostel })}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-100/80 px-2.5 py-0.5 text-xs font-bold text-violet-700">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-600 animate-pulse" />
              {t("currentlyAwayBadge", { count: leaves.length })}
            </span>
          </div>
          <h3 className="text-xl font-bold text-slate-900 mt-1">
            {t("activeLeaveRoster")}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("activeLeaveDesc")}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              title={t("syncBtn")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-600" : "text-slate-500"}`} />
              <span className="hidden sm:inline">{t("syncBtn")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search Filter */}
      {leaves.length > 0 && (
        <div className="pt-4 pb-2">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchLeavePlaceholder")}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-violet-500 focus:bg-white transition"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                {tc("clearAll") || "Clear"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Content Area */}
      <div className="mt-4">
        {loading && leaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <RefreshCw className="h-8 w-8 animate-spin text-violet-500 mb-3" />
            <p className="text-sm font-semibold text-slate-600">{t("loadingLeave")}</p>
          </div>
        ) : filteredLeaves.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-violet-100 bg-violet-50/30 p-8 text-center sm:p-12">
            <div className="relative mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-md text-violet-600 ring-4 ring-violet-50">
              <ShieldCheck className="h-7 w-7 text-emerald-600" />
            </div>
            <h4 className="text-base font-bold text-slate-800">
              {search ? t("noMatchingStudents") : t("allStudentsAccountedFor")}
            </h4>
            <p className="mt-1 max-w-md text-xs sm:text-sm text-slate-500">
              {search
                ? t("searchDifferentPrompt")
                : t("noLeaveActiveDesc", { hostel: displayHostel })}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {filteredLeaves.map((item) => {
              const s = item.student || {};
              const returnStatus = getReturnStatus(item.returnDate);
              const parentPhone = item.parentPhone || s.guardianPhoneNumber;
              const studentPhone = s.phoneNumber;

              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition hover:shadow-md hover:border-violet-300"
                >
                  {/* Top info */}
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-violet-600 to-indigo-600 font-bold text-white shadow-sm">
                          {s.name
                            ? s.name
                                .split(" ")
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join("")
                                .toUpperCase()
                            : "ST"}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-900 text-sm truncate">
                            {s.name || "Student"}
                          </h4>
                          <p className="text-xs text-slate-500 font-mono mt-0.5">
                            {s.rollNumber || s.studentId || "No Roll"}
                            {s.roomNumber ? ` • ${t("roomLabel", { room: s.roomNumber })}` : ""}
                          </p>
                        </div>
                      </div>

                      {item.isEmergency ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white uppercase tracking-wider shadow-xs">
                          <Siren className="h-3 w-3" /> {t("emergencyBadge")}
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-700 border border-violet-200">
                          {t("tabOnLeaveMobile")}
                        </span>
                      )}
                    </div>

                    {/* Return Status Badge */}
                    {returnStatus && (
                      <div className="mt-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold ring-1 ${returnStatus.badgeClass}`}
                        >
                          <Clock className="h-3.5 w-3.5" />
                          {returnStatus.label} ({formatDate(item.returnDate)})
                        </span>
                      </div>
                    )}

                    {/* Destination & Reason */}
                    <div className="mt-3 rounded-xl bg-slate-50 p-2.5 text-xs text-slate-700 space-y-1 border border-slate-100">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
                        <span className="font-medium text-slate-900 truncate">
                          {item.destination || t("notSpecified")}
                        </span>
                      </div>
                      {item.reason && (
                        <p className="text-slate-500 line-clamp-2 pl-5 text-[11px]">
                          {item.reason}
                        </p>
                      )}
                    </div>

                    {/* Departure Info */}
                    <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 px-1">
                      <span>{t("leftCampusOn")}</span>
                      <span className="font-medium text-slate-700">
                        {formatDateTime(item.leaveDate || item.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions / Contact buttons */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                    {parentPhone ? (
                      <a
                        href={`tel:${parentPhone}`}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-violet-700 active:scale-95"
                        title={`${t("callParentBtn")}: ${parentPhone}`}
                      >
                        <PhoneCall className="h-3.5 w-3.5" />
                        <span>{t("callParentBtn")}</span>
                      </a>
                    ) : (
                      <span className="flex-1 text-center text-[11px] text-slate-400 py-1">
                        {t("noParentPhone")}
                      </span>
                    )}

                    {studentPhone && (
                      <a
                        href={`tel:${studentPhone}`}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-xs transition hover:bg-slate-50 active:scale-95"
                        title={`${t("callStudentBtn")}: ${studentPhone}`}
                      >
                        <Phone className="h-3.5 w-3.5 text-slate-500" />
                        <span className="sr-only">{t("callStudentBtn")}</span>
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
