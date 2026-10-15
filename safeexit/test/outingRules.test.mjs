import test from "node:test";
import assert from "node:assert/strict";

import { OUTING_RETURN_LABEL, OUTING_RETURN_MINUTES, clockLabel } from "../src/app/lib/outingRules.mjs";

test("everyone is due back at 8:00 PM", () => {
  assert.equal(OUTING_RETURN_MINUTES, 20 * 60);
  assert.equal(OUTING_RETURN_LABEL, "8:00 PM");
});

test("clockLabel renders campus minutes as a 12-hour clock", () => {
  assert.equal(clockLabel(0), "12:00 AM");
  assert.equal(clockLabel(6 * 60), "6:00 AM");
  assert.equal(clockLabel(12 * 60), "12:00 PM");
  assert.equal(clockLabel(17 * 60 + 30), "5:30 PM");
  assert.equal(clockLabel(19 * 60 + 59), "7:59 PM");
});
