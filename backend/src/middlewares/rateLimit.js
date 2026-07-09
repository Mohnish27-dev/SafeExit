const rateLimit = require('express-rate-limit');

// ---------------------------------------------------------------------------
// Brute-force protection for the auth endpoints
// ---------------------------------------------------------------------------
// A short PIN with unlimited guesses is trivially crackable. These limiters cap
// how many attempts a single IP can make in a window, so an attacker cannot spray
// thousands of PINs. Successful requests don't count against the limit, so a
// legitimate admin who logs in cleanly is never throttled.

// Tight limit for credential-checking endpoints (login, admin bootstrap,
// passkey challenge). 10 attempts / 15 min / IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts burn the budget
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
});

// Slightly looser limit for account creation to blunt automated signup abuse.
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Please try again later.' },
});

// OTP delivery is an email-spam vector if left open (each call sends mail to an
// inbox), so cap sends per IP. The per-email 60s cooldown lives in the controller;
// this is the coarser per-IP backstop. Every send counts, successful or not.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many code requests. Please wait a few minutes and try again.' },
});

module.exports = { authLimiter, registerLimiter, otpLimiter };
