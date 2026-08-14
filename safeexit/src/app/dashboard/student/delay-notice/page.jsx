"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Clock,
  CheckCircle2,
  Loader2,
  CarFront,
  TrainFront,
  HeartPulse,
  Users,
  CloudRain,
  MoreHorizontal,
  AlertCircle,
  Send,
  ShieldCheck,
} from "lucide-react";
import StudentFeatureShell, {
  StudentFeaturePanel,
} from "@/app/components/student/StudentFeatureShell";
import StudentProfileBanner from "@/app/components/student/StudentProfileBanner";
import FeatureHeroStrip from "@/app/components/student/FeatureHeroStrip";
import { useStudentProfile } from "@/app/hooks/useStudentProfile";
import { apiFetch } from "@/app/lib/api";
import { useRequireAuth } from "@/app/lib/auth";
import AuthLoading from "@/app/components/AuthGate";

// Mirrors the DelayNotice model's reason enum — keep the two in step.
const reasons = [
  { key: "Traffic", label: "Stuck in traffic", desc: "Jam, roadblock, or diversion", icon: CarFront, tone: "text-amber-600", selectedBg: "bg-amber-50 border-amber-300" },
  { key: "Transport", label: "Transport delay", desc: "Late bus, train, or no cab available", icon: TrainFront, tone: "text-sky-600", selectedBg: "bg-sky-50 border-sky-300" },
  { key: "Medical", label: "Medical reason", desc: "Feeling unwell or at a clinic", icon: HeartPulse, tone: "text-rose-600", selectedBg: "bg-rose-50 border-rose-300" },
  { key: "Family", label: "Family reason", desc: "Held up with family or a guardian", icon: Users, tone: "text-violet-600", selectedBg: "bg-violet-50 border-violet-300" },
  { key: "Weather", label: "Bad weather", desc: "Rain or conditions making travel unsafe", icon: CloudRain, tone: "text-teal-600", selectedBg: "bg-teal-50 border-teal-300" },
  { key: "Other", label: "Other reason", desc: "Anything else keeping you back", icon: MoreHorizontal, tone: "text-slate-600", selectedBg: "bg-slate-50 border-slate-300" },
];

