"use client";

import { useEffect, useState } from "react";
import { UserCog, Loader2 } from "lucide-react";
import { apiFetch } from "@/app/lib/api";

// Warden picker shared by the outing, leave, and complaint forms.
//
// Loads the wardens the student may route to (GET /warden/selectable — the server
// fences this to the student's own gender scope) and pre-selects the student's own
// hostel warden. When their own warden is away for a few days, the student can pick
// another same-gender warden so the request isn't stuck. The chosen id is reported
// upward via onChange; the parent sends it as `targetWardenId` on submit.
export default function WardenSelect({ value, onChange, className = "" }) {
  const [wardens, setWardens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const data = await apiFetch("/warden/selectable");
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setWardens(list);
        // Default to the student's own-hostel warden when nothing is chosen yet.
        if (!value) {
          const def = list.find((w) => w.isDefault) || list[0];
          if (def) onChange(def._id);
        }
      } catch (err) {
        if (!cancelled) setError("Could not load wardens. Your request will go to your hostel warden.");
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
  if (!loading && !error && wardens.length <= 1) return null;

  return (
    <div className={className}>
      <label className="text-xs font-semibold text-slate-600 block mb-1.5">
        <UserCog size={11} className="inline mr-1 text-sky-500" />
        Send to warden
      </label>
      {loading ? (
        <div className="sf-input flex items-center gap-2 bg-slate-50 text-slate-400 cursor-wait">
          <Loader2 size={14} className="animate-spin" /> Loading wardens…
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
            {wardens.map((w) => (
              <option key={w._id} value={w._id}>
                {w.name}
                {w.hostel ? ` — ${w.hostel}` : ""}
                {w.isDefault ? " (your hostel)" : ""}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 font-medium mt-1">
            Defaults to your hostel warden. Pick another if yours is unavailable.
          </p>
        </>
      )}
    </div>
  );
}
