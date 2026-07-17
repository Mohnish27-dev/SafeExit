const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const perUserKey = (req) =>
  req.user?._id ? `user:${req.user._id}` : ipKeyGenerator(req.ip);

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


const sosLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  message: { message: 'Too many SOS alerts in a short time. If this is a real emergency, call campus security directly.' },
});

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: perUserKey,
  message: { message: 'Too many requests in a short time. Please wait a moment and try again.' },
});

module.exports = { authLimiter, registerLimiter, otpLimiter, sosLimiter, createLimiter };
