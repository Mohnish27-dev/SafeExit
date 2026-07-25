"use client";

import { useEffect, useState } from "react";
import { UserCog, Loader2 } from "lucide-react";
import { apiFetch } from "@/app/lib/api";

// Caretaker picker shared by the outing, leave, and complaint forms.
//
// Loads the caretakers the student may route to (GET /caretaker/selectable — the server
// fences this to the student's own gender scope) and pre-selects the student's own
// hostel caretaker. When their own caretaker is away for a few days, the student can pick
// another same-gender caretaker so the request isn't stuck. The chosen id is reported
// upward via onChange; the parent sends it as `targetCaretakerId` on submit.
export default function CaretakerSelect({ value, onChange, className = "" }) {
  const [caretakers, setCaretakers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch("/caretaker/selectable");
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setCaretakers(list);
        // Default to the student's own-hostel caretaker when nothing is chosen yet.
        if (!value) {
          const def = list.find((w) => w.isDefault) || list[0];
          if (def) onChange(def._id);
        }
      } catch (err) {
        if (!cancelled) setError("Could not load caretakers. Your request will go to your hostel caretaker.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Run once on mount; onChange/value are intentionally not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Nothing to choose between — hide the control entirely.
  if (!loading && !error && caretakers.length <= 1) return null;

  return (
    <div className={className}>
      <label className="text-xs font-semibold text-slate-600 block mb-1.5">
        <UserCog size={11} className="inline mr-1 text-sky-500" />
        Send to caretaker
      </label>
      {loading ? (
        <div className="sf-input flex items-center gap-2 bg-slate-50 text-slate-400 cursor-wait">
          <Loader2 size={14} className="animate-spin" /> Loading caretakers…
        </div>
      ) : error ? (
        <p className="text-xs text-amber-600">{error}</p>
      ) : (
        <>
          <select
            value={value || ""}
            onChange={(e) => onChange(e.target.value)}
            className="sf-input"
          >
            {caretakers.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
                {w.hostel ? ` — ${w.hostel}` : ""}
                {w.isDefault ? " (your hostel)" : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 font-medium mt-1">
            Defaults to your hostel caretaker. Pick another if yours is unavailable.
          </p>
        </>
      )}
    </div>
  );
}
