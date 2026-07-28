"use client";

import { useRef, useState } from "react";
import { Check, PenLine, Upload } from "lucide-react";
import SignaturePad from "./SignaturePad";
import { prepareSignatureImage, describeSignatureError } from "@/app/lib/signatureImage";

// Capture a signature once, by drawing it or uploading a photo of it.
//
// Whatever the user provides is saved as-is, only resized to fit the storage cap. An
// upload is never judged on lighting or contrast — the earlier version scored those and
// rejected legitimate photos, which left students unable to file an outing at all.
//
// SignaturePad is intentionally wrapped rather than extended. It is uncontrolled and
// cannot be seeded with an existing signature, so "your current signature" is shown as a
// plain <img> beside a fresh pad — the same shape the photo picker already uses. Clearing
// the pad between tab switches is a `key` remount.
export default function SignatureCapture({
  currentSignature = null,
  onSave,
  saving = false,
  error = "",
  saveLabel = "Save signature",
  disabled = false,
}) {
  const [tab, setTab] = useState("draw");
  // Raw pad output, cleaned only at save time: SignaturePad fires onChange on every
  // pointerup, and cleaning per stroke would run a full-canvas pass per stroke.
  const [rawDraw, setRawDraw] = useState(null);
  const [draft, setDraft] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [localError, setLocalError] = useState("");
  const [padKey, setPadKey] = useState(0);
  const fileInputRef = useRef(null);

  const busy = saving || processing || disabled;
  const preview = draft || currentSignature;
  const shownError = localError || error;

  const switchTab = (next) => {
    if (next === tab) return;
    setTab(next);
    setDraft(null);
    setRawDraw(null);
    setLocalError("");
    setPadKey((k) => k + 1);
  };

  const handleFile = (event) => {
    const file = event.target.files?.[0];
    // Allow re-picking the same file after a failed attempt.
    event.target.value = "";
    if (!file) return;

    setLocalError("");
    setProcessing(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const result = await prepareSignatureImage(reader.result);
      if (result.error) {
        setDraft(null);
        setLocalError(describeSignatureError(result.error));
      } else {
        setDraft(result.dataUrl);
      }
      setProcessing(false);
    };
    reader.onerror = () => {
      setLocalError(describeSignatureError("unreadable"));
      setProcessing(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setLocalError("");
    let finalSignature = draft;

    if (tab === "draw" && rawDraw) {
      setProcessing(true);
      // transparent: the pad's background is empty, so this must stay a PNG with alpha.
      const result = await prepareSignatureImage(rawDraw, { transparent: true });
      setProcessing(false);
      if (result.error) {
        setLocalError(describeSignatureError(result.error));
        return;
      }
      finalSignature = result.dataUrl;
      setDraft(result.dataUrl);
    }

    if (!finalSignature) {
      setLocalError("Please draw or upload your signature first.");
      return;
    }
    await onSave?.(finalSignature);
  };

  const tabClass = (name) =>
    `flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-wider transition cursor-pointer ${
      tab === name
        ? "bg-indigo-600 text-white shadow-sm"
        : "bg-slate-100 text-slate-500 hover:bg-slate-200"
    }`;

  return (
    <div className="w-full">
      <div className="flex gap-2 rounded-2xl bg-slate-50 p-1">
        <button type="button" onClick={() => switchTab("draw")} disabled={busy} className={tabClass("draw")}>
          <PenLine size={13} /> Draw
        </button>
        <button type="button" onClick={() => switchTab("upload")} disabled={busy} className={tabClass("upload")}>
          <Upload size={13} /> Upload photo
        </button>
      </div>

      <div className="mt-3">
        {tab === "draw" ? (
          <SignaturePad
            key={padKey}
            label="Sign here"
            hint="Draw your signature using your finger"
            onChange={setRawDraw}
            disabled={busy}
          />
        ) : (
          <div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFile}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white px-4 py-8 text-center transition hover:border-indigo-300 hover:bg-indigo-50/40 disabled:opacity-60"
            >
              <Upload size={20} className="text-indigo-500" />
              <span className="text-sm font-semibold text-slate-700">
                {processing ? "Processing…" : "Choose a photo of your signature"}
              </span>
              <span className="text-xs text-slate-400">
                Any clear photo of your signature works
              </span>
            </button>
          </div>
        )}
      </div>

      {preview && (
        <div className="mt-3">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            {draft ? "New signature" : "Current signature"}
          </p>
          {/* Explicit white background: a drawn signature is a transparent PNG and must
              read correctly here. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Signature preview" className="mx-auto h-16 w-auto" />
          </div>
        </div>
      )}

      {shownError && (
        <p className="mt-2 text-xs font-semibold text-rose-600">{shownError}</p>
      )}

      <button
        type="button"
        onClick={handleSave}
        disabled={busy || (!rawDraw && !draft)}
        className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Check size={16} />
        {saving ? "Saving…" : processing ? "Processing…" : saveLabel}
      </button>
    </div>
  );
}
