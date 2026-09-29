const { normalizeEmail } = require('./emailPolicy');

// Admin access allowlist — the real security boundary for the admin console.
//
// The admin console is opened by exactly one college Google account. It used to be a
// name + Admin ID + PIN read from backend/.env; anyone who saw that file (or a copy of
// it) could sign in from any device. A Google sign-in cannot be replayed that way.
//
// The address lives here, in code, and deliberately NOT in .env: adding an administrator
// should take a reviewed commit, not a line in a file that gets copied between machines.
const ADMIN_EMAILS = Object.freeze(['safeexit@nitp.ac.in']);

const isAdminEmail = (email) => ADMIN_EMAILS.includes(normalizeEmail(email));

module.exports = { ADMIN_EMAILS, isAdminEmail };
