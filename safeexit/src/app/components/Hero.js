"use client";

import { Shield, ArrowRight, EyeOff, CheckCircle2, FileText, Bell } from "lucide-react";

export default function Hero() {
  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden bg-radial-gradient bg-dot-pattern transition-colors duration-300">
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 right-0 -z-10 w-[500px] h-[500px] rounded-full bg-indigo-200/40 dark:bg-indigo-900/10 blur-3xl opacity-60"></div>
      <div className="absolute bottom-0 left-0 -z-10 w-[600px] h-[600px] rounded-full bg-violet-200/30 dark:bg-violet-900/10 blur-3xl opacity-50"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Text Content Column */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6 animate-fade-in-up">
            {/* Pill Tag */}
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold bg-indigo-50 border border-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:border-indigo-900/60 dark:text-indigo-400 shadow-sm uppercase tracking-wider">
              <Shield className="h-3.5 w-3.5" />
              Privacy-First Hostel Access System
            </div>

            {/* Title */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black text-slate-900 dark:text-white tracking-tight leading-tight max-w-2xl transition-colors">
              Smart Access. <br />
              <span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
                Safer Tomorrow.
              </span>
            </h1>

            {/* Description */}
            <p className="text-lg text-slate-600 dark:text-slate-300 max-w-xl font-medium leading-relaxed transition-colors">
              SafeExit replaces unsafe physical registers with a secure digital system. Protect students' contact details from guard exploitation, streamline travel approval timelines, and establish a clear audit log of who accesses data.
            </p>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 w-full sm:w-auto">
              <a
                href="#simulator"
                className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-base font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/30 active:scale-98 transition-all duration-200"
              >
                Try System Demo
                <ArrowRight className="h-5 w-5" />
              </a>
              <a
                href="#features"
                className="inline-flex items-center justify-center px-8 py-4 rounded-xl text-base font-bold bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-750 dark:hover:bg-slate-750 shadow-sm active:scale-98 transition-all duration-200"
              >
                Explore Features
              </a>
            </div>

            {/* Core Badges Row */}
            <div className="grid grid-cols-3 gap-6 pt-6 border-t border-slate-100 dark:border-slate-800 w-full max-w-md text-left transition-colors">
              <div>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">100%</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Data Encrypted</p>
              </div>
              <div>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">Zero</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Exposed Numbers</p>
              </div>
              <div>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white">Real-Time</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-1">Audit Tracking</p>
              </div>
            </div>
          </div>

          {/* Graphics Mockup Column */}
          <div className="lg:col-span-5 flex justify-center relative mt-6 lg:mt-0 animate-fade-in-up animation-delay-200">
            {/* Main Mockup Box */}
            <div className="relative w-full max-w-[480px] aspect-[4/3] rounded-3xl overflow-hidden bg-gradient-to-tr from-indigo-50 to-indigo-100/40 dark:from-indigo-950/20 dark:to-indigo-900/10 p-6 border border-indigo-150/40 dark:border-indigo-900/40 shadow-xl flex items-center justify-center transition-colors">
              {/* Grid backdrop */}
              <div className="absolute inset-0 bg-grid-pattern opacity-30"></div>
              
              {/* Dynamic Graphic Container */}
              <div className="relative z-10 w-full h-full flex flex-col justify-between">
                {/* Simulated Hostel Scan Interface */}
                <div className="flex items-center justify-between p-4 bg-white/95 dark:bg-slate-900/95 rounded-2xl border border-indigo-100 dark:border-indigo-900/80 shadow-lg mt-auto mb-auto gap-4 transition-colors">
                  {/* Left Side: Student avatar and scanner indicator */}
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl bg-violet-100 dark:bg-violet-950/50 border border-violet-250 dark:border-violet-900/80 flex items-center justify-center text-violet-750 dark:text-violet-400 font-bold relative transition-colors">
                      A
                      <div className="absolute -bottom-1 -right-1 h-4.5 w-4.5 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center">
                        <CheckCircle2 className="h-2.5 w-2.5 text-white" />
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">Ananya Verma</h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">B.Tech - CS | Room 304</p>
                      <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40 inline-block px-1.5 py-0.5 rounded mt-0.5 border border-emerald-100 dark:border-emerald-900/40 transition-colors">
                        Outing Approved
                      </p>
                    </div>
                  </div>

                  {/* Right Side: QR Scanner Indicator */}
                  <div className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 transition-colors">
                    <div className="h-10 w-10 bg-indigo-600 text-white rounded-lg flex items-center justify-center font-mono text-lg font-bold shadow shadow-indigo-600/30 animate-pulse">
                      [::]
                    </div>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold tracking-wide uppercase">QR Validated</span>
                  </div>
                </div>

                {/* Floating Side Info Badges */}
                <div className="absolute top-2 right-2 flex flex-col gap-2.5 w-[160px]">
                  {/* Privacy Protected */}
                  <div className="flex items-center gap-2 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-xl shadow-md transform hover:-translate-x-1 transition-all">
                    <div className="h-7 w-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                      <EyeOff className="h-4 w-4" />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold text-slate-950 dark:text-white">Privacy Active</h5>
                      <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">Number Masked</p>
                    </div>
                  </div>

                  {/* Secure Logged */}
                  <div className="flex items-center gap-2 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-xl shadow-md transform hover:-translate-x-1 transition-all">
                    <div className="h-7 w-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold text-slate-950 dark:text-white">Audit Trace</h5>
                      <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">Log Saved</p>
                    </div>
                  </div>

                  {/* Smart Approval */}
                  <div className="flex items-center gap-2 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-xl shadow-md transform hover:-translate-x-1 transition-all">
                    <div className="h-7 w-7 rounded-lg bg-violet-50 dark:bg-violet-950/40 flex items-center justify-center text-violet-600 dark:text-violet-400">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold text-slate-950 dark:text-white">Smart Approval</h5>
                      <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">Ticket Validated</p>
                    </div>
                  </div>

                  {/* Harassment Report */}
                  <div className="flex items-center gap-2 p-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-indigo-100 dark:border-indigo-900 rounded-xl shadow-md transform hover:-translate-x-1 transition-all">
                    <div className="h-7 w-7 rounded-lg bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400">
                      <Bell className="h-4 w-4" />
                    </div>
                    <div>
                      <h5 className="text-[10px] font-bold text-slate-950 dark:text-white">Instant Report</h5>
                      <p className="text-[8px] text-slate-400 dark:text-slate-500 font-medium">Warden Alerts</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Security Shield badge center overlay background */}
              <div className="absolute -bottom-6 -left-6 w-24 h-24 bg-indigo-600/10 rounded-full blur-xl"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
