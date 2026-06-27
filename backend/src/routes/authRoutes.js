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
const {
  getRegistrationOptions,
  verifyRegistration,
  getLoginOptions,
  verifyLogin
} = require('../controllers/webauthnController');
const { protect } = require('../middlewares/authMiddleware');

router.post('/register', registerUser);
router.post('/login', authUser);
router.post('/logout', logoutUser);
router.get('/profile', protect, getUserProfile);

// WebAuthn registration (requires an authenticated session to bind the passkey to)
router.post('/webauthn/register/options', protect, getRegistrationOptions);
router.post('/webauthn/register/verify', protect, verifyRegistration);

// WebAuthn login (public — security comes from the signed challenge, not the session)
router.post('/webauthn/login/options', getAuthenticationOptions);
router.post('/webauthn/login/verify', verifyAuthentication);

// WebAuthn — real passkey flow (used by the security guard page)
router.post('/webauthn/register/options', protect, getRegistrationOptions);
router.post('/webauthn/register/verify', protect, verifyRegistration);
router.post('/webauthn/login/options', getLoginOptions);
router.post('/webauthn/login/verify', verifyLogin);

module.exports = router;
