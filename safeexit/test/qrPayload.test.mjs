import test from "node:test";
import assert from "node:assert/strict";

import { parseScannedQr } from "../src/app/lib/qrPayload.mjs";

// The real NITP ID card payload: one line, tab-separated label/value pairs.
const ID_CARD =
  "Name\tAnanya Verma\tRollNo\t2101CS42\tNITP Email\tananya.ug24.cs@nitp.ac.in\t" +
  "Branch\tComputer Science & Engg.\tFather's Name\tRajesh Verma\tGender\tFemale\t" +
  "DOB\t27-10-2005\tValid Till\tJun-2028\tBlood Group\tB+\tMobile No.\t8318693892\t" +
  'Permanent address\t"12 MG Road, Patna"';

test("the app's own identity QR still parses", () => {
  const raw = JSON.stringify({ id: "2101CS42", sid: "66f3a1c0e4b2f81234abcd12", name: "Ananya Verma" });

  assert.deepEqual(parseScannedQr(raw), {
    id: "2101CS42",
    sid: "66f3a1c0e4b2f81234abcd12",
    name: "Ananya Verma",
  });
});

test("a college ID card QR yields only the roll number and name", () => {
  assert.deepEqual(parseScannedQr(ID_CARD), {
    id: "2101CS42",
    sid: "",
    name: "Ananya Verma",
  });
});

test("no ID card field other than roll number and name survives the parse", () => {
  const parsed = parseScannedQr(ID_CARD);

  assert.deepEqual(Object.keys(parsed).sort(), ["id", "name", "sid"]);
  const serialized = JSON.stringify(parsed);
  for (const secret of ["27-10-2005", "Rajesh", "B+", "8318693892", "MG Road", "nitp.ac.in", "Female"]) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
  }
});

test("father's name is never mistaken for the student's name", () => {
  // Father's Name comes first here, so a substring label match would take it.
  const raw = "Father's Name\tRajesh Verma\tName\tAnanya Verma\tRollNo\t2101CS42";

  assert.equal(parseScannedQr(raw).name, "Ananya Verma");
});

test("a blank card field cannot shift a label into the next field's value", () => {
  // An empty value collapses its tab run, so "RollNo" lands where a name goes.
  const raw = "Name\t\tRollNo\t2101CS42\tBlood Group\t\tMobile No.\t8318693892";
  const parsed = parseScannedQr(raw);

  assert.equal(parsed.id, "2101CS42");
  assert.equal(parsed.name, "");
});

test("quoted values and zero-width characters are stripped", () => {
  const raw = 'Name\t"Ananya Verma"\tRollNo\t​2101CS42⁠';

  assert.deepEqual(parseScannedQr(raw), { id: "2101CS42", sid: "", name: "Ananya Verma" });
});

test("RollNo wins when a card also carries a separate student id", () => {
  const raw = "Name\tAnanya Verma\tStudentId\tLIB-99812\tRollNo\t2101CS42";

  assert.equal(parseScannedQr(raw).id, "2101CS42");
});

test("a QR carrying no usable identifier is rejected", () => {
  assert.equal(parseScannedQr("2101CS42"), null); // bare code, no labels
  assert.equal(parseScannedQr("https://example.com/promo"), null);
  assert.equal(parseScannedQr(JSON.stringify({ name: "Ananya Verma" })), null); // no id or sid
  assert.equal(parseScannedQr("{}"), null);
  assert.equal(parseScannedQr("12345"), null); // valid JSON, but a number
  assert.equal(parseScannedQr("null"), null);
  assert.equal(parseScannedQr('["2101CS42"]'), null);
  assert.equal(parseScannedQr("Name\tAnanya Verma\tGender\tFemale"), null); // card with no roll
  assert.equal(parseScannedQr(""), null);
  assert.equal(parseScannedQr(undefined), null);
  assert.equal(parseScannedQr("Name\tA\tRollNo\t" + "x".repeat(5000)), null); // oversized
});

test("a sid-only identity QR is accepted so pre-roll-sync renders still scan", () => {
  const raw = JSON.stringify({ sid: "66f3a1c0e4b2f81234abcd12", name: "Ananya Verma" });

  assert.deepEqual(parseScannedQr(raw), {
    id: "",
    sid: "66f3a1c0e4b2f81234abcd12",
    name: "Ananya Verma",
  });
});
