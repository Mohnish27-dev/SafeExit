"use client";

import { useEffect, useState } from "react";
import {
  Clock,
  Compass,
  MapPin,
  Phone,
  PhoneCall,
  Search,
  RefreshCw,
  User,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Tag,
} from "lucide-react";
import { useTranslation, useDateLocale } from "@/app/lib/i18n";
import { getTranslatedHostelName } from "@/app/lib/hostels";

export default function HostelActiveOutingsRoster({
  outings = [],
  loading = false,
  onRefresh,
  hostelName = "Kadambini",
}) {
  const { t, locale } = useTranslation("caretaker");
  const displayHostel = getTranslatedHostelName(hostelName, locale);
  const { t: tc } = useTranslation("common");
  const dateLocale = useDateLocale();
  const [search, setSearch] = useState("");
  const [now, setNow] = useState(null);
  useEffect(() => {
    const update = () => setNow(Date.now());
    const initial = setTimeout(update, 0);
    const interval = setInterval(update, 30000);
    return () => { clearTimeout(initial); clearInterval(interval); };
  }, []);

  const filteredOutings = outings.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const s = item.student || {};
    return (
      (s.name || "").toLowerCase().includes(q) ||
      (s.rollNumber || s.studentId || "").toLowerCase().includes(q) ||
      (s.roomNumber || "").toLowerCase().includes(q) ||
      (item.destination || "").toLowerCase().includes(q) ||
      (item.purpose || "").toLowerCase().includes(q) ||
      (item.outingType || "").toLowerCase().includes(q)
    );
  });

  const formatClock = (dateStr) => {
    if (!dateStr) return "N/A";
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleTimeString(dateLocale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getPunctualityMeta = (inTimeStr) => {
    if (!inTimeStr || now === null) return null;
    const due = new Date(inTimeStr).getTime();
    if (!Number.isFinite(due)) return null;
    const diffMins = Math.round((due - now) / 60000);

    if (diffMins < 0) {
      const lateMins = Math.abs(diffMins);
      const h = Math.floor(lateMins / 60);
      const m = lateMins % 60;
      const label = h > 0 ? t("lateByHours", { h, m }) : t("lateByMins", { mins: lateMins });
      return {
        label,
        badgeClass: "bg-rose-50 text-rose-700 border-rose-200 ring-rose-500/20",
        overdue: true,
      };
    } else if (diffMins <= 30) {
      return {
        label: t("dueInMins", { mins: diffMins }),
        badgeClass: "bg-amber-50 text-amber-700 border-amber-200 ring-amber-500/20",
        overdue: false,
      };
    } else {
      const h = Math.floor(diffMins / 60);
      const m = diffMins % 60;
      const label = h > 0 ? t("dueInHours", { h, m }) : t("dueInMins", { mins: diffMins });
      return {
        label,
        badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-500/20",
        overdue: false,
      };
    }
  };

  return (
    <div className="sd-luxe-panel sd-glow-border sd-enter rounded-3xl p-4 sm:p-6 shadow-xl border border-white/80 bg-white/90 backdrop-blur-md">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-linear-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-500/20">
              <Compass className="h-4 w-4" />
            </span>
            <h3 className="text-base sm:text-lg font-black tracking-tight text-slate-800">
              {t("activeOutingsRoster")}
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
              {t("currentlyOutsideBadge", { count: outings.length })}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {t("activeOutingsDesc")}
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
              placeholder={t("searchOutingsPlaceholder")}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white/80 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Outings Roster List */}
      <div className="mt-4 space-y-3">
        {loading && outings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
            <p className="mt-2 text-xs font-bold uppercase tracking-wider">
              {tc("loading") || "Loading…"}
            </p>
          </div>
        ) : filteredOutings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-2xl bg-slate-50/70 border border-dashed border-slate-200">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <p className="mt-3 text-sm font-bold text-slate-700">
              {search.trim() ? t("noMatchingStudents") : t("noOutingsActiveHeader")}
            </p>
            <p className="mt-1 text-xs text-slate-400 max-w-sm">
              {search.trim()
                ? t("searchDifferentPrompt")
                : t("noOutingsActiveDesc", { hostel: displayHostel })}
            </p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2">
            {filteredOutings.map((item) => {
              const student = item.student || {};
              const punctuality = getPunctualityMeta(item.inTime);

              return (
                <div
                  key={item._id || item.id}
                  className={`relative overflow-hidden rounded-2xl border p-4 transition-all duration-200 hover:shadow-md bg-white ${
                    punctuality?.overdue
                      ? "border-rose-300 ring-1 ring-rose-200 bg-rose-50/30"
                      : "border-slate-200/90 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black text-white bg-linear-to-br from-amber-500 to-orange-500 shadow-sm">
                        {(student.name || "?")[0]}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-sm text-slate-900 truncate">
                            {student.name || "Student"}
                          </h4>
                          {punctuality && (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border ring-1 ${punctuality.badgeClass}`}
                            >
                              {punctuality.overdue && (
                                <AlertTriangle className="h-3 w-3 animate-pulse text-rose-600" />
                              )}
                              {punctuality.label}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          Roll: <span className="font-mono text-slate-700 font-bold">{student.rollNumber || student.studentId || "—"}</span>
                          {student.roomNumber && (
                            <> • {t("roomLabel", { room: student.roomNumber })}</>
                          )}
                        </p>
                      </div>
                    </div>

                    <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200">
                      {item.outingType || "Market"}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {t("departedAt")}
                      </span>
                      <span className="font-semibold text-slate-700">
                        {formatClock(item.outTime)}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {t("expectedReturn")}
                      </span>
                      <span className={`font-bold ${punctuality?.overdue ? "text-rose-600" : "text-slate-800"}`}>
                        {formatClock(item.inTime)}
                      </span>
                    </div>

                    <div className="col-span-2 pt-1 border-t border-slate-200/50">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        {t("destination")}
                      </span>
                      <p className="font-medium text-slate-800 truncate">
                        <MapPin className="inline h-3 w-3 mr-1 text-slate-400" />
                        {item.destination} {item.purpose ? `(${item.purpose})` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                    <div className="text-[11px] text-slate-500 flex items-center gap-1.5 truncate">
                      <Phone className="h-3 w-3 text-slate-400 shrink-0" />
                      <span>{student.phoneNumber || t("noParentPhone")}</span>
                    </div>

                    {student.phoneNumber && (
                      <a
                        href={`tel:${student.phoneNumber}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 transition cursor-pointer"
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
