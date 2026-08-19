"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Ban,
  Check,
  Copy,
  IdCard,
  Keyboard,
  QrCode,
  ScanLine,
  ShieldAlert,
  Trash2,
  TriangleAlert,
  Usb,
} from "lucide-react";
import useHardwareScanner, { SCANNER_CAPTURE } from "@/app/hooks/useHardwareScanner";
import { classifyScan, summarizeRaw, tokenizeRaw } from "@/app/lib/scanDebug.mjs";
import GateScanSimulator from "@/app/components/GateScanSimulator";

// Commissioning bench for the gate's USB scanner: scan anything and see the exact
// payload that reached the browser, character for character, plus what the gate would
// have done with it. Its whole purpose is that "the scan did nothing" has about five
// different causes that are indistinguishable from the guard dashboard — no CR suffix,
// tabs eaten by focus navigation, a wrong keyboard layout, an STX/ETX wrapper, or the
// scanner simply not typing at all. This page separates them.
//
// It runs the production hook rather than its own listener, deliberately: a private
// copy of the capture logic would prove nothing about the code the gate actually runs.
//
// No auth, no i18n, no backend call, and nothing persisted — same class of tool as
// /gate-cards, and never in front of a student. Every scan lives in React state only,
// so closing the tab is the whole cleanup story.

// Enough to compare a handful of cards in a row without turning into a log file that
// wants clearing. Oldest fall off the end.
const HISTORY_LIMIT = 12;
// A hardware scanner types far faster than any human. This is deliberately generous —
// the point is to catch "you are typing this by hand, aren't you", not to grade
// scanners against each other.
const HUMAN_SPEED_MS_PER_KEY = 30;
// Two keystrokes this close together are a device emptying a payload, not a hand. Used
// only to tell a lost scan apart from someone filling in a field.
const BURST_GAP_MS = 40;

