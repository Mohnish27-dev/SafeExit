"use client";

import { Shield, LogIn, Headphones, ShieldCheck, GraduationCap, UserCog, Lock, CheckCircle } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

const roles = [
  {
    id: "security",
    title: "Security",
    icon: ShieldCheck,
    image: "/images/login/security-guard.png",
    description: "Login as Security Guard to scan and verify entries",
    buttonText: "Login as Security",
    href: "/login/security",
    color: "from-indigo-500 to-indigo-700",
    iconBg: "bg-indigo-100 text-indigo-600",
  },
  {
    id: "student",
    title: "Student",
    icon: GraduationCap,
    image: "/images/login/student.png",
    description: "Login to request outings, view permissions and more",
    buttonText: "Login as Student",
    href: "/login/student",
    color: "from-violet-500 to-violet-700",
    iconBg: "bg-violet-100 text-violet-600",
  },
  {
    id: "warden",
    title: "Warden",
    icon: UserCog,
    image: "/images/login/warden.png",
    description: "Login to approve requests, manage complaints and monitor",
    buttonText: "Login as Warden",
    href: "/login/warden",
    color: "from-purple-500 to-purple-700",
    iconBg: "bg-purple-100 text-purple-600",
  },
];

export default function LoginRoleSelect() {
  return (
    <div className="min-h-screen flex flex-col bg-[#f0f0ff] relative overflow-hidden">
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

      {/* Gradient overlays */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#f0f0ff] to-transparent z-[1]"></div>
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#f0f0ff] to-transparent z-[1]"></div>

      {/* Header */}
      <header className="relative z-10 w-full px-4 sm:px-8 py-5 flex items-center justify-between max-w-7xl mx-auto">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="h-11 w-11 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 group-hover:shadow-indigo-600/50 transition-shadow">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <span className="font-sans text-xl font-bold tracking-tight text-slate-900">
              Safe<span className="text-indigo-600">Exit</span>
            </span>
            <p className="text-[10px] font-medium text-slate-500 -mt-0.5 tracking-wide">
              Secure Access. Safer Campuses.
            </p>
          </div>
        </Link>
        <a
          href="#"
          className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
        >
          <div className="h-9 w-9 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Headphones className="h-4.5 w-4.5" />
          </div>
          <div className="hidden sm:block text-right">
            <p className="text-sm font-bold text-slate-800">Need Help?</p>
            <p className="text-xs text-slate-500 -mt-0.5">Contact Support</p>
          </div>
        </a>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">
        {/* Title */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            Welcome to <span className="text-indigo-600">SafeExit</span>
          </h1>
          <p className="text-slate-500 mt-2 text-base font-medium">
            Choose your role to continue to the login page
          </p>
          <div className="mx-auto mt-3 h-1 w-12 rounded-full bg-indigo-600"></div>
        </div>

        {/* Role Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 max-w-4xl w-full">
          {roles.map((role, index) => (
            <div
              key={role.id}
              className="group relative bg-white rounded-2xl border border-slate-200/80 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300 overflow-hidden flex flex-col items-center text-center p-6 pt-0"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Character Image */}
              <div className="relative w-48 h-48 -mt-2 mb-1">
                <div className="absolute inset-0 bg-indigo-100/50 rounded-full scale-75 group-hover:scale-80 transition-transform duration-500"></div>
                <Image
                  src={role.image}
                  alt={role.title}
                  fill
                  sizes="192px"
                  className="object-contain relative z-10 group-hover:scale-105 transition-transform duration-500"
                />
              </div>

              {/* Role Icon Badge */}
              <div className={`h-11 w-11 rounded-full ${role.iconBg} flex items-center justify-center -mt-2 mb-3 shadow-sm border border-white ring-4 ring-white`}>
                <role.icon className="h-5 w-5" />
              </div>

              {/* Role Title */}
              <h2 className="text-lg font-bold text-slate-900 mb-1">
                {role.title}
              </h2>

              {/* Description */}
              <p className="text-sm text-slate-500 font-medium mb-5 leading-relaxed max-w-[200px]">
                {role.description}
              </p>

              {/* Login Button */}
              <Link
                href={role.href}
                className={`w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r ${role.color} hover:opacity-90 shadow-md hover:shadow-lg active:scale-[0.98] transition-all duration-200 mt-auto`}
              >
                <LogIn className="h-4 w-4" />
                {role.buttonText}
              </Link>
            </div>
          ))}
        </div>

        {/* Admin Console access */}
        <div className="mt-8">
          <Link
            href="/login/admin"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 backdrop-blur-sm px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-md transition-all"
          >
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
            Admin Console
            <span className="text-slate-400">→</span>
          </Link>
        </div>

        {/* Privacy Notice */}
        <div className="mt-8 max-w-2xl w-full">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600 flex-shrink-0">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-800">
                  Your data is private and secure with us.
                </p>
                <p className="text-xs text-slate-500 font-medium">
                  We never share your personal information with anyone.
                </p>
              </div>
            </div>
            <div className="h-9 w-9 rounded-full bg-indigo-600 flex items-center justify-center text-white flex-shrink-0">
              <CheckCircle className="h-5 w-5" />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 px-4">
        <div className="flex items-center justify-center gap-2 text-sm text-slate-500 font-medium">
          <div className="h-6 w-6 rounded-full border border-slate-300 flex items-center justify-center text-slate-400">
            <ShieldCheck className="h-3.5 w-3.5" />
          </div>
          <div className="text-left">
            <p>SafeExit © {new Date().getFullYear()}. All rights reserved.</p>
            <p className="text-xs text-slate-400 -mt-0.5">
              Building safer & smarter campuses.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
