// Turns a raw scanner payload into something a human can actually inspect, for the
// /scanner-check commissioning page. Nothing here takes part in a gate decision — the
// gate's own path is useHardwareScanner → readControlBarcode → parseScannedQr in
// dashboard/security/page.js. Pure and framework-free so test/scanDebug.test.mjs can
// exercise it directly.

import { readControlBarcode } from "./gateFlow.mjs";
import { parseScannedQr } from "./qrPayload.mjs";

// The whole reason this file exists: the characters that decide whether a payload
// parses are the ones a screen renders as nothing at all. A card that arrives with its
// tabs stripped looks byte-identical on screen to one that kept them, so a plain echo
// of the payload cannot tell a working scanner from a misconfigured one.

// Written as codepoints, never as literals: pasting these characters into source would
// put something in the file that no reviewer can see.
const NBSP = 0x00a0;
const INVISIBLE_CODEPOINTS = [
  // Looks like a space, is not one, and survives trim(). The classic wrong-keyboard-
  // layout artifact — a roll number holding one silently fails the DB lookup.
  NBSP,
  // Stripped by parseScannedQr, but still worth seeing: their presence means the card
  // generator is leaking Cf-category junk.
  0x200b, 0x200c, 0x200d, 0x2060, 0xfeff,
];

const MARKERS = new Map([
  ["\t", { kind: "tab", label: "⇥" }],
  ["\r", { kind: "control", label: "␍" }],
  ["\n", { kind: "control", label: "␊" }],
  ...INVISIBLE_CODEPOINTS.map((cp) => [
    String.fromCodePoint(cp),
    { kind: "invisible", label: cp === NBSP ? "␣" : "∅" },
  ]),
]);

// Same construction as ZERO_WIDTH in qrPayload.mjs, for the same reason.
const ZERO_WIDTH = new RegExp("[\\u200B-\\u200D\\u2060\\uFEFF]", "g");

const codepointOf = (ch) =>
  `U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`;

/**
 * Splits a payload into display tokens: runs of ordinary text, plus one token per
 * character that would otherwise be invisible.
 * Each token is { kind: "text" | "tab" | "control" | "invisible", text, label?, code? }
 * where `text` is always the original character, so the stream rejoins into the exact
 * payload.
 */
export const tokenizeRaw = (raw) => {
  if (typeof raw !== "string" || raw === "") return [];

  const tokens = [];
  let plain = "";
  const flush = () => {
    if (plain) tokens.push({ kind: "text", text: plain });
    plain = "";
  };

  // By codepoint, not by UTF-16 unit — a name carrying an emoji or a Devanagari
  // conjunct must not be split down the middle into two mojibake halves.
  for (const ch of Array.from(raw)) {
    const marker = MARKERS.get(ch);
    if (marker) {
      flush();
      tokens.push({ ...marker, text: ch, code: codepointOf(ch) });
      continue;
    }
    // Remaining C0 controls and DEL. A scanner configured with an STX/ETX wrapper
    // lands here, which is the fastest explanation for "every scan is unreadable".
    const cp = ch.codePointAt(0);
    if (cp < 0x20 || cp === 0x7f) {
      flush();
      const code = codepointOf(ch);
      tokens.push({ kind: "control", text: ch, label: code, code });
      continue;
    }
    plain += ch;
  }
  flush();
  return tokens;
};

/** Countable facts about a payload, for the readout beside it. */
export const summarizeRaw = (raw) => {
  const text = typeof raw === "string" ? raw : "";
  const counts = { tab: 0, control: 0, invisible: 0 };
  for (const token of tokenizeRaw(text)) {
    if (token.kind in counts) counts[token.kind] += 1;
  }
  return {
    // UTF-16 units, matching what MAX_BUFFER_LENGTH and MAX_RAW_LENGTH bound.
    length: text.length,
    tabs: counts.tab,
    controls: counts.control,
    invisibles: counts.invisible,
    // Two or more tabs means the label/value stream survived the browser, which is the
    // one thing a scanner that works fine in Notepad still fails at inside an app.
    tabSeparated: counts.tab >= 2,
  };
};

// An ID-card payload never starts with a brace and the identity QR always does, so
// this tells the two apart without duplicating either parser. A display label only —
// parseScannedQr is what actually decides.
const looksLikeIdentityJson = (raw) =>
  raw.replace(ZERO_WIDTH, "").trim().startsWith("{");

/**
 * What the gate would make of this payload:
 *   { kind: "control", action: "CONFIRM" | "CANCEL" }
 *   { kind: "student", student: { id, sid, name }, format: "SafeExit QR" | "ID card" }
 *   { kind: "unknown" }
 * Control codes are checked first, matching the order the guard dashboard uses.
 */
export const classifyScan = (raw) => {
  const action = readControlBarcode(raw);
  if (action) return { kind: "control", action };

  const student = parseScannedQr(raw);
  if (student) {
    return {
      kind: "student",
      student,
      format: looksLikeIdentityJson(raw) ? "SafeExit QR" : "ID card",
    };
  }
  return { kind: "unknown" };
};
