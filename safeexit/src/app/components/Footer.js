"use client";

import { useEffect, useState } from "react";
import { Shield, Mail, Phone, MapPin } from "lucide-react";

export default function Footer() {
  const [now, setNow] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial clock sync from Date(), a client-only external source; subsequent ticks are driven by the interval callback, not the effect body.
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const raw = typeof window !== "undefined" && sessionStorage.getItem("safeexit:user");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrating from localStorage (client-only external source) after mount.
      if (raw) setUser(JSON.parse(raw));
    } catch (e) {}
  }, []);

  const displayName = (user && (user.name || user.displayName)) || null;

  return (
    <footer className="relative bg-white/60 dark:bg-slate-950/70 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-400 py-14 backdrop-blur-md overflow-hidden">
      {/* Animated top beam + ambient glow */}
      <div className="footer-beam" aria-hidden="true"></div>
      <div className="absolute -bottom-24 left-1/4 h-64 w-64 rounded-full bg-indigo-300/20 dark:bg-indigo-600/10 blur-3xl -z-10"></div>
      <div className="absolute -top-20 right-10 h-56 w-56 rounded-full bg-cyan-300/20 dark:bg-cyan-600/10 blur-3xl -z-10"></div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-5 space-y-4">
            <div className="flex items-center gap-2 group w-fit">
              <div className="nav-logo-glow h-9 w-9 rounded-lg bg-linear-to-br from-indigo-600 to-cyan-400 flex items-center justify-center text-white">
                <Shield className="h-5 w-5" />
              </div>
              <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                Safe<span className="text-indigo-500">Exit</span>
              </span>
            </div>
            <p className="text-sm font-medium text-slate-600 leading-relaxed max-w-sm">
              SafeExit delivers privacy-first campus safety. By replacing exposed paper registers with encrypted digital checkpoints, we protect students and reinforce institutional accountability.
            </p>
          </div>

          <div className="md:col-span-3 space-y-4">
            <h4 className="text-slate-900 dark:text-white font-bold text-sm tracking-wider uppercase">Platform</h4>
            <ul className="space-y-2.5 text-sm font-medium">
              <li>
                <a href="#features" className="footer-link hover:text-indigo-500 dark:hover:text-cyan-300">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="footer-link hover:text-indigo-500 dark:hover:text-cyan-300">
                  How It Works
                </a>
              </li>
              <li>
                <a href="#security" className="footer-link hover:text-indigo-500 dark:hover:text-cyan-300">
                  Security Measures
                </a>
              </li>
              <li>
                <a href="#simulator" className="footer-link hover:text-indigo-500 dark:hover:text-cyan-300">
                  System Simulator
                </a>
              </li>
            </ul>
          </div>

          <div className="md:col-span-4 space-y-4">
            <h4 className="text-slate-900 dark:text-white font-bold text-sm tracking-wider uppercase">Get In Touch</h4>
            <ul className="space-y-3 text-sm font-medium text-slate-600 dark:text-slate-400">
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-indigo-500" />
                <span>safeexit927@gmail.com</span>
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-indigo-500" />
                <span>+91 1800 123 4567</span>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-indigo-500" />
                <span>NIT PATNA BIHTA CAMPUS</span>
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
