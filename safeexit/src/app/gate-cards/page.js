"use client";

import { useState } from "react";
import QRCode from "react-qr-code";
import { Printer, Check, Ban, TriangleAlert, Scissors } from "lucide-react";
import { SCAN_CONTROL } from "@/app/lib/gateFlow.mjs";

// Print sheet for the two control codes a guard scans to commit or discard the
// movement pending on the gate screen. Setup material, printed once per gate and
// laminated — not a dashboard, which is why it carries no auth, no i18n and no
// live data. The codes are not credentials (see lib/gateFlow.mjs): they act only
// on the scan already pending on that station's own monitor.
//
// QR rather than a 1D barcode, for three reasons:
//   1. The gate runs a 2D imager already, since the student pass is a QR.
//   2. QR is omnidirectional. A linear barcode needs the scan line roughly square
//      to the bars, which is a bad fit for a guard pulling the trigger a few
//      hundred times a shift at whatever angle their wrist happens to be at.
//   3. react-qr-code is already a dependency and already proven at this gate, so
//      nothing new has to be trusted. Hand-rolling Code 128 would mean shipping a
//      107-entry pattern table whose first proof of correctness is a guard
//      standing at a gate with a card that will not scan.
// If a station is ever downgraded to a 1D laser scanner, these become Code 128
// and the payloads stay byte-identical.

// Derived from SCAN_CONTROL so a printed card can never drift from what
// readControlBarcode actually accepts. Editing the payload here would be a bug.
const CARDS = [
  {
    action: "CONFIRM",
    payload: SCAN_CONTROL.CONFIRM,
    Icon: Check,
    band: "#047857", // emerald-700 — reads as near-black on a mono printer
    instruction: "Scan once the photo on screen matches the student in front of you.",
  },
  {
    action: "CANCEL",
    payload: SCAN_CONTROL.CANCEL,
    Icon: Ban,
    band: "#b91c1c", // red-700
    instruction: "Scan to clear the pending student without logging anything.",
  },
];

// 100 × 72mm sits inside a common A6 laminating pouch with a trimming margin, and
// two fit on one A4 portrait sheet with room for the cut line between them.
const CARD_W = "100mm";
const CARD_H = "72mm";
// A 40mm QR is comfortably acquired by a handheld imager at arm's length. Larger
// mostly costs quiet zone; smaller starts to need aiming.
const QR_SIZE = "40mm";
// react-qr-code emits the symbol edge-to-edge — viewBox "0 0 25 25" for a 25-module
// version-2 code, i.e. no margin at all. The spec wants 4 clear modules on every
// side, and an imager uses that blank ring to find the symbol in the first place.
// At 40mm / 25 modules = 1.6mm per module, 4 modules is 6.4mm; 7mm clears it with
// room to spare and keeps the coloured band from crowding the top edge.
const QR_QUIET = "7mm";
// Fixed so the body below it is a known height and the quiet zone can be guaranteed
// rather than left to however the flex box happens to settle.
const BAND_H = "13mm";

const PRINT_CSS = `
  #gate-print-root { background: #fff; }

  @media print {
    @page { size: A4 portrait; margin: 10mm; }

    html, body { background: #fff !important; }

    /* The root layout renders InstallPrompt and the language provider around every
       page, so this sheet cannot simply hide its own siblings. Blanking everything
       and re-showing one subtree is the only approach that stays correct if the
       layout gains more chrome later. visibility (not display) keeps the subtree
       measurable so the cards keep their mm sizing. */
    body * { visibility: hidden !important; }
    #gate-print-root, #gate-print-root * { visibility: visible !important; }
    #gate-print-root {
      position: absolute !important;
      top: 0 !important;
      left: 0 !important;
      width: 100% !important;
      padding: 0 !important;
    }

    .gate-card {
      break-inside: avoid;
      page-break-inside: avoid;
      /* Without this the coloured band is dropped by most browsers' default
         "economy" print path, taking the CONFIRM/CANCEL colour cue with it. */
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
`;

function GateCard({ action, payload, Icon, band, instruction }) {
  return (
    <div
      className="gate-card flex flex-col overflow-hidden rounded-[3mm] border-2 border-dashed border-slate-400 bg-white"
      style={{ width: CARD_W, height: CARD_H }}
    >
      <div
        className="flex shrink-0 items-center justify-center gap-[3mm] text-white"
        style={{ backgroundColor: band, height: BAND_H }}
      >
        <Icon className="h-[6mm] w-[6mm]" strokeWidth={3} />
        <span className="text-[6mm] font-extrabold leading-none tracking-[0.15em]">
          {action}
        </span>
      </div>

      <div className="flex flex-1 items-center pr-[5mm]">
        {/* The quiet zone is this wrapper's padding, not the card's — that keeps it
            measured from the symbol itself, so it cannot be eaten by a layout tweak
            later. Pure white, and never overlapping the coloured band: a tinted
            background is the fastest way to make a QR unreadable. */}
        <div className="shrink-0 bg-white" style={{ padding: QR_QUIET }}>
          <QRCode
            value={payload}
            size={256}
            level="H"
            bgColor="#FFFFFF"
            fgColor="#000000"
            style={{ width: QR_SIZE, height: QR_SIZE, display: "block" }}
          />
        </div>
        <div className="min-w-0">
          {/* Printed so the payload can be verified, or retyped by hand if a
              scanner dies mid-shift. */}
          <p className="font-mono text-[3.6mm] font-bold tracking-tight text-slate-900">
            {payload}
          </p>
          <p className="mt-[2mm] text-[3mm] leading-snug text-slate-600">{instruction}</p>
          <p className="mt-[3mm] text-[2.4mm] font-bold uppercase tracking-[0.2em] text-slate-400">
            SafeExit gate station
          </p>
        </div>
      </div>
    </div>
  );
}

export default function GateCardsPage() {
  const [copies, setCopies] = useState(1);
  const sets = Array.from({ length: copies }, (_, i) => i);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-[210mm]">
        <header className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-extrabold text-slate-900">Gate control cards</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            Print, cut along the dashed line, and laminate. Tape both where the person{" "}
            <strong>holding the scanner</strong> can reach them — beside the gate monitor,
            not inside the cabin.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              Sets
              <select
                value={copies}
                onChange={(e) => setCopies(Number(e.target.value))}
                className="cursor-pointer rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-500"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <span className="text-xs text-slate-500">One set per sheet, A4 portrait.</span>
          </div>

          <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-xs leading-relaxed text-amber-900">
              <p className="font-bold">Test-scan both cards before laminating.</p>
              <p className="mt-1">
                Open the guard dashboard, scan a student, then scan CONFIRM from the paper
                print. Once it is sealed in plastic you cannot fix a printer that scaled
                the page down.
              </p>
              <p className="mt-1">
                If a scan does nothing, check the raw read on{" "}
                <a href="/scanner-check" className="font-bold underline">
                  /scanner-check
                </a>{" "}
                first — it shows what the scanner actually typed, which separates a bad
                print from a badly configured scanner.
              </p>
            </div>
          </div>
        </header>

        <div id="gate-print-root" className="rounded-2xl p-6 shadow-sm">
          {sets.map((i) => (
            <div key={i} className="flex flex-col items-center gap-[8mm] [&:not(:first-child)]:mt-[8mm]">
              {CARDS.map((card) => (
                <GateCard key={card.action} {...card} />
              ))}
            </div>
          ))}
        </div>

        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-500">
          <Scissors className="h-3.5 w-3.5" />
          Cut on the dashed border — it is outside the quiet zone, so trimming it away is
          fine.
        </p>
      </div>

      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />
    </main>
  );
}
