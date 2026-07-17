"use client";

import { EyeOff, QrCode, FileCheck, ShieldAlert, ClipboardList, Flame, PhoneCall, CheckCircle2, ArrowUpRight } from "lucide-react";
import useScrollReveal from "../hooks/useScrollReveal";

// Live mini-visuals: each feature card carries a small animated demo.

function MaskingVisual() {
  return (
    <div className="relative rounded-xl bg-slate-950 border border-indigo-900/60 p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Guard View</span>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-indigo-300 bg-indigo-500/10 border border-indigo-500/30 px-2 py-0.5 rounded-full">
          <EyeOff className="h-2.5 w-2.5" /> Masked
        </span>
      </div>
      <div className="font-mono text-lg font-bold tracking-wider">
        <span className="text-slate-500">+91 </span>
        <span className="mask-shimmer">••••• ••</span>
        <span className="text-slate-300">10</span>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          <PhoneCall className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] text-slate-400 font-medium">Call routed via relay — real number hidden</span>
      </div>
    </div>
  );
}

function QRScanVisual() {
  return (
    <div className="relative rounded-xl bg-slate-950 border border-violet-900/60 p-4 flex items-center gap-4 overflow-hidden">
      <div className="relative h-20 w-20 shrink-0 rounded-lg bg-white/5 border border-violet-500/40 flex items-center justify-center overflow-hidden">
        <QrCode className="h-12 w-12 text-violet-300" />
        <div className="feature-scanline"></div>
      </div>
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="h-2.5 w-2.5" /> Pass Verified
        </span>
        <p className="text-[11px] text-slate-400 font-medium leading-snug">Digital exit pass scanned in <span className="text-white font-bold">0.4s</span> — no paper, no leak.</p>
      </div>
    </div>
  );
}

function ApprovalVisual() {
  return (
    <div className="relative rounded-xl bg-slate-950 border border-emerald-900/60 p-4 overflow-hidden">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Warden Approved</span>
        <span className="text-[10px] font-mono text-slate-500">REQ-4091</span>
      </div>
      <div className="approve-bar h-2 w-full mb-2.5"></div>
      <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
        <FileCheck className="h-3.5 w-3.5 text-emerald-400" />
        Request reviewed · Warden approved · QR pass issued
      </div>
    </div>
  );
}

