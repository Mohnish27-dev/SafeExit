"use client";

import { useEffect, useState } from "react";
import { Shield, Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  const [now, setNow] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && localStorage.getItem("safeexit:user");
      if (raw) setUser(JSON.parse(raw));
    } catch (e) {}
  }, []);

  const displayName = (user && (user.name || user.displayName)) || null;

  return (
    <footer className="bg-white/60 border-t border-slate-100 text-slate-600 py-12 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg bg-linear-to-br from-indigo-600 to-cyan-400 flex items-center justify-center text-white">
                <Shield className="h-5 w-5" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-slate-900">
                Safe<span className="text-indigo-500">Exit</span>
              </span>
            </div>
            <p className="text-sm font-medium text-slate-600 leading-relaxed max-w-sm">
              SafeExit delivers privacy-first campus safety. By replacing exposed paper registers with encrypted digital checkpoints, we protect students and reinforce institutional accountability.
            </p>
          </div>

          <div className="md:col-span-3 space-y-4">
            <h4 className="text-slate-900 font-bold text-sm tracking-wider uppercase">Platform</h4>
            <ul className="space-y-2.5 text-sm font-medium">
              <li>
                <a href="#features" className="hover:text-indigo-400 transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-indigo-400 transition-colors">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#security" className="hover:text-indigo-400 transition-colors">
                  Security Measures
                </a>
              </li>
              <li>
                <a href="#simulator" className="hover:text-indigo-400 transition-colors">
                  System Simulator
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-4">
            <h4 className="text-slate-900 font-bold text-sm tracking-wider uppercase">Get In Touch</h4>
            <ul className="space-y-3 text-sm font-medium text-slate-600">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-500" />
                <span>support@safeexit.edu</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-indigo-500" />
                <span>+91 1800 123 4567</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-indigo-500" />
                <span>Safety Inc., Tech Hub Sector 12, India</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-100 mt-12 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-500">
          <p className="text-slate-600">© {new Date().getFullYear()} SafeExit. Built for Student Safety & Accountability.</p>
          <div className="flex items-center gap-6">
            {displayName && <div className="text-sm font-semibold text-slate-800">Signed in as <span className="font-bold">{displayName}</span></div>}
            <div className="flex items-center gap-3 text-sm text-slate-700">
              <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-bold text-slate-800">{now ? now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</div>
              <div className="rounded-full bg-white/80 px-3 py-1 text-xs font-mono font-bold text-slate-800">{now ? now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}</div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
