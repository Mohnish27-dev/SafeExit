"use client";

import Link from "next/link";
import { History, Home, UserRound, UsersRound } from "lucide-react";
import { useTranslation } from "@/app/lib/i18n";

export default function SecurityBottomNav({ active }) {
  const { t: tc } = useTranslation("common");
  const { t } = useTranslation("security");

  const NAV_ITEMS = [
    { label: tc("home"), matchKey: "Home", icon: Home, href: "/dashboard/security" },
    { label: t("students"), matchKey: "Students", icon: UsersRound, href: "/dashboard/security/students" },
    { label: t("history"), matchKey: "History", icon: History, href: "/dashboard/security/history" },
    { label: tc("profile"), matchKey: "Profile", icon: UserRound, href: "/dashboard/security/profile" },
  ];

  return (
    <nav className="dash-card mt-6 hidden md:grid grid-cols-4 rounded-[2rem] p-3 shadow-xl backdrop-blur">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.matchKey}
          href={item.href}
          className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-xs font-semibold uppercase tracking-[0.18em] transition ${
            item.matchKey === active ? "bg-indigo-100 text-indigo-700" : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <item.icon className="h-6 w-6" />
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
