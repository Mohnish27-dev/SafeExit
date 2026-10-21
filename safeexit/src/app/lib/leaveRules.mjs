export const CAMPUS_TIMEZONE = "Asia/Kolkata";

const CAMPUS_OFFSET = "+05:30";
const DAY_MS = 24 * 60 * 60 * 1000;

export const campusDateKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CAMPUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
};

// A leave is a DAY, not a time: the student picks only the departure date and may leave on
// the leave QR at any hour of it (backend utils/outingRules.leaveDayRelation). A date input
// carries no timezone, so its value is pinned to campus midnight starting that IST day,
// which is also how the backend stores it.
export const parseCampusDate = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00${CAMPUS_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const parseCampusReturnDate = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59${CAMPUS_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Mirrors getLeaveSubmissionTimingViolation in backend/src/utils/outingRules.js. Boys may
// apply up to and including the departure day; girls must apply before it. Nobody can apply
// for a day already gone.
export const getLeaveSubmissionTimingViolation = (gender, leaveDate, at = new Date()) => {
  const departureDay = campusDateKey(leaveDate);
  const today = campusDateKey(at);
  if (!departureDay || !today) return "INVALID_DATE";
  if (departureDay < today) return "DEPARTURE_NOT_FUTURE";
  if (gender === "Female" && departureDay === today) return "FEMALE_DEPARTURE_DAY";
  return null;
};

// The earliest date the leave-date input offers: today for boys, tomorrow for girls.
export const getMinimumLeaveDateValue = (gender, at = new Date()) => {
  const today = campusDateKey(at);
  if (gender !== "Female") return today;
  return campusDateKey(new Date(parseCampusDate(today).getTime() + DAY_MS));
};

// Calendar days the leave spans, both ends included: out on the 24th, back on the 26th is
// 3 days. Counted on campus dates, so older rows that still carry a time of day agree.
export const leaveDayCount = (leaveDate, returnDate) => {
  const from = parseCampusDate(campusDateKey(leaveDate));
  const to = parseCampusDate(campusDateKey(returnDate));
  if (!from || !to || to < from) return null;
  return Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
};
