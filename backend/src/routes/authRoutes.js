const express = require('express');
const router = express.Router();
const {
  registerUser,
  authUser,
  getUserProfile,
  updateUserProfile,
  logoutUser,
  refreshSession,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication
} = require('../controllers/authController');
const { sendOtp, verifyOtp } = require('../controllers/otpController');
const {
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
} = require('../controllers/passwordResetController');
const { protect } = require('../middlewares/authMiddleware');
const { authLimiter, registerLimiter, otpLimiter } = require('../middlewares/rateLimit');

// Email verification for student self-registration (must precede /register).
router.post('/otp/send', otpLimiter, sendOtp);
router.post('/otp/verify', authLimiter, verifyOtp);

// Password recovery for students who forgot their password (and thus their device
// Quick Login PIN, which just caches that password). Same OTP-by-email design as
// registration: forgot (send code) → verify-otp (check code) → reset (set new
// password + sign in). `forgot` sends mail so it uses the OTP send limiter;
// `verify-otp` and `reset` are credential checks so they use authLimiter.
router.post('/password/forgot', otpLimiter, requestPasswordReset);
router.post('/password/verify-otp', authLimiter, verifyResetOtp);
router.post('/password/reset', authLimiter, resetPassword);

router.post('/register', registerLimiter, registerUser);
router.post('/login', authLimiter, authUser);
router.post('/logout', logoutUser);
// Silent session restore from the httpOnly cookie (see refreshSession). Behind
// `protect` — an invalid/expired cookie simply 401s and the client falls back
// to the normal login flow.
router.post('/refresh', protect, refreshSession);
router.get('/profile', protect, getUserProfile);
router.patch('/profile', protect, updateUserProfile);

// WebAuthn registration (requires an authenticated session to bind the passkey to)
router.post('/webauthn/register/options', protect, getRegistrationOptions);
router.post('/webauthn/register/verify', protect, verifyRegistration);

// WebAuthn login (public — security comes from the signed challenge, not the session)
// Rate-limit the challenge issuer to blunt account-probing.
router.post('/webauthn/login/options', authLimiter, getAuthenticationOptions);
router.post('/webauthn/login/verify', verifyAuthentication);

module.exports = router;
