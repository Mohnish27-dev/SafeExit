import test from "node:test";
import assert from "node:assert/strict";

import { SCAN_CONTROL, canAutoCommit, deriveGateDirection, isExitDenied, readControlBarcode } from "../src/app/lib/gateFlow.mjs";
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


const previewFor = (campusStatus, exit) => ({ student: { _id: "s1", campusStatus }, exit });

test("an approved, currently-valid exit arms itself", () => {
  assert.equal(canAutoCommit(previewFor("Inside", { allowed: true, reason: null })), true);
});

test("every exit denial reason refuses to arm", () => {
  // Each of these is a message a human has to read; none may auto-commit.
  for (const reason of ["no-approved", "not-yet-valid", "expired"]) {
    assert.equal(
      canAutoCommit(previewFor("Inside", { allowed: false, reason })),
      false,
      `armed on a '${reason}' denial`
    );
  }
});

test("a return always arms, late or not", () => {
  assert.equal(canAutoCommit(previewFor("Outside", null)), true);
  assert.equal(canAutoCommit(previewFor("Overdue", null)), true);
});

test("a return arms even when the exit verdict looks denied", () => {
  assert.equal(canAutoCommit(previewFor("Outside", { allowed: false, reason: "no-approved" })), true);
});

test("a missing or unusable preview never arms", () => {
  // No preview means no photo on screen, so the guard has no face to match against.
  for (const preview of [null, undefined, {}, { student: null }, { exit: { allowed: true } }]) {
    assert.equal(canAutoCommit(preview), false, `armed on ${JSON.stringify(preview) ?? "nullish"}`);
  }
});

test("an unrecognised exit verdict shape never arms", () => {
  for (const exit of [undefined, null, {}, { allowed: "yes" }, { allowed: 1 }, { permitted: true }]) {
    assert.equal(canAutoCommit(previewFor("Inside", exit)), false, `armed on ${JSON.stringify(exit)}`);
  }
});

test("auto-commit agrees with the direction it derives", () => {
  // The two must not drift: anything this treats as unconditionally committable has
  // to be a movement deriveGateDirection also calls IN.
  for (const status of ["Inside", "Outside", "Overdue", "", undefined, "Weird"]) {
    const armedWithoutPass = canAutoCommit(previewFor(status, { allowed: false, reason: "no-approved" }));
    assert.equal(armedWithoutPass, deriveGateDirection(status) === "IN", `status ${String(status)}`);
  }
});

test("every exit denial reason reads as denied", () => {
  for (const reason of ["no-approved", "not-yet-valid", "expired"]) {
    assert.equal(isExitDenied(previewFor("Inside", { allowed: false, reason })), true, `reason '${reason}'`);
  }
});

test("an approved exit is not a denial", () => {
  assert.equal(isExitDenied(previewFor("Inside", { allowed: true, reason: null })), false);
});

test("a return is never a denial, whatever its spent pass says", () => {

  for (const status of ["Outside", "Overdue"]) {
    assert.equal(isExitDenied(previewFor(status, { allowed: false, reason: "no-approved" })), false, status);
    assert.equal(isExitDenied(previewFor(status, null)), false, `${status} without a verdict`);
  }
});

test("a card with no verdict yet is unverified, not denied", () => {
  for (const preview of [null, undefined, {}, { student: null }, previewFor("Inside", undefined), previewFor("Inside", null)]) {
    assert.equal(isExitDenied(preview), false, `called ${JSON.stringify(preview) ?? "nullish"} denied`);
  }
});

test("an unrecognised exit verdict shape counts as denied", () => {
  for (const exit of [{}, { allowed: "yes" }, { allowed: 1 }, { permitted: true }, { allowed: false }]) {
    assert.equal(isExitDenied(previewFor("Inside", exit)), true, `passed ${JSON.stringify(exit)}`);
  }
});

test("a preview is never both committable and denied", () => {
  const verdicts = [undefined, null, {}, { allowed: true }, { allowed: false }, { allowed: "yes" }, { allowed: 1 }];
  for (const status of ["Inside", "Outside", "Overdue", "", undefined, "Weird"]) {
    for (const exit of verdicts) {
      const preview = previewFor(status, exit);
      assert.ok(
        !(canAutoCommit(preview) && isExitDenied(preview)),
        `status ${String(status)} with exit ${JSON.stringify(exit)} both armed and denied`
      );
    }
  }
});
