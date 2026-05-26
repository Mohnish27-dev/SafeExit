"use client";

import { Smartphone, CheckSquare, EyeOff, ShieldCheck } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      num: "01",
      icon: <Smartphone className="h-6 w-6 text-indigo-600" />,
      title: "File Digital Request",
      description: "Students request outings in the portal, adding timing and travel proof for late arrivals.",
    },
    {
      num: "02",
      icon: <CheckSquare className="h-6 w-6 text-violet-600" />,
      title: "Smart Approval Routing",
      description: "Wardens validate tickets when needed; routine exits are auto-approved by policy rules.",
    },
    {
      num: "03",
      icon: <EyeOff className="h-6 w-6 text-emerald-600" />,
      title: "Secure Verification",
      description: "A temporary QR pass is generated. Guards scan without ever seeing phone numbers or rooms.",
    },
    {
      num: "04",
      icon: <ShieldCheck className="h-6 w-6 text-cyan-600" />,
      title: "Cryptographic Logging",
      description: "Every scan is logged with a tamper-proof audit trail for safety administrators.",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-20 bg-gradient-to-b from-[#f6f8ff] via-white to-[#eef4ff] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:bg-slate-950 border-t border-slate-200/55 dark:border-slate-800/55 relative overflow-hidden"
    >
      <div className="absolute -top-24 left-10 h-64 w-64 rounded-full bg-cyan-200/25 blur-3xl -z-10"></div>
      <div className="absolute bottom-0 right-0 h-72 w-72 rounded-full bg-indigo-200/25 blur-3xl -z-10"></div>
      <div className="absolute inset-0 bg-dot-pattern opacity-25 -z-10"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-xs font-bold text-cyan-600 uppercase tracking-widest">
            Student Safety Workflow
          </h2>
          <h3 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white dark:drop-shadow-[0_2px_16px_rgba(56,189,248,0.2)] tracking-tight">
            Every Exit Is Verified, Every Student Protected
          </h3>
          <p className="text-lg text-slate-600 dark:text-slate-400 font-medium">
            A clear, four-step flow that protects privacy while giving wardens and security the visibility they need.
          </p>
        </div>

        {/* Timeline Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          
          {/* Connecting Line (Desktop) */}
          <div className="hidden lg:block absolute top-1/2 left-[12.5%] right-[12.5%] h-0.5 bg-gradient-to-r from-cyan-100 via-indigo-100 to-cyan-100 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 -z-10 -translate-y-12"></div>

          {steps.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center text-center space-y-4 group">
              {/* Icon Bubble */}
              <div className="relative h-16 w-16 rounded-2xl card-elevated flex items-center justify-center group-hover:border-indigo-500 group-hover:scale-105 transition-all duration-300">
                {step.icon}
                <span className="absolute -top-3.5 -right-3.5 text-xs font-black text-slate-350 dark:text-slate-650 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800 h-7 w-7 rounded-full flex items-center justify-center">
                  {step.num}
                </span>
              </div>

              {/* Title & Desc */}
              <div className="space-y-2 pt-2">
                <h4 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                  {step.title}
                </h4>
                <p className="text-slate-600 dark:text-slate-400 text-xs leading-relaxed font-medium max-w-[240px] mx-auto">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
