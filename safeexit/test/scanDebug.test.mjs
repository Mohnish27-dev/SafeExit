import test from "node:test";
import assert from "node:assert/strict";

import { classifyScan, summarizeRaw, tokenizeRaw } from "../src/app/lib/scanDebug.mjs";
import { SCAN_CONTROL } from "../src/app/lib/gateFlow.mjs";

// Built from codepoints, never pasted as literals: a test asserting something about an
// invisible character cannot be reviewed if the character itself is invisible in source.
const TAB = "	";
const NBSP = String.fromCharCode(0x00a0);
const ZERO_WIDTH_SPACE = String.fromCharCode(0x200b);
const BOM = String.fromCharCode(0xfeff);
const STX = String.fromCharCode(0x02);

const kinds = (raw) => tokenizeRaw(raw).map((token) => token.kind);
const rejoin = (raw) => tokenizeRaw(raw).map((token) => token.text).join("");

// --- Tokenizing ---------------------------------------------------------------
// The page's whole claim is that you can see what arrived. That holds only if the
// token stream is lossless and every invisible character becomes its own token.

test("ordinary text collapses into a single text token", () => {
  assert.deepEqual(tokenizeRaw("2101CS42"), [{ kind: "text", text: "2101CS42" }]);
});

test("a token stream rejoins into the exact payload", () => {
  // Lossless, or the page is showing something other than what the scanner typed.
  for (const raw of [
    "2101CS42",
    `Name${TAB}Ananya Verma${TAB}Roll No${TAB}2101CS42`,
    `${BOM}2101CS42\r\n`,
    `${STX}2101CS42${NBSP}`,
    JSON.stringify({ id: "2101CS42", name: "Ananya Verma" }),
  ]) {
    assert.equal(rejoin(raw), raw);
  }
});

test("tabs surface as their own tokens between the values they separate", () => {
  assert.deepEqual(kinds(`Name${TAB}Ananya`), ["text", "tab", "text"]);
});

test("carriage return and line feed are shown, not swallowed", () => {
  assert.deepEqual(kinds("2101CS42\r\n"), ["text", "control", "control"]);
});

test("zero-width characters and NBSP are surfaced as invisibles", () => {
  // These are the reads that look perfect on screen and still fail to parse.
  assert.deepEqual(kinds(`21${ZERO_WIDTH_SPACE}01`), ["text", "invisible", "text"]);
  assert.deepEqual(kinds(`21${NBSP}01`), ["text", "invisible", "text"]);
});

test("an unmapped control character is labelled with its codepoint", () => {
  // A scanner wrapping payloads in STX/ETX is otherwise invisible as a cause.
  const [token] = tokenizeRaw(STX);
  assert.equal(token.kind, "control");
  assert.equal(token.label, "U+0002");
  assert.equal(token.code, "U+0002");
});

test("every non-text token carries a codepoint for its tooltip", () => {
  for (const token of tokenizeRaw(`a${TAB}b\r${NBSP}${BOM}`)) {
    if (token.kind === "text") continue;
    assert.match(token.code, /^U\+[0-9A-F]{4}$/, `bad code on ${token.kind}`);
  }
});

test("a multi-byte name is never split down the middle", () => {
  // Iterating UTF-16 units instead of codepoints would emit two broken halves and
  // render the name as mojibake — making a good scan look like a bad one.
  assert.deepEqual(tokenizeRaw("अनन्या"), [{ kind: "text", text: "अनन्या" }]);
  assert.deepEqual(tokenizeRaw("Ananya 🎓"), [{ kind: "text", text: "Ananya 🎓" }]);
});

test("an empty or non-string payload tokenizes to nothing", () => {
  for (const raw of ["", null, undefined, 42, {}]) {
    assert.deepEqual(tokenizeRaw(raw), [], `on ${String(raw)}`);
  }
});

// --- Summarizing --------------------------------------------------------------

test("a college ID card payload reads as tab-separated", () => {
  const card = `Name${TAB}Ananya Verma${TAB}Roll No${TAB}2101CS42${TAB}DOB${TAB}01/01/2004`;
  const summary = summarizeRaw(card);

  assert.equal(summary.length, card.length);
  assert.equal(summary.tabs, 5);
  assert.equal(summary.tabSeparated, true);
  assert.equal(summary.controls, 0);
  assert.equal(summary.invisibles, 0);
});

