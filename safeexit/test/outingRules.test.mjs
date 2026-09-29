import test from "node:test";
import assert from "node:assert/strict";

import {
  OUTING_POLICIES,
  campusMinutesOfDay,
  clockLabel,
  getOutingWindowState,
  resolveOutingPolicy,
} from "../src/app/lib/outingRules.mjs";

const ist = (hh, mm = 0) =>
  new Date(`2026-09-29T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00+05:30`);

test("policy selection mirrors the backend", () => {
  assert.equal(resolveOutingPolicy("Female", "Market"), OUTING_POLICIES.femaleMarket);
  assert.equal(resolveOutingPolicy("Female", "Nearby"), OUTING_POLICIES.femaleNearby);
  assert.equal(resolveOutingPolicy("Female", undefined), OUTING_POLICIES.femaleNearby);
  assert.equal(resolveOutingPolicy("Male", "Market"), OUTING_POLICIES.general);
  assert.equal(resolveOutingPolicy("Other", "Nearby"), OUTING_POLICIES.general);
  assert.equal(resolveOutingPolicy(undefined, undefined), OUTING_POLICIES.general);
});

test("window labels match what the backend enforces", () => {
  assert.equal(clockLabel(OUTING_POLICIES.general.departEnd), "7:59 PM");
  assert.equal(clockLabel(OUTING_POLICIES.femaleNearby.departEnd), "6:30 PM");
  assert.equal(clockLabel(OUTING_POLICIES.femaleMarket.departEnd), "3:00 PM");
  assert.equal(clockLabel(OUTING_POLICIES.femaleMarket.returnDeadline), "5:30 PM");
  assert.equal(clockLabel(OUTING_POLICIES.general.departStart), "6:00 AM");
});

test("campus minutes ignore the device timezone", () => {
  assert.equal(campusMinutesOfDay(ist(0, 30)), 30);
  assert.equal(campusMinutesOfDay(ist(19, 59)), 19 * 60 + 59);
  assert.equal(campusMinutesOfDay("garbage"), null);
});

test("window state: before, open, closed — inclusive at the closing minute", () => {
  const { general, femaleMarket, femaleNearby } = OUTING_POLICIES;
  assert.equal(getOutingWindowState(general, ist(5, 0)), "before");
  assert.equal(getOutingWindowState(general, ist(6, 0)), "open");
  assert.equal(getOutingWindowState(general, ist(19, 59)), "open");
  assert.equal(getOutingWindowState(general, ist(20, 0)), "closed");

  assert.equal(getOutingWindowState(femaleMarket, ist(15, 0)), "open");
  assert.equal(getOutingWindowState(femaleMarket, ist(15, 1)), "closed");
  assert.equal(getOutingWindowState(femaleNearby, ist(15, 1)), "open");
  assert.equal(getOutingWindowState(femaleNearby, ist(18, 31)), "closed");

  assert.equal(getOutingWindowState(general, "garbage"), "closed");
});
