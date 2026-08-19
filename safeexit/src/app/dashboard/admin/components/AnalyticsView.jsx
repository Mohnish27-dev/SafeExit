import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarRange,
  CheckCircle2,
  Clock3,
  DoorOpen,
  Info,
  RefreshCw,
  Siren,
  Sparkles,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { apiFetch } from "@/app/lib/api";

const PERIODS = [7, 30, 90];
const WEEKDAYS = [
  { day: 2, label: "Mon" },
  { day: 3, label: "Tue" },
  { day: 4, label: "Wed" },
  { day: 5, label: "Thu" },
  { day: 6, label: "Fri" },
  { day: 7, label: "Sat" },
  { day: 1, label: "Sun" },
];

const SOS_LABELS = {
  harassment: "Harassment",
  medical: "Medical",
  unsafe: "Unsafe area",
  stalking: "Stalking",
  other: "Other",
};

const formatShortDate = (value) =>
  new Date(`${value}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });

const formatDateTime = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatHour = (hour) => {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display} ${suffix}`;
};

function SectionHeading({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-indigo-500">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-xl font-bold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone }) {
  const tones = {
    indigo: "from-indigo-500 to-violet-600 bg-indigo-50 text-indigo-700 border-indigo-100",
    cyan: "from-cyan-500 to-sky-600 bg-cyan-50 text-cyan-700 border-cyan-100",
    amber: "from-amber-400 to-orange-500 bg-amber-50 text-amber-700 border-amber-100",
    rose: "from-rose-500 to-pink-600 bg-rose-50 text-rose-700 border-rose-100",
  };

  return (
    <div className={`relative overflow-hidden rounded-3xl border p-5 shadow-sm ${tones[tone]}`}>
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold opacity-75">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-900">{value}</p>
          <p className="mt-2 text-xs font-medium opacity-75">{detail}</p>
        </div>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${tones[tone].split(" ").slice(0, 2).join(" ")}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <span className="absolute -bottom-8 -right-7 h-24 w-24 rounded-full bg-white/45" />
    </div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-5" aria-label="Loading analytics">
      <div className="h-28 animate-pulse rounded-3xl bg-white/70" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-36 animate-pulse rounded-3xl bg-white/70" />
        ))}
      </div>
      <div className="h-96 animate-pulse rounded-3xl bg-white/70" />
    </div>
  );
}

function TrendChart({ outings, sos }) {
  const series = [
    { name: "Outings", color: "#4f46e5", values: outings },
    { name: "SOS", color: "#e11d48", values: sos },
  ];
  const width = 900;
  const height = 290;
  const bounds = { left: 50, right: 20, top: 22, bottom: 45 };
  const plotWidth = width - bounds.left - bounds.right;
  const plotHeight = height - bounds.top - bounds.bottom;
  const pointCount = outings.length;
  const rawMax = Math.max(1, ...series.flatMap((item) => item.values.map((point) => point.count)));
  const yMax = rawMax <= 5 ? rawMax : Math.ceil(rawMax / 5) * 5;
  const pointX = (index) => bounds.left + ((pointCount <= 1 ? 0 : index / (pointCount - 1)) * plotWidth);
  const pointY = (value) => bounds.top + plotHeight - ((value / yMax) * plotHeight);
  const pathFor = (values) => values.map((point, index) => `${index === 0 ? "M" : "L"} ${pointX(index)} ${pointY(point.count)}`).join(" ");
  const labelIndexes = Array.from(new Set([0, Math.floor((pointCount - 1) / 4), Math.floor((pointCount - 1) / 2), Math.floor(((pointCount - 1) * 3) / 4), pointCount - 1])).filter((index) => index >= 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((item) => (
          <span key={item.name} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.name}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="min-w-[650px]"
          role="img"
          aria-label="Daily outing and SOS activity trend"
        >
          <defs>
            <linearGradient id="outing-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const y = bounds.top + (plotHeight * ratio);
            const value = Math.round(yMax * (1 - ratio));
            return (
              <g key={ratio}>
                <line x1={bounds.left} x2={width - bounds.right} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 6" />
                <text x={bounds.left - 12} y={y + 4} textAnchor="end" className="fill-slate-400 text-[11px]">{value}</text>
              </g>
            );
          })}
          {outings.length > 1 && (
            <path
              d={`${pathFor(outings)} L ${pointX(outings.length - 1)} ${bounds.top + plotHeight} L ${pointX(0)} ${bounds.top + plotHeight} Z`}
              fill="url(#outing-area)"
            />
          )}
          {series.map((item) => (
            <g key={item.name}>
              <path d={pathFor(item.values)} fill="none" stroke={item.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              {item.values.map((point, index) => {
                const showPoint = pointCount <= 30 || index % Math.ceil(pointCount / 30) === 0 || index === pointCount - 1;
                return showPoint ? (
                  <circle key={point.date} cx={pointX(index)} cy={pointY(point.count)} r="3.25" fill="white" stroke={item.color} strokeWidth="2">
                    <title>{`${item.name}: ${point.count} on ${formatShortDate(point.date)}`}</title>
                  </circle>
                ) : null;
              })}
            </g>
          ))}
          {labelIndexes.map((index) => (
            <text key={index} x={pointX(index)} y={height - 14} textAnchor={index === 0 ? "start" : index === pointCount - 1 ? "end" : "middle"} className="fill-slate-400 text-[11px] font-medium">
              {formatShortDate(outings[index]?.date)}
            </text>
          ))}
        </svg>
      </div>
    </div>
  );
}