const formatWhen = (value) =>
  value
    ? new Date(value).toLocaleString("en-US", {
        day: "2-digit",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";

// <input type="datetime-local"> wants a local-time string, not an ISO/UTC one.
const toLocalInputValue = (date) => {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export default function DelayNotice() {
  const router = useRouter();
  const { checked, authorized } = useRequireAuth("student");
  const { display, hydrated } = useStudentProfile();

  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState("");
  const [expectedTime, setExpectedTime] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const [activeTrip, setActiveTrip] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(true);
  // Ticking clock so the "your return time has passed" warning appears on its own,
  // rather than reading Date.now() during render.
  const [now, setNow] = useState(() => Date.now());

  // The notice attaches to the outing the student is currently out on, so the
  // form only makes sense while one is live. Outings only — a leave return date
  // spans days and is not a same-day deadline to run late against.
  const load = useCallback(async () => {
    try {
      const [outings, notices] = await Promise.all([
        apiFetch("/outing/myrequests").catch(() => []),
        apiFetch("/delay/mine").catch(() => []),
      ]);

      const outing = (outings || []).find((o) => o.status === "Out");
      const out = outing
        ? { _id: outing._id, destination: outing.destination, dueAt: outing.inTime }
        : null;

      setActiveTrip(out);
      // Show the notice for the live trip; older ones stay in history, not here.
      const forTrip = out
        ? (notices || []).find((n) => String(n.trip) === String(out._id))
        : null;
      setNotice(forTrip || null);
      if (forTrip) {
        setSelected(forTrip.reason);
        setNote(forTrip.note || "");
      }
    } catch {
      /* best-effort — the empty state covers it */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of the student's live pass from the API, a client-only external source.
    load();
    // Refresh on focus so a gate scan (trip closed) reflects without a reload.
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(clock);
  }, []);

  const handleSend = async () => {
    if (!selected) return;
    setSending(true);
    setError("");
    try {
      const saved = await apiFetch("/delay", {
        method: "POST",
        body: JSON.stringify({
          reason: selected,
          note: note.trim() || undefined,
          newExpectedTime: expectedTime ? new Date(expectedTime).toISOString() : undefined,
        }),
      });
      setNotice(saved);
    } catch (err) {
      setError(err.message || "Could not send your delay notice. Please try again.");
    } finally {
      setSending(false);
    }
  };

  if (!checked || !authorized) return <AuthLoading />;

  const isOverdue = activeTrip && new Date(activeTrip.dueAt).getTime() < now;
  const acknowledged = notice?.status === "Acknowledged";

  return (
    <StudentFeatureShell
      eyebrow="Running Late"
      title="Inform Authorities"
      icon={Clock}
      iconTone="leave"
      onBack={() => router.push("/dashboard/student")}
      contentClassName="space-y-5"
    >
      <FeatureHeroStrip
        variant="leave"
        icon={Clock}
        title="Let your hostel know you'll be late"
        description="Your caretaker, warden and chief warden are informed straight away."
      />

      {hydrated && <StudentProfileBanner display={display} />}

      {loading ? (
        <StudentFeaturePanel className="p-10 text-center" delay={80}>
          <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-3">
            <Loader2 size={24} className="text-slate-400 animate-spin" />
          </div>
          <p className="font-sora font-semibold text-slate-700">Checking your active pass…</p>
        </StudentFeaturePanel>
      ) : !activeTrip ? (
        <StudentFeaturePanel className="p-10 text-center" delay={80}>
          <div className="w-14 h-14 rounded-2xl bg-linear-to-br from-slate-100 to-slate-200 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={24} className="text-slate-400" />
          </div>
          <p className="font-sora font-semibold text-slate-700">You&apos;re not out on an outing right now</p>
          <p className="text-sm text-slate-500 mt-1">
            A delay notice can only be sent while you are out on an approved outing pass.
          </p>
        </StudentFeaturePanel>
      ) : (
        <>
          {/* Live trip summary — the deadline they're measuring themselves against. */}
          <StudentFeaturePanel className="p-5" delay={80}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Current trip
                </p>
                <p className="font-sora font-extrabold text-slate-800 text-lg mt-0.5">
                  {activeTrip.destination}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Expected back
                </p>
                <p
                  className={`text-sm font-bold mt-0.5 ${isOverdue ? "text-rose-600" : "text-slate-700"}`}
                >
                  {formatWhen(activeTrip.dueAt)}
                </p>
              </div>
            </div>
            {isOverdue && (
              <p className="mt-3 pt-3 border-t border-rose-100 flex items-start gap-2 text-xs font-semibold text-rose-600">
                <AlertCircle size={14} className="shrink-0 mt-0.5" />
                Your return time has already passed. Sending a notice now still helps —
                your hostel will know why.
              </p>
            )}
          </StudentFeaturePanel>

          {notice ? (
            <StudentFeaturePanel className="p-6" delay={120}>
              <div className="flex items-start gap-4">
                <div
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${acknowledged ? "bg-emerald-100" : "bg-amber-100"}`}
                >
                  {acknowledged ? (
                    <CheckCircle2 size={22} className="text-emerald-600" />
                  ) : (
                    <Loader2 size={22} className="text-amber-600 animate-spin" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-sora font-extrabold text-slate-800 text-lg">
                    {acknowledged ? "Acknowledged" : "Notice sent"}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {acknowledged
                      ? `${notice.acknowledgedBy?.name || "Hostel staff"} has seen your message.`
                      : "Your hostel authorities have been notified and will see this shortly."}
                  </p>
                  {notice.acknowledgementNote && (
                    <p className="mt-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-700">
                      “{notice.acknowledgementNote}”
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-2xl p-4 space-y-2.5 bg-linear-to-br from-slate-50 to-sky-50/40 border border-slate-100/80">
                {[
                  { label: "Reason", value: reasons.find((r) => r.key === notice.reason)?.label || notice.reason },
                  ...(notice.note ? [{ label: "Your message", value: notice.note }] : []),
                  ...(notice.newExpectedTime
                    ? [{ label: "You said you'd reach by", value: formatWhen(notice.newExpectedTime) }]
                    : []),
                  { label: "Sent at", value: formatWhen(notice.createdAt) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between items-start gap-4 py-0.5">
                    <span className="text-xs text-slate-400 font-bold uppercase tracking-wider shrink-0">
                      {label}
                    </span>
                    <span className="text-sm font-bold text-slate-700 text-right break-words">
                      {value}
                    </span>
                  </div>
                ))}
              </div>

              {!acknowledged && (
                <button
                  type="button"
                  onClick={() => setNotice(null)}
                  className="mt-4 w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-bold hover:bg-slate-50 transition cursor-pointer"
                >
                  Update my notice
                </button>
              )}

              <p className="mt-4 text-xs text-slate-500 leading-relaxed">
                Your return time on the pass is unchanged, so this outing is still recorded
                as a late return. Reach the campus as soon as you safely can.
              </p>
            </StudentFeaturePanel>
          ) : (
            <>
              <StudentFeaturePanel className="p-5" delay={120}>
                <p className="font-sora font-bold text-slate-800">What&apos;s holding you up?</p>
                <div className="mt-3 grid gap-2.5">
                  {reasons.map(({ key, label, desc, icon: Icon, tone, selectedBg }) => {
                    const isSelected = selected === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelected(key)}
                        className={`flex items-center gap-3 rounded-2xl border p-3.5 text-left transition cursor-pointer ${
                          isSelected
                            ? `${selectedBg} shadow-xs`
                            : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <span className="w-10 h-10 rounded-xl bg-white flex items-center justify-center shrink-0 border border-slate-100">
                          <Icon size={18} className={tone} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold text-slate-800">{label}</span>
                          <span className="block text-xs text-slate-500 mt-0.5">{desc}</span>
                        </span>
                        {isSelected && (
                          <CheckCircle2 size={18} className="ml-auto shrink-0 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </StudentFeaturePanel>

              <StudentFeaturePanel className="p-5 space-y-4" delay={160}>
                <div>
                  <label
                    htmlFor="delay-note"
                    className="text-xs font-bold uppercase tracking-wider text-slate-400"
                  >
                    Add a message (optional)
                  </label>
                  <textarea
                    id="delay-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value.slice(0, 300))}
                    rows={3}
                    placeholder="e.g. Stuck near Patna Junction, the road is blocked. Starting back now."
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-sky-300"
                  />
                  <p className="mt-1 text-right text-[11px] font-semibold text-slate-400">
                    {note.length}/300
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="delay-eta"
                    className="text-xs font-bold uppercase tracking-wider text-slate-400"
                  >
                    When do you expect to reach? (optional)
                  </label>
                  <input
                    id="delay-eta"
                    type="datetime-local"
                    value={expectedTime}
                    min={toLocalInputValue(new Date())}
                    onChange={(e) => setExpectedTime(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-sky-300"
                  />
                  <p className="mt-1.5 text-[11px] text-slate-400 leading-relaxed">
                    This is shared with your hostel as information only — it does not change
                    the return time on your pass.
                  </p>
                </div>
              </StudentFeaturePanel>

              {error && (
                <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                  <AlertCircle size={15} className="text-rose-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-semibold text-rose-600">{error}</p>
                </div>
              )}

              <button
                type="button"
                disabled={!selected || sending}
                onClick={handleSend}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-indigo-700 via-indigo-600 to-cyan-500 px-4 py-3.5 text-sm font-bold text-white shadow-sm transition hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 cursor-pointer"
              >
                {sending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Sending…
                  </>
                ) : (
                  <>
                    <Send size={16} /> Notify my hostel authorities
                  </>
                )}
              </button>
            </>
          )}
        </>
      )}

      <div className="sf-notice sf-rise sf-stagger-4">
        <ShieldCheck size={14} className="text-sky-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          Informing your hostel early helps them account for you and avoids an unexplained
          overdue entry. If you are unsafe, use the SOS alert instead.
        </p>
      </div>

      <div className="h-4" />
    </StudentFeatureShell>
  );
}
