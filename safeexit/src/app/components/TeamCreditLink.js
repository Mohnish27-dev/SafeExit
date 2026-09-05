"use client";

import Link from "next/link";
import { Users } from "lucide-react";
import { TEAM } from "@/app/lib/team";

// The "Built by Team SafeExit" pill that links to /team.
//
// It started on the role-picker login page, but once quick login is set up a
// returning user never sees that page again — the PIN screen is the first thing
// they land on. So every login screen that can show a returning user renders
// this too, and they all share one component to keep the wording and styling
// from drifting apart.
export default function TeamCreditLink({ className = "" }) {
  return (
    <Link
      href="/team"
      className={`group inline-flex items-center gap-2 rounded-full border border-slate-300/70 bg-white/70 px-4 py-2 text-xs font-semibold text-slate-600 backdrop-blur-sm transition-all hover:border-indigo-200 hover:text-indigo-600 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2 ${className}`}
    >
      <Users className="h-3.5 w-3.5 text-indigo-500" aria-hidden="true" />
      Built by <span className="font-bold">{TEAM.name}</span>
      <span className="text-slate-400 transition-transform group-hover:translate-x-0.5">→</span>
    </Link>
  );
}
