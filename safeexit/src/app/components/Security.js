"use client";

import { ShieldCheck, EyeOff, Radio, Lock } from "lucide-react";

export default function Security() {
  const securityPillars = [
    {
      title: "AES-256 Contact Encrypting",
      desc: "All phone numbers and room details are encrypted at rest. Guards see only a hashed validation token, preventing direct access and misuse.",
      icon: <Lock className="h-5 w-5 text-indigo-600" />
    },
    {
      title: "Relay Phone Masking",
      desc: "If a guard needs to contact a student, calls are routed via an in-app masked telephone server (similar to Uber/Ola calls), completely hiding real numbers.",
      icon: <EyeOff className="h-5 w-5 text-violet-600" />
    },
    {
      title: "AI Access Abuse Alerting",
      desc: "The system logs every lookup. An AI monitor alerts administrators if security staff lookup a student's profile repeatedly or off-duty.",
      icon: <Radio className="h-5 w-5 text-rose-600" />
    },
    {
      title: "Role-Restricted Decryption",
      desc: "Information can only be decrypted via temporary multi-auth keys held by the Hostel Registrar and Warden during emergencies, securing complete accountability.",
      icon: <ShieldCheck className="h-5 w-5 text-emerald-600" />
    }
  ];

  return (
    <section id="security" className="py-20 bg-slate-900 text-white relative overflow-hidden">
      {/* Background circles */}
      <div className="absolute top-0 right-0 -z-10 w-96 h-96 rounded-full bg-indigo-500/10 blur-3xl"></div>
      <div className="absolute bottom-0 left-0 -z-10 w-96 h-96 rounded-full bg-violet-500/10 blur-3xl"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Text Info */}
          <div className="lg:col-span-6 space-y-6">
            <span className="text-xs font-extrabold text-indigo-400 uppercase tracking-widest bg-indigo-950/80 px-3 py-1.5 rounded-full border border-indigo-900/50">
              Military-Grade Auditing
            </span>
            <h3 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
              Safety Built on Strict Privacy Principles
            </h3>
            <p className="text-slate-400 text-base leading-relaxed font-medium">
              We believe a student's safety shouldn't compromise their privacy. SafeExit enforces cryptographically secure logs and anonymous access filters to ensure that campus authorities maintain supervision without creating room for personal boundaries to be violated.
            </p>

            {/* Core Shield badge */}
            <div className="flex items-center gap-4 p-4 bg-slate-800/50 border border-slate-700/60 rounded-2xl max-w-md">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h5 className="font-extrabold text-sm text-slate-100">Zero-Trust Architecture</h5>
                <p className="text-xs text-slate-400 font-medium mt-0.5">
                  Even during network offline periods, local QR validations remain tamper-proof and encrypted.
                </p>
              </div>
            </div>
          </div>

          {/* Pillars Grid */}
          <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            {securityPillars.map((pillar, idx) => (
              <div key={idx} className="p-6 bg-slate-800/40 border border-slate-750/70 rounded-2xl space-y-4 hover:border-indigo-500/50 transition-colors">
                <div className="h-10 w-10 bg-slate-850 rounded-xl flex items-center justify-center">
                  {pillar.icon}
                </div>
                <h4 className="font-extrabold text-base text-slate-100">{pillar.title}</h4>
                <p className="text-xs text-slate-450 leading-relaxed font-medium">{pillar.desc}</p>
              </div>
            ))}
          </div>

        </div>
      </div>
    </section>
  );
}
