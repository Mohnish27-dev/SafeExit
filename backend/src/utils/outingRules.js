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

const minutesOfDayInTimeZone = (date, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === 'hour').value);
  const minute = Number(parts.find((part) => part.type === 'minute').value);
  return hour * 60 + minute;
};

// True once `outTime` is behind us. Only rows written by the old request flow still use this
// for outings (their outTime was an exit-by deadline, so an unused one lapses lazily, see
// utils/passExpiry.js); a gate-created outing is born 'Out'. `at` injectable for tests.
const isDeparturePassed = (outTime, at = Date.now()) => {
  const departure = new Date(outTime);
  if (Number.isNaN(departure.getTime())) return false;
  return at > departure.getTime();
};

// Pass can't be used before its approved departure (e.g. leave approved days ahead).
const isBeforeDeparture = (outTime, at = Date.now()) => {
  const departure = new Date(outTime);
  if (Number.isNaN(departure.getTime())) return false;
  return at < departure.getTime();
};

// Authoritative punctuality check for entry scans (never trust client values).
const isReturnLate = (inTime, at = Date.now()) => {
  const expectedReturn = new Date(inTime);
  if (Number.isNaN(expectedReturn.getTime())) return false;
  return at > expectedReturn.getTime();
};

// Leave departures allowed 6:00 AM – 5:30 PM campus time, all genders.
const EVENING_CURFEW_MINUTES = 17 * 60 + 30; // 5:30 PM
const LEAVE_DEPART_START_MINUTES = 6 * 60; // 6:00 AM

const isBeforeEveningCurfew = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const mins = minutesOfDayInTimeZone(d, CAMPUS_TIMEZONE);
  return mins >= LEAVE_DEPART_START_MINUTES && mins <= EVENING_CURFEW_MINUTES;
};

// Female students must apply before the campus-local departure day. Everyone
// else may apply at any time before departure. The departure-window rule is
// checked separately by isBeforeEveningCurfew.
const getLeaveSubmissionTimingViolation = (gender, leaveDate, at = Date.now()) => {
  const departure = new Date(leaveDate);
  const now = new Date(at);
  if (Number.isNaN(departure.getTime()) || Number.isNaN(now.getTime())) return 'INVALID_DATE';
  if (departure.getTime() <= now.getTime()) return 'DEPARTURE_NOT_FUTURE';
  if (gender === 'Female' && campusDateKey(departure) === campusDateKey(now)) {
    return 'FEMALE_DEPARTURE_DAY';
  }
  return null;
};

// Leave pass dies at 5:30 PM campus time on its departure day; any later
// calendar day counts as past-curfew regardless of clock time.
const isAfterLeaveCurfew = (leaveDate, at = Date.now()) => {
  const dep = new Date(leaveDate);
  if (Number.isNaN(dep.getTime())) return false;
  const now = new Date(at);
  const depDay = campusDateKey(dep);
  const nowDay = campusDateKey(now);
  if (nowDay < depDay) return false;
  if (nowDay > depDay) return true;
  return minutesOfDayInTimeZone(now, CAMPUS_TIMEZONE) > EVENING_CURFEW_MINUTES;
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
  isDeparturePassed,
  isBeforeDeparture,
  isReturnLate,
  isBeforeEveningCurfew,
  getLeaveSubmissionTimingViolation,
  isAfterLeaveCurfew,
  OUTING_RETURN_MINUTES,
  computeOutingReturnDeadline,
  outingTypeFor,
};
