// Outing/leave business rules. All clock rules are evaluated in campus-local
// time (pinned TZ) so behavior doesn't depend on the server's host timezone.

const CAMPUS_TIMEZONE = 'Asia/Kolkata';

const campusDateKey = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(date));

// True once `outTime` is behind us. Only rows written by the old request flow still use this
// for outings (their outTime was an exit-by deadline, so an unused one lapses lazily, see
// utils/passExpiry.js); a gate-created outing is born 'Out'. `at` injectable for tests.
const isDeparturePassed = (outTime, at = Date.now()) => {
  const departure = new Date(outTime);
  if (Number.isNaN(departure.getTime())) return false;
  return at > departure.getTime();
};

// Authoritative punctuality check for entry scans (never trust client values).
const isReturnLate = (inTime, at = Date.now()) => {
  const expectedReturn = new Date(inTime);
  if (Number.isNaN(expectedReturn.getTime())) return false;
  return at > expectedReturn.getTime();
};

// A leave is a DAY, not an instant. The application carries only a departure date, and the
// student may leave on it at any hour of that campus day (early morning and after dark
// included); the leave QR is what says they are leaving on it, so the clock no longer has
// to guess. Rows written before this change still carry a time of day, which these ignore.
//
// Compared as YYYY-MM-DD strings, which order the same way as the dates they name.
const leaveDayRelation = (leaveDate, at = Date.now()) => {
  const dep = new Date(leaveDate);
  if (Number.isNaN(dep.getTime())) return null;
  const depDay = campusDateKey(dep);
  const nowDay = campusDateKey(new Date(at));
  if (nowDay < depDay) return 'AHEAD';
  if (nowDay > depDay) return 'OVER';
  return 'TODAY';
};

const isLeaveDay = (leaveDate, at = Date.now()) => leaveDayRelation(leaveDate, at) === 'TODAY';

// True from campus midnight after the leave day. An unused pass is stale from then on: it can
// no longer be used at the gate, approved, or forwarded.
const isLeaveDayOver = (leaveDate, at = Date.now()) => leaveDayRelation(leaveDate, at) === 'OVER';

// Female students must apply before the campus-local departure day. Everyone else may apply
// up to and including the departure day itself, but never for a day already gone.
const getLeaveSubmissionTimingViolation = (gender, leaveDate, at = Date.now()) => {
  if (Number.isNaN(new Date(at).getTime())) return 'INVALID_DATE';
  const relation = leaveDayRelation(leaveDate, at);
  if (!relation) return 'INVALID_DATE';
  if (relation === 'OVER') return 'DEPARTURE_NOT_FUTURE';
  if (gender === 'Female' && relation === 'TODAY') return 'FEMALE_DEPARTURE_DAY';
  return null;
};

// Outings need no request, no approval and no exit window. The gate's exit scan IS the
// outing: scanController creates the row at that moment. Whether it is a sensible hour to
// let a student out is the guard's call at the gate; the server only fixes when they must
// be back. Same rule for boys and girls (nearby and market alike): back by 8:00 PM.
const OUTING_RETURN_MINUTES = 20 * 60; // 8:00 PM

// The instant `minutes` after campus midnight on `date`'s campus-local day. Built with a
// fixed +05:30 offset (no DST in Asia/Kolkata) so the instant is unambiguous regardless of
// server timezone.
const campusInstantOnDayOf = (date, minutes) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  const [year, month, day] = campusDateKey(d).split('-');
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return new Date(`${year}-${month}-${day}T${hh}:${mm}:00.000+05:30`);
};

// Campus midnight starting `date`'s campus day: how a date-only leave departure is stored.
const campusDayStart = (date) => campusInstantOnDayOf(date, 0);

// Return deadline for an outing that began at `exitAt`: 8:00 PM that campus day. If the
// guard let the student out at or after 8:00 PM there is no later deadline that day, so it
// is one second after the exit — the trip reads as overdue straight away instead of quietly
// running until tomorrow evening. The second also keeps outing_window_ordered
// (in_time > out_time) true, because out_time is the exit instant itself.
const computeOutingReturnDeadline = (exitAt) => {
  const exit = new Date(exitAt);
  if (Number.isNaN(exit.getTime())) return null;
  const deadline = campusInstantOnDayOf(exit, OUTING_RETURN_MINUTES);
  return deadline.getTime() > exit.getTime() ? deadline : new Date(exit.getTime() + 1000);
};

// Outing types are no longer chosen; the column is NOT NULL, so a gate-created row records
// the one type each gender maps to.
const outingTypeFor = (gender) => (gender === 'Female' ? 'Nearby' : 'General');

module.exports = {
  campusDateKey,
  isDeparturePassed,
  isReturnLate,
  leaveDayRelation,
  isLeaveDay,
  isLeaveDayOver,
  getLeaveSubmissionTimingViolation,
  campusDayStart,
  OUTING_RETURN_MINUTES,
  computeOutingReturnDeadline,
  outingTypeFor,
};
