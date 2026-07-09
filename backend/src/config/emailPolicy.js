// Single source of truth for "what counts as a real student email".
//
// Every NIT Patna student has exactly one, unique @nitp.ac.in mailbox, so tying
// an account to a *verified* address of this form is what enforces "one human =
// one student account" — a student cannot spin up extra accounts from personal
// Gmail addresses to bypass the one-active-outing rule.
//
// This lives in config (not inline in a controller) so the SAME rule is applied
// in every place that must agree: the OTP send/verify endpoints AND the final
// registration endpoint. The frontend has its own copy of this regex for instant
// UX feedback, but the browser can be bypassed — this server-side check is the
// one that actually counts.
const STUDENT_EMAIL_REGEX = /^[^\s@]+@nitp\.ac\.in$/i;

// Normalize the way Mongoose stores email/loginId (trimmed + lowercased) so
// comparisons and uniqueness checks line up.
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isValidStudentEmail = (email) => STUDENT_EMAIL_REGEX.test(normalizeEmail(email));

module.exports = { STUDENT_EMAIL_REGEX, normalizeEmail, isValidStudentEmail };
