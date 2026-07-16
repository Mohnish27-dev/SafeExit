// Outing/leave business rules. All clock rules are evaluated in campus-local
// time (pinned TZ) so behavior doesn't depend on the server's host timezone.

const CAMPUS_TIMEZONE = 'Asia/Kolkata';

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

// Pass can't be used to exit after its departure time. `at` injectable for tests.
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

// Leave pass dies at 5:30 PM campus time on its departure day; any later
// calendar day counts as past-curfew regardless of clock time.
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
  if (nowDay < depDay) return false;
  if (nowDay > depDay) return true;
  return minutesOfDayInTimeZone(now, CAMPUS_TIMEZONE) > EVENING_CURFEW_MINUTES;
};

// Same-day outing policy (gender x outing type), minutes since campus midnight:
//   Female Nearby: no warden; depart 6:00 AM–6:30 PM; return by 8:00 PM.
//   Female Market: warden required; depart 6:00 AM–2:30 PM; return by 5:30 PM.
//   Male/Other -> 'General': no warden; depart 6:00 AM–7:59 PM; return by 8:00 PM.
const NIGHT_RETURN_MINUTES = 20 * 60; // 8:00 PM
const MARKET_RETURN_MINUTES = 17 * 60 + 30; // 5:30 PM

const GIRL_NEARBY_DEPART_START_MINUTES = 6 * 60;
const GIRL_NEARBY_DEPART_END_MINUTES = 18 * 60 + 30;
const GIRL_MARKET_DEPART_START_MINUTES = 6 * 60;
const GIRL_MARKET_DEPART_END_MINUTES = 14 * 60 + 30;
const MALE_DEPART_START_MINUTES = 6 * 60;
const MALE_DEPART_END_MINUTES = 20 * 60 - 1;

const normalizeOutingType = (gender, outingType) => {
  if (gender === 'Female') return outingType === 'Market' ? 'Market' : 'Nearby';
  return 'General';
};

// Always returns a policy — never throws.
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

  return {
    type: 'General',
    requiresWarden: false,
    departStartMinutes: MALE_DEPART_START_MINUTES,
    departEndMinutes: MALE_DEPART_END_MINUTES,
    returnDeadlineMinutes: NIGHT_RETURN_MINUTES,
  };
};

const isWithinDepartureWindow = (gender, outingType, departDate) => {
  const d = new Date(departDate);
  if (Number.isNaN(d.getTime())) return false;
  const policy = resolveOutingPolicy(gender, outingType);
  const mins = minutesOfDayInTimeZone(d, CAMPUS_TIMEZONE);
  return mins >= policy.departStartMinutes && mins <= policy.departEndMinutes;
};

// Policy-fixed return deadline on the departure's campus-local day.
// Built with a fixed +05:30 offset (no DST in Asia/Kolkata) so the instant
// is unambiguous regardless of server timezone.
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
  isDeparturePassed,
  isBeforeDeparture,
  isReturnLate,
  isBeforeEveningCurfew,
  isAfterLeaveCurfew,
  resolveOutingPolicy,
  normalizeOutingType,
  isWithinDepartureWindow,
  computeReturnDeadline,
};
