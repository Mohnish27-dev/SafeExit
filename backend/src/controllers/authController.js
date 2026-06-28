const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// Relying Party config. In dev these default to localhost:3000 (the frontend origin).
// In production set RP_ID / RP_ORIGIN to your real domain (e.g. RP_ID=safeexit.app,
// RP_ORIGIN=https://safeexit.app). RP_ORIGIN must be where navigator.credentials runs.
const rpName = process.env.RP_NAME || 'SafeExit';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.RP_ORIGIN || 'http://localhost:3000';

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  const { name, email, password, role, studentId, roomNumber, department, year, phoneNumber } = req.body;

  try {
    const userExists = await User.findOne({ email });

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name, email, password, role, studentId, roomNumber, department, year, phoneNumber
    });

    if (user) {
      const token = generateToken(res, user._id);
      res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        webAuthnRegistered: user.webAuthnRegistered,
        token
      });
    } else {
      res.status(400).json({ message: 'Invalid user data' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Auth user & get token
// @route   POST /api/auth/login
// @access  Public
const authUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      const token = generateToken(res, user._id);

      // Mark guards as on duty the moment they sign in, and stamp activity for
      // staff so the admin overview reflects who is currently active.
      if (['Guard', 'Warden', 'Admin'].includes(user.role)) {
        user.lastActiveAt = new Date();
        if (user.role === 'Guard') user.onDuty = true;
        await user.save();
      }

      res.json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        webAuthnRegistered: user.webAuthnRegistered,
        token
      });
    } else {
      res.status(401).json({ message: 'Invalid email or password' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      roomNumber: user.roomNumber,
      department: user.department,
      year: user.year,
      phoneNumber: user.phoneNumber,
      webAuthnRegistered: user.webAuthnRegistered
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Logout user / clear cookie
// @route   POST /api/auth/logout
// @access  Public
const logoutUser = (req, res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: 'Logged out successfully' });
};

// --- WebAuthn / FIDO2 (real verification via @simplewebauthn/server) ---
//
// A WebAuthn ceremony is two round-trips:
//   1. /options  — server issues a random challenge the authenticator must sign
//   2. /verify   — server cryptographically verifies the signed response
// The challenge is stashed on the user document between the two calls and cleared
// immediately after verification, so it can be used exactly once.

// @desc    Begin passkey registration: issue challenge + creation options
// @route   POST /api/auth/webauthn/register/options
// @access  Private (must be logged in via password/JWT first)
const getRegistrationOptions = async (req, res) => {
  try {
    console.log('WebAuthn register called, user ID:', req.user?._id);
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: user.name,
      // Stable per-user handle so re-registration maps to the same account.
      userID: new TextEncoder().encode(user._id.toString()),
      attestationType: 'none',
      // Stop the user re-registering a credential they already have.
      excludeCredentials: user.webAuthnCredentials.map((c) => ({
        id: c.credentialID,
        transports: c.transports,
      })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    user.currentChallenge = options.challenge;
    await user.save();
    res.json(options);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Finish passkey registration: verify attestation, store the credential
// @route   POST /api/auth/webauthn/register/verify
// @access  Private
const verifyRegistration = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.currentChallenge) {
      return res.status(400).json({ message: 'No registration in progress' });
    }

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: req.body,
        expectedChallenge: user.currentChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const { verified, registrationInfo } = verification;
    if (!verified || !registrationInfo) {
      return res.status(400).json({ message: 'Registration could not be verified' });
    }

    const { credential } = registrationInfo;
    // Guard against storing the same credential twice.
    const exists = user.webAuthnCredentials.some((c) => c.credentialID === credential.id);
    if (!exists) {
      user.webAuthnCredentials.push({
        credentialID: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
      });
    }
    user.webAuthnRegistered = true;
    user.currentChallenge = undefined;
    await user.save();

    res.json({ verified: true, webAuthnRegistered: true });
  } catch (error) {
    console.error('WebAuthn registration error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Begin passkey login: issue challenge scoped to the user's credentials
// @route   POST /api/auth/webauthn/login/options
// @access  Public
const getAuthenticationOptions = async (req, res) => {
  const { email } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !user.webAuthnRegistered || user.webAuthnCredentials.length === 0) {
      return res.status(404).json({ message: 'No passkey registered for this account' });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.webAuthnCredentials.map((c) => ({
        id: c.credentialID,
        transports: c.transports,
      })),
      userVerification: 'preferred',
    });

    user.currentChallenge = options.challenge;
    await user.save();
    res.json(options);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Finish passkey login: verify the signed assertion, then issue a JWT
// @route   POST /api/auth/webauthn/login/verify
// @access  Public
const verifyAuthentication = async (req, res) => {
  const { email, response } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !user.currentChallenge) {
      return res.status(400).json({ message: 'No login in progress for this account' });
    }

    // The assertion names which stored credential signed it.
    const cred = user.webAuthnCredentials.find((c) => c.credentialID === response?.id);
    if (!cred) {
      return res.status(400).json({ message: 'Credential not recognized' });
    }

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: user.currentChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
        credential: {
          id: cred.credentialID,
          publicKey: new Uint8Array(cred.publicKey),
          counter: cred.counter,
          transports: cred.transports,
        },
      });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }

    const { verified, authenticationInfo } = verification;
    if (!verified) {
      return res.status(401).json({ message: 'Biometric verification failed' });
    }

    // Replay protection: persist the authenticator's monotonically increasing counter.
    cred.counter = authenticationInfo.newCounter;
    user.currentChallenge = undefined;
    // Reflect live duty/activity for staff signing in via passkey.
    if (['Guard', 'Warden', 'Admin'].includes(user.role)) {
      user.lastActiveAt = new Date();
      if (user.role === 'Guard') user.onDuty = true;
    }
    await user.save();

    const token = generateToken(res, user._id);
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      webAuthnRegistered: user.webAuthnRegistered,
      token,
    });
  } catch (error) {
    console.error('WebAuthn login error:', error);
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  registerUser,
  authUser,
  getUserProfile,
  logoutUser,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
};
