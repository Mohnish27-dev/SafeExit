const express = require('express');
const router = express.Router();
const {
  registerUser,
  authUser,
  getUserProfile,
  logoutUser,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication
} = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');
const { authLimiter, registerLimiter } = require('../middlewares/rateLimit');

router.post('/register', registerLimiter, registerUser);
router.post('/login', authLimiter, authUser);
router.post('/logout', logoutUser);
router.get('/profile', protect, getUserProfile);

// WebAuthn registration (requires an authenticated session to bind the passkey to)
router.post('/webauthn/register/options', protect, getRegistrationOptions);
router.post('/webauthn/register/verify', protect, verifyRegistration);

// WebAuthn login (public — security comes from the signed challenge, not the session)
// Rate-limit the challenge issuer to blunt account-probing.
router.post('/webauthn/login/options', authLimiter, getAuthenticationOptions);
router.post('/webauthn/login/verify', verifyAuthentication);

module.exports = router;
