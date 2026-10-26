import test from "node:test";
import assert from "node:assert/strict";

import {
  SCAN_CONTROL, canAutoCommit, deriveGateDirection, exitRefusal, previewDirection, readControlBarcode,
} from "../src/app/lib/gateFlow.mjs";
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
  // hand; it must resolve to IN so the late return is recorded as a return.
  assert.equal(deriveGateDirection("Overdue"), "IN");
});

test("an unknown or missing status falls back to OUT, matching the schema default", () => {
  // OUT is the fallback because 'Inside' is the schema default; the server re-derives
  // the direction inside the same atomic flip, so a stale guess cannot log a wrong move.
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

test("every resolved student arms, exit or entry, unless a leave exit is refused", () => {
  // Outings need no approval: the exit scan creates the outing. There is no denied state.
  for (const status of ["Inside", "Outside", "Overdue", "", undefined]) {
    assert.equal(canAutoCommit(previewFor(status, { allowed: true, reason: null })), true, `status ${String(status)}`);
    assert.equal(canAutoCommit(previewFor(status, null)), true, `status ${String(status)} without a verdict`);
  }
});

test("a missing or unusable preview never arms", () => {
  // No preview means no photo on screen, so the guard has no face to match against.
  for (const preview of [null, undefined, {}, { student: null }, { exit: { allowed: true } }]) {
    assert.equal(canAutoCommit(preview), false, `armed on ${JSON.stringify(preview) ?? "nullish"}`);
  }
});

test("a leave QR with no leave valid today never arms on an exit, and blocks nothing on an entry", () => {
  const refused = { allowed: false, reason: "LEAVE_NOT_TODAY", passType: "Leave" };

  assert.equal(canAutoCommit(previewFor("Inside", refused)), false);
  assert.deepEqual(exitRefusal(previewFor("Inside", refused)), refused);

  // Coming back: the student is returning whichever QR they showed.
  for (const status of ["Outside", "Overdue"]) {
    assert.equal(exitRefusal(previewFor(status, refused)), null);
    assert.equal(canAutoCommit(previewFor(status, refused)), true);
  }

  // An outing QR on the leave day is allowed, only flagged.
  const flagged = { allowed: true, passType: "Outing", leaveToday: { windowStart: "x", windowEnd: "y" } };
  assert.equal(canAutoCommit(previewFor("Inside", flagged)), true);
});

test("a day scholar's direction comes from the preview, not their campusStatus", () => {
  // Never written for a day scholar, so it stays at the 'Inside' default all day.
  const dayScholar = (direction) => ({
    student: { campusStatus: "Inside", residency: "DayScholar" },
    dayScholar: true,
    direction,
    exit: { allowed: true, passType: null },
  });
  assert.equal(previewDirection(dayScholar("IN")), "IN");
  assert.equal(previewDirection(dayScholar("OUT")), "OUT");
  assert.equal(exitRefusal(dayScholar("IN")), null);
  assert.equal(canAutoCommit(dayScholar("IN")), true);
});

test("a preview without a direction still falls back to campusStatus", () => {
  assert.equal(previewDirection({ student: { campusStatus: "Outside" } }), "IN");
  assert.equal(previewDirection({ student: { campusStatus: "Inside" } }), "OUT");
  assert.equal(previewDirection(null), "OUT");
});
