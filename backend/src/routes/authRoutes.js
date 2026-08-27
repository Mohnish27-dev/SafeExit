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
const {
  authLimiter,
  registerLimiter,
  registerIpBackstop,
  otpLimiter,
  otpIpBackstop,
  profileLimiter,
} = require('../middlewares/rateLimit');

// The mail-sending and registration routes carry two limiters each: a coarse per-IP
// backstop, then the real per-email/per-verified-token one. Order matters only for which
// message the caller sees first; see middlewares/rateLimit.js for why the precise limit
// cannot be keyed on IP here.
router.post('/otp/send', otpIpBackstop, otpLimiter, sendOtp);
router.post('/otp/verify', authLimiter, verifyOtp);

// forgot sends mail (otpLimiter); verify-otp/reset are credential checks (authLimiter).
router.post('/password/forgot', otpIpBackstop, otpLimiter, requestPasswordReset);
router.post('/password/verify-otp', authLimiter, verifyResetOtp);
router.post('/password/reset', authLimiter, resetPassword);

router.post('/register', registerIpBackstop, registerLimiter, registerUser);
router.post('/login', authLimiter, authUser);
router.post('/logout', logoutUser);
router.post('/refresh', protect, refreshSession);
router.get('/profile', protect, getUserProfile);
// profileLimiter because this is the 2mb-body photo endpoint, per-user keyed.
router.patch('/profile', protect, profileLimiter, updateUserProfile);

router.post('/webauthn/register/options', protect, getRegistrationOptions);
router.post('/webauthn/register/verify', protect, verifyRegistration);

// Login is public — security comes from the signed challenge; limiter blunts account-probing.
router.post('/webauthn/login/options', authLimiter, getAuthenticationOptions);
router.post('/webauthn/login/verify', verifyAuthentication);

module.exports = router;
