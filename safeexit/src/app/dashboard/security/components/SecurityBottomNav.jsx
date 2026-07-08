"use client";

import Link from "next/link";
import { History, Home, UserRound, UsersRound } from "lucide-react";

const NAV_ITEMS = [
  { label: "Home", icon: Home, href: "/dashboard/security" },
  { label: "Students", icon: UsersRound, href: "/dashboard/security/students" },
  { label: "History", icon: History, href: "/dashboard/security/history" },
  { label: "Profile", icon: UserRound, href: "/dashboard/security/profile" },
];

export default function SecurityBottomNav({ active }) {
  return (
    <nav className="dash-card mt-6 hidden md:grid grid-cols-4 rounded-[2rem] p-3 shadow-xl backdrop-blur">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition ${
            item.label === active ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <item.icon className="h-6 w-6" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
