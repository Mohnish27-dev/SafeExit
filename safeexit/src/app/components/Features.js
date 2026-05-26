"use client";

import { EyeOff, QrCode, FileCheck, ShieldAlert, ClipboardList, Flame } from "lucide-react";

export default function Features() {
  const features = [
    {
      icon: <EyeOff className="h-6 w-6 text-indigo-600" />,
      title: "Contact & Room Masking",
      description: "Guards never see personal numbers or room details. Calls are routed via masked numbers, and profiles show only validation credentials.",
      color: "bg-indigo-50 border-indigo-100",
    },
    {
      icon: <QrCode className="h-6 w-6 text-violet-600" />,
      title: "Secure QR Exit Pass",
      description: "Replaces paper logbooks with instant digital checks. Each exit is scanned and verified with no handwritten records exposed.",
      color: "bg-violet-50 border-violet-100",
    },
    {
      icon: <FileCheck className="h-6 w-6 text-emerald-600" />,
      title: "Smart Outing Approvals",
      description: "Students submit travel proof in-app, triggering automatic or quick warden approvals for late arrivals and emergencies.",
      color: "bg-emerald-50 border-emerald-100",
    },
    {
      icon: <ShieldAlert className="h-6 w-6 text-rose-600" />,
      title: "Anonymous Misconduct Reports",
      description: "One-tap reporting routes issues directly to ICC leadership, protecting students who raise concerns.",
      color: "bg-rose-50 border-rose-100",
    },
    {
      icon: <ClipboardList className="h-6 w-6 text-cyan-600" />,
      title: "Immutable Access Audit Logs",
      description: "Tracks guard lookups, QR scans, and data access so wardens can see exactly who checked what.",
      color: "bg-cyan-50 border-cyan-100",
    },
    {
      icon: <Flame className="h-6 w-6 text-amber-600" />,
      title: "Live SOS Safety Shield",
      description: "Enable active journey tracking outside campus and alert safety coordinators if a student is late or in distress.",
      color: "bg-amber-50 border-amber-100",
    },
  ];

  return (
    <section
      id="features"
      className="py-20 bg-gradient-to-b from-[#f1f4ff] via-[#eef3ff] to-[#e8f0ff] dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 dark:bg-slate-950 relative overflow-hidden"
    >
      <div className="absolute -top-24 right-10 h-64 w-64 rounded-full bg-cyan-200/30 blur-3xl -z-10"></div>
      <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-indigo-200/25 blur-3xl -z-10"></div>
      <div className="absolute inset-0 bg-dot-pattern opacity-40 -z-10"></div>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-xs font-bold text-cyan-600 uppercase tracking-widest">
            Safety That Students Can Trust
          </h2>
          <h3 className="font-display text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white dark:drop-shadow-[0_2px_16px_rgba(56,189,248,0.2)] tracking-tight">
            Built Around Student Safety, Not Just Access
          </h3>
          <p className="text-lg text-slate-600 dark:text-slate-400 font-medium">
            SafeExit replaces exposed registers with a privacy-first system that verifies exits, alerts wardens, and protects student data at every step.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className={`p-8 card-elevated rounded-2xl transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-cyan-200 dark:hover:border-cyan-800 group`}
            >
              <div className={`h-12 w-12 rounded-xl flex items-center justify-center mb-6 border ${feature.color} group-hover:scale-110 transition-transform duration-300`}>
                {feature.icon}
              </div>
              <h4 className="text-xl font-bold text-slate-900 dark:text-white mb-3">
                {feature.title}
              </h4>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed font-medium">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
