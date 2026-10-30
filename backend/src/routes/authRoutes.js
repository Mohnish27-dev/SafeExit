const express = require('express');
const router = express.Router();
const {
  registerUser,
  authUser,
  googleLogin,
  getGoogleConfig,
  getUserProfile,
  updateUserProfile,
  getHostelContact,
  logoutUser,
  refreshSession,
} =require('../controllers/authController');
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
// Wardens and the Chief Warden: college Google account only (see utils/googleIdToken.js).
router.get('/google/config', getGoogleConfig);
router.post('/google', authLimiter, googleLogin);
router.post('/logout', logoutUser);
router.post('/refresh', protect, refreshSession);
router.get('/profile', protect, getUserProfile);
// Returns the caretaker's name + phone for the student's hostel (and wardens).
router.get('/hostel-contact', protect, getHostelContact);
// profileLimiter because this is the 2mb-body photo endpoint, per-user keyed.
router.patch('/profile', protect, profileLimiter, updateUserProfile);

module.exports = router;
