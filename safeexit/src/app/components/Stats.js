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
    <section id="metrics" className="py-20 bg-white dark:bg-slate-900 border-t border-slate-200/55 dark:border-slate-800/55">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Title */}
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
            Measurable Campus Safety
          </h2>
          <h3 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Our Growing Safety Network
          </h3>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {statsList.map((stat, idx) => (
            <div key={idx} className="p-6 rounded-2xl border border-slate-200/70 dark:border-slate-800/70 hover:shadow-md transition-shadow space-y-4">
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
