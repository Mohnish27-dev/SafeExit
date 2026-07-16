const jwt = require('jsonwebtoken');

// Cookie flags come from explicit env vars (COOKIE_SAMESITE / COOKIE_SECURE), not NODE_ENV guesswork — Secure=true over plain HTTP drops the cookie and silently kills SSE auth (EventSource can't send a Bearer header).
const parseCookieOptions = () => {
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();

  let secure;
  if (process.env.COOKIE_SECURE !== undefined) {
    secure = process.env.COOKIE_SECURE === 'true';
  } else {
    secure = process.env.NODE_ENV === 'production';
  }

  // Browsers reject SameSite=None without Secure.
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
