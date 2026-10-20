"use client";

import { useState } from "react";
import { Lock, PenLine, X } from "lucide-react";
import SignatureCapture from "./SignatureCapture";
import { apiFetch } from "@/app/lib/api";
import { markSignatureSaved } from "@/app/lib/userProfile";

// Overlay that captures a signature and persists it to the caller's own profile.
// 
// Owns persistence because four surfaces need identical behaviour: both student request
// forms and both staff approval modals. Errors are surfaced inline rather than swallowed
// into console.error — an unsaved signature blocks real work.
//
// A saved signature is locked (the server refuses to replace it), so with one present this
// only shows it and says who can change it: an administrator reset clears it, and the
// owner then captures a new one here.
export default function SignatureSetupModal({
  open,
  dismissible = true,
  currentSignature = null,
  title = "Add your signature",
  description = "You only do this once — it will be attached automatically from now on.",
  onSaved,
  onClose,
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  const handleSave = async (signature) => {
    setSaving(true);
    setError("");
    try {
      const updated = await apiFetch("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ signature }),
      });
      markSignatureSaved();
      onSaved?.(updated.signature || signature);
    } catch (err) {
      setError(err?.message || "Couldn't save your signature. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      {/* Backdrop only dismisses when the caller allows it — the onboarding gate does not. */}
      <button
        type="button"
        aria-hidden={!dismissible}
        tabIndex={dismissible ? 0 : -1}
        onClick={dismissible ? onClose : undefined}
        className="absolute inset-0 cursor-default"
        disabled={!dismissible}
      />
      <div className="relative z-10 max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-t-[2rem] bg-white p-5 shadow-2xl sm:rounded-[2rem]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <PenLine size={18} />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{title}</h2>
              <p className="mt-0.5 text-xs text-slate-500">{description}</p>
            </div>
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X size={18} />
            </button>
          )}
        </div>

        {currentSignature ? (
          <div className="mt-4">
            <div className="flex justify-center rounded-2xl border border-slate-200 bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={currentSignature} alt="Your saved signature" className="h-20 w-auto" />
            </div>
            <div className="mt-3 flex items-start gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <p className="text-xs leading-relaxed text-slate-600">
                Your signature is locked. To change it, contact the SafeExit administrator.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-4">
            <p className="mb-3 text-[11px] font-semibold text-amber-700">
              Once saved, your signature is locked. Only the administrator can change it.
            </p>
            <SignatureCapture
              currentSignature={null}
              onSave={handleSave}
              saving={saving}
              error={error}
            />
          </div>
        )}
      </div>
    </div>
  );
}