function AuditVisual() {
  const rows = [
    { t: "17:15", a: "Student submitted REQ-4092", c: "text-cyan-300" },
    { t: "16:50", a: "Guard scan — Exit OUT recorded", c: "text-indigo-300" },
    { t: "16:30", a: "Warden approved outing", c: "text-emerald-300" },
    { t: "16:28", a: "Student submitted REQ-4091", c: "text-slate-300" },
  ];
  return (
    <div className="relative rounded-xl bg-slate-950 border border-cyan-900/60 p-3 h-[104px] ticker-mask">
      <div className="ticker-track">
        {[...rows, ...rows].map((r, i) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            <span className="font-mono text-slate-600 shrink-0">{r.t}</span>
            <span className="h-1 w-1 rounded-full bg-cyan-500 shrink-0"></span>
            <span className={`font-medium ${r.c} truncate`}>{r.a}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SosVisual() {
  return (
    <div className="relative rounded-xl bg-slate-950 border border-rose-900/60 p-4 flex items-center gap-4 overflow-hidden min-h-[104px]">
      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
        <span className="sos-radar h-10 w-10"></span>
        <span className="sos-radar h-10 w-10" style={{ animationDelay: "0.8s" }}></span>
        <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg shadow-rose-500/40">
          <Flame className="h-5 w-5" />
        </span>
      </div>
      <div className="space-y-1">
        <span className="text-[10px] font-bold uppercase tracking-widest text-rose-400">Live SOS</span>
        <p className="text-[11px] text-slate-400 font-medium leading-snug">Distress signal broadcasts location to wardens <span className="text-white font-bold">instantly</span>.</p>
      </div>
    </div>
  );
}

export default function Features() {
  useScrollReveal();

  return (
    <section
      id="features"
      className="py-12 sm:py-16 md:py-20 bg-gradient-to-b from-[#f1f4ff] via-[#eef3ff] to-[#e8f0ff] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:bg-slate-950 relative overflow-hidden"
    >
      <div className="absolute -top-24 right-10 h-64 w-64 rounded-full bg-cyan-200/30 blur-3xl -z-10"></div>
      <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-200/25 blur-3xl -z-10"></div>
      <div className="absolute inset-0 bg-dot-pattern opacity-40 -z-10"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 md:mb-16 space-y-4 reveal">
          <h2 className="text-xs font-bold text-cyan-600 uppercase tracking-widest">
            Safety That Students Can Trust
          </h2>
          <h3 className="font-display text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-white dark:drop-shadow-[0_2px_16px_rgba(56,189,248,0.2)] tracking-tight">
            Built Around Student Safety, Not Just Access
          </h3>
          <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 font-medium">
            SafeExit replaces exposed registers with a privacy-first system that verifies exits, alerts wardens, and protects student data at every step.
          </p>
        </div>

        {/* Bento Grid — asymmetric, with live product visuals */}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 sm:gap-5 auto-rows-[minmax(0,1fr)]">

          {/* Contact masking — hero cell (spans 4) */}
          <div className="reveal bento-card card-elevated md:col-span-4 p-5 sm:p-7 flex flex-col justify-between gap-5 sm:gap-6">
            <div className="bento-spot"></div>
            <div className="flex items-start justify-between gap-4">
              <div className="max-w-sm">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-4 border bg-indigo-50 border-indigo-100 dark:bg-indigo-950/40 dark:border-indigo-900/60 text-indigo-600 dark:text-indigo-400">
                  <EyeOff className="h-5 w-5" />
                </div>
                <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Contact &amp; Room Masking</h4>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-medium">
                  Guards never see personal numbers or room details. Calls route through masked relays; profiles show only validation credentials.
                </p>
              </div>
              <ArrowUpRight className="h-5 w-5 text-slate-300 dark:text-slate-600 shrink-0" />
            </div>
            <MaskingVisual />
          </div>

          {/* Secure QR pass (spans 2) */}
          <div className="reveal bento-card card-elevated md:col-span-2 p-5 sm:p-7 flex flex-col justify-between gap-5" style={{ transitionDelay: "80ms" }}>
            <div className="bento-spot"></div>
            <div>
              <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-4 border bg-violet-50 border-violet-100 dark:bg-violet-950/40 dark:border-violet-900/60 text-violet-600 dark:text-violet-400">
                <QrCode className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Secure QR Exit Pass</h4>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-medium">
                Instant digital checks replace paper logbooks — every exit scanned and verified.
              </p>
            </div>
            <QRScanVisual />
          </div>

          {/* Live audit ticker (spans 2) */}
          <div className="reveal bento-card card-elevated md:col-span-2 p-5 sm:p-7 flex flex-col justify-between gap-5" style={{ transitionDelay: "120ms" }}>
            <div className="bento-spot"></div>
            <div>
              <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-4 border bg-cyan-50 border-cyan-100 dark:bg-cyan-950/40 dark:border-cyan-900/60 text-cyan-600 dark:text-cyan-400">
                <ClipboardList className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Immutable Audit Logs</h4>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-medium">
                Every lookup and scan is recorded so wardens see exactly who accessed what.
              </p>
            </div>
            <AuditVisual />
          </div>

          {/* Smart approvals (spans 2) */}
          <div className="reveal bento-card card-elevated md:col-span-2 p-5 sm:p-7 flex flex-col justify-between gap-5" style={{ transitionDelay: "160ms" }}>
            <div className="bento-spot"></div>
            <div>
              <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-4 border bg-emerald-50 border-emerald-100 dark:bg-emerald-950/40 dark:border-emerald-900/60 text-emerald-600 dark:text-emerald-400">
                <FileCheck className="h-5 w-5" />
              </div>
              <h4 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Smart Outing Approvals</h4>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-medium">
                Students submit digital outing requests; wardens review and approve them, then a QR exit pass is issued instantly.
              </p>
            </div>
            <ApprovalVisual />
          </div>

          {/* Live SOS — wide cell (spans 4) */}
          <div className="reveal bento-card card-elevated md:col-span-4 p-5 sm:p-7 flex flex-col justify-between gap-5 sm:gap-6" style={{ transitionDelay: "200ms" }}>
            <div className="bento-spot"></div>
            <div className="flex items-start justify-between gap-4">
              <div className="max-w-sm">
                <div className="h-11 w-11 rounded-xl flex items-center justify-center mb-4 border bg-rose-50 border-rose-100 dark:bg-rose-950/40 dark:border-rose-900/60 text-rose-600 dark:text-rose-400">
                  <ShieldAlert className="h-5 w-5" />
                </div>
                <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Live SOS Safety Shield</h4>
                <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-medium">
                  One-tap distress escalation with GPS location, pushed instantly to wardens and security. Overdue returns are flagged automatically the moment a pass misses its curfew. Anonymous misconduct reports route straight to ICC leadership, protecting anyone who raises a concern.
                </p>
              </div>
              <ArrowUpRight className="h-5 w-5 text-slate-300 dark:text-slate-600 shrink-0" />
            </div>
            <SosVisual />
          </div>
        </div>
      </div>
    </section>
  );
}
