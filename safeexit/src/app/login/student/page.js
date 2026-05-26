"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Phone,
  Smartphone,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function StudentLoginPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("email");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [countryCode, setCountryCode] = useState("+91");
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [emailOrId, setEmailOrId] = useState("");
  const [password, setPassword] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [formError, setFormError] = useState("");
  const [formSuccess, setFormSuccess] = useState(false);

  const countryCodes = [
    { code: "+91", country: "IN" },
    { code: "+1", country: "US" },
    { code: "+44", country: "UK" },
    { code: "+61", country: "AU" },
    { code: "+971", country: "AE" },
  ];

  const handleLogin = (event) => {
    event.preventDefault();
    setFormError("");
    setFormSuccess(false);

    if (activeTab === "email") {
      if (!emailOrId.trim() || !password.trim()) {
        setFormError("Please enter your email/enrollment ID and password.");
        return;
      }
    } else {
      const digits = mobileNumber.replace(/\D/g, "");
      if (digits.length < 8) {
        setFormError("Please enter a valid mobile number.");
        return;
      }
    }

    setFormSuccess(true);
    setTimeout(() => {
      router.push("/");
    }, 700);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-[#f4f1ff] via-[#efe8ff] to-[#e9e2ff] relative overflow-hidden">
      {/* Background hostel illustration */}
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
      <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-indigo-300/20 blur-3xl z-0" />
      <div className="absolute top-16 -right-20 h-72 w-72 rounded-full bg-purple-300/25 blur-3xl z-0" />
      <div className="absolute -bottom-24 left-1/3 h-80 w-80 rounded-full bg-violet-300/20 blur-3xl z-0" />

      {/* Gradient overlays */}
      <div className="absolute top-0 left-0 right-0 h-44 bg-gradient-to-b from-[#f0f0ff] to-transparent z-[1]"></div>
      <div className="absolute bottom-0 left-0 right-0 h-44 bg-gradient-to-t from-[#e8e0ff] to-transparent z-[1]"></div>

      {/* Page Content */}
      <div className="relative z-10 flex-1 flex flex-col items-center px-4 py-6 sm:py-8 animate-fade-in-up">
        {/* Header / Logo */}
        <Link href="/" className="flex flex-col items-center gap-1.5 group mb-4 sm:mb-6">
          <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 group-hover:shadow-indigo-600/50 transition-shadow duration-300">
            <Shield className="h-7 w-7" />
          </div>
          <div className="text-center">
            <span className="font-sans text-2xl font-bold tracking-tight text-slate-900">
              Safe<span className="text-indigo-600">Exit</span>
            </span>
            <p className="text-[11px] font-medium text-slate-500 tracking-wide">
              Secure Access. Safer Campuses.
            </p>
          </div>
        </Link>

        {/* Character Illustration */}
        <div className="relative w-[200px] h-[200px] sm:w-[220px] sm:h-[220px] mb-[-54px] z-20 animate-float">
          <div className="absolute inset-0 rounded-full bg-white/60 shadow-[0_30px_60px_-35px_rgba(59,7,100,0.6)]" />
          <Image
            src="/images/login/student.png"
            alt="Student"
            fill
            className="object-contain drop-shadow-lg"
            priority
          />
        </div>

        {/* Icon Badge - overlapping between illustration and card */}
        <div className="relative z-30 mb-[-24px]">
          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg ring-4 ring-white">
            <Mail className="h-5 w-5" />
          </div>
        </div>

        {/* White Login Card */}
        <div className="w-full max-w-[480px] bg-white rounded-3xl shadow-2xl shadow-indigo-900/10 border border-white/80 pt-10 pb-8 px-6 sm:px-8">
          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Student Login
            </h1>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Welcome! Please login to continue
              <br />
              to your dashboard.
            </p>
          </div>

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

          {/* Login Method Tabs */}
          <div className="bg-slate-100/90 rounded-full p-1 flex mb-6">
            <button
              onClick={() => setActiveTab("email")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-sm font-semibold transition-all duration-300 cursor-pointer ${
                activeTab === "email"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">Email / Enrollment ID</span>
              <span className="sm:hidden text-xs">Email / ID</span>
            </button>
            <button
              onClick={() => setActiveTab("mobile")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-sm font-semibold transition-all duration-300 cursor-pointer ${
                activeTab === "mobile"
                  ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Smartphone className="h-4 w-4" />
              <span className="hidden sm:inline">Mobile Number</span>
              <span className="sm:hidden text-xs">Mobile</span>
            </button>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Email / Enrollment Tab */}
            {activeTab === "email" && (
              <div className="space-y-5 animate-fade-in-up" style={{ animationDuration: "0.35s" }}>
              {/* Field 1 - Email / Enrollment */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  College Email / Enrollment Number
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Mail className="h-[18px] w-[18px]" />
                  </div>
                  <input
                    type="text"
                    placeholder="Enter your college email or enrollment number"
                    value={emailOrId}
                    onChange={(event) => setEmailOrId(event.target.value)}
                    className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/15 focus:bg-white transition-all duration-200"
                  />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 ml-1">
                  Use your official email ID or enrollment number.
                </p>
              </div>

              {/* Field 2 - Password */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                    <Lock className="h-[18px] w-[18px]" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="w-full pl-11 pr-12 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/15 focus:bg-white transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-indigo-500 transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="h-[18px] w-[18px]" />
                    ) : (
                      <Eye className="h-[18px] w-[18px]" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 ml-1">
                  Enter your account password.
                </p>
              </div>

              {/* Remember Me & Forgot Password */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <div
                    onClick={() => setRememberMe(!rememberMe)}
                    className={`h-[18px] w-[18px] rounded flex items-center justify-center border-2 transition-all duration-200 cursor-pointer ${
                      rememberMe
                        ? "bg-indigo-600 border-indigo-600"
                        : "border-slate-300 bg-white hover:border-indigo-400"
                    }`}
                  >
                    {rememberMe && (
                      <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm text-slate-600">Remember me</span>
                </label>
                <Link
                  href="#"
                  className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>

              {/* Login Button */}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:brightness-110 active:scale-[0.98] transition-all duration-200 cursor-pointer"
              >
                <ArrowRight className="h-5 w-5" />
                Login
              </button>
              </div>
            )}

            {/* Mobile Number Tab */}
            {activeTab === "mobile" && (
              <div className="space-y-5 animate-fade-in-up" style={{ animationDuration: "0.35s" }}>
              {/* Phone Number Input */}
              <div>
                <label className="block text-sm font-semibold text-slate-800 mb-1.5">
                  Mobile Number
                </label>
                <div className="relative flex gap-2">
                  {/* Country Code Selector */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCountryDropdown(!showCountryDropdown)}
                      className="flex items-center gap-1 px-3 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-700 font-semibold hover:border-indigo-400 focus:outline-none focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/15 transition-all duration-200 cursor-pointer min-w-[80px]"
                    >
                      {countryCode}
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                    {showCountryDropdown && (
                      <div className="absolute top-full left-0 mt-1 bg-white rounded-xl border border-slate-200 shadow-lg z-50 overflow-hidden min-w-[100px]">
                        {countryCodes.map((cc) => (
                          <button
                            key={cc.code}
                            onClick={() => {
                              setCountryCode(cc.code);
                              setShowCountryDropdown(false);
                            }}
                            className={`w-full px-3 py-2 text-left text-sm hover:bg-indigo-50 transition-colors cursor-pointer flex items-center gap-2 ${
                              countryCode === cc.code
                                ? "bg-indigo-50 text-indigo-600 font-semibold"
                                : "text-slate-700"
                            }`}
                          >
                            <span className="text-xs text-slate-400">{cc.country}</span>
                            <span>{cc.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Phone Input */}
                  <div className="relative flex-1">
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
                      <Phone className="h-[18px] w-[18px]" />
                    </div>
                    <input
                      type="tel"
                      placeholder="Enter your mobile number"
                      value={mobileNumber}
                      onChange={(event) => setMobileNumber(event.target.value)}
                      className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50/60 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 focus:ring-[3px] focus:ring-indigo-500/15 focus:bg-white transition-all duration-200"
                    />
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1.5 ml-1">
                  We&apos;ll send a one-time verification code to this number.
                </p>
              </div>

              {/* Send OTP Button */}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:brightness-110 active:scale-[0.98] transition-all duration-200 cursor-pointer"
              >
                <ArrowRight className="h-5 w-5" />
                Send OTP
              </button>

              <p className="text-xs text-slate-400 text-center">
                By continuing, you agree to receive an SMS for verification.
              </p>
            </div>
            )}
          </form>

          {/* OR Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px bg-slate-200"></div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              OR
            </span>
            <div className="flex-1 h-px bg-slate-200"></div>
          </div>

          {/* Continue with Google */}
          <button
            type="button"
            className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-300 hover:shadow-sm active:scale-[0.98] transition-all duration-200 cursor-pointer"
          >
            {/* Google G Logo SVG */}
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          {/* Register Link */}
          <p className="text-center text-sm text-slate-500 mt-5">
            Don&apos;t have an account?{" "}
            <Link
              href="#"
              className="font-semibold text-indigo-600 hover:text-indigo-700 transition-colors"
            >
              Register now
            </Link>
          </p>
        </div>

        {/* Footer */}
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <div className="h-9 w-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-500">
            <ShieldCheck className="h-4.5 w-4.5" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">
              Your data is encrypted and protected.
            </p>
            <p className="text-xs text-slate-400 mt-0.5">
              We prioritize your privacy and safety.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
