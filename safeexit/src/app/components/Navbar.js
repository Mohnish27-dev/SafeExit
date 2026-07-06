"use client";

import { useState, useEffect } from "react";
import { Shield, Menu, X, ArrowRight, Sun, Moon } from "lucide-react";
import Link from "next/link";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    // Check initial class on documentElement
    const isDark = document.documentElement.classList.contains("dark");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reading theme from the DOM (client-only external source) after mount.
    setTheme(isDark ? "dark" : "light");

    const handleScroll = () => {
      if (window.scrollY > 20) {
        setScrolled(true);
      } else {
        setScrolled(false);
      }
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const toggleTheme = () => {
    if (theme === "dark") {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      setTheme("light");
    } else {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      setTheme("dark");
    }
  };

  const navLinks = [
    { name: "Features", href: "#features" },
    { name: "How It Works", href: "#how-it-works" },
    { name: "Security", href: "#security" },
    { name: "Interactive Demo", href: "#simulator" },
    { name: "Metrics", href: "#metrics" },
  ];

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/80 dark:bg-slate-900/80 backdrop-blur-md shadow-sm border-b border-slate-200/55 dark:border-slate-800/55 py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 cursor-pointer group">
            <div className="nav-logo-glow h-10 w-10 rounded-xl bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Shield className="h-5.5 w-5.5" />
            </div>
            <div>
              <span className="font-sans text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Safe<span className="text-indigo-600">Exit</span>
              </span>
              <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 -mt-1 uppercase tracking-wider">
                Secure. Private. Safe.
              </p>
            </div>
          </div>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                className="nav-link text-sm font-semibold text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-white transition-colors duration-200"
              >
                {link.name}
              </a>
            ))}
          </div>

          {/* Action Button */}
          <div className="hidden md:flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-full border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? <Sun className="h-4.5 w-4.5" /> : <Moon className="h-4.5 w-4.5" />}
            </button>
            <Link
              href="/login"
              className="cta-shine group inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold bg-gradient-to-r from-slate-900 to-indigo-600 text-white hover:brightness-110 hover:scale-105 shadow-md shadow-indigo-600/20 active:scale-95 transition-all duration-200"
            >
              Login
              <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors"
              aria-label="Toggle menu"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      <div
        className={`md:hidden absolute top-full left-0 right-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-all duration-300 ease-in-out origin-top ${
          isOpen ? "opacity-100 scale-y-100 py-4" : "opacity-0 scale-y-0 h-0 overflow-hidden pointer-events-none"
        }`}
      >
        <div className="px-4 space-y-2 flex flex-col">
          {navLinks.map((link) => (
            <a
              key={link.name}
              href={link.href}
              onClick={() => setIsOpen(false)}
              className="px-4 py-3 rounded-lg text-base font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition-all"
            >
              {link.name}
            </a>
          ))}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 px-4 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {theme === "dark" ? "Dark Mode" : "Light Mode"}
            </span>
            <button
              onClick={toggleTheme}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              aria-label="Toggle Theme"
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
          </div>
          <div className="pt-2 px-4">
            <Link
              href="/login"
              onClick={() => setIsOpen(false)}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-base font-semibold bg-gradient-to-r from-slate-900 to-indigo-600 text-white hover:brightness-110 shadow-lg shadow-indigo-600/20"
            >
              Login
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
