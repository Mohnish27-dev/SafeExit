import test from "node:test";
import assert from "node:assert/strict";

import { SCAN_CONTROL, deriveGateDirection, readControlBarcode } from "../src/app/lib/gateFlow.mjs";
import { parseScannedQr } from "../src/app/lib/qrPayload.mjs";

// --- Direction derivation ------------------------------------------------------
// This is the whole reason the gate needs no exit/entry switch, so it has to agree
// with `allowedFrom` in backend/src/controllers/scanController.js exactly: OUT is
// legal only from 'Inside', IN only from 'Outside'/'Overdue'.

test("a student inside campus can only be leaving", () => {
  assert.equal(deriveGateDirection("Inside"), "OUT");
});

test("a student outside campus can only be returning", () => {
  assert.equal(deriveGateDirection("Outside"), "IN");
});

test("an overdue student is still a return, not a fresh exit", () => {
  // Overdue is the status that would tempt a guard into picking the wrong mode by
  // hand; it must resolve to IN so the late return is recorded rather than denied.
  assert.equal(deriveGateDirection("Overdue"), "IN");
});

test("an unknown or missing status falls back to OUT, matching the schema default", () => {
  // OUT is the safe fallback: it is the direction that requires a DB-verified
  // approved pass, so a corrupt status cannot wave anybody through the gate.
  for (const status of [undefined, null, "", "inside", "Weird", 42]) {
    assert.equal(deriveGateDirection(status), "OUT", `status ${String(status)}`);
  }
});

// --- Control barcodes ---------------------------------------------------------

test("the printed control barcodes are recognised", () => {
  assert.equal(readControlBarcode(SCAN_CONTROL.CONFIRM), "CONFIRM");
  assert.equal(readControlBarcode(SCAN_CONTROL.CANCEL), "CANCEL");
});

test("scanner whitespace and case do not break a control barcode", () => {
  // A scanner's suffix and a badly configured prefix both show up as padding.
  assert.equal(readControlBarcode("  ##confirm##  "), "CONFIRM");
  assert.equal(readControlBarcode("\t##Cancel##\r"), "CANCEL");
});

test("student payloads are never mistaken for control barcodes", () => {
  const identityQr = JSON.stringify({ id: "2101CS42", name: "Ananya Verma" });
  const idCard = "Name\tAnanya Verma\tRollNo\t2101CS42";

  for (const raw of [identityQr, idCard, "2101CS42", "CONFIRM", "##CONFIRM", "", null, undefined, 7]) {
    assert.equal(readControlBarcode(raw), null, `treated ${String(raw)} as a control barcode`);
  }
});

test("a control barcode is not a parseable student, and vice versa", () => {
  // The two paths must stay disjoint: whichever one claims a payload, the other
  // has to reject it, or a CONFIRM read would open a preview for a phantom student.
  assert.equal(parseScannedQr(SCAN_CONTROL.CONFIRM), null);
  assert.equal(parseScannedQr(SCAN_CONTROL.CANCEL), null);

  const identityQr = JSON.stringify({ id: "2101CS42", name: "Ananya Verma" });
  assert.equal(readControlBarcode(identityQr), null);
  assert.ok(parseScannedQr(identityQr));
});
