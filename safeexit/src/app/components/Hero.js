"use client";

import { useRef, useCallback } from "react";
import { Shield, ArrowRight, EyeOff, CheckCircle2, FileText, Bell, QrCode } from "lucide-react";

export default function Hero() {
  const sceneRef = useRef(null);
  const cardRef = useRef(null);

  // Pointer → 3D tilt + glare via CSS vars (no React re-render).
  const handlePointerMove = useCallback((e) => {
    const scene = sceneRef.current;
    const card = cardRef.current;
    if (!scene || !card) return;

    const rect = scene.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width; // 0 → 1
    const py = (e.clientY - rect.top) / rect.height; // 0 → 1

    // Max ~12° of tilt, inverted so the card leans toward the cursor.
    const ry = (px - 0.5) * 24;
    const rx = -(py - 0.5) * 24;

    card.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
    card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
    card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
  }, []);

  const handlePointerLeave = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    card.style.setProperty("--ry", "0deg");
    card.style.setProperty("--rx", "0deg");
  }, []);

  return (
    <section className="relative pt-28 pb-14 sm:pt-32 sm:pb-20 md:pt-40 md:pb-28 overflow-hidden bg-gradient-to-b from-[#eef2ff] via-[#f3f6ff] to-[#e8f1ff] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:bg-slate-950 bg-dot-pattern transition-colors duration-300">
      <div className="hero-aurora-3d -z-10" />
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 right-0 -z-10 w-[520px] h-[520px] rounded-full bg-cyan-200/35 dark:bg-cyan-900/10 blur-3xl opacity-60"></div>
      <div className="absolute bottom-0 left-0 -z-10 w-[620px] h-[620px] rounded-full bg-indigo-200/30 dark:bg-indigo-900/10 blur-3xl opacity-50"></div>
      <div className="absolute -top-20 left-1/3 -z-10 h-56 w-56 rounded-full bg-sky-200/30 dark:bg-sky-900/10 blur-3xl"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 sm:gap-12 lg:gap-8 items-center">
          {/* Text Content Column */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 animate-fade-in-up">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-slate-900/90 border border-slate-800 text-cyan-200 dark:bg-slate-950/70 dark:border-slate-800 shadow-sm uppercase tracking-wider">
              <Shield className="h-3.5 w-3.5" />
              Student Safety & Privacy Portal
            </div>

            {/* Title */}
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white dark:drop-shadow-[0_2px_18px_rgba(56,189,248,0.22)] tracking-tight leading-tight max-w-2xl transition-colors">
              Protect Students.
              <br />
              <span className="text-shimmer-gradient">
                Verify Every Exit.
              </span>
            </h1>

            {/* Description */}
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-xl font-medium leading-relaxed transition-colors">
              NITP-SafeExit replaces unsafe paper registers with a secure, student-first system. Contact details stay masked, exit passes are verified in seconds, and every access is logged for accountability.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <a
                href="/login"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-bold bg-gradient-to-r from-slate-900 to-indigo-600 text-white shadow-xl shadow-indigo-600/40 ring-1 ring-indigo-400/30 hover:brightness-110 hover:shadow-indigo-500/60 hover:scale-[1.02] active:scale-98 transition-all duration-200"
              >
                Login to Portal
                <ArrowRight className="h-5 w-5" />
              </a>
              <a
                href="#how-it-works"
                className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold bg-white/90 text-slate-800 border border-slate-300/70 hover:bg-white dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700 dark:hover:bg-slate-750 shadow-sm active:scale-98 transition-all duration-200"
              >
                See Safety Flow
              </a>
            </div>

            {/* Core Badges Row */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800 w-full max-w-md text-left transition-colors">
              <div>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">Masked</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Contact Details</p>
              </div>
              <div>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">Instant</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Guard Validation</p>
              </div>
              <div>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">24/7</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Safety Alerts</p>
              </div>
            </div>
          </div>

          {/* 3D Interactive Mockup Column */}
          <div className="lg:col-span-5 flex justify-center relative mt-6 lg:mt-0 animate-fade-in-up animation-delay-200">
            <div
              ref={sceneRef}
              onPointerMove={handlePointerMove}
              onPointerLeave={handlePointerLeave}
              className="scene-3d w-full max-w-[480px]"
            >
              {/* Tiltable 3D pass card */}
              <div
                ref={cardRef}
                className="tilt-3d relative w-full aspect-[4/3] rounded-3xl bg-gradient-to-tr from-white/90 to-cyan-100/50 dark:from-slate-900/50 dark:to-indigo-900/20 p-6 border border-indigo-150/50 dark:border-indigo-900/40 shadow-2xl shadow-indigo-900/20"
              >
                {/* Grid backdrop (sits at base depth) */}
                <div className="absolute inset-0 rounded-3xl bg-grid-pattern opacity-30"></div>

                {/* Pointer glare */}
                <div className="tilt-glare"></div>

                {/* Holographic verification core — lifted toward viewer */}
                <div className="depth-3 absolute top-6 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="relative flex items-center justify-center">
                    <span className="scan-ring h-24 w-24"></span>
                    <span className="scan-ring h-24 w-24" style={{ animationDelay: "1s" }}></span>
                    <div className="holo-core float-3d relative h-20 w-20 rounded-2xl flex items-center justify-center text-white">
                      <QrCode className="h-10 w-10" />
                    </div>
                  </div>
                  <span className="mt-3 text-[10px] font-bold tracking-[0.2em] uppercase text-indigo-600 dark:text-cyan-300">
                    QR Verified
                  </span>
                </div>

                {/* Student verification chip — mid depth, floats */}
                <div className="depth-2 float-3d float-3d-delay absolute bottom-6 left-6 right-6">
                  <div className="flex items-center justify-between p-4 bg-white/95 dark:bg-slate-900/95 rounded-2xl border border-indigo-100 dark:border-indigo-900/80 shadow-lg gap-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-xl bg-violet-100 dark:bg-violet-950/50 border border-violet-250 dark:border-violet-900/80 flex items-center justify-center text-violet-750 dark:text-violet-400 font-bold relative">
                        A
                        <div className="absolute -bottom-1 -right-1 h-4.5 w-4.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                          <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">Ananya Verma</h4>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">B.Tech - CS | Room 3••</p>
                        <p className="text-[10px] font-bold text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/40 inline-block px-1.5 py-0.5 rounded mt-0.5 border border-cyan-100 dark:border-cyan-900/40">
                          Safe Exit Approved
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating parallax badges — highest depth for strong 3D pop */}
                <div className="depth-4 float-3d-slow absolute -top-4 -right-4 flex items-center gap-2 p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-xl shadow-xl">
                  <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                    <EyeOff className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-[10px] font-bold text-slate-950 dark:text-white">Privacy Active</h5>
                    <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">Number Masked</p>
                  </div>
                </div>

                <div className="depth-4 float-3d-slow float-3d-delay absolute top-1/3 -left-5 flex items-center gap-2 p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-xl shadow-xl">
                  <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-[10px] font-bold text-slate-950 dark:text-white">Audit Trace</h5>
                    <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">Log Saved</p>
                  </div>
                </div>

                <div className="depth-3 float-3d absolute -bottom-4 -right-3 flex items-center gap-2 p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-xl shadow-xl">
                  <div className="h-7 w-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                    <Bell className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-[10px] font-bold text-slate-950 dark:text-white">SOS Ready</h5>
                    <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">Safety Escalation</p>
                  </div>
                </div>

                <div className="depth-3 float-3d-slow absolute top-2 -left-4 flex items-center gap-2 p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-xl shadow-xl">
                  <div className="h-7 w-7 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center text-violet-600 dark:text-violet-400">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div>
                    <h5 className="text-[10px] font-bold text-slate-950 dark:text-white">Smart Approval</h5>
                    <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">Ticket Validated</p>
                  </div>
                </div>
              </div>

              {/* Soft ground glow beneath the card */}
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 w-3/4 h-12 bg-indigo-600/20 dark:bg-cyan-500/15 rounded-full blur-2xl"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
