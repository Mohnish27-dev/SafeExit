// Gate-station logic that sits between a hardware scanner and the guard dashboard.
// Kept pure and framework-free so test/gateFlow.test.mjs can exercise it directly.

// Printed on card and taped beside the gate monitor, so a guard holding a handheld
// scanner never has to reach for a keyboard. Deliberately shaped so they can never
// collide with a roll number or an ID-card payload.
//
// These are not credentials and are useless if photographed: they act only on the
// scan already pending on that station's own screen. NOTE: that safety depends on
// the guard holding the scanner. If the scanner is ever mounted facing students in
// presentation mode, the student controls the lens and could flash a printed
// CONFIRM at it — use a footswitch for confirmation in that layout instead.
export const SCAN_CONTROL = {
  CONFIRM: "##CONFIRM##",
  CANCEL: "##CANCEL##",
};

/** Returns 'CONFIRM' | 'CANCEL' for a control barcode, else null for a student QR. */
export const readControlBarcode = (rawValue) => {
  if (typeof rawValue !== "string") return null;
  const raw = rawValue.trim().toUpperCase();
  if (raw === SCAN_CONTROL.CONFIRM) return "CONFIRM";
  if (raw === SCAN_CONTROL.CANCEL) return "CANCEL";
  return null;
};

// A student's live campusStatus admits exactly one legal move, which is why the gate
// needs no exit/entry mode switch: 'Inside' can only leave, 'Outside'/'Overdue' can
// only return. Mirrors `allowedFrom` in backend/src/controllers/scanController.js —
// anything not demonstrably outside is treated as inside, matching the User schema
// default of 'Inside'. The server re-derives this authoritatively; this copy only
// decides what the guard sees before confirming.
export const deriveGateDirection = (campusStatus) =>
  campusStatus === "Outside" || campusStatus === "Overdue" ? "IN" : "OUT";

// The one refusal the gate has: an EXIT on the student's leave QR with no leave approved for
// today (backend scanController's LEAVE_REFUSALS). Returns the preview's exit verdict when
// that is what this scan would be, else null. An entry is never refused — either QR closes
// whichever pass the student is out on — so a refused exit verdict on a student who is
// outside means nothing.
export const exitRefusal = (preview) => {
  if (!preview?.student) return null;
  if (deriveGateDirection(preview.student.campusStatus) !== "OUT") return null;
  return preview.exit?.allowed === false ? preview.exit : null;
};

// Every other scan logs a movement (outings need no approval; the guard decides whether it
// is a sensible hour). What gates the countdown is a resolved student — that is what puts
// the photo on screen for the face match — that the server would accept. A failed preview
// stays a manual, by-hand commit.
export const canAutoCommit = (preview) => Boolean(preview?.student) && !exitRefusal(preview);
