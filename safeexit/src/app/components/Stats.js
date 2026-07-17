"use client";

import { Shield, Building, QrCode, ClipboardCheck } from "lucide-react";
import useScrollReveal from "../hooks/useScrollReveal";
import useCountUp from "../hooks/useCountUp";

// Each stat animates its number from 0 → target when scrolled into view.
function StatCard({ icon, target, suffix, label, desc, bg, accent, delay }) {
  const [ref, value] = useCountUp(target);
  const display = Math.round(value).toLocaleString();

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className="reveal card-3d-hover relative overflow-hidden p-5 sm:p-6 rounded-2xl card-elevated space-y-4 group"
    >
      {/* Accent glow that blooms on hover */}
      <div className={`absolute -top-10 -right-10 h-28 w-28 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 ${accent}`}></div>

      <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${bg} relative z-10`}>
        {icon}
      </div>
      <div className="space-y-1 relative z-10">
        <h4 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white tracking-tight count-glow tabular-nums">
          {display}<span className="text-cyan-500">{suffix}</span>
        </h4>
        <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200">{label}</h5>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">{desc}</p>
      </div>

      {/* Bottom accent line grows in on hover */}
      <span className="absolute bottom-0 left-0 h-[3px] w-0 group-hover:w-full transition-all duration-500 bg-gradient-to-r from-indigo-500 to-cyan-400"></span>
    </div>
  );
}

export default function Stats() {
  useScrollReveal();

  const statsList = [
    { icon: <Shield className="h-5 w-5 text-indigo-600" />, target: 1200, suffix: "+", label: "Students Protected", desc: "Contact details masked and shielded from gate log leakage.", bg: "bg-indigo-50/70 dark:bg-indigo-950/40", accent: "bg-indigo-400/40" },
    { icon: <Building className="h-5 w-5 text-violet-600" />, target: 15, suffix: "+", label: "Institutions Enrolled", desc: "Universities replacing paper registers with SafeExit.", bg: "bg-violet-50/70 dark:bg-violet-950/40", accent: "bg-violet-400/40" },
    { icon: <QrCode className="h-5 w-5 text-emerald-600" />, target: 5000, suffix: "+", label: "Secure Check-Ins", desc: "Seamless entry and exit scans completed in seconds.", bg: "bg-emerald-50/70 dark:bg-emerald-950/40", accent: "bg-emerald-400/40" },
    { icon: <ClipboardCheck className="h-5 w-5 text-cyan-600" />, target: 800, suffix: "+", label: "Requests Approved Daily", desc: "Automatic travel ticket validation bypassing manual hold-ups.", bg: "bg-cyan-50/70 dark:bg-cyan-950/40", accent: "bg-cyan-400/40" },
  ];

  return (
    <section
      id="metrics"
      className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-[#f4f7ff] via-white to-[#edf4ff] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:bg-slate-950 border-t border-slate-200/55 dark:border-slate-800/55 relative overflow-hidden"
    >
      <div className="absolute -top-24 right-8 h-64 w-64 rounded-full bg-cyan-200/20 blur-3xl -z-10"></div>
      <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-200/20 blur-3xl -z-10"></div>
      <div className="absolute inset-0 bg-dot-pattern opacity-20 -z-10"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Title */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14 md:mb-16 space-y-3 reveal">
          <h2 className="text-xs font-bold text-cyan-600 uppercase tracking-widest">
            Safety You Can Measure
          </h2>
          <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white dark:drop-shadow-[0_2px_16px_rgba(56,189,248,0.2)] tracking-tight">
            Student Safety, Verified Daily
          </h3>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6 lg:gap-8">
          {statsList.map((stat, idx) => (
            <StatCard key={idx} {...stat} delay={idx * 80} />
          ))}
        </div>

      </div>
    </section>
  );
}
