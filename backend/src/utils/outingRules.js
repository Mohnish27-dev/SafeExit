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

// Separate rule for multi-day Leave Applications: a student must depart on or
// before 5:30 PM (campus local time), and no earlier than 6:00 AM. This applies
// to EVERY student regardless of gender — leave has no gender-specific timing
// (unlike same-day Outing below, whose windows do vary by gender). It shares
// its late-bound clock value with AUTO_APPROVE_CUTOFF_MINUTES but is a distinct
// policy (a hard departure curfew, not an auto-approval threshold) — kept as
// its own named export so the two rules can diverge independently in future.
const EVENING_CURFEW_MINUTES = 17 * 60 + 30; // 5:30 PM, campus local time
const LEAVE_DEPART_START_MINUTES = 6 * 60; // 6:00 AM, campus local time

// True only when the leave departure is within the 6:00 AM-5:30 PM window.
const isBeforeEveningCurfew = (date) => {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  const mins = minutesOfDayInTimeZone(d, CAMPUS_TIMEZONE);
  return mins >= LEAVE_DEPART_START_MINUTES && mins <= EVENING_CURFEW_MINUTES;
};

// A Leave Application pass is usable only until 5:30 PM (campus local time) on
// its own departure day. Past that instant the pass is dead — the student may
// no longer leave on it and must file a fresh application. This is the LATE
// bound of the leave exit window; `isBeforeDeparture(leaveDate)` is the early
// bound. Unlike a same-day Outing (whose only bound is its outTime deadline), a
// leave gets this fixed 5:30 PM cap regardless of the exact approved leaveDate.
//
// Days are compared in campus-local time so a scan on ANY later calendar day
// counts as past-curfew no matter the clock time. `at` is injectable for tests.
const isAfterLeaveCurfew = (leaveDate, at = Date.now()) => {
  const dep = new Date(leaveDate);
  if (Number.isNaN(dep.getTime())) return false;
  const now = new Date(at);
  const campusDay = (d) =>
    new Intl.DateTimeFormat('en-CA', {
      timeZone: CAMPUS_TIMEZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  const depDay = campusDay(dep);
  const nowDay = campusDay(now);
  if (nowDay < depDay) return false; // scan is before the departure day entirely
  if (nowDay > depDay) return true; // a later calendar day — curfew long passed
  return minutesOfDayInTimeZone(now, CAMPUS_TIMEZONE) > EVENING_CURFEW_MINUTES;
};

// ---------------------------------------------------------------------------
// Same-day Outing policy engine (gender x outing type)
// ---------------------------------------------------------------------------
//
// Unlike Leave (one gender-agnostic window), same-day outings follow different
// college rules depending on the student's gender and the kind of outing. Each
// policy is a plain object of campus-local clock values, so every consumer
// (create controller, gate scan, frontend mirror) reasons about the same
// numbers rather than re-deriving windows. All *_MINUTES values are minutes
// since midnight in CAMPUS_TIMEZONE.
//
//   Female + 'Nearby' (walk to café/food): no warden approval; may leave only
//     between 6:00 AM and 6:30 PM; must be back by 8:00 PM.
//   Female + 'Market' (local city market): warden approval REQUIRED; may leave
//     only between 6:00 AM and 2:30 PM; must be back by 5:30 PM.
//   Male (any outing -> normalized to 'General'): no warden approval; may leave
//     between 6:00 AM and just before 8:00 PM (the fixed return time); must be
//     back by 8:00 PM.
//
// NOTE (tunable business values): the market late-departure bound is set to
// 2:30 PM — the explicit "6am-2:30pm" window. If the intended cutoff is 3:00 PM
// instead, change GIRL_MARKET_DEPART_END_MINUTES only. Gender 'Other' (and any
// unrecognised value) resolves to the male 'General' policy (least restrictive).
const NIGHT_RETURN_MINUTES = 20 * 60; // 8:00 PM
const MARKET_RETURN_MINUTES = 17 * 60 + 30; // 5:30 PM

const GIRL_NEARBY_DEPART_START_MINUTES = 6 * 60; // 6:00 AM
const GIRL_NEARBY_DEPART_END_MINUTES = 18 * 60 + 30; // 6:30 PM
const GIRL_MARKET_DEPART_START_MINUTES = 6 * 60; // 6:00 AM
const GIRL_MARKET_DEPART_END_MINUTES = 14 * 60 + 30; // 2:30 PM
const MALE_DEPART_START_MINUTES = 6 * 60; // 6:00 AM
const MALE_DEPART_END_MINUTES = 20 * 60 - 1; // 7:59 PM (just before the fixed 8:00 PM return)

// Males have a single combined outing path — both "nearby" and "market" share
// identical rules — so any male request normalizes to 'General'. Females keep
// the caller's choice ('Nearby' or 'Market'), defaulting to 'Nearby' if absent.
const normalizeOutingType = (gender, outingType) => {
  if (gender === 'Female') return outingType === 'Market' ? 'Market' : 'Nearby';
  return 'General';
};

// Resolve the governing policy for a (gender, outingType) pair. Always returns
// a policy — never throws — so callers can trust the shape. `type` is the
// normalized outing type actually applied.
const resolveOutingPolicy = (gender, outingType) => {
  const type = normalizeOutingType(gender, outingType);

  if (gender === 'Female' && type === 'Nearby') {
    return {
      type,
      requiresWarden: false,
      departStartMinutes: GIRL_NEARBY_DEPART_START_MINUTES,
      departEndMinutes: GIRL_NEARBY_DEPART_END_MINUTES,
      returnDeadlineMinutes: NIGHT_RETURN_MINUTES,
    };
  }

  if (gender === 'Female' && type === 'Market') {
    return {
      type,
      requiresWarden: true,
      departStartMinutes: GIRL_MARKET_DEPART_START_MINUTES,
      departEndMinutes: GIRL_MARKET_DEPART_END_MINUTES,
      returnDeadlineMinutes: MARKET_RETURN_MINUTES,
    };
  }

  // Male / Other / unspecified -> single 'General' path.
  return {
    type: 'General',
    requiresWarden: false,
    departStartMinutes: MALE_DEPART_START_MINUTES,
    departEndMinutes: MALE_DEPART_END_MINUTES,
    returnDeadlineMinutes: NIGHT_RETURN_MINUTES,
  };
};

// Is the given departure instant inside the policy's allowed departure window,
// judged in campus-local time? Rejects both too-early and too-late departures.
const isWithinDepartureWindow = (gender, outingType, departDate) => {
  const d = new Date(departDate);
  if (Number.isNaN(d.getTime())) return false;
  const policy = resolveOutingPolicy(gender, outingType);
  const mins = minutesOfDayInTimeZone(d, CAMPUS_TIMEZONE);
  return mins >= policy.departStartMinutes && mins <= policy.departEndMinutes;
};

// Compute the fixed, policy-mandated return deadline as an absol
// ute Date on the
// SAME campus-local calendar day as the departure. The student never chooses
// this — the college rule fixes it (8:00 PM or 5:30 PM), and pinning it as the
// pass's `inTime` is what lets the existing overdue/punctuality machinery raise
// the "warden must call" signal without any extra bookkeeping.
//
// We derive the departure's campus-local Y/M/D, then build an ISO string with a
// fixed +05:30 offset (CAMPUS_TIMEZONE is Asia/Kolkata, which has no DST) so the
// resulting instant is unambiguous regardless of the server's own timezone.
const computeReturnDeadline = (gender, outingType, departDate) => {
  const d = new Date(departDate);
  if (Number.isNaN(d.getTime())) return null;
  const policy = resolveOutingPolicy(gender, outingType);

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  const hh = String(Math.floor(policy.returnDeadlineMinutes / 60)).padStart(2, '0');
  const mm = String(policy.returnDeadlineMinutes % 60).padStart(2, '0');

  return new Date(`${get('year')}-${get('month')}-${get('day')}T${hh}:${mm}:00+05:30`);
};

module.exports = {
  qualifiesForAutoApproval,
  isDeparturePassed,
  isBeforeDeparture,
  isReturnLate,
  isBeforeEveningCurfew,
  isAfterLeaveCurfew,
  resolveOutingPolicy,
  normalizeOutingType,
  isWithinDepartureWindow,
  computeReturnDeadline,
  AUTO_APPROVE_CUTOFF_MINUTES,
  EVENING_CURFEW_MINUTES,
  CAMPUS_TIMEZONE,
};
