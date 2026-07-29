const test = require('node:test');
const assert = require('node:assert/strict');

const { getLeaveSubmissionTimingViolation } = require('../src/utils/outingRules');

test('boys can submit a leave application on the departure day', () => {
  const now = new Date('2026-07-30T04:30:00.000Z'); // 10:00 AM IST
  const departure = new Date('2026-07-30T05:30:00.000Z'); // 11:00 AM IST

  assert.equal(getLeaveSubmissionTimingViolation('Male', departure, now), null);
});

test('boys still cannot submit after the departure time', () => {
  const now = new Date('2026-07-30T05:30:00.000Z');
  const departure = new Date('2026-07-30T04:30:00.000Z');

  assert.equal(
    getLeaveSubmissionTimingViolation('Male', departure, now),
    'DEPARTURE_NOT_FUTURE'
  );
});

test('girls cannot submit on the campus-local departure day', () => {
  const now = new Date('2026-07-30T04:30:00.000Z'); // 10:00 AM IST
  const departure = new Date('2026-07-30T11:30:00.000Z'); // 5:00 PM IST

  assert.equal(
    getLeaveSubmissionTimingViolation('Female', departure, now),
    'FEMALE_DEPARTURE_DAY'
  );
});

test('girls can submit until the end of the day for a next-day departure', () => {
  const now = new Date('2026-07-30T18:29:59.000Z'); // 11:59:59 PM IST
  const departure = new Date('2026-07-31T00:30:00.000Z'); // 6:00 AM IST

  assert.equal(getLeaveSubmissionTimingViolation('Female', departure, now), null);
});

test('girls are blocked just after campus midnight for that day departure', () => {
  const now = new Date('2026-07-30T18:30:00.000Z'); // 12:00 AM IST on July 31
  const departure = new Date('2026-07-31T00:30:00.000Z'); // 6:00 AM IST

  assert.equal(
    getLeaveSubmissionTimingViolation('Female', departure, now),
    'FEMALE_DEPARTURE_DAY'
  );
});
