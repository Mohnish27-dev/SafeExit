"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Shield, Headphones, ShieldCheck, GraduationCap, UserCog, UserCheck, Crown, Lock, CheckCircle, ArrowLeft, ArrowRight, LogIn } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import caretakerIllustration from "../../../public/images/login/caretaker.png";
import { getToken } from "@/app/lib/auth";
import { getStoredUser } from "@/app/lib/userProfile";
import { CHIEF_WARDEN_PIN_KEY } from "@/app/lib/chiefWardenQuickLogin";

// Per-role Quick Login PIN keys — presence tells which roles this device is set up for
const ROLE_PIN_KEYS = {
  security: "safeexit_quick_pin_guard",
  student: "safeexit_quick_pin",
  caretaker: "safeexit_quick_pin_caretaker",
  warden: "safeexit_quick_pin_warden",
  "chief-warden": CHIEF_WARDEN_PIN_KEY,
};

const ROLE_LOGIN_PATH = {
  student: "/login/student",
  caretaker: "/login/caretaker",
  warden: "/login/warden",
  "chief-warden": "/login/chief-warden",
  security: "/login/security",
};

const ROLE_DASHBOARD = {
  student: "/dashboard/student",
  caretaker: "/dashboard/caretaker",
  warden: "/dashboard/warden",
  "chief-warden": "/dashboard/chief-warden",
  security: "/dashboard/security",
  admin: "/dashboard/admin",
};

// The versioned filename prevents Next/Image from serving the previously cached single-student artwork.
const STUDENT_ILLUSTRATION = "/images/login/student-team.png";
const STAFF_ILLUSTRATION = caretakerIllustration;

const allRoles = [
  {
    id: "security",
    title: "Security Guard",
    icon: ShieldCheck,
    image: "/images/login/security-guard.png",
    description: "Scan passes and verify student entry and exit.",
    href: "/login/security",
    eyebrow: "Gate operations",
    features: ["QR pass verification", "Entry and exit logs"],
    accentClass: "bg-blue-600",
    iconClass: "bg-blue-50 text-blue-700 ring-blue-100",
    visualClass: "from-blue-50 via-indigo-50 to-white border-blue-100",
    imageClass: "scale-[1.12] group-hover:scale-[1.17]",
  },
  {
    id: "student",
    title: "Student",
    icon: GraduationCap,
    image: STUDENT_ILLUSTRATION,
    description: "Request outings, track approvals and manage your campus access.",
    href: "/login/student",
    eyebrow: "Student access",
    features: ["Outing requests", "Live approval status"],
    accentClass: "bg-indigo-600",
    iconClass: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    visualClass: "from-indigo-50 via-violet-50 to-white border-indigo-100",
    imageClass: "scale-[1.12] group-hover:scale-[1.17]",
  },
  {
    id: "caretaker",
    title: "Caretaker",
    icon: UserCog,
    image: STAFF_ILLUSTRATION,
    description: "Review requests, handle complaints and monitor students.",
    href: "/login/caretaker",
    eyebrow: "Hostel operations",
    features: ["Request review", "Student support"],
    accentClass: "bg-violet-600",
    iconClass: "bg-violet-50 text-violet-700 ring-violet-100",
    visualClass: "from-violet-50 via-purple-50 to-white border-violet-100",
    imageClass: "scale-[1.24] group-hover:scale-[1.29]",
  },
  {
    id: "warden",
    title: "Warden",
    icon: UserCheck,
    image: STAFF_ILLUSTRATION,
    description: "Review and decide requests forwarded by caretakers.",
    href: "/login/warden",
    eyebrow: "Approvals and oversight",
    features: ["Final decisions", "Escalation review"],
    accentClass: "bg-purple-700",
    iconClass: "bg-purple-50 text-purple-700 ring-purple-100",
    visualClass: "from-purple-50 via-fuchsia-50/60 to-white border-purple-100",
    imageClass: "scale-[1.24] group-hover:scale-[1.29]",
  },
];

const STAFF_ROLE_IDS = new Set(["security", "caretaker", "warden"]);

const staffCategory = {
  id: "staff",
  title: "Staff",
  icon: UserCog,
  description: "Access tools for security guards, caretakers and wardens.",
  eyebrow: "Staff access",
  features: ["Three dedicated roles", "Secure role-based tools"],
  accentClass: "bg-violet-600",
  iconClass: "bg-violet-50 text-violet-700 ring-violet-100",
};

const primaryButtonClass =
  "mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-md shadow-indigo-600/20 transition-all duration-200 hover:bg-indigo-700 hover:shadow-lg hover:shadow-indigo-600/25 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2";

