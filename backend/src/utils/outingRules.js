// Business rules for outing requests, shared by the controller that creates
// them and (indirectly, via the request's persisted `status`) the gate scan
// flow that trusts that status.
//
// Rule: a request whose expected return time is on or before 5:30 PM is
// low-risk enough to skip warden review and be approved automatically.

// The cutoff is evaluated in the campus's own timezone rather than the
// server process's local time. `Date#getHours()` reads out in whatever TZ
// the host happens to be configured with — identical code would compute a
// different cutoff on a UTC-default cloud host than on a machine set to
// IST, silently moving "5:30 PM" to a different real-world time depending
// on where this process is deployed. Pinning it keeps the rule's meaning
// fixed regardless of host configuration.
const CAMPUS_TIMEZONE = 'Asia/Kolkata';
const AUTO_APPROVE_CUTOFF_MINUTES = 17 * 60 + 30; // 5:30 PM, campus local time

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

// `inTime` is the student's expected return Date (as sent from the client / stored on the request).
const qualifiesForAutoApproval = (inTime) => {
  const returnDate = new Date(inTime);
  if (Number.isNaN(returnDate.getTime())) return false;
  return minutesOfDayInTimeZone(returnDate, CAMPUS_TIMEZONE) <= AUTO_APPROVE_CUTOFF_MINUTES;
};

// The pass's departure time (`outTime`) is a hard deadline: once it passes, the
// pass can no longer be used to exit. This is a comparison of absolute instants
// (`outTime` is a stored Date), so it's timezone-safe — the moment itself is
// unambiguous regardless of where the server runs. `at` is injectable for tests.
const isDeparturePassed = (outTime, at = Date.now()) => {
  const departure = new Date(outTime);
  if (Number.isNaN(departure.getTime())) return false;
  return at > departure.getTime();
};

// Symmetric with isDeparturePassed: a scan before the pass's approved
// departure time isn't a legitimate early exit, it's someone trying to use a
// pass that hasn't opened yet. This matters most for multi-day Leave
// Applications, which can be approved days ahead of the actual leave date —
// without this check, an approved-for-the-13th pass would let a student exit
// on the 12th. Same absolute-instant, timezone-safe comparison as
// isDeparturePassed. `at` is injectable for tests.
const isBeforeDeparture = (outTime, at = Date.now()) => {
  const departure = new Date(outTime);
  if (Number.isNaN(departure.getTime())) return false;
  return at < departure.getTime();
};

// A return is late when the student is scanned back IN after the pass's expected
// return time (`inTime`). Like `isDeparturePassed`, this compares absolute
// instants (`inTime` is a stored Date), so it's timezone-safe. This is the
// authoritative punctuality check for entry scans — the gate must not trust a
// client-supplied value, which can be missing or stale. `at` is injectable for
// tests. Returns false for an unparseable/absent time (no window to judge).
const isReturnLate = (inTime, at = Date.now()) => {
  const expectedReturn = new Date(inTime);
  if (Number.isNaN(expectedReturn.getTime())) return false;
  return at > expectedReturn.getTime();
};

// Separate rule for multi-day Leave Applications: female students must depart
// on or before 5:30 PM (campus local time). This intentionally shares its
// clock value with AUTO_APPROVE_CUTOFF_MINUTES but is a distinct policy (a
// hard departure curfew, not an auto-approval threshold) and only applies to
// Leave Applications, never same-day Outing — kept as its own named export so
// the two rules can diverge independently in the future.
const EVENING_CURFEW_MINUTES = 17 * 60 + 30; // 5:30 PM, campus local time

const isBeforeEveningCurfew = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return minutesOfDayInTimeZone(d, CAMPUS_TIMEZONE) <= EVENING_CURFEW_MINUTES;
};

module.exports = {
  qualifiesForAutoApproval,
  isDeparturePassed,
  isBeforeDeparture,
  isReturnLate,
  isBeforeEveningCurfew,
  AUTO_APPROVE_CUTOFF_MINUTES,
  EVENING_CURFEW_MINUTES,
  CAMPUS_TIMEZONE,
};
