const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { normalizeEmail } = require('../config/emailPolicy');

// ---- Key generators ----
//
// WHY THE ONBOARDING LIMITERS ARE NOT KEYED ON IP: in production the browser talks to
// getApiBase() === '/api/backend', which next.config.mjs rewrites to this backend. That
// rewrite is http-proxy and does NOT set X-Forwarded-For (it sets x-forwarded-host only,
// and never passes xfwd:true). So whatever XFF arrives came from the host nginx, and this
// repo carries no nginx config to prove that hop exists. With app.set('trust proxy', 1),
// if nginx doesn't set XFF then req.ip collapses to the Next container's IP for EVERY
// student on campus, and a 20/hour registration cap becomes 20/hour campus-wide. Campus
// NAT collapses the same buckets legitimately even when nginx is correct.
//
// Anything keyed on an email or a signed token is immune to that whole question, so the
// onboarding-critical limiters use those. GET /api/_diag/ip (routes/diagRoutes.js, gated
// on DIAG_TOOLS=1) is how you measure the real req.ip before touching the IP-keyed ones.

const perUserKey = (req) =>
  req.user?._id ? `user:${req.user._id}` : ipKeyGenerator(req.ip);

// The mailbox being spammed is the thing worth protecting, and it is stable across every
// network path. Falls back to IP when the body carries no usable email (garbage requests).
const perEmailKey = (req) => {
  const email = normalizeEmail(req.body?.email);
  return email ? `email:${email}` : ipKeyGenerator(req.ip);
};

// Registration is reached only with an OTP-verified token, so bucket on the mailbox that
// token proves. The signature is checked here so a forged token can't mint unlimited
// buckets; the purpose/expiry checks stay in the controller, which is the real gate.
// Any token of ours carrying `email` is email-derived (session tokens carry `id`), so no
// purpose check is needed just to pick a bucket.
const perVerifiedEmailKey = (req) => {
  const token = req.body?.emailVerificationToken;
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      if (payload?.email) return `email:${normalizeEmail(payload.email)}`;
    } catch {
      // Forged, expired or malformed — falls through to the IP bucket below.
    }
  }
  return ipKeyGenerator(req.ip);
};

const common = { standardHeaders: true, legacyHeaders: false };

// ---- Credential checks: still IP-keyed, deliberately ----
//
// Login has no verified identity to key on yet. Keying on the submitted loginId would let
// anyone lock a named student out for 15 minutes by burning their budget, which is worse
// than the NAT collapse. Measure with /api/_diag/ip before changing this one.
const authLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true, // only failed attempts burn the budget
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
});

// ---- Registration ----

// Per verified mailbox. A student needs 2-3 attempts at most; 10 absorbs retries after a
// validation error without letting one mailbox grind the endpoint.
const registerLimiter = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: 10,
  keyGenerator: perVerifiedEmailKey,
  message: { message: 'Too many registration attempts for this email. Please try again later.' },
});

// Coarse backstop only. The ceiling is high on purpose: it must not be the thing that
// stops a hostel onboarding together, so it is sized to catch a script, not a crowd.
const registerIpBackstop = rateLimit({
  ...common,
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_IP_MAX) || 300,
  message: { message: 'Too many registration attempts from this network. Please try again later.' },
});

// ---- OTP / password-reset mail ----

// Per mailbox. Stacks with the 60s per-email resend cooldown in
// controllers/otpController.js, which is what stops rapid-fire inbox spam.
const otpLimiter = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyGenerator: perEmailKey,
  message: { message: 'Too many code requests for this email. Please wait a few minutes and try again.' },
});

// Bounds total outbound mail from one apparent network, since per-email keying alone lets
// an attacker rotate addresses. High ceiling for the same reason as registerIpBackstop.
const otpIpBackstop = rateLimit({
  ...common,
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.OTP_IP_MAX) || 200,
  message: { message: 'Too many code requests from this network. Please wait a few minutes and try again.' },
});

// ---- Authenticated endpoints: per-user, unaffected by the proxy question ----

const sosLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: perUserKey,
  message: { message: 'Too many SOS alerts in a short time. If this is a real emergency, call campus security directly.' },
});

const createLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: perUserKey,
  message: { message: 'Too many requests in a short time. Please wait a moment and try again.' },
});

// PATCH /auth/profile accepts a ~1.5MB base64 photo under express.json({limit:'2mb'}), so
// N concurrent uploads buffer N x 2MB of heap. It was the least-protected heavy endpoint
// on the app, and it is hit hardest during the mass-registration window.
const profileLimiter = rateLimit({
  ...common,
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: perUserKey,
  message: { message: 'Too many profile updates in a short time. Please wait a moment and try again.' },
});

module.exports = {
  authLimiter,
  registerLimiter,
  registerIpBackstop,
  otpLimiter,
  otpIpBackstop,
  sosLimiter,
  createLimiter,
  profileLimiter,
};
