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


export function useTranslation(namespace) {
  const { locale, setLocale } = useContext(LanguageContext);

  const t = useCallback(
    (key, params) => {
      const nsObj = translations[locale]?.[namespace];
      const fallback = translations.en?.[namespace];

      const str =
        nsObj && key in nsObj
          ? nsObj[key]
          : fallback && key in fallback
          ? fallback[key]
          // Return the key itself so missing keys are obvious in the UI
          : key;

      if (!params) return str;
      // Unknown placeholders are left as-is — a visible `{name}` beats silently dropping it.
      return str.replace(/\{(\w+)\}/g, (match, slot) =>
        slot in params ? params[slot] : match
      );
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
