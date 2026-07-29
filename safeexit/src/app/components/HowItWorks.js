"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Smartphone, CheckSquare, EyeOff, ShieldCheck,
  QrCode, FileCheck, Clock, MapPin, Lock, Sparkles, Play, Pause,
} from "lucide-react";
import useScrollReveal from "../hooks/useScrollReveal";

// Each step owns its icon, copy, and a "stage" preview for the right panel.
const STEPS = [
  {
    num: "01",
    icon: Smartphone,
    title: "File Digital Request",
    description: "Students submit outing requests in the portal, specifying their destination and estimated return time.",
    accent: "from-indigo-500 to-indigo-600",
    tint: "text-indigo-600 dark:text-indigo-400",
  },
  {
    num: "02",
    icon: CheckSquare,
    title: "Smart Approval Routing",
    description: "Caretakers review and approve outing requests through their dashboard; students are notified once approved.",
    accent: "from-violet-500 to-violet-600",
    tint: "text-violet-600 dark:text-violet-400",
  },
  {
    num: "03",
    icon: EyeOff,
    title: "Secure Verification",
    description: "The student's identity QR is scanned at the gate — approval is verified live against the server, so a screenshot can never fake a pass.",
    accent: "from-emerald-500 to-emerald-600",
    tint: "text-emerald-600 dark:text-emerald-400",
  },
  {
    num: "04",
    icon: ShieldCheck,
    title: "Activity Logging",
    description: "Every outing request, caretaker decision, gate scan, and SOS event is logged and available to administrators in real time.",
    accent: "from-cyan-500 to-cyan-600",
    tint: "text-cyan-600 dark:text-cyan-400",
  },
];

const AUTOPLAY_MS = 3200;

// ── Stage previews (right panel) ──────────────────────────────────────────
function StageRequest() {
  return (
    <div className="journey-stage space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300">Outing Request</span>
        <span className="text-[10px] font-mono text-slate-500">Draft</span>
      </div>
      <div className="space-y-2">
        <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
          <p className="text-[9px] text-slate-500 font-bold uppercase">Destination</p>
          <p className="text-sm text-white font-semibold">New Delhi (Hometown)</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-indigo-300" />
            <span className="text-xs text-slate-300 font-medium">9:30 PM</span>
          </div>
          <div className="rounded-lg bg-slate-800/60 border border-white/10 px-3 py-2 flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-xs text-slate-400 font-medium">Return by 10PM</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function StageApproval() {
  return (
    <div className="journey-stage space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-violet-300">Approval Routing</span>
        <span className="text-[10px] font-mono text-slate-500">REQ-4091</span>
      </div>
      <div className="approve-bar h-2 w-full"></div>
      <div className="space-y-2 pt-1">
        {["Policy check passed", "Caretaker reviewed & approved", "QR pass issued to student"].map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-xs text-slate-300 font-medium">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">
              <CheckSquare className="h-2.5 w-2.5" />
            </span>
            {t}
          </div>
        ))}
      </div>
    </div>
  );
}

function StageQR() {
  return (
    <div className="journey-stage flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0 rounded-xl bg-white/5 border border-emerald-500/40 flex items-center justify-center overflow-hidden">
        <QrCode className="h-14 w-14 text-emerald-300" />
        <div className="feature-scanline"></div>
      </div>
      <div className="space-y-2">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
          <Sparkles className="h-2.5 w-2.5" /> Identity-Only Pass
        </span>
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <EyeOff className="h-3.5 w-3.5 text-emerald-300" /> Approval verified live from the server
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
          <Clock className="h-3.5 w-3.5 text-emerald-300" /> Screenshots can&apos;t fake a pass
        </div>
      </div>
    </div>
  );
}

function StageLog() {
  const rows = [
    { t: "21:32:04", a: "QR scanned · Gate 1 · Exit OUT", c: "text-cyan-300" },
    { t: "21:32:05", a: "Caretaker decision recorded", c: "text-emerald-300" },
    { t: "21:32:06", a: "Admin log updated", c: "text-emerald-300" },
  ];
  return (
    <div className="journey-stage space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Activity Log</span>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-300">
          <Lock className="h-2.5 w-2.5" /> Recorded
        </span>
      </div>
      <div className="rounded-lg bg-black/40 border border-cyan-500/20 p-3 space-y-1.5 font-mono">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="text-slate-600 shrink-0">{r.t}</span>
            <span className={`font-medium ${r.c}`}>{r.a}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs text-cyan-300 font-semibold">
        <MapPin className="h-3.5 w-3.5" /> Full activity trail visible to admins
      </div>
    </div>
  );
}

const STAGES = [StageRequest, StageApproval, StageQR, StageLog];

