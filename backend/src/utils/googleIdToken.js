const { OAuth2Client } = require('google-auth-library');
const { isCollegeEmail, normalizeEmail } = require('../config/emailPolicy');

// Wardens and the Chief Warden are professors with their own @nitp.ac.in mailbox, so they
// sign in with Google instead of an admin-issued ID + PIN. A PIN can be read off a
// shoulder or a WhatsApp forward and replayed from any phone; a Google sign-in cannot.
// These roles are Google-ONLY: authController refuses password and passkey login for them.
const GOOGLE_SIGNIN_ROLES = ['Warden', 'ChiefWarden'];

const clientId = () => (process.env.GOOGLE_CLIENT_ID || '').trim();

let client = null;
const getClient = () => {
  if (!client) client = new OAuth2Client();
  return client;
};

const fail = (status, message) => Object.assign(new Error(message), { statusCode: status });

// Verifies a Google Identity Services ID token and returns the college email it proves.
//
// verifyIdToken checks the signature against Google's published keys, the issuer, the
// expiry, and — the part that matters most — that the token was minted for OUR client ID.
// Without the audience check, a token from any other site's "Sign in with Google" would
// be accepted here.
//
// The email is the whole identity. It is only trusted when Google says it verified it,
// and it must be on the college domain. `hd` is not required: it is present only when
// nitp.ac.in is a Google Workspace domain, and the allowlist lookup that follows (an
// account an admin provisioned for exactly this address) is the real boundary anyway.
const verifyGoogleCredential = async (credential) => {
  const audience = clientId();
  if (!audience) {
    throw fail(503, 'Google sign-in is not configured on the server. Contact the administrator.');
  }
  if (!credential || typeof credential !== 'string') {
    throw fail(400, 'Missing Google credential.');
  }

  let payload;
  try {
    const ticket = await getClient().verifyIdToken({ idToken: credential, audience });
    payload = ticket.getPayload();
  } catch {
    throw fail(401, 'Google sign-in could not be verified. Please try again.');
  }

  const email = normalizeEmail(payload?.email);
  if (!email || payload.email_verified !== true) {
    throw fail(401, 'Your Google account email is not verified.');
  }
  if (!isCollegeEmail(email)) {
    throw fail(403, 'Please sign in with your college Google account ending in @nitp.ac.in.');
  }

  return { email, name: payload.name || '' };
};

module.exports = { GOOGLE_SIGNIN_ROLES, verifyGoogleCredential, googleClientId: clientId };
