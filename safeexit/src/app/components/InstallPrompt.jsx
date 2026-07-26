"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/app/lib/i18n";

const DISMISS_KEY = "safeexit:installPromptDismissedAt";
// Re-show the banner after 7 days if the user dismissed it earlier
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Bottom install banner shown to visitors who haven't installed the PWA yet.
 *
 * - Android / Chrome: captures the `beforeinstallprompt` event and triggers the
 *   native install dialog when the user taps "Install".
 * - iOS Safari: no install API exists, so we show "Share → Add to Home Screen"
 *   instructions instead.
 * - Hidden entirely when already running as an installed app (standalone mode).
 */
export default function InstallPrompt() {
  const { t } = useTranslation("install");
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already installed → never show
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (isStandalone) return;

    // Respect a recent dismissal
    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
      if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) return;
    } catch {
      // localStorage unavailable — just show the banner
    }

    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    setIsIOS(iOS);

    let showTimer;

    const onBeforeInstall = (e) => {
      // Stop Chrome's mini-infobar; we render our own banner instead
      e.preventDefault();
      setDeferredPrompt(e);
      showTimer = setTimeout(() => setVisible(true), 2000);
    };

    const onInstalled = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // The event may have fired before hydration — the beforeInteractive
    // script in layout.js stashes it for us (see "pwa-install-capture")
    if (window.__deferredInstallPrompt) {
      setDeferredPrompt(window.__deferredInstallPrompt);
      window.__deferredInstallPrompt = null;
      showTimer = setTimeout(() => setVisible(true), 2000);
    }

    // iOS never fires beforeinstallprompt — show the manual instructions
    if (iOS) {
      showTimer = setTimeout(() => setVisible(true), 2000);
    }

    return () => {
      clearTimeout(showTimer);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      // The event can only be used once, whatever the user chose
      setDeferredPrompt(null);
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignore
    }
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label={t("ariaLabel")}
      className="fixed inset-x-3 bottom-4 z-[100] mx-auto max-w-md animate-fade-in-up sm:inset-x-auto sm:right-6 sm:left-auto"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-teal-400/25 bg-slate-900/95 p-3.5 pl-4 shadow-2xl shadow-slate-900/40 backdrop-blur-md">
        {/* App icon */}
        <img
          src="/images/icon-192.png"
          alt=""
          className="h-10 w-10 shrink-0 rounded-xl shadow-md"
        />

        {/* Message */}
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-slate-100">
            {t("message")}
          </p>
          {isIOS && (
            <p className="mt-1 text-[11px] leading-snug text-slate-300">
              {t("iosHint")}{" "}
              <span role="img" aria-label="share icon">
                ⎋
              </span>{" "}
              {t("iosHint2")}
            </p>
          )}
        </div>

        {/* Install button — Android/Chrome only (iOS has no install API) */}
        {!isIOS && (
          <button
            onClick={handleInstall}
            className="shrink-0 cursor-pointer rounded-full bg-gradient-to-br from-amber-400 to-amber-500 px-4 py-2 text-[13px] font-extrabold text-slate-900 shadow-md shadow-amber-500/30 transition-all duration-200 hover:shadow-lg hover:shadow-amber-500/40 active:scale-95"
          >
            {t("button")}
          </button>
        )}

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          aria-label={t("dismiss")}
          className="shrink-0 cursor-pointer rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-700/60 hover:text-slate-100"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
