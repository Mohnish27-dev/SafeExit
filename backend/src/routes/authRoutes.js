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
const { protect } = require('../middlewares/authMiddleware');

router.post('/register', registerUser);
router.post('/login', authUser);
router.post('/logout', logoutUser);
router.get('/profile', protect, getUserProfile);

// WebAuthn routes
router.post('/webauthn/register', protect, registerWebAuthn);
router.post('/webauthn/verify', verifyWebAuthnLogin);

module.exports = router;
