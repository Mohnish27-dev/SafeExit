"use client";

import { EyeOff, QrCode, FileCheck, ShieldAlert, ClipboardList, Flame } from "lucide-react";

export default function Features() {
  const features = [
    {
      icon: <EyeOff className="h-6 w-6 text-indigo-600" />,
      title: "Contact & Room Masking",
      description: "Guards never see personal numbers or room details. Calls are routed via anonymous numbers, and profiles show only necessary validation credentials.",
      color: "bg-indigo-50 border-indigo-100",
    },
    {
      icon: <QrCode className="h-6 w-6 text-violet-600" />,
      title: "Secure QR Code Access",
      description: "Replaces physical logbooks with instant digital checks. Outings are scanned and verified, leaving no handwritten records exposed on tables.",
      color: "bg-violet-50 border-violet-100",
    },
    {
      icon: <FileCheck className="h-6 w-6 text-emerald-600" />,
      title: "Smart Outing Approvals",
      description: "Eliminates the rigid 5:30 PM restriction. Students submit travel proof (tickets) directly in-app, triggering automatic or quick warden approvals for flights/trains.",
      color: "bg-emerald-50 border-emerald-100",
    },
    {
      icon: <ShieldAlert className="h-6 w-6 text-rose-600" />,
      title: "Direct Misconduct Reporting",
      description: "One-tap anonymous report channel for security personnel misconduct. Submissions bypass hostel gatekeeper hierarchy and route straight to the ICC board.",
      color: "bg-rose-50 border-rose-100",
    },
    {
      icon: <ClipboardList className="h-6 w-6 text-cyan-600" />,
      title: "Immutable Access Audit logs",
      description: "Tracks all guard lookups, QR scans, and data access. Admin and Wardens see who checked what record, leaving a clean accountability log.",
      color: "bg-cyan-50 border-cyan-100",
    },
    {
      icon: <Flame className="h-6 w-6 text-amber-600" />,
      title: "Live SOS Safety Shield",
      description: "Enable active journey tracking when outside campus. Shares real-time locations with campus safety coordinators and trusted contacts if checked out after hours.",
      color: "bg-amber-50 border-amber-100",
    },
  ];

  return (
    <section id="features" className="py-20 bg-slate-50 dark:bg-slate-900 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <h2 className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
            Privacy First, Safety Always
          </h2>
          <h3 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Designed to Solve Actual Hostel Vulnerabilities
          </h3>
          <p className="text-lg text-slate-600 dark:text-slate-400 font-medium">
            SafeExit addresses the systemic design failures of physical campus logging systems, replacing them with modern, role-restricted, and accountable workflows.
          </p>
        </div>

        {/* Feature Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, idx) => (
            <div
              key={idx}
              className={`p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-indigo-200 dark:hover:border-indigo-800 group`}
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
