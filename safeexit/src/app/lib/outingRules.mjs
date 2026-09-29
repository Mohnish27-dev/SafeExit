// UX-only mirror of backend/src/utils/outingRules.js — keep the numbers in sync. The server
// re-derives everything from the authenticated user, so nothing here is trusted.
//
// Students do not choose a departure time. Their departure is the gate scan; the only rule
// is that the scan falls inside the exit window below, on the day the pass was requested.
// A pass nobody uses lapses when that window closes.

export const CAMPUS_TIMEZONE = "Asia/Kolkata";

// Minutes since campus midnight.
export const OUTING_POLICIES = {
  femaleNearby: { departStart: 6 * 60, departEnd: 18 * 60 + 30, returnDeadline: 20 * 60, requiresCaretaker: false },
  femaleMarket: { departStart: 6 * 60, departEnd: 15 * 60, returnDeadline: 17 * 60 + 30, requiresCaretaker: true },
  general: { departStart: 6 * 60, departEnd: 20 * 60 - 1, returnDeadline: 20 * 60, requiresCaretaker: false },
};

// Females: Nearby/Market; everyone else: 'General'. Mirrors backend normalizeOutingType.
export const resolveOutingPolicy = (gender, outingType) => {
  if (gender === "Female") {
    return outingType === "Market" ? OUTING_POLICIES.femaleMarket : OUTING_POLICIES.femaleNearby;
  }
  return OUTING_POLICIES.general;
};

// 1110 -> "6:30 PM"
export const clockLabel = (minutes) => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

// Minute-of-day (0..1439) on the campus clock, whatever the device's timezone.
export const campusMinutesOfDay = (at = new Date()) => {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CAMPUS_TIMEZONE,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour").value);
  const minute = Number(parts.find((p) => p.type === "minute").value);
  return hour * 60 + minute;
};

// Where today stands against a policy's exit window:
//   "before" — request allowed now, the gate opens at departStart
//   "open"   — request and exit allowed now
//   "closed" — nothing left today; the server refuses the request
export const getOutingWindowState = (policy, at = new Date()) => {
  const mins = campusMinutesOfDay(at);
  if (mins === null) return "closed";
  if (mins > policy.departEnd) return "closed";
  if (mins < policy.departStart) return "before";
  return "open";
};
