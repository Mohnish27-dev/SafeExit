const express = require('express');
const router = express.Router();
const {
  registerUser,
  authUser,
  getUserProfile,
  logoutUser,
  registerWebAuthn,
  verifyWebAuthnLogin
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

// WebAuthn — simple mock flow (used by the student & warden pages)
router.post('/webauthn/register', protect, registerWebAuthn);
router.post('/webauthn/verify', verifyWebAuthnLogin);

// WebAuthn — real passkey flow (used by the security guard page)
router.post('/webauthn/register/options', protect, getRegistrationOptions);
router.post('/webauthn/register/verify', protect, verifyRegistration);
router.post('/webauthn/login/options', getLoginOptions);
router.post('/webauthn/login/verify', verifyLogin);

module.exports = router;
