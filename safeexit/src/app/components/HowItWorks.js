"use client";

import { Smartphone, CheckSquare, EyeOff, ShieldCheck } from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      num: "01",
      icon: <Smartphone className="h-6 w-6 text-indigo-600" />,
      title: "File Digital Request",
      description: "Student requests outing via their student portal, specifying timing and uploading travel tickets for late arrivals.",
    },
    {
      num: "02",
      icon: <CheckSquare className="h-6 w-6 text-violet-600" />,
      title: "Smart Approval Routing",
      description: "Warden validates the ticket inside their portal. Regular outings are auto-approved by system rules.",
    },
    {
      num: "03",
      icon: <EyeOff className="h-6 w-6 text-emerald-600" />,
      title: "Secure Verification",
      description: "A secure, temporary QR pass is generated. Security guards scan this QR on exit without seeing raw contact info.",
    },
    {
      num: "04",
      icon: <ShieldCheck className="h-6 w-6 text-cyan-600" />,
      title: "Cryptographic Logging",
      description: "Gate logs are generated and written directly to the ledger, creating a tamper-proof audit trail for safety administrators.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 bg-white dark:bg-slate-900 border-t border-slate-200/55 dark:border-slate-800/55">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
            Intuitive & Automated
          </h2>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            How SafeExit Secures Your Campus
          </h3>
          <p className="text-lg text-slate-600 dark:text-slate-400 font-medium">
            A 4-step secure workflow that bridges the gap between hostel security needs and personal student privacy.
          </p>
        </div>

        {/* Timeline Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 relative">
          
          {/* Connecting Line (Desktop) */}
          <div className="hidden lg:block absolute top-1/2 left-[12.5%] right-[12.5%] h-0.5 bg-slate-100 dark:bg-slate-800 -z-10 -translate-y-12"></div>

          {steps.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center text-center space-y-4 group">
              {/* Icon Bubble */}
              <div className="relative h-16 w-16 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 flex items-center justify-center shadow-sm group-hover:border-indigo-500 group-hover:scale-105 transition-all duration-300">
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