export default function HowItWorks() {
  useScrollReveal();
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const sectionRef = useRef(null);
  const [visible, setVisible] = useState(false);

  // Only autoplay while the section is on-screen (saves cycles + feels alive).
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.35 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!playing || !visible) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STEPS.length), AUTOPLAY_MS);
    return () => clearInterval(id);
  }, [playing, visible]);

  const handleSelect = useCallback((i) => {
    setActive(i);
    setPlaying(false); // manual interaction takes over
  }, []);

  const Stage = STAGES[active];
  const progressPct = STEPS.length > 1 ? (active / (STEPS.length - 1)) * 100 : 0;

  return (
    <section
      ref={sectionRef}
      id="how-it-works"
      className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-[#f6f8ff] via-white to-[#eef4ff] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:bg-slate-950 border-t border-slate-200/55 dark:border-slate-800/55 relative overflow-hidden"
    >
      <div className="absolute -top-24 left-10 h-64 w-64 rounded-full bg-cyan-200/25 blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-indigo-200/25 blur-3xl -z-10"></div>
      <div className="absolute inset-0 bg-dot-pattern opacity-25 -z-10"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 space-y-4 reveal">
          <h2 className="text-xs font-bold text-cyan-600 uppercase tracking-widest">
            Student Safety Workflow
          </h2>
          <h3 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white dark:drop-shadow-[0_2px_16px_rgba(56,189,248,0.2)] tracking-tight">
            Follow One Safe Exit, End to End
          </h3>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 font-medium">
            Watch a single request travel the whole pipeline — tap any step to explore, or let it play.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
          {/* ── Left: interactive step list ── */}
          <div className="lg:col-span-7 reveal">
            {/* Desktop horizontal rail */}
            <div className="hidden md:block relative pt-4 pb-2">
              <div className="journey-rail left-[11%] right-[11%] top-9 h-1">
                <div
                  className="journey-fill"
                  style={{ transform: `scaleX(${STEPS.length > 1 ? active / (STEPS.length - 1) : 0})` }}
                ></div>
              </div>
              <div
                className="journey-comet"
                style={{ left: `calc(11% + ${progressPct * 0.78}%)`, top: "2.5rem" }}
              ></div>

              <div className="grid grid-cols-4 gap-4 relative">
                {STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const state = i === active ? "active" : i < active ? "done" : "idle";
                  return (
                    <button
                      key={step.num}
                      onClick={() => handleSelect(i)}
                      className={`journey-node journey-node--${state} flex flex-col items-center text-center gap-3 group outline-none`}
                      aria-label={step.title}
                    >
                      <span className="relative h-16 w-16 rounded-2xl card-elevated flex items-center justify-center journey-node__ring">
                        <span className="journey-node__pulse absolute inset-0 rounded-2xl bg-indigo-500/30"></span>
                        <Icon className={`h-6 w-6 relative z-10 ${i === active ? "text-white" : step.tint}`} />
                        <span className="absolute -top-3 -right-3 z-10 text-[11px] font-black text-slate-400 dark:text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 h-6 w-6 rounded-full flex items-center justify-center">
                          {step.num}
                        </span>
                      </span>
                      <span className={`text-sm font-bold transition-colors ${i === active ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                        {step.title}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile vertical list */}
            <div className="md:hidden relative pl-8">
              <div className="absolute left-[11px] top-2 bottom-2 w-[3px] rounded-full bg-slate-200 dark:bg-slate-800"></div>
              <div className="journey-progress-line left-[11px]" style={{ height: `${progressPct}%` }}></div>
              <div className="space-y-4">
                {STEPS.map((step, i) => {
                  const Icon = step.icon;
                  const isActive = i === active;
                  return (
                    <button
                      key={step.num}
                      onClick={() => handleSelect(i)}
                      className={`w-full text-left flex items-start gap-3 rounded-2xl p-4 border transition-all ${
                        isActive
                          ? "card-elevated border-indigo-300/60 dark:border-indigo-800"
                          : "border-transparent opacity-70"
                      }`}
                    >
                      <span className={`h-9 w-9 shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br ${step.accent} text-white shadow`}>
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <span>
                        <span className="block text-sm font-bold text-slate-900 dark:text-white">{step.title}</span>
                        <span className="block text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">{step.description}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Active description + controls (desktop) */}
            <div className="hidden md:flex items-center justify-between gap-4 mt-8 rounded-2xl card-elevated px-5 py-4">
              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium max-w-lg">
                <span className="font-bold text-slate-900 dark:text-white">{STEPS[active].title}:</span>{" "}
                {STEPS[active].description}
              </p>
              <button
                onClick={() => setPlaying((p) => !p)}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                {playing ? "Pause" : "Play"}
              </button>
            </div>
          </div>

          {/* ── Right: morphing device preview ── */}
          <div className="lg:col-span-5 reveal" style={{ transitionDelay: "120ms" }}>
            <div className="relative mx-auto max-w-sm">
              {/* Glow */}
              <div className="absolute -inset-4 bg-gradient-to-tr from-indigo-500/20 to-cyan-400/20 blur-2xl rounded-[2rem] -z-10"></div>

              {/* Device frame */}
              <div className="rounded-[2rem] bg-slate-950 border border-slate-800 p-3 shadow-2xl shadow-indigo-900/30">
                <div className="rounded-[1.5rem] bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800/80 overflow-hidden">
                  {/* Status bar */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/80">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NITP-SafeExit Live</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-600">Step {active + 1}/4</span>
                  </div>

                  {/* Morphing stage */}
                  <div className="p-4 min-h-[188px] flex flex-col justify-center">
                    <Stage key={active} />
                  </div>

                  {/* Footer progress dots */}
                  <div className="flex items-center justify-center gap-1.5 pb-4">
                    {STEPS.map((_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 rounded-full transition-all duration-500 ${
                          i === active ? "w-6 bg-cyan-400" : "w-1.5 bg-slate-700"
                        }`}
                      ></span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
