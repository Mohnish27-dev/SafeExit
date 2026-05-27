"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  ShieldCheck,
  Lock,
  Eye,
  EyeOff,
  User,
  Info,
  Headphones,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function WardenLoginPage() {
  const router = useRouter();
  const [showPin, setShowPin] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [wardenId, setWardenId] = useState("");
  const [pin, setPin] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  const handleLogin = (event) => {
    event.preventDefault();
    setFormError("");
    setFormSuccess(false);

    if (!wardenId.trim()) {
      setFormError("Please enter your Warden ID.");
      return;
    }

    if (pin.trim().length !== 4) {
      setFormError("Please enter your 4-digit PIN.");
      return;
    }

    setFormSuccess(true);
    setTimeout(() => {
      router.push("/warden/dashboard");
    }, 700);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f4f1ff] to-[#e9e2ff] relative overflow-hidden animate-fade-in-up">

      {/* ── Full-page background image ── */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/login/hostel-bg.png"
          alt=""
          fill
          className="object-cover opacity-[0.18] pointer-events-none select-none"
          priority
        />
      </div>

      {/* Ambient glow shapes */}
      <div className="absolute -top-28 -left-24 h-72 w-72 rounded-full bg-violet-300/20 blur-3xl z-0" />
      <div className="absolute top-16 -right-24 h-72 w-72 rounded-full bg-purple-300/25 blur-3xl z-0" />
      <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-indigo-300/20 blur-3xl z-0" />

      {/* Gradient overlays top & bottom */}
      <div className="absolute top-0 left-0 right-0 h-44 bg-gradient-to-b from-[#f0f0ff] to-transparent z-[1]" />
      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-[#e8e0ff] to-transparent z-[1]" />

      {/* ── HEADER ── */}
      <header className="relative z-10 w-full px-4 sm:px-8 pt-6 pb-2 flex items-center justify-center">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-11 w-11 rounded-xl bg-violet-700 flex items-center justify-center text-white shadow-lg shadow-violet-700/30 group-hover:shadow-violet-700/50 transition-shadow">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <span className="font-sans text-xl font-bold tracking-tight text-slate-900">
              Safe<span className="text-violet-700">Exit</span>
            </span>
            <p className="text-[10px] font-medium text-slate-500 -mt-0.5 tracking-wide">
              Secure Access. Safer Campuses.
            </p>
          </div>
        </Link>
      </header>

      {/* ── MAIN CONTENT ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center px-4 pb-6 pt-2">

        {/* Warden character illustration */}
        <div className="relative w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] mb-[-44px] z-20 animate-float">
          <div className="absolute inset-0 rounded-full bg-white/60 shadow-[0_30px_60px_-35px_rgba(59,7,100,0.6)]" />
          <Image
            src="/images/login/warden.png"
            alt="Warden"
            fill
            className="object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* Shield badge overlapping illustration and card */}
        <div className="relative z-30 mb-[-22px]">
          <div className="h-11 w-11 rounded-full bg-violet-700 flex items-center justify-center text-white shadow-lg ring-4 ring-white">
            <ShieldCheck className="h-5 w-5" />
          </div>
        </div>

        {/* ── WHITE LOGIN CARD ── */}
        <div className="w-full max-w-[480px] bg-white rounded-3xl shadow-2xl shadow-violet-900/10 border border-slate-200/60 px-6 sm:px-8 pt-10 pb-7 relative z-10">

          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Warden Login
            </h1>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Welcome! Please login to continue
              <br />
              to your dashboard.
            </p>
          </div>

          {/* Alert banner */}
          {(formError || formSuccess) && (
            <div
              className={`mb-5 rounded-xl px-4 py-3 text-sm font-semibold border ${
                formSuccess
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-rose-50 text-rose-700 border-rose-200"
              }`}
              role="status"
              aria-live="polite"
            >
              {formSuccess
                ? "Login successful. Redirecting to your dashboard..."
                : formError}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-5">

            {/* Field 1 – Warden ID */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                Warden ID
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <User className="h-[18px] w-[18px]" />
                </div>
                <input
                  type="text"
                  value={wardenId}
                  onChange={(e) => setWardenId(e.target.value)}
                  placeholder="Enter your Warden ID"
                  className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-violet-500 focus:ring-[3px] focus:ring-violet-500/15 focus:bg-white hover:border-slate-300"
                />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                Use the unique Warden ID provided by your institution.
              </p>
            </div>

            {/* Field 2 – 4-Digit PIN */}
            <div>
              <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                4-Digit PIN
              </label>
              <div className="relative">
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="h-[18px] w-[18px]" />
                </div>
                <input
                  type={showPin ? "text" : "password"}
                  value={pin}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "");
                    if (v.length <= 4) setPin(v);
                  }}
                  maxLength={4}
                  inputMode="numeric"
                  placeholder="Enter 4-digit PIN"
                  className="w-full pl-11 pr-11 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-violet-500 focus:ring-[3px] focus:ring-violet-500/15 focus:bg-white hover:border-slate-300 tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowPin((p) => !p)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-violet-600 transition-colors"
                  tabIndex={-1}
                  aria-label={showPin ? "Hide PIN" : "Show PIN"}
                >
                  {showPin ? (
                    <EyeOff className="h-[18px] w-[18px]" />
                  ) : (
                    <Eye className="h-[18px] w-[18px]" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5 pl-0.5">
                Enter your 4-digit PIN to access the system.
              </p>
            </div>

            {/* Remember Me */}
            <div>
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="sr-only peer"
                />
                {/* Custom checkbox */}
                <span className="h-[18px] w-[18px] rounded-md border-2 border-slate-300 flex items-center justify-center flex-shrink-0 transition-all duration-200 peer-checked:bg-violet-700 peer-checked:border-violet-700 group-hover:border-violet-400">
                  {rememberMe && (
                    <svg
                      className="h-3 w-3 text-white"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                </span>
                <span className="text-sm text-slate-700 font-medium flex items-center gap-1.5">
                  Remember me on this device
                  <Info className="h-3.5 w-3.5 text-slate-400" />
                </span>
              </label>
              <p className="text-xs text-slate-400 mt-1 pl-7">
                Keeping you logged in for a smoother experience.
              </p>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-violet-700 to-purple-600 text-white font-bold text-sm shadow-lg shadow-violet-700/25 hover:shadow-xl hover:shadow-violet-700/30 hover:brightness-110 active:scale-[0.98] transition-all duration-200 mt-1"
            >
              <ArrowRight className="h-[18px] w-[18px]" />
              Login
            </button>
          </form>

          {/* Need Help? divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200" />
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Need Help?
            </span>
            <div className="flex-1 h-px bg-slate-200" />
          </div>

          {/* Help Card */}
          <div className="bg-violet-50/70 border border-violet-100/80 rounded-xl px-4 py-3.5 flex items-center gap-3.5 hover:bg-violet-50 transition-colors duration-300 group cursor-default">
            <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 flex-shrink-0 group-hover:scale-105 transition-transform duration-300">
              <Headphones className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-slate-800">
                Facing issues logging in?
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Contact your administrator for assistance.
              </p>
            </div>
          </div>
        </div>

        {/* ── FOOTER ── */}
        <footer className="mt-8 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 rounded-full border border-slate-300 flex items-center justify-center text-slate-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Your actions are logged and monitored for security.
            </p>
            <p className="text-xs font-semibold text-violet-700">
              Thank you for keeping the campus safe!
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
