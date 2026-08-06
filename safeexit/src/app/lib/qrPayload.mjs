// The gate scanner accepts two QR formats: the app's own identity JSON and the
// college ID card, whose payload is one line of tab-separated label/value pairs.
// Only the roll number and name are ever read off a card — every other printed
// field (DOB, father's name, blood group, address…) is dropped here, so it can
// never reach React state, the network, or a log line.
//
// This parser is not a security boundary. A QR is attacker-authored either way;
// the gate's real checks are the DB lookup and the DB-verified pass in
// backend/src/controllers/scanController.js.

const MAX_RAW_LENGTH = 4096;

// trim() misses the Cf-category invisibles that ID-card generators leak.
const ZERO_WIDTH = new RegExp("[\\u200B-\\u200D\\u2060\\uFEFF]", "g");

const NAME_LABEL = "name";

// Roll-number labels in priority order; the first present wins.
const ROLL_LABELS = ["rollno", "rollnumber", "regno", "registrationno", "enrollmentno", "studentid"];

// Every label a card is known to print, not just the two we keep. A candidate
// value that is itself a label means that field was blank and its tab run
// collapsed, so the stream must resync instead of storing a label as a value.
const CARD_LABELS = new Set([
  ...ROLL_LABELS,
  NAME_LABEL,
  "address",
  "bloodgroup",
  "branch",
  "course",
  "dateofbirth",
  "department",
  "dob",
  "email",
  "fathersname",
  "gender",
  "guardiansname",
  "hostel",
  "mobile",
  "mobileno",
  "mothersname",
  "nitpemail",
  "permanentaddress",
  "phone",
  "phoneno",
  "session",
  "validtill",
  "year",
]);

// Exact match only. Never loosen this to includes()/endsWith() — "Father's Name"
// and "Mother's Name" would then be accepted as the student's name.
const normalizeLabel = (token) => token.toLowerCase().replace(/[^a-z0-9]/g, "");

const cleanToken = (token) => {
  const trimmed = token.trim();
  // Cards quote free-text fields; a symmetric pair is packaging, not data.
  return trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1).trim()
    : trimmed;
};

const asText = (value) =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

// The app's own QR. Rejected unless an identifier survives, so an unrelated JSON
// QR can't open a confirm modal for nobody.
const parseIdentityJson = (raw) => {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;

  const id = asText(data.id);
  const sid = asText(data.sid);
  if (!id && !sid) return null;
  return { id, sid, name: asText(data.name) };
};

// Label-driven rather than positional: a value holding a stray tab shifts the
// token stream, and pairing by position would mis-assign every field after it.
const parseIdCard = (raw) => {
  const tokens = raw.split(/[\t\r\n]+/).map(cleanToken).filter(Boolean);

  const fields = new Map();
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const label = normalizeLabel(tokens[i]);
    if (!CARD_LABELS.has(label) || fields.has(label)) continue;
    const value = tokens[i + 1];
    if (CARD_LABELS.has(normalizeLabel(value))) continue;
    fields.set(label, value);
  }

  const id = ROLL_LABELS.map((label) => fields.get(label)).find(Boolean) || "";
  // A card with no roll number is unusable; so is a bare code with no labels.
  if (!id) return null;

  // The roll is passed through verbatim. Repairing it (stripping spaces/dashes)
  // could match a different student, and the backend match is anchored — a
  // visible "student not found" beats a silent wrong-student gate log.
  return { id, sid: "", name: fields.get(NAME_LABEL) || "" };
};

// Returns { id, sid, name } — always exactly those keys — or null if the QR is
// neither format. `sid` is "" for ID cards, which resolve by roll number alone.
export const parseScannedQr = (rawValue) => {
  if (typeof rawValue !== "string") return null;
  const raw = rawValue.replace(ZERO_WIDTH, "").trim();
  if (!raw || raw.length > MAX_RAW_LENGTH) return null;
  return parseIdentityJson(raw) || parseIdCard(raw);
};
