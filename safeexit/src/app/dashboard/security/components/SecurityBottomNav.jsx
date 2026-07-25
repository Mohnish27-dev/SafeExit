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

  const renderItems = () =>
    NAV_ITEMS.map((item) => (
      <Link
        key={item.matchKey}
        href={item.href}
        className={`sd-navx ${item.matchKey === active ? "sd-navx--active" : ""}`}
      >
        <span className="sd-navx__icon">
          <item.icon className="h-5 w-5" />
        </span>
        {item.label}
      </Link>
    ));

  return (
    <>
      {/* Desktop: inline panel constrained to page width */}
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <nav className="sd-luxe-panel sd-luxe-rise mt-6 hidden md:grid grid-cols-4 gap-1 rounded-4xl p-3">
          {renderItems()}
        </nav>
      </div>

      {/* Mobile: floating bottom bar fixed to viewport */}
      <nav className="sd-luxe-panel sd-glow-border fixed inset-x-2 bottom-3 z-50 grid grid-cols-4 gap-0.5 rounded-[1.75rem] p-1.5 md:hidden">
        {renderItems()}
      </nav>
    </>
  );
}
