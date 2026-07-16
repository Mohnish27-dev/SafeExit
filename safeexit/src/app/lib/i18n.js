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

/** Lightweight client-side i18n provider; language preference lives in localStorage. */
export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState("en");

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

/** `t(key)` looks up `namespace.key` in the active locale, falling back to English. */
export function useTranslation(namespace) {
  const { locale, setLocale } = useContext(LanguageContext);

  const t = useCallback(
    (key) => {
      const nsObj = translations[locale]?.[namespace];
      if (nsObj && key in nsObj) return nsObj[key];

      const fallback = translations.en?.[namespace];
      if (fallback && key in fallback) return fallback[key];

      // Return the key itself so missing keys are obvious in the UI
      return key;
    },
    [locale, namespace]
  );

  return { t, locale, setLocale };
}

/** Locale string for date/time formatting. */
export function useDateLocale() {
  const { locale } = useContext(LanguageContext);
  return locale === "hi" ? "hi-IN" : "en-US";
}