function RoleVisual({ role }) {
  if (role.id === "staff") {
    const staffIcons = [ShieldCheck, UserCog, UserCheck];

    return (
      <div className="relative mb-5 flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border border-violet-100 bg-gradient-to-br from-indigo-50 via-violet-50 to-white sm:h-48">
        <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-violet-200/30 blur-2xl" />
        <div className="absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-indigo-200/40 blur-2xl" />
        <div className="relative flex items-end justify-center gap-2.5 sm:gap-3">
          {staffIcons.map((Icon, index) => (
            <div
              key={index}
              className={`flex items-center justify-center rounded-2xl border border-white bg-white/95 text-indigo-600 shadow-lg shadow-indigo-100 transition-transform duration-300 group-hover:-translate-y-1 ${
                index === 1 ? "h-20 w-20 sm:h-24 sm:w-24" : "h-16 w-16 sm:h-20 sm:w-20"
              }`}
            >
              <Icon className={index === 1 ? "h-9 w-9 sm:h-11 sm:w-11" : "h-7 w-7 sm:h-9 sm:w-9"} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`relative mb-5 h-40 w-full overflow-hidden rounded-2xl border bg-gradient-to-br sm:h-48 ${role.visualClass}`}>
      <div className="absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/80 blur-2xl" />
      <div className="absolute -bottom-14 -left-10 h-36 w-36 rounded-full bg-indigo-200/25 blur-2xl" />
      <Image
        src={role.image}
        alt={`${role.title} illustration`}
        fill
        sizes="(max-width: 768px) 100vw, 320px"
        className={`relative z-10 object-contain transition-transform duration-500 ${role.imageClass}`}
      />
    </div>
  );
}

function RoleCard({ role, onSelect }) {
  const Icon = role.icon;
  const actionContent = onSelect ? (
    <>
      Choose staff role
      <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </>
  ) : (
    <>
      Login
      <LogIn className="h-4 w-4" aria-hidden="true" />
    </>
  );

  return (
    <article className="group relative flex h-full flex-col items-center overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-5 text-center shadow-[0_10px_35px_rgba(79,70,229,0.08)] transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_22px_55px_rgba(79,70,229,0.16)] sm:p-6">
      <div className={`absolute inset-x-0 top-0 h-1 ${role.accentClass}`} />

      <div className="mb-4 flex w-full items-center justify-between gap-3 pt-1">
        <span className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-slate-500">
          {role.eyebrow}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Secure
        </span>
      </div>

      <RoleVisual role={role} />

      <div className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl shadow-sm ring-1 ${role.iconClass}`}>
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>

      <h2 className="mb-1.5 text-lg font-bold text-slate-900 sm:text-xl">
        {role.title}
      </h2>
      <p className="mb-5 max-w-[260px] flex-1 text-sm font-medium leading-6 text-slate-500">
        {role.description}
      </p>

      <div className="mb-5 grid w-full grid-cols-1 gap-2 text-left">
        {role.features.map((feature) => (
          <div
            key={feature}
            className="flex min-h-10 items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2 text-xs font-semibold text-slate-600"
          >
            <CheckCircle className="h-4 w-4 shrink-0 text-indigo-500" aria-hidden="true" />
            {feature}
          </div>
        ))}
      </div>

      {onSelect ? (
        <button
          type="button"
          onClick={onSelect}
          className={primaryButtonClass}
          aria-label="Choose a staff role"
        >
          {actionContent}
        </button>
      ) : (
        <Link
          href={role.href}
          className={primaryButtonClass}
          aria-label={`Login as ${role.title}`}
        >
          {actionContent}
        </Link>
      )}
    </article>
  );
}

export default function LoginRoleSelect() {
  const router = useRouter();

  // loading | redirect | ready
  const [pageState, setPageState] = useState("loading");

  const [enrolledRoles, setEnrolledRoles] = useState([]);

  const [showAll, setShowAll] = useState(false);
  const [roleView, setRoleView] = useState("primary");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- hydrate role/session state from browser storage once on mount */
    // Active session? Go straight to the dashboard
    const token = getToken();
    if (token) {
      const user = getStoredUser();
      const dest = ROLE_DASHBOARD[user?.role] || "/dashboard/student";
      setPageState("redirect");
      router.replace(dest);
      return;
    }

    const found = Object.entries(ROLE_PIN_KEYS)
      .filter(([, key]) => !!localStorage.getItem(key))
      .map(([role]) => role);

    setEnrolledRoles(found);

    // Exactly one role enrolled → auto-redirect to that role's login
    if (found.length === 1) {
      const target = ROLE_LOGIN_PATH[found[0]];
      if (target) {
        setPageState("redirect");
        router.replace(target);
        return;
      }
    }

    setPageState("ready");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [router]);

  const enrolledPrimaryRoles = enrolledRoles.filter((role) => allRoles.some((item) => item.id === role));
  const availableRoles =
    showAll || enrolledPrimaryRoles.length === 0
      ? allRoles
      : allRoles.filter((r) => enrolledPrimaryRoles.includes(r.id));

  const availableStudentRole = availableRoles.find((role) => role.id === "student");
  const availableStaffRoles = availableRoles.filter((role) => STAFF_ROLE_IDS.has(role.id));
  const visibleRoles =
    roleView === "staff"
      ? availableStaffRoles
      : [
          ...(availableStudentRole ? [availableStudentRole] : []),
          ...(availableStaffRoles.length > 0 ? [staffCategory] : []),
        ];

  if (pageState !== "ready") {
    return (
      <div className="min-h-screen flex flex-col bg-[#f0f0ff] relative overflow-hidden">
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

        {/* Header skeleton */}
        <header className="relative z-10 w-full px-4 sm:px-8 py-5 flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2.5">
            <div className="h-11 w-11 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
              <Shield className="h-6 w-6" />
            </div>
            <div>
              <span className="font-sans text-xl font-bold tracking-tight text-slate-900">
                NITP-Safe<span className="text-indigo-600">Exit</span>
              </span>
              <p className="text-[10px] font-medium text-slate-500 -mt-0.5 tracking-wide">
                Secure Access. Safer Campuses.
              </p>
            </div>
          </div>
        </header>

        {/* Centered loader */}
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-8">
          <div className="flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin"></div>
            <p className="text-sm font-semibold text-slate-500 animate-pulse">
              Getting things ready…
            </p>
          </div>
        </main>
      </div>
    );
  }

  const isFiltered = !showAll && enrolledPrimaryRoles.length > 0;
  const isStaffView = roleView === "staff";

  return (
    <div className="min-h-screen flex flex-col bg-[#f0f0ff] relative overflow-hidden">
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
              NITP-Safe<span className="text-indigo-600">Exit</span>
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
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 py-4 sm:py-8">
        {/* Title */}
        <div className="text-center mb-5 sm:mb-10">
          <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            {isStaffView ? (
              <>Choose your <span className="text-indigo-600">staff role</span></>
            ) : isFiltered ? (
              <>Welcome back to <span className="text-indigo-600">NITP-SafeExit</span></>
            ) : (
              <>Welcome to <span className="text-indigo-600">NITP-SafeExit</span></>
            )}
          </h1>
          <p className="text-slate-500 mt-1.5 text-sm sm:text-base font-medium">
            {isStaffView
              ? "Select your responsibility to continue to the correct login page"
              : isFiltered
                ? "Continue with your registered access"
                : "Are you a student or a staff member?"}
          </p>
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-indigo-600"></div>
        </div>

        {isStaffView && (
          <div className="mb-4 w-full max-w-5xl sm:mb-5">
            <button
              type="button"
              onClick={() => setRoleView("primary")}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bold text-slate-600 transition-colors hover:bg-white/70 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Back to Student or Staff
            </button>
          </div>
        )}

        {/* Role Cards */}
        <div
          className={`grid w-full grid-cols-1 gap-5 sm:gap-6 lg:gap-8 ${
            visibleRoles.length === 1
              ? "max-w-sm"
              : visibleRoles.length === 2
                ? "max-w-3xl md:grid-cols-2"
                : "max-w-5xl md:grid-cols-3"
          }`}
        >
          {visibleRoles.map((role) => (
            <RoleCard
              key={role.id}
              role={role}
              onSelect={role.id === "staff" ? () => setRoleView("staff") : undefined}
            />
          ))}
        </div>

        {/* "Show all roles" escape hatch */}
        {isFiltered && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition-colors hover:bg-white/70 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              {isStaffView ? "Show all staff roles" : "Show all roles"}
            </button>
          </div>
        )}

        {/* Privileged oversight access stays compact, outside the primary role cards. */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:mt-8">
          <Link
            href="/login/chief-warden"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 backdrop-blur-sm px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-md transition-all"
          >
            <Crown className="h-4 w-4 text-indigo-500" />
            Chief Warden
            <span className="text-slate-400">→</span>
          </Link>
          <Link
            href="/login/admin"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 backdrop-blur-sm px-4 sm:px-5 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-md transition-all"
          >
            <ShieldCheck className="h-4 w-4 text-indigo-500" />
            Admin Console
            <span className="text-slate-400">→</span>
          </Link>
        </div>

        {/* Privacy Notice */}
        <div className="mt-5 sm:mt-8 max-w-2xl w-full">
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 shadow-sm px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
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
            <p>NITP-SafeExit © {new Date().getFullYear()}. All rights reserved.</p>
            <p className="text-xs text-slate-400 -mt-0.5">
              Building safer & smarter campuses.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
