"use client";

// The "approved & signed by" strip on a student's own pass.
//
// The badge renders straight from the has*Signature flags the list response carries; the
// image itself is fetched on mount, and this only mounts once a card is expanded. See
// lib/signatures.js for why the bytes are no longer in the list payload.

import { CheckCircle2 } from "lucide-react";
import { useSignatures } from "@/app/lib/signatures";

export default function ApprovalSignature({
  kind,
  id,
  hasWarden,
  hasCaretaker,
  imgClassName = "mt-2 h-16 w-auto rounded-lg border border-slate-200 bg-white p-1",
}) {
  const enabled = Boolean(hasWarden || hasCaretaker);
  const { signatures } = useSignatures(kind, id, enabled);

  if (!enabled) return null;

  // A warden decision supersedes the caretaker's, matching the server's mirroring.
  const who = hasWarden ? "warden" : "caretaker";
  const src = hasWarden ? signatures?.wardenSignature : signatures?.caretakerSignature;

  return (
    <div className="pt-3 mt-1 border-t border-emerald-100">
      <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1.5">
        <CheckCircle2 size={12} /> Approved &amp; signed by {who}
      </p>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${who} signature`} className={imgClassName} />
      ) : (
        // Same height as the image, so resolving it doesn't shift the card.
        <div className="mt-2 h-16 w-32 rounded-lg border border-slate-200 bg-slate-50 animate-pulse" />
      )}
    </div>
  );
}