// Wall-clock, only for labelling entries; burst timing comes from the hook. Module
// scope so it is not a changing dependency of the event callbacks.
const stamp = () =>
  new Date().toLocaleTimeString("en-GB", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

const OUTCOMES = {
  scan: {
    label: "Complete",
    note: "Terminated by Enter, the scanner's CR suffix.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
    Icon: Check,
  },
  "no-terminator": {
    label: "No Enter suffix",
    note: "Characters arrived, then the read went quiet without an Enter. The gate discards this — configure a CR/Enter suffix on the scanner.",
    tone: "border-amber-300 bg-amber-50 text-amber-900",
    Icon: TriangleAlert,
  },
  "too-short": {
    label: "Too short",
    note: `Enter arrived with fewer than ${SCANNER_CAPTURE.MIN_PAYLOAD_LENGTH} characters, so the gate treats it as a stray keypress rather than a scan.`,
    tone: "border-slate-300 bg-slate-100 text-slate-700",
    Icon: Ban,
  },
  dropped: {
    label: "Abandoned mid-read",
    note: `More than ${SCANNER_CAPTURE.IDLE_RESET_MS}ms passed mid-payload, so this partial read was discarded before the next one began.`,
    tone: "border-amber-300 bg-amber-50 text-amber-900",
    Icon: TriangleAlert,
  },
};

const TOKEN_STYLES = {
  tab: "bg-indigo-100 text-indigo-700 ring-indigo-300",
  control: "bg-rose-100 text-rose-700 ring-rose-300",
  invisible: "bg-amber-100 text-amber-800 ring-amber-400",
};

/** The payload with every invisible character made visible and labelled. */
function RawPayload({ raw, live = false }) {
  const tokens = tokenizeRaw(raw);
  return (
    <p
      className={`grd-mono break-all rounded-xl border p-3 text-sm leading-7 ${
        live ? "border-sky-300 bg-sky-50 text-slate-800" : "border-slate-200 bg-white text-slate-800"
      }`}
    >
      {tokens.length === 0 && <span className="text-slate-400">(nothing captured)</span>}
      {tokens.map((token, i) =>
        token.kind === "text" ? (
          <span key={i}>{token.text}</span>
        ) : (
          <span
            key={i}
            title={token.code}
            className={`mx-0.5 inline-block rounded px-1 text-xs font-bold ring-1 ${TOKEN_STYLES[token.kind]}`}
          >
            {token.label}
          </span>
        )
      )}
      {live && <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-sky-500 align-middle" />}
    </p>
  );
}

function Stat({ label, value, warn = false }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${warn ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <p className="text-[0.6rem] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`grd-mono text-sm font-bold ${warn ? "text-amber-800" : "text-slate-800"}`}>{value}</p>
    </div>
  );
}

/** What the gate would do with this payload — the reason the page exists. */
function Verdict({ raw }) {
  const result = classifyScan(raw);

  if (result.kind === "control") {
    const isConfirm = result.action === "CONFIRM";
    return (
      <div
        className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${
          isConfirm ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-slate-100 text-slate-700"
        }`}
      >
        {isConfirm ? <Check className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
        Control card — {result.action}
        <span className="font-semibold text-slate-500">
          {isConfirm ? "commits the pending student" : "clears the pending student"}
        </span>
      </div>
    );
  }

  if (result.kind === "unknown") {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">
        <span className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Not recognised — the gate would reject this
        </span>
        <span className="mt-1 block text-xs font-semibold text-rose-600">
          Neither a SafeExit QR nor a college ID card carrying a roll number. Check the
          highlighted characters above: missing tabs or a wrong keyboard layout are the
          usual causes.
        </span>
      </div>
    );
  }

  const { student, format } = result;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
      <p className="flex items-center gap-2 text-sm font-bold text-emerald-800">
        {format === "SafeExit QR" ? <QrCode className="h-4 w-4" /> : <IdCard className="h-4 w-4" />}
        Parsed as {format}
      </p>
      <div className="mt-2 grid gap-1 text-xs font-semibold text-emerald-900 sm:grid-cols-3">
        <p>
          <span className="text-emerald-600">Roll no </span>
          <span className="grd-mono font-bold">{student.id || "—"}</span>
        </p>
        <p>
          <span className="text-emerald-600">Name </span>
          <span className="font-bold">{student.name || "—"}</span>
        </p>
        <p>
          <span className="text-emerald-600">sid </span>
          <span className="grd-mono font-bold">{student.sid || "—"}</span>
        </p>
      </div>
      {/* The dropped fields are the privacy claim in qrPayload.mjs made visible. */}
      <p className="mt-2 text-[0.68rem] font-semibold text-emerald-700">
        Only these fields leave the parser. Everything else the card prints — DOB, address,
        phone, parents&apos; names — is dropped and never reaches state or the network.
      </p>
    </div>
  );
}

function ScanEntry({ entry }) {
  const outcome = OUTCOMES[entry.outcome];
  const stats = summarizeRaw(entry.raw);
  const perKey = entry.keyCount > 0 ? Math.round((entry.elapsedMs / entry.keyCount) * 10) / 10 : 0;
  const humanSpeed = perKey > HUMAN_SPEED_MS_PER_KEY;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(entry.raw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider ${outcome.tone}`}>
          <outcome.Icon className="h-3.5 w-3.5" />
          {outcome.label}
        </span>
        <span className="flex items-center gap-2">
          <span className="grd-mono text-[0.68rem] font-semibold text-slate-400">{entry.at}</span>
          <button
            type="button"
            onClick={copy}
            className="flex cursor-pointer items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1 text-[0.68rem] font-bold text-slate-600 transition hover:bg-slate-100"
          >
            <Copy className="h-3 w-3" />
            {copied ? "Copied" : "Copy raw"}
          </button>
        </span>
      </div>

      <p className="mt-2 text-xs font-semibold leading-snug text-slate-500">{outcome.note}</p>

      <div className="mt-3">
        <RawPayload raw={entry.raw} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Characters" value={stats.length} />
        <Stat label="Tabs" value={stats.tabs} />
        <Stat
          label="Odd characters"
          value={stats.controls + stats.invisibles}
          warn={stats.controls + stats.invisibles > 0}
        />
        <Stat
          label="Per key"
          value={`${perKey}ms`}
          warn={humanSpeed}
        />
      </div>

      {humanSpeed && (
        <p className="mt-2 text-[0.68rem] font-semibold text-amber-700">
          {perKey}ms per key is human typing speed, not a scanner. Fine if you are testing
          by hand — but a real scanner should land well under {HUMAN_SPEED_MS_PER_KEY}ms.
        </p>
      )}

      {entry.outcome === "scan" && (
        <div className="mt-3">
          <Verdict raw={entry.raw} />
        </div>
      )}
    </li>
  );
}

export default function ScannerCheckPage() {
  const [live, setLive] = useState(null);
  const [history, setHistory] = useState([]);
  // Keystrokes the hook dropped because focus sat in a text field, and how many of
  // those arrived at machine speed. Only the fast ones are a problem worth raising:
  // typing into this page's own simulator inputs is not a fault, a scanner firing into
  // a text box is a scan the gate silently loses.
  const [swallowed, setSwallowed] = useState({ burst: 0, at: null });
  const liveRef = useRef(null);
  // Entry identity. Two identical cards scanned twice must stay two rows, so the key
  // cannot be derived from the payload or from a list index that wraps at HISTORY_LIMIT.
  const seqRef = useRef(0);

  const record = useCallback((entry) => {
    seqRef.current += 1;
    const row = { ...entry, at: stamp(), id: seqRef.current };
    setHistory((prev) => [row, ...prev].slice(0, HISTORY_LIMIT));
  }, []);

  const handleScan = useCallback(
    (raw, meta) => {
      liveRef.current = null;
      setLive(null);
      record({ outcome: "scan", raw, keyCount: meta?.keyCount ?? 0, elapsedMs: meta?.elapsedMs ?? 0 });
    },
    [record]
  );

  const handleEvent = useCallback(
    (event) => {
      switch (event.type) {
        case "key": {
          // elapsedMs is not carried on key events — the live row only needs the count
          // and the buffer, and per-key timing is reported once the read completes.
          const next = { raw: event.buffer, keyCount: event.keyCount };
          liveRef.current = next;
          setLive(next);
          return;
        }
        case "too-short":
          liveRef.current = null;
          setLive(null);
          record({
            outcome: "too-short",
            raw: event.buffer,
            keyCount: event.keyCount ?? 0,
            elapsedMs: event.elapsedMs ?? 0,
          });
          return;
        case "idle-reset":
          // The hook noticed the stale buffer on a later keystroke. If our own stall
          // timer already filed this read, it is gone from `live` and we skip it.
          if (!liveRef.current) return;
          liveRef.current = null;
          setLive(null);
          record({ outcome: "dropped", raw: event.buffer, keyCount: 0, elapsedMs: 0 });
          return;
        case "ignored":
          // Consecutive keys milliseconds apart are a device, not a hand.
          if (event.gapMs <= BURST_GAP_MS) {
            setSwallowed((prev) => ({ burst: prev.burst + 1, at: stamp() }));
          }
          return;
        default:
          return;
      }
    },
    [record]
  );

  useHardwareScanner(handleScan, { onEvent: handleEvent });

  // The hook cannot report a payload that simply stops — it clears the stale buffer on
  // the *next* keystroke, which may be minutes away. So the missing-Enter case, the
  // single most common scanner misconfiguration, is detected here instead.
  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => {
      if (!liveRef.current) return;
      const stalled = liveRef.current;
      liveRef.current = null;
      setLive(null);
      record({ outcome: "no-terminator", raw: stalled.raw, keyCount: stalled.keyCount, elapsedMs: 0 });
    }, SCANNER_CAPTURE.IDLE_RESET_MS);
    return () => clearTimeout(timer);
  }, [live, record]);

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
            <Usb className="h-5 w-5 text-indigo-600" />
            Scanner check
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Plug the USB scanner into this PC, click anywhere on this page, and scan. Every
            character it types is shown below exactly as the browser received it, along with
            what the gate would do with it.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            No login, no camera, and nothing sent anywhere — this page never calls the
            backend. Scans live in the tab&apos;s memory and are gone when you close it.
          </p>

          <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-xs leading-relaxed text-amber-900">
              <strong className="font-bold">A real ID card is printed with private data.</strong>{" "}
              Unlike the gate dashboard, this page shows the payload unfiltered — DOB, address
              and phone number included — because that is the only way to debug a bad read.
              Use it to commission the hardware, then close the tab. Not a screen to leave
              open at a gate.
            </p>
          </div>
        </header>

        {/* Live buffer. Proves keystrokes are arriving even when no scan ever completes,
            which is the difference between a dead scanner and a suffix-less one. */}
        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-500">
            <ScanLine className="h-4 w-4" />
            Live capture
          </h2>
          {live ? (
            <>
              <div className="mt-3">
                <RawPayload raw={live.raw} live />
              </div>
              <p className="mt-2 text-xs font-semibold text-sky-700">
                {live.keyCount} key{live.keyCount === 1 ? "" : "s"} so far — waiting up to{" "}
                {SCANNER_CAPTURE.IDLE_RESET_MS}ms for more, then Enter to finish the read.
              </p>
            </>
          ) : (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-sm font-semibold text-slate-400">
              <Keyboard className="h-4 w-4" />
              Waiting for a scan…
            </p>
          )}

          {swallowed.burst > 0 && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-snug text-rose-800">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                <strong className="font-bold">A scan was swallowed by a text box</strong> at{" "}
                {swallowed.at} — characters arrived at machine speed while focus sat in an
                input, so the gate discarded them. This is the trap: the payload lands in
                the field instead, and a tab inside it jumps focus mid-card. Click empty
                space, then scan again.
              </span>
            </p>
          )}
        </section>

        <section className="mt-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Captured scans
            </h2>
            {(history.length > 0 || swallowed.burst > 0) && (
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  setSwallowed({ burst: 0, at: null });
                }}
                className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Clear
              </button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-6 text-sm leading-relaxed text-slate-500 shadow-sm">
              <p className="font-bold text-slate-700">Nothing captured yet.</p>
              <ul className="mt-2 space-y-1.5">
                <li className="flex gap-2">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  Scan a student&apos;s SafeExit QR from their phone, or their college ID card.
                </li>
                <li className="flex gap-2">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  Scan the printed CONFIRM and CANCEL cards from{" "}
                  <a href="/gate-cards" className="font-bold text-indigo-600 underline">
                    /gate-cards
                  </a>{" "}
                  to prove they read cleanly before laminating.
                </li>
                <li className="flex gap-2">
                  <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                  Nothing at all? The scanner may not be in HID keyboard-wedge mode — check
                  it types into Notepad first.
                </li>
              </ul>
            </div>
          ) : (
            <ul className="mt-3 space-y-3">
              {history.map((entry) => (
                <ScanEntry key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </section>

        {/* Dev-only, renders null in production builds: lets the page be exercised
            before any hardware is on the desk. */}
        <GateScanSimulator />
      </div>
    </main>
  );
}
