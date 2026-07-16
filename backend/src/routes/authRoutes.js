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

router.post('/otp/send', otpLimiter, sendOtp);
router.post('/otp/verify', authLimiter, verifyOtp);

// forgot sends mail (otpLimiter); verify-otp/reset are credential checks (authLimiter).
router.post('/password/forgot', otpLimiter, requestPasswordReset);
router.post('/password/verify-otp', authLimiter, verifyResetOtp);
router.post('/password/reset', authLimiter, resetPassword);

router.post('/register', registerLimiter, registerUser);
router.post('/login', authLimiter, authUser);
router.post('/logout', logoutUser);
router.post('/refresh', protect, refreshSession);
router.get('/profile', protect, getUserProfile);
router.patch('/profile', protect, updateUserProfile);

router.post('/webauthn/register/options', protect, getRegistrationOptions);
router.post('/webauthn/register/verify', protect, verifyRegistration);

// Login is public — security comes from the signed challenge; limiter blunts account-probing.
router.post('/webauthn/login/options', authLimiter, getAuthenticationOptions);
router.post('/webauthn/login/verify', verifyAuthentication);

module.exports = router;
