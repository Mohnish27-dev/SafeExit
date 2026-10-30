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
      type="button"
      onClick={toggle}
      aria-label="Switch language"
      className={`
        group relative inline-flex items-center gap-1 sm:gap-1.5 rounded-full
        border border-slate-200 bg-white/80 backdrop-blur-sm
        px-2.5 py-1 sm:px-3 sm:py-1.5 text-[11px] sm:text-xs font-bold tracking-wide
        shadow-sm transition-all duration-300
        hover:shadow-md hover:border-indigo-300 hover:bg-indigo-50/50
        active:scale-95 cursor-pointer select-none shrink-0
        ${className}
      `}
    >
      <span className="flex h-4.5 w-4.5 sm:h-5 sm:w-5 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-[8.5px] sm:text-[9px] font-black text-white shadow-inner shrink-0">
        {locale === "en" ? "EN" : "हि"}
      </span>
      <span className="transition-all duration-300 whitespace-nowrap">
        {locale === "en" ? "हिंदी" : "English"}
      </span>
      <span className="text-[10px] text-slate-400 group-hover:text-indigo-500 transition-colors shrink-0">
        🌐
      </span>
    </button>
  );
}
