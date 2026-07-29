export const CAMPUS_TIMEZONE = "Asia/Kolkata";

const CAMPUS_OFFSET = "+05:30";
const DAY_MS = 24 * 60 * 60 * 1000;
const LEAVE_DEPART_START_MINUTES = 6 * 60;
const LEAVE_DEPART_END_MINUTES = 17 * 60 + 30;

const campusParts = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  };
};

export const campusDateKey = (value) => {
  const parts = campusParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
};

export const campusDateTimeInputValue = (value) => {
  const parts = campusParts(value);
  return parts
    ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
    : "";
};

// datetime-local carries no timezone. In this campus workflow its wall-clock
// value is always IST, regardless of the timezone configured on the device.
export const parseCampusDateTime = (value) => {
  if (!value) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${withSeconds}${CAMPUS_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const parseCampusReturnDate = (value) => {
  if (!value) return null;
  const date = new Date(`${value}T23:59:59${CAMPUS_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const getLeaveSubmissionTimingViolation = (gender, leaveDate, at = new Date()) => {
  const departure = new Date(leaveDate);
  const now = new Date(at);
  if (Number.isNaN(departure.getTime()) || Number.isNaN(now.getTime())) return "INVALID_DATE";
  if (departure.getTime() <= now.getTime()) return "DEPARTURE_NOT_FUTURE";
  if (gender === "Female" && campusDateKey(departure) === campusDateKey(now)) {
    return "FEMALE_DEPARTURE_DAY";
  }
  return null;
};

export const getMinimumLeaveInputValue = (gender, at = new Date()) => {
  const now = new Date(at);
  if (gender === "Female") {
    const todayStart = new Date(`${campusDateKey(now)}T00:00:00${CAMPUS_OFFSET}`);
    const tomorrow = new Date(todayStart.getTime() + DAY_MS);
    return `${campusDateKey(tomorrow)}T06:00`;
  }

  const nextMinute = new Date((Math.floor(now.getTime() / 60000) + 1) * 60000);
  return campusDateTimeInputValue(nextMinute);
};

export const isWithinLeaveDepartureWindow = (value) => {
  const parts = campusParts(value);
  if (!parts) return false;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  return minutes >= LEAVE_DEPART_START_MINUTES && minutes <= LEAVE_DEPART_END_MINUTES;
};
