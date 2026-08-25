"use client";

import { useState } from "react";
import { FlaskConical, IdCard, QrCode, ScanLine, X, Check, Ban } from "lucide-react";
import { SCAN_CONTROL } from "@/app/lib/gateFlow.mjs";

// Dev-only stand-in for a USB HID barcode scanner. A real scanner is indistinguishable
// from fast keyboard input, so dispatching synthetic keydown events reproduces it
// closely enough to build and demo the entire gate flow before any hardware arrives.
//
// One honest limitation: synthetic events are untrusted, so the Tab-suppression in
// useHardwareScanner cannot be *proven* here — untrusted events never trigger the
// browser's default focus move, so there is nothing to suppress. The tab-buffering
// path is exercised faithfully; only real hardware can confirm focus never jumps.
//
// English-only and unlocalised on purpose: this never reaches a gate station.

// Fields a real college ID card prints but that parseIdCard must drop, kept here so a
// simulated card proves the PII filtering rather than just the happy path.
const CARD_NOISE = [
  ["DOB", "01/01/2004"],
  ["Blood Group", "B+"],
  ["Father's Name", "Rakesh Verma"],
  ["Address", "12 Model Town, New Delhi"],
  ["Mobile No", "9876543210"],
  ["Valid Till", "31/05/2027"],
];

export default function GateScanSimulator() {
  // Never ship a synthetic scanner to the gate.
  if (process.env.NODE_ENV === "production") return null;
  return <SimulatorPanel />;
}

function SimulatorPanel() {
  const [open, setOpen] = useState(false);
  const [rollNo, setRollNo] = useState("");
  const [name, setName] = useState("Ananya Verma");
  const [delayMs, setDelayMs] = useState(8);
  const [busy, setBusy] = useState(false);
  const [lastSent, setLastSent] = useState("");

  const emit = async (text, label) => {
    setBusy(true);
    setLastSent(`${label} — ${text.length} chars`);
    // Mirror a real scanner, which types wherever focus happens to be while the
    // capture-phase listener sees it regardless. Blur first so this panel's own text
    // inputs don't swallow the burst (the hook deliberately ignores text fields).
    document.activeElement?.blur?.();
    const target = document.body;
    const send = (key) =>
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

    try {
      for (const ch of text) {
        send(ch === "\t" ? "Tab" : ch);
        if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
      send("Enter"); // the scanner's configured CR suffix
    } finally {
      setBusy(false);
    }
  };

  // Byte-identical to the student dashboard's QR (see dashboard/student/page.js).
  const sendStudentQr = () =>
    emit(JSON.stringify({ id: rollNo.trim(), name: name.trim() }), "SafeExit QR");

  // Tab-separated label/value stream, the format the college ID card encodes.
  const sendIdCard = () => {
    const fields = [["Name", name.trim()], ["Roll No", rollNo.trim()], ...CARD_NOISE];
    emit(fields.flat().join("\t"), "ID card (tab-separated)");
  };

  const disabled = busy || !rollNo.trim();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Simulate a hardware scanner"
        className="fixed bottom-24 left-4 z-60 flex h-12 w-12 cursor-pointer items-center justify-center rounded-2xl bg-fuchsia-600 text-white shadow-xl transition hover:bg-fuchsia-500 md:bottom-6"
      >
        <FlaskConical className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 left-4 z-60 w-76 rounded-2xl border border-fuchsia-200 bg-white p-4 shadow-2xl md:bottom-6">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-bold text-fuchsia-700">
          <FlaskConical className="h-4 w-4" />
          Scanner simulator
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="cursor-pointer rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <p className="mt-1 text-[0.7rem] leading-snug text-slate-500">
        Fakes a USB HID scanner with synthetic keystrokes. Dev builds only.
      </p>

      <label className="mt-3 block text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">
        Roll number
        <input
          value={rollNo}
          onChange={(e) => setRollNo(e.target.value)}
          placeholder="e.g. 21CS045"
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal tracking-normal text-slate-800 outline-none focus:border-fuchsia-400"
        />
      </label>

      <label className="mt-2 block text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">
        Name (ID card only)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal tracking-normal text-slate-800 outline-none focus:border-fuchsia-400"
        />
      </label>

      <label className="mt-2 block text-[0.65rem] font-bold uppercase tracking-wider text-slate-400">
        Key interval: {delayMs}ms {delayMs > 60 && "(human speed)"}
        <input
          type="range"
          min="0"
          max="120"
          step="4"
          value={delayMs}
          onChange={(e) => setDelayMs(Number(e.target.value))}
          className="mt-1 w-full accent-fuchsia-600"
        />
      </label>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={sendStudentQr}
          disabled={disabled}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-2 py-2.5 text-[0.7rem] font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          <QrCode className="h-3.5 w-3.5" />
          SafeExit QR
        </button>
        <button
          type="button"
          onClick={sendIdCard}
          disabled={disabled}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-2 py-2.5 text-[0.7rem] font-bold text-white transition hover:bg-slate-800 disabled:opacity-40"
        >
          <IdCard className="h-3.5 w-3.5" />
          ID card
        </button>
        <button
          type="button"
          onClick={() => emit(SCAN_CONTROL.CONFIRM, "CONFIRM barcode")}
          disabled={busy}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-2 py-2.5 text-[0.7rem] font-bold text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          <Check className="h-3.5 w-3.5" />
          Confirm
        </button>
        <button
          type="button"
          onClick={() => emit(SCAN_CONTROL.CANCEL, "CANCEL barcode")}
          disabled={busy}
          className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-slate-500 px-2 py-2.5 text-[0.7rem] font-bold text-white transition hover:bg-slate-400 disabled:opacity-40"
        >
          <Ban className="h-3.5 w-3.5" />
          Cancel
        </button>
      </div>

      {lastSent && (
        <p className="mt-3 flex items-center gap-1.5 truncate text-[0.68rem] font-semibold text-slate-500">
          <ScanLine className="h-3 w-3 shrink-0" />
          {busy ? "Typing…" : "Sent"}: {lastSent}
        </p>
      )}
    </div>
  );
}
