// Single source of truth for "what counts as a real student email".
// One unique @nitp.ac.in mailbox per student enforces one-human-one-account;
// applied by OTP send/verify AND registration (frontend copy is UX-only).
const STUDENT_EMAIL_REGEX = /^[^\s@]+@nitp\.ac\.in$/i;

// Match Mongoose storage (trimmed + lowercased) so comparisons line up.
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const isValidStudentEmail = (email) => STUDENT_EMAIL_REGEX.test(normalizeEmail(email));

module.exports = { normalizeEmail, isValidStudentEmail };