test("a single tab is not yet a label/value stream", () => {
  // One tab is as likely to be a stray as a separator; two is the pattern.
  assert.equal(summarizeRaw(`Name${TAB}Ananya`).tabSeparated, false);
  assert.equal(summarizeRaw(`a${TAB}b${TAB}c`).tabSeparated, true);
});

test("a scan stripped of its tabs reports zero — the misconfiguration it exists to catch", () => {
  const summary = summarizeRaw("NameAnanya VermaRoll No2101CS42");
  assert.equal(summary.tabs, 0);
  assert.equal(summary.tabSeparated, false);
});

test("odd characters are counted apart from ordinary text", () => {
  const summary = summarizeRaw(`${BOM}2101${NBSP}CS42\r\n${STX}`);
  assert.equal(summary.invisibles, 2); // BOM + NBSP
  assert.equal(summary.controls, 3); // CR + LF + STX
});

test("a non-string payload summarizes to zeroes rather than throwing", () => {
  assert.deepEqual(summarizeRaw(null), {
    length: 0,
    tabs: 0,
    controls: 0,
    invisibles: 0,
    tabSeparated: false,
  });
});

// --- Classifying --------------------------------------------------------------
// Must agree with what the guard dashboard would do with the same payload, or the
// page would clear a scanner the gate then rejects.

test("control cards are reported as control cards, not students", () => {
  assert.deepEqual(classifyScan(SCAN_CONTROL.CONFIRM), { kind: "control", action: "CONFIRM" });
  assert.deepEqual(classifyScan(SCAN_CONTROL.CANCEL), { kind: "control", action: "CANCEL" });
});

test("the SafeExit QR is labelled as the app's own format", () => {
  const result = classifyScan(JSON.stringify({ id: "2101CS42", name: "Ananya Verma" }));
  assert.equal(result.kind, "student");
  assert.equal(result.format, "SafeExit QR");
  assert.equal(result.student.id, "2101CS42");
  assert.equal(result.student.name, "Ananya Verma");
});

test("a BOM ahead of the JSON does not get it mislabelled as an ID card", () => {
  // Card generators leak a BOM; parseScannedQr strips it, so the label must too.
  const result = classifyScan(`${BOM}${JSON.stringify({ id: "2101CS42" })}`);
  assert.equal(result.kind, "student");
  assert.equal(result.format, "SafeExit QR");
});

test("a college ID card is labelled as an ID card and reduced to two fields", () => {
  const card = [
    "Name", "Ananya Verma",
    "Roll No", "2101CS42",
    "DOB", "01/01/2004",
    "Address", "12 Model Town",
    "Mobile No", "9876543210",
  ].join(TAB);

  const result = classifyScan(card);
  assert.equal(result.kind, "student");
  assert.equal(result.format, "ID card");
  assert.deepEqual(result.student, { id: "2101CS42", sid: "", name: "Ananya Verma" });

  // The privacy claim the page prints under the verdict, asserted rather than trusted.
  const kept = JSON.stringify(result.student);
  for (const pii of ["01/01/2004", "12 Model Town", "9876543210"]) {
    assert.ok(!kept.includes(pii), `leaked ${pii}`);
  }
});

test("an unreadable payload is reported as unknown rather than guessed at", () => {
  for (const raw of ["", "   ", "hello world", "{not json", "CONFIRM", null, 7]) {
    assert.deepEqual(classifyScan(raw), { kind: "unknown" }, `on ${String(raw)}`);
  }
});

test("a card whose tabs were eaten by focus navigation classifies as unknown", () => {
  // The exact symptom of a scanner working in Notepad but not in the browser: the
  // payload arrives, minus its separators, and no roll number can be found.
  const intact = `Name${TAB}Ananya Verma${TAB}Roll No${TAB}2101CS42`;
  assert.equal(classifyScan(intact).kind, "student");
  assert.equal(classifyScan(intact.split(TAB).join("")).kind, "unknown");
});
