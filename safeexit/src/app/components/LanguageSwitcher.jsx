"use client";

import { useTranslation } from "@/app/lib/i18n";

/**
 * A compact, elegant language toggle button for dashboard headers.
 * Switches between English and Hindi instantly with a subtle animation.
 *
 * Props:
 *   className – optional extra classes for positioning
 */
export default function LanguageSwitcher({ className = "" }) {
  const { locale, setLocale } = useTranslation("common");

  const toggle = () => setLocale(locale === "en" ? "hi" : "en");

  return (
    <button
      onClick={toggle}
      aria-label="Switch language"
      className={`
        group relative inline-flex items-center gap-1.5 rounded-full
        border border-slate-200 bg-white/80 backdrop-blur-sm
        px-3 py-1.5 text-xs font-bold tracking-wide
        shadow-sm transition-all duration-300
        hover:shadow-md hover:border-indigo-300 hover:bg-indigo-50/50
        active:scale-95 cursor-pointer select-none
        ${className}
      `}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-[9px] font-black text-white shadow-inner">
        {locale === "en" ? "EN" : "हि"}
      </span>
      <span className="transition-all duration-300">
        {locale === "en" ? "हिंदी" : "English"}
      </span>
      <span className="text-[10px] text-slate-400 group-hover:text-indigo-500 transition-colors">
        🌐
      </span>
    </button>
  );
}
