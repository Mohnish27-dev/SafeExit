"use client";

import { useEffect, useRef } from "react";

// A USB/Bluetooth barcode scanner in HID ("keyboard wedge") mode is simply a very
// fast keyboard: it types the payload character by character, then sends the Enter
// configured as its suffix. So no driver, SDK or device permission is involved —
// only keystrokes.
//
// Captured at the window in the CAPTURE phase rather than through a focused <input>,
// for two reasons that both cost real debugging time otherwise:
//
//   1. College ID card payloads are TAB-separated (see lib/qrPayload.mjs). Notepad
//      treats Tab as a character, but a browser treats it as focus navigation — so a
//      text field loses focus on the first tab and the remainder of the card is typed
//      into whatever element happens to be next. That is the exact reason a scanner
//      can work perfectly in Notepad and silently shred every card in the app.
//   2. A gate station collects stray clicks all day. Focus-based capture breaks the
//      moment anything else is clicked; this does not.

// Long enough that a slow human can be simulated in dev, short enough that an
// abandoned partial read never merges into the next student's scan.
const IDLE_RESET_MS = 1000;
// A bare Enter is a guard leaning on the keyboard, not a scan.
const MIN_PAYLOAD_LENGTH = 4;
// Matches MAX_RAW_LENGTH in lib/qrPayload.mjs; bounds a stuck-key runaway.
const MAX_BUFFER_LENGTH = 4096;

// Exported so the /scanner-check page can state the real thresholds rather than
// printing its own copy of them.
export const SCANNER_CAPTURE = Object.freeze({
  IDLE_RESET_MS,
  MIN_PAYLOAD_LENGTH,
  MAX_BUFFER_LENGTH,
});

/**
 * Streams completed hardware-scanner payloads to `onScan(rawValue, meta)`.
 * `rawValue` is the untouched string the scanner typed — parse it with parseScannedQr.
 * `meta` is { keyCount, elapsedMs } describing the burst; the gate ignores it, the
 * commissioning page uses it to tell a scanner apart from a human at a keyboard.
 *
 * `onEvent` is optional and exists only for /scanner-check, which has to show the
 * states that produce no scan at all — a payload with no Enter suffix, a read too
 * short to count, keystrokes swallowed by a focused text field. Those are the actual
 * failure modes when commissioning a scanner, and every one of them is invisible from
 * `onScan` alone. Nothing is emitted unless a callback is passed.
 */
export default function useHardwareScanner(onScan, { enabled = true, onEvent } = {}) {
  // Latched in an effect so the listener attaches exactly once. Re-subscribing on
  // every parent render would drop whatever burst was mid-flight.
  const onScanRef = useRef(onScan);
  const onEventRef = useRef(onEvent);
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  // Separate clock: keys dropped in a text field never touch lastKeyAtRef, so the gap
  // between two of them has to be measured on its own.
  const lastIgnoredAtRef = useRef(0);
  // Burst timing. Reset with the buffer, so they always describe the current read.
  const startedAtRef = useRef(0);
  const keyCountRef = useRef(0);

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!enabled) return;

    const emit = (event) => onEventRef.current?.(event);

    // The burst clock starts on its own first key, not on the idle reset: two triggers
    // pulled inside IDLE_RESET_MS of each other are separate reads, and timing the
    // second one from the first would report a burst slower than the scanner is.
    const countKey = (now) => {
      if (keyCountRef.current === 0) startedAtRef.current = now;
      keyCountRef.current += 1;
    };

    const handleKeyDown = (event) => {
      // A real text field wins, so a search box or PIN entry still behaves normally.
      const target = event.target;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        // Silent by design at the gate. Reported to /scanner-check with the gap since
        // the previous ignored key, because that gap is the whole story: seconds apart
        // is a human filling in a field, milliseconds apart is a scanner emptying a
        // payload into it — a lost scan, and the reason the read "did nothing".
        const gapMs = event.timeStamp - lastIgnoredAtRef.current;
        lastIgnoredAtRef.current = event.timeStamp;
        emit({ type: "ignored", key: event.key, reason: "text-field", gapMs });
        return;
      }

      // Leave browser and OS shortcuts alone.
      if (event.ctrlKey || event.altKey || event.metaKey) return;

      const now = event.timeStamp;
      const gapMs = now - lastKeyAtRef.current;
      if (gapMs > IDLE_RESET_MS) {
        // Only observable when a later key arrives: nothing fires on the silence
        // itself. /scanner-check runs its own timer for the live case.
        if (bufferRef.current) emit({ type: "idle-reset", buffer: bufferRef.current, gapMs });
        bufferRef.current = "";
        keyCountRef.current = 0;
      }
      lastKeyAtRef.current = now;

      if (event.key === "Enter") {
        const raw = bufferRef.current;
        const meta = { keyCount: keyCountRef.current, elapsedMs: now - startedAtRef.current };
        bufferRef.current = "";
        keyCountRef.current = 0;
        if (raw.length >= MIN_PAYLOAD_LENGTH) {
          event.preventDefault();
          onScanRef.current?.(raw, meta);
        } else {
          emit({ type: "too-short", buffer: raw, ...meta });
        }
        return;
      }

      if (event.key === "Tab") {
        // Must never reach the browser: focus would jump mid-payload.
        event.preventDefault();
        if (bufferRef.current.length < MAX_BUFFER_LENGTH) bufferRef.current += "\t";
        countKey(now);
        emit({ type: "key", key: "\t", buffer: bufferRef.current, keyCount: keyCountRef.current, gapMs });
        return;
      }

      // Printable keys only. Shift/arrows/F-keys arrive as multi-character names.
      if (event.key.length === 1) {
        if (bufferRef.current.length < MAX_BUFFER_LENGTH) bufferRef.current += event.key;
        countKey(now);
        emit({ type: "key", key: event.key, buffer: bufferRef.current, keyCount: keyCountRef.current, gapMs });
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      bufferRef.current = "";
      keyCountRef.current = 0;
    };
  }, [enabled]);
}
