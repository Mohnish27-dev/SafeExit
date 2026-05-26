"use client";

import { Shield, Building, QrCode, ClipboardCheck } from "lucide-react";

export default function Stats() {
  const statsList = [
    {
      icon: <Shield className="h-5 w-5 text-indigo-600" />,
      value: "1,200+",
      label: "Students Protected",
      desc: "Contact details masked and shielded from gate log leakage.",
      bg: "bg-indigo-50/50"
    },
    {
      icon: <Building className="h-5 w-5 text-violet-600" />,
      value: "15+",
      label: "Institutions Enrolled",
      desc: "Universities replacing paper registers with SafeExit.",
      bg: "bg-violet-50/50"
    },
    {
      icon: <QrCode className="h-5 w-5 text-emerald-600" />,
      value: "5,000+",
      label: "Secure Check-Ins",
      desc: "Seamless entry and exit scans completed in seconds.",
      bg: "bg-emerald-50/50"
    },
    {
      icon: <ClipboardCheck className="h-5 w-5 text-cyan-600" />,
      value: "800+",
      label: "Requests Approved Daily",
      desc: "Automatic travel ticket validation bypassing manual hold-ups.",
      bg: "bg-cyan-50/50"
    }
  ];

  return (
    <section
      id="metrics"
      className="py-20 bg-gradient-to-b from-[#f4f7ff] via-white to-[#edf4ff] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:bg-slate-950 border-t border-slate-200/55 dark:border-slate-800/55 relative overflow-hidden"
    >
      <div className="absolute -top-24 right-8 h-64 w-64 rounded-full bg-cyan-200/20 blur-3xl -z-10"></div>
      <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-200/20 blur-3xl -z-10"></div>
      <div className="absolute inset-0 bg-dot-pattern opacity-20 -z-10"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Title */}
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-xs font-bold text-cyan-600 uppercase tracking-widest">
            Safety You Can Measure
          </h2>
          <h3 className="font-display text-3xl font-extrabold text-slate-900 dark:text-white dark:drop-shadow-[0_2px_16px_rgba(56,189,248,0.2)] tracking-tight">
            Student Safety, Verified Daily
          </h3>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {statsList.map((stat, idx) => (
            <div key={idx} className="p-6 rounded-2xl card-elevated hover:shadow-lg transition-shadow space-y-4">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${stat.bg}`}>
                {stat.icon}
              </div>
              <div className="space-y-1">
                <h4 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">
                  {stat.value}
                </h4>
                <h5 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  {stat.label}
                </h5>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  {stat.desc}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
