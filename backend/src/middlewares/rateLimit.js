const rateLimit = require('express-rate-limit');

// Credential-checking endpoints: 10 attempts / 15 min / IP; successes don't count.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only failed attempts burn the budget
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many registration attempts. Please try again later.' },
});

// Per-IP backstop against email spam; the per-email 60s cooldown lives in the controller. Every send counts.
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many code requests. Please wait a few minutes and try again.' },
});

module.exports = { authLimiter, registerLimiter, otpLimiter };
