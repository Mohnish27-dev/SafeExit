import test from "node:test";
import assert from "node:assert/strict";

import {
  getLeaveSubmissionTimingViolation,
  getMinimumLeaveInputValue,
  parseCampusDateTime,
} from "../src/app/lib/leaveRules.mjs";

test("campus datetime fields are interpreted as IST on every device", () => {
  assert.equal(
    parseCampusDateTime("2026-07-30T10:00").toISOString(),
    "2026-07-30T04:30:00.000Z"
  );
});

test("boys receive a same-day minimum and may submit before departure", () => {
  const now = new Date("2026-07-30T04:30:00.000Z"); // 10:00 AM IST
  const departure = parseCampusDateTime("2026-07-30T11:00");

  assert.equal(getMinimumLeaveInputValue("Male", now), "2026-07-30T10:01");
  assert.equal(getLeaveSubmissionTimingViolation("Male", departure, now), null);
});

test("girls receive a next-day minimum and cannot submit for today", () => {
  const now = new Date("2026-07-30T04:30:00.000Z"); // 10:00 AM IST
  const todayDeparture = parseCampusDateTime("2026-07-30T17:00");

  assert.equal(getMinimumLeaveInputValue("Female", now), "2026-07-31T06:00");
  assert.equal(
    getLeaveSubmissionTimingViolation("Female", todayDeparture, now),
    "FEMALE_DEPARTURE_DAY"
  );
});

test("girls may submit at the end of today for tomorrow", () => {
  const now = new Date("2026-07-30T18:29:59.000Z"); // 11:59:59 PM IST
  const tomorrowDeparture = parseCampusDateTime("2026-07-31T06:00");

  assert.equal(getLeaveSubmissionTimingViolation("Female", tomorrowDeparture, now), null);
});
