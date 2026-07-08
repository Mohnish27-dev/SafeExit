"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import en from "./translations/en";
import hi from "./translations/hi";

const translations = { en, hi };

const STORAGE_KEY = "safeexit:lang";

const LanguageContext = createContext({
  locale: "en",
  setLocale: () => {},
});

/**
 * Lightweight i18n provider.
 * Stores language preference in localStorage and provides a `useTranslation`
 * hook that returns a `t(key)` function for the current locale.
 *
 * No route changes required — works entirely client-side.
 */
export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState("en");

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "hi" || stored === "en") {
        setLocaleState(stored);
      }
    } catch {
      // localStorage unavailable (SSR, incognito, etc.)
    }
  }, []);

  const setLocale = useCallback((lang) => {
    setLocaleState(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook: returns `{ t, locale, setLocale }`.
 *
 * Usage:
 *   const { t } = useTranslation("warden");
 *   <h1>{t("dashboardTitle")}</h1>
 *
 * `t("dashboardTitle")` looks up `warden.dashboardTitle` in the active locale.
 * Falls back to the English translation if a Hindi key is missing.
 */
export function useTranslation(namespace) {
  const { locale, setLocale } = useContext(LanguageContext);

  const t = useCallback(
    (key) => {
      // Try current locale first, fall back to English
      const nsObj = translations[locale]?.[namespace];
      if (nsObj && key in nsObj) return nsObj[key];

      const fallback = translations.en?.[namespace];
      if (fallback && key in fallback) return fallback[key];

      // Last resort: return the key itself (makes missing keys obvious in UI)
      return key;
    },
    [locale, namespace]
  );

  return { t, locale, setLocale };
}

/**
 * Returns the locale string for date/time formatting.
 * "en" → "en-IN"  (English with Indian formatting)
 * "hi" → "hi-IN"  (Hindi with Devanagari)
 */
export function useDateLocale() {
  const { locale } = useContext(LanguageContext);
  return locale === "hi" ? "hi-IN" : "en-US";
}
