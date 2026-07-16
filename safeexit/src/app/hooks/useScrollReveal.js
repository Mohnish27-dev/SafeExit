"use client";

import { useEffect } from "react";

// Adds `.in-view` to `.reveal` elements on scroll-in; runs once per element.
export default function useScrollReveal(deps = []) {
  useEffect(() => {
    const nodes = document.querySelectorAll(".reveal:not(.in-view)");
    if (nodes.length === 0) return;

    // No IntersectionObserver (or reduced test envs) → just show everything.
    if (typeof IntersectionObserver === "undefined") {
      nodes.forEach((n) => n.classList.add("in-view"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in-view");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );

    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
