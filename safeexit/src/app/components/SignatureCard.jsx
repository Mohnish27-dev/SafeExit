"use client";

import { useState } from "react";
import { Lock, PenLine, Plus } from "lucide-react";
import SignatureSetupModal from "./SignatureSetupModal";

// Profile row showing the saved signature. Tapping it adds one when there is none; once
// saved it is locked and the row only shows it — changing it is an administrator reset.
// Past requests keep their own snapshot either way.
export default function SignatureCard({ signature, onSaved, label = "My signature" }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="sd-row w-full cursor-pointer text-left transition hover:bg-slate-50"
        style={{ "--accent": "#8b5cf6" }}
      >
        <span className="sd-row__accent" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <PenLine className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <p className="sd-card-title text-[0.88rem]">{label}</p>
            {signature ? (
              <div className="mt-1.5 inline-flex rounded-lg border border-slate-200 bg-white p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signature} alt="Your saved signature" className="h-10 w-auto" />
              </div>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">
                Not set up — add it once and it attaches to every approval.
              </p>
            )}
          </div>
        </div>
        <span className="shrink-0 text-[11px] font-bold text-indigo-600">
          {signature ? (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Lock className="h-3 w-3" /> Locked
            </span>
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </span>
      </button>

      <SignatureSetupModal
        open={open}
        currentSignature={signature}
        title={signature ? "Your signature" : "Add your signature"}
        description="Draw it or upload a photo — it is attached automatically to everything you approve."
        onClose={() => setOpen(false)}
        onSaved={(saved) => {
          onSaved?.(saved);
          setOpen(false);
        }}
      />
    </>
  );
}
