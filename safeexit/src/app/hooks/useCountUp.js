"use client";

import { useState, useEffect, useRef } from "react";

// Ease-out count-up on scroll-in. Returns [ref, value]; reduced-motion snaps to target.
export default function useCountUp(target, { duration = 1600 } = {}) {
  const ref = useRef(null);
  const [value, setValue] = useState(0);
  // Whether the element has ever scrolled into view; gates only the *first* animation.
  const visible = useRef(false);
  // Where the current animation starts from — the last value we actually displayed.
  const fromRef = useRef(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Animate from the last displayed value to the current target. Re-runs on every
    // target change (live polling / SSE) instead of latching after the first run.
    const run = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const from = fromRef.current;
      if (reduce || from === target) {
        fromRef.current = target;
        setValue(target);
        return;
      }

      const start = performance.now();
      const tick = (now) => {
        const p = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
        const current = from + (target - from) * eased;
        fromRef.current = current;
        setValue(current);
        if (p < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          fromRef.current = target;
          setValue(target);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const cleanup = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };

    if (typeof IntersectionObserver === "undefined") {
      visible.current = true;
      run();
      return cleanup;
    }

    // Once visible, keep animating on target changes even if it scrolls back out.
    if (visible.current) {
      run();
      return cleanup;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          visible.current = true;
          run();
        }
      },
      { threshold: 0.4 }
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      cleanup();
    };
  }, [target, duration]);

  return [ref, value];
}