function WeekdayChart({ data }) {
  const counts = new Map(data.map((item) => [item.day, item.count]));
  const values = WEEKDAYS.map((item) => ({ ...item, count: counts.get(item.day) || 0 }));
  const max = Math.max(1, ...values.map((item) => item.count));

  return (
    <div className="mt-6 flex h-48 items-end justify-between gap-2 border-b border-slate-200 px-1 pb-7">
      {values.map((item) => (
        <div key={item.day} className="group relative flex h-full flex-1 items-end justify-center">
          <div
            className="relative w-full max-w-10 rounded-t-xl bg-gradient-to-t from-indigo-600 to-cyan-400 transition group-hover:from-indigo-500 group-hover:to-cyan-300"
            style={{ height: `${Math.max(item.count ? 12 : 3, (item.count / max) * 100)}%` }}
          >
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs font-bold text-slate-600">{item.count}</span>
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-slate-400">{item.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function DistributionBars({ rows, labelFor = (row) => row.type, color = "bg-indigo-500", emptyLabel }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  const max = Math.max(1, ...rows.map((row) => row.count));

  if (!rows.length) {
    return <p className="mt-8 rounded-2xl bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">{emptyLabel}</p>;
  }

  return (
    <div className="mt-6 space-y-5">
      {rows.map((row) => (
        <div key={labelFor(row)}>
          <div className="mb-2 flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold text-slate-700">{labelFor(row)}</span>
            <span className="font-bold text-slate-900">
              {row.count} <span className="font-medium text-slate-400">({total ? Math.round((row.count / total) * 100) : 0}%)</span>
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${(row.count / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function FrequencyBadge({ value }) {
  if (value >= 4) return <span className="rounded-full bg-rose-50 px-2.5 py-1 text-[11px] font-bold text-rose-600">Very frequent</span>;
  if (value >= 2) return <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">Frequent</span>;
  return <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-600">Occasional</span>;
}

function TopStudentsTable({ students }) {
  if (!students.length) {
    return <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">No completed or active outings in this period.</p>;
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            <th className="pb-3 pr-3">Rank</th>
            <th className="pb-3 pr-3">Student</th>
            <th className="pb-3 pr-3">Hostel</th>
            <th className="pb-3 pr-3 text-center">Outings</th>
            <th className="pb-3 pr-3">Weekly pace</th>
            <th className="pb-3 pr-3 text-center">Late</th>
            <th className="pb-3">Last outing</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student, index) => (
            <tr key={`${student.studentId}-${index}`} className="border-b border-slate-100 text-sm last:border-0">
              <td className="py-3.5 pr-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl font-black ${index < 3 ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                  {index + 1}
                </span>
              </td>
              <td className="py-3.5 pr-3">
                <p className="font-bold text-slate-800">{student.name}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-400">{student.registrationNumber} · {student.department}</p>
              </td>
              <td className="py-3.5 pr-3 font-medium text-slate-600">{student.hostelName}</td>
              <td className="py-3.5 pr-3 text-center text-base font-black text-slate-900">{student.count}</td>
              <td className="py-3.5 pr-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">{student.outingsPerWeek}/wk</span>
                  <FrequencyBadge value={student.outingsPerWeek} />
                </div>
              </td>
              <td className="py-3.5 pr-3 text-center">
                <span className={student.overdueReturns ? "font-black text-rose-600" : "font-semibold text-slate-400"}>{student.overdueReturns}</span>
              </td>
              <td className="py-3.5 text-xs font-semibold text-slate-500">{formatDateTime(student.lastOuting)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InsightCard({ icon: Icon, title, description, tone = "indigo" }) {
  const tones = {
    indigo: "border-indigo-100 bg-indigo-50/70 text-indigo-600",
    amber: "border-amber-100 bg-amber-50/70 text-amber-600",
    rose: "border-rose-100 bg-rose-50/70 text-rose-600",
    emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-600",
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white shadow-sm"><Icon className="h-4 w-4" /></span>
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsView() {
  const [days, setDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await apiFetch(`/admin/analytics?days=${days}`);
      setAnalytics(data);
      setError("");
    } catch (err) {
      setError(err.message || "Could not load analytics");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [days]);

  useEffect(() => {
    let cancelled = false;

    apiFetch(`/admin/analytics?days=${days}`)
      .then((data) => {
        if (cancelled) return;
        setAnalytics(data);
        setError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Could not load analytics");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [days]);

  const selectPeriod = (periodDays) => {
    if (periodDays === days) return;
    setLoading(true);
    setDays(periodDays);
  };

  const computed = useMemo(() => {
    if (!analytics) return null;
    const peakWeekday = [...analytics.outings.byWeekday].sort((a, b) => b.count - a.count)[0];
    const peakHour = [...analytics.outings.byHour].sort((a, b) => b.count - a.count)[0];
    const topSos = analytics.sos.byType[0];
    const weekdayName = WEEKDAYS.find((item) => item.day === peakWeekday?.day)?.label;
    return { peakWeekday, peakHour, topSos, weekdayName };
  }, [analytics]);

  if (loading && !analytics) return <AnalyticsSkeleton />;

  if (!analytics) {
    return (
      <div className="rounded-3xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <AlertTriangle className="mx-auto h-9 w-9 text-rose-500" />
        <h2 className="mt-3 text-lg font-bold text-slate-900">Analytics could not be loaded</h2>
        <p className="mt-1 text-sm text-slate-500">{error}</p>
        <button onClick={() => loadAnalytics()} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Try again</button>
      </div>
    );
  }

  const { outings, sos, period } = analytics;

  return (
    <section className="space-y-6">
      <div className="overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-800 p-6 text-white shadow-xl sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-indigo-100">
              <Activity className="h-3.5 w-3.5" /> Campus intelligence
            </span>
            <h1 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Student activity analytics</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-indigo-100/75">
              Actual gate outings and emergency signals in one operational view.
            </p>
          </div>
          <button
            onClick={() => loadAnalytics({ quiet: true })}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-white/15 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} /> Refresh data
          </button>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5">
          <div className="flex items-center gap-2 rounded-2xl bg-black/15 p-1.5" aria-label="Analytics period">
            {PERIODS.map((periodDays) => (
              <button
                key={periodDays}
                onClick={() => selectPeriod(periodDays)}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition ${days === periodDays ? "bg-white text-indigo-700 shadow-sm" : "text-indigo-100 hover:bg-white/10"}`}
              >
                {periodDays} days
              </button>
            ))}
          </div>
          <p className="inline-flex items-center gap-2 text-xs font-medium text-indigo-100/65">
            <CalendarRange className="h-4 w-4" /> {formatShortDate(period.start.slice(0, 10))} – {formatShortDate(period.end.slice(0, 10))} · IST
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Showing the last loaded data. Refresh failed: {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard icon={DoorOpen} label="Actual outings" value={outings.total} detail={`${outings.averagePerDay} per day · ${outings.overdueRate}% late returns`} tone="indigo" />
        <MetricCard icon={UserRound} label="Students going out" value={outings.uniqueStudents} detail={`${outings.averagePerStudent} outings per active student`} tone="cyan" />
        <MetricCard icon={Siren} label="SOS signals" value={sos.total} detail={`${sos.active} active · ${sos.resolved} resolved`} tone="rose" />
      </div>

      <div className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading
          eyebrow="Combined trend"
          title="Daily campus activity"
          description="Daily actual outings alongside SOS alerts. Hover chart points for exact values."
          action={<span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-500">Last {period.days} days</span>}
        />
        <div className="mt-5">
          <TrendChart outings={outings.trend} sos={sos.trend} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.75fr]">
        <div className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeading
            eyebrow="Outing frequency"
            title="10 most frequent students"
            description="Ranked using outings that were actually started at the gate, with late-return context."
            action={<span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-bold text-indigo-600"><TrendingUp className="h-3.5 w-3.5" /> Weekly pace</span>}
          />
          <TopStudentsTable students={outings.topStudents} />
          <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> “Very frequent” means 4+ actual outings/week; “Frequent” means 2–3.9/week. This is an activity signal, not a disciplinary label.
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeading eyebrow="Rhythm" title="Outings by weekday" description="Use peaks to plan gate and caretaker coverage." />
            <WeekdayChart data={outings.byWeekday} />
            <div className="mt-5 flex items-center justify-between rounded-2xl bg-indigo-50 px-4 py-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-400">Peak departure hour</p>
                <p className="mt-1 text-lg font-black text-slate-900">{computed.peakHour ? formatHour(computed.peakHour.hour) : "No activity"}</p>
              </div>
              <Clock3 className="h-7 w-7 text-indigo-500" />
            </div>
          </div>

          <div className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm sm:p-6">
            <SectionHeading eyebrow="Classification" title="Outing types" description="Distribution of actual trips by pass type." />
            <DistributionBars rows={outings.byType} color="bg-gradient-to-r from-indigo-600 to-cyan-400" emptyLabel="No outings in this period." />
          </div>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm sm:p-6">
          <SectionHeading
            eyebrow="Safety"
            title="SOS alerts by type"
            description="Separate emergency patterns so recurring safety issues are easier to spot."
            action={<span className={`rounded-full px-3 py-1.5 text-xs font-bold ${sos.active ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700"}`}>{sos.active} active</span>}
          />
          <DistributionBars rows={sos.byType} labelFor={(row) => SOS_LABELS[row.type] || row.type} color="bg-gradient-to-r from-rose-600 to-orange-400" emptyLabel="No SOS alerts in this period." />
          <div className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-slate-50 p-3 text-center">
            <div><p className="text-lg font-black text-rose-600">{sos.active}</p><p className="text-[10px] font-bold uppercase text-slate-400">Active</p></div>
            <div className="border-x border-slate-200"><p className="text-lg font-black text-amber-600">{sos.acknowledged}</p><p className="text-[10px] font-bold uppercase text-slate-400">Acknowledged</p></div>
            <div><p className="text-lg font-black text-emerald-600">{sos.resolved}</p><p className="text-[10px] font-bold uppercase text-slate-400">Resolved</p></div>
          </div>
          <p className="mt-3 text-center text-[11px] font-medium text-slate-400">Average time to the latest handled status: {sos.averageHandlingMinutes} minutes</p>
        </div>
      </div>

      <div className="rounded-3xl border border-indigo-100 bg-white p-5 shadow-sm sm:p-6">
        <SectionHeading eyebrow="Automatic readout" title="What deserves attention" description="Quick interpretations of the selected period; validate context before taking action." action={<Sparkles className="h-5 w-5 text-indigo-500" />} />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <InsightCard icon={CalendarRange} title={computed.weekdayName ? `${computed.weekdayName} is the busiest day` : "No outing peak yet"} description={computed.peakWeekday ? `${computed.peakWeekday.count} actual outings occurred on this weekday in the selected period.` : "There is not enough outing activity to establish a pattern."} />
          <InsightCard icon={Siren} title={computed.topSos ? `${SOS_LABELS[computed.topSos.type] || computed.topSos.type} is the top SOS type` : "No SOS pattern detected"} description={computed.topSos ? `${computed.topSos.count} of ${sos.total} SOS signals were classified this way.` : "No SOS alerts were raised in this period."} tone="rose" />
          <InsightCard icon={outings.overdueReturns ? AlertTriangle : CheckCircle2} title={outings.overdueReturns ? `${outings.overdueReturns} late returns to review` : "No late returns recorded"} description={outings.total ? `${outings.overdueRate}% of actual outings in this period were returned late.` : "There were no actual outings in this period."} tone={outings.overdueReturns ? "rose" : "emerald"} />
        </div>
      </div>
    </section>
  );
}
