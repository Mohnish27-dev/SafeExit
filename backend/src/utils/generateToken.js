const jwt = require('jsonwebtoken');

// Cookie security flags are driven by EXPLICIT env vars, not NODE_ENV guesswork.
//
// Why the old `secure: NODE_ENV !== 'development'` was a footgun:
//  - It sets Secure=true whenever NODE_ENV is anything other than 'development'
//    — INCLUDING when NODE_ENV is unset. Over plain HTTP the browser then drops
//    the cookie entirely. The SSE stream (warden/guard/SOS live dashboards) can
//    only authenticate via this cookie — an EventSource can't attach a Bearer
//    header — so it silently 401s and the dashboards go dark with no clear cause.
//  - `sameSite:'strict'` stops the cookie from being sent on cross-site requests,
//    breaking any frontend served from a different site than the API.
//
// Defaults chosen so the common case just works:
//  - sameSite = 'lax'  (sent on same-site requests and top-level navigations)
//  - secure   = true only in production (NODE_ENV === 'production')
// Override per deployment with COOKIE_SAMESITE / COOKIE_SECURE. A cross-site
// frontend needs COOKIE_SAMESITE=none, which browsers require be paired with
// Secure — so we force secure=true in that case regardless of COOKIE_SECURE.
const parseCookieOptions = () => {
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();

  let secure;
  if (process.env.COOKIE_SECURE !== undefined) {
    secure = process.env.COOKIE_SECURE === 'true';
  } else {
    secure = process.env.NODE_ENV === 'production';
  }

  // SameSite=None without Secure is rejected by browsers, so enforce it.
  if (sameSite === 'none') {
    secure = true;
  }

  return { sameSite, secure };
};

const generateToken = (res, userId) => {
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

  const { sameSite, secure } = parseCookieOptions();

  res.cookie('jwt', token, {
    httpOnly: true,
    secure,
    sameSite,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });

  return token;
};

module.exports = generateToken;
