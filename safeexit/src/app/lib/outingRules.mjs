// UX-only mirror of backend/src/utils/outingRules.js — keep the numbers in sync. The server
// re-derives everything, so nothing here is trusted.
//
// Outings need no request, no approval and no destination. The student shows their QR at
// the gate; the exit scan creates the outing and the entry scan closes it. The only rule is
// the return deadline, the same for boys and girls (nearby or market).

export const CAMPUS_TIMEZONE = "Asia/Kolkata";

// Minutes since campus midnight.
export const OUTING_RETURN_MINUTES = 20 * 60; // 8:00 PM

// 1200 -> "8:00 PM"
export const clockLabel = (minutes) => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

export const OUTING_RETURN_LABEL = clockLabel(OUTING_RETURN_MINUTES);
