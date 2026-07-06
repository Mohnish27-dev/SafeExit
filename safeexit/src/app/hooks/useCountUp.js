"use client";

import { useState, useEffect, useRef } from "react";

// Counts from 0 → target with an ease-out curve, but only once the element
// scrolls into view. Returns [ref, value]. Respects prefers-reduced-motion by
// snapping straight to the target.
export default function useCountUp(target, { duration = 1600 } = {}) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const run = () => {
      if (started.current) return;
      started.current = true;
      if (reduce) { setValue(target); return; }

      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setValue(target * eased);
        if (p < 1) requestAnimationFrame(tick);
        else setValue(target);
      };
      requestAnimationFrame(tick);
    };

    if (typeof IntersectionObserver === "undefined") { run(); return; }
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) run(); },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [target, duration]);

  return [ref, value];
}
