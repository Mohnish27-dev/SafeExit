const test = require('node:test');
const assert = require('node:assert/strict');

const { getLeaveSubmissionTimingViolation, isEmergencyLeave } = require('../src/utils/outingRules');

test('boys can submit a leave application on the departure day', () => {
  const now = new Date('2026-07-30T04:30:00.000Z'); // 10:00 AM IST
  const departure = new Date('2026-07-30T05:30:00.000Z'); // 11:00 AM IST

  assert.equal(getLeaveSubmissionTimingViolation('Male', departure, now), null);
});

test('boys may submit for today until the day is over, whatever the hour', () => {
  const now = new Date('2026-07-30T16:30:00.000Z'); // 10:00 PM IST
  const departure = new Date('2026-07-29T18:30:00.000Z'); // campus midnight starting July 30

  assert.equal(getLeaveSubmissionTimingViolation('Male', departure, now), null);
});

test('nobody can submit for a day already gone', () => {
  const now = new Date('2026-07-30T18:30:00.000Z'); // 12:00 AM IST on July 31
  const departure = new Date('2026-07-29T18:30:00.000Z'); // July 30

  assert.equal(
    getLeaveSubmissionTimingViolation('Male', departure, now),
    'DEPARTURE_NOT_FUTURE'
  );
});

test('girls may submit on the campus-local departure day, flagged as an emergency', () => {
  const now = new Date('2026-07-30T04:30:00.000Z'); // 10:00 AM IST
  const departure = new Date('2026-07-30T11:30:00.000Z'); // 5:00 PM IST

  assert.equal(getLeaveSubmissionTimingViolation('Female', departure, now), null);
  assert.equal(isEmergencyLeave('Female', departure, now), true);
});

test('a girl applying by the end of the day before is not an emergency', () => {
  const now = new Date('2026-07-30T18:29:59.000Z'); // 11:59:59 PM IST
  const departure = new Date('2026-07-31T00:30:00.000Z'); // 6:00 AM IST

  assert.equal(getLeaveSubmissionTimingViolation('Female', departure, now), null);
  assert.equal(isEmergencyLeave('Female', departure, now), false);
});

test('just after campus midnight the same departure becomes an emergency', () => {
  const now = new Date('2026-07-30T18:30:00.000Z'); // 12:00 AM IST on July 31
  const departure = new Date('2026-07-31T00:30:00.000Z'); // 6:00 AM IST

  assert.equal(getLeaveSubmissionTimingViolation('Female', departure, now), null);
  assert.equal(isEmergencyLeave('Female', departure, now), true);
});

test("a boy's same-day leave is never an emergency", () => {
  const now = new Date('2026-07-30T04:30:00.000Z');
  const departure = new Date('2026-07-30T11:30:00.000Z');

  assert.equal(isEmergencyLeave('Male', departure, now), false);
  assert.equal(isEmergencyLeave('Other', departure, now), false);
});
