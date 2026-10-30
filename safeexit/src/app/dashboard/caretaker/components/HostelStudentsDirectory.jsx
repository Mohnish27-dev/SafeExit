"use client";

import { useMemo, useState } from "react";
import {
  Users,
  Search,
  RefreshCw,
  Phone,
  PhoneCall,
  UserCheck,
  UserRound,
  CalendarDays,
  Clock3,
  Shield,
  CheckCircle2,
} from "lucide-react";
import { useTranslation } from "@/app/lib/i18n";
import { getTranslatedHostelName } from "@/app/lib/hostels";

const STATUS_TONES = {
  Inside: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20",
  Outside: "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20",
  OnLeave: "bg-purple-50 text-purple-700 border-purple-200 ring-purple-500/20",
  Overdue: "bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20",
};

export default function HostelStudentsDirectory({
  students = [],
  loading = false,
  onRefresh,
  hostelName = "Kadambini",
  initialFilter = "all",
}) {
  const { t, locale } = useTranslation("caretaker");
  const displayHostel = getTranslatedHostelName(hostelName, locale);
  const { t: tc } = useTranslation("common");
  const [filterState, setFilterState] = useState({ initialFilter, filter: initialFilter || 'all' });
  const filter = filterState.initialFilter === initialFilter ? filterState.filter : initialFilter || 'all';
  const setFilter = (filter) => setFilterState({ initialFilter, filter });
  const [search, setSearch] = useState("");

  const statusLabels = {
    Inside: t("insideHostel") || "Inside Hostel",
    Outside: t("tabOnOutingMobile") || "On Outing",
    OnLeave: t("tabOnLeaveMobile") || "On Leave",
    Overdue: t("overdueStudents") || "Overdue",
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

  const visible = useMemo(() => {
    return students.filter((s) => {
      const st = s.campusStatus || "Inside";
      if (filter === "inside" && st !== "Inside") return false;
      if (filter === "outside" && st !== "Outside") return false;
      if (filter === "onleave" && st !== "OnLeave") return false;
      if (filter === "overdue" && st !== "Overdue") return false;

      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        (s.name || "").toLowerCase().includes(q) ||
        (s.studentId || "").toLowerCase().includes(q) ||
        (s.roomNumber || "").toLowerCase().includes(q) ||
        (s.department || "").toLowerCase().includes(q) ||
        (s.year || "").toLowerCase().includes(q)
      );
    });
  }, [students, filter, search]);

  return (
    <div className="sd-luxe-panel sd-glow-border sd-enter rounded-3xl p-4 sm:p-6 shadow-xl border border-white/80 bg-white/90 backdrop-blur-md">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-indigo-600 to-cyan-500 text-white shadow-md shadow-indigo-500/20">
              <Users className="h-4 w-4" />
            </span>
            <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-800">
              {t("residentsDirectory")}
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700">
              {t("registeredResidentsBadge", { count: students.length })}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t("residentsDirectoryDesc", { hostel: displayHostel })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl text-slate-600 bg-slate-100 hover:bg-slate-200 transition active:scale-95 disabled:opacity-50 cursor-pointer"
              title={t("syncBtn")}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{t("syncBtn")}</span>
            </button>
          )}

          <div className="relative flex-1 sm:w-56">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchDirectoryPlaceholder")}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="mt-4 flex flex-wrap gap-2">
        {[
          { key: "all", label: t("tabAllResidents"), count: counts.all, icon: Users },
          { key: "inside", label: t("insideHostel"), count: counts.inside, icon: UserCheck, color: "text-emerald-700 bg-emerald-50" },
          { key: "outside", label: t("tabOnOutingMobile"), count: counts.outside, icon: UserRound, color: "text-amber-700 bg-amber-50" },
          { key: "onleave", label: t("tabOnLeaveMobile"), count: counts.onleave, icon: CalendarDays, color: "text-purple-700 bg-purple-50" },
          { key: "overdue", label: t("overdueStudents"), count: counts.overdue, icon: Clock3, color: "text-rose-700 bg-rose-50" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              filter === tab.key
                ? "bg-slate-900 text-white shadow-md scale-[1.02]"
                : "bg-slate-100/80 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <tab.icon className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
            <span
              className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                filter === tab.key ? "bg-white/20 text-white" : "bg-white text-slate-700 shadow-xs"
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Roster Cards Grid */}
      <div className="mt-4">
        {loading && students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
            <p className="mt-2 text-xs font-bold uppercase tracking-wider">
              {tc("loading") || "Loading…"}
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl bg-slate-50/70 border border-dashed border-slate-200">
            <CheckCircle2 className="h-8 w-8 text-slate-300" />
            <p className="mt-2 text-sm font-bold text-slate-700">{t("noResidentsFound")}</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {t("noResidentsFoundDesc")}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((s) => {
              const st = s.campusStatus || "Inside";
              const tone = STATUS_TONES[st] || STATUS_TONES.Inside;
              const label = statusLabels[st] || st;

              return (
                <div
                  key={s._id || s.id}
                  className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-xs transition hover:shadow-md hover:border-indigo-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black text-white bg-linear-to-br from-indigo-500 to-cyan-500 shadow-sm">
                        {(s.name || "?")[0]}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-slate-900 truncate">
                          {s.name}
                        </h4>
                        <p className="text-xs text-slate-500 font-medium">
                          Roll: <span className="font-mono text-slate-700 font-bold">{s.studentId}</span>
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black border ring-1 shrink-0 ${tone}`}
                    >
                      {label}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {t("room")}
                      </span>
                      <span className="font-bold text-slate-800">
                        {s.roomNumber ? `${t("room")} ${s.roomNumber}` : t("notSpecified")}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {tc("department") || "Department"}
                      </span>
                      <span className="font-semibold text-slate-700 truncate block">
                        {s.department || "Engineering"}
                      </span>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div className="text-[11px] text-slate-600 truncate flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{s.phoneNumber || t("noParentPhone")}</span>
                    </div>

                    {s.phoneNumber && (
                      <a
                        href={`tel:${s.phoneNumber}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition cursor-pointer"
                        title={t("callStudentOuting")}
                      >
                        <PhoneCall className="h-3 w-3" />
                        <span>{t("callStudentOuting")}</span>
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
