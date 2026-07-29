import { Outfit, Manrope, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { LanguageProvider } from "./lib/i18n";
import InstallPrompt from "./components/InstallPrompt";

const displayFont = Outfit({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const bodyFont = Manrope({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "NITP-SafeExit | Privacy-First Smart Hostel Access",
  description: "NITP-SafeExit replaces unsafe physical hostel registers with a secure digital outing system that protects student privacy and tracks audit trails.",
  icons: {
    icon: [
      { url: "/images/nit-patna-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/nit-patna-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: { url: "/images/nit-patna-apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    shortcut: "/images/nit-patna-icon-192.png",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      className={`${displayFont.variable} ${bodyFont.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#6366f1" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <Script id="theme-init" strategy="beforeInteractive">
          {`
            (function() {
              try {
                const storedTheme = localStorage.getItem('theme');
                if (storedTheme === 'dark' || (!storedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            })();
          `}
        </Script>
        <Script id="pwa-install-capture" strategy="beforeInteractive">
          {`
            // Chrome may fire beforeinstallprompt before React hydrates.
            // Stash it so InstallPrompt can pick it up on mount.
            window.addEventListener('beforeinstallprompt', function(e) {
              e.preventDefault();
              window.__deferredInstallPrompt = e;
            });
          `}
        </Script>
        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ('serviceWorker' in navigator) {
              navigator.serviceWorker.register('/sw.js').catch(function(err) {
                console.log('SW registration failed:', err);
              });
            }
          `}
        </Script>
      </head>
      <body className="min-h-full flex flex-col transition-colors duration-300"><LanguageProvider>{children}<InstallPrompt /></LanguageProvider></body>
    </html>
  );
}
