import test from "node:test";
import assert from "node:assert/strict";

import {
  getLeaveSubmissionTimingViolation,
  getMinimumLeaveDateValue,
  leaveDayCount,
  parseCampusDate,
} from "../src/app/lib/leaveRules.mjs";

test("a leave date is pinned to campus midnight on every device", () => {
  assert.equal(parseCampusDate("2026-07-30").toISOString(), "2026-07-29T18:30:00.000Z");
  assert.equal(parseCampusDate(""), null);
});

test("boys may apply for today, at any hour of it", () => {
  const lateEvening = new Date("2026-07-30T16:30:00.000Z"); // 10:00 PM IST

  assert.equal(getMinimumLeaveDateValue("Male", lateEvening), "2026-07-30");
  assert.equal(getLeaveSubmissionTimingViolation("Male", parseCampusDate("2026-07-30"), lateEvening), null);
});

test("nobody can apply for a day already gone", () => {
  const now = new Date("2026-07-30T04:30:00.000Z"); // 10:00 AM IST

  assert.equal(
    getLeaveSubmissionTimingViolation("Male", parseCampusDate("2026-07-29"), now),
    "DEPARTURE_NOT_FUTURE"
  );
});

test("girls receive a next-day minimum and cannot apply for today", () => {
  const now = new Date("2026-07-30T04:30:00.000Z"); // 10:00 AM IST

  assert.equal(getMinimumLeaveDateValue("Female", now), "2026-07-31");
  assert.equal(
    getLeaveSubmissionTimingViolation("Female", parseCampusDate("2026-07-30"), now),
    "FEMALE_DEPARTURE_DAY"
  );
});

test("girls may apply at the end of today for tomorrow", () => {
  const now = new Date("2026-07-30T18:29:59.000Z"); // 11:59:59 PM IST

  assert.equal(getLeaveSubmissionTimingViolation("Female", parseCampusDate("2026-07-31"), now), null);
});

test("leave length counts calendar days, both ends included", () => {
  assert.equal(leaveDayCount(parseCampusDate("2026-10-24"), parseCampusDate("2026-10-26")), 3);
  assert.equal(leaveDayCount(parseCampusDate("2026-10-24"), parseCampusDate("2026-10-24")), 1);
  // Older rows carry a time of day; the count still follows the campus dates.
  assert.equal(leaveDayCount("2026-10-24T10:30:00.000Z", "2026-10-26T18:29:59.000Z"), 3);
  assert.equal(leaveDayCount(parseCampusDate("2026-10-26"), parseCampusDate("2026-10-24")), null);
});
