const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// --- Relying Party (RP) configuration ---
// rpID must be a registrable domain suffix of the page origin. On localhost the
// page is served from http://localhost:3000, so rpID is "localhost".
const rpName = process.env.RP_NAME || 'SafeExit';
const rpID = process.env.RP_ID || 'localhost';
// The browser-visible origin the passkey ceremony runs on (the Next.js frontend).
const expectedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';

// @desc    Begin passkey registration — issue a creation challenge
// @route   POST /api/auth/webauthn/register/options
// @access  Private (needs a JWT from register/login)
const getRegistrationOptions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userID: new TextEncoder().encode(user._id.toString()),
      attestationType: 'none',
      // Don't let the user register the same authenticator twice.
      excludeCredentials: (user.webAuthnCredentials || []).map((cred) => ({
        id: cred.credentialID,
        transports: cred.transports,
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
    console.error('WebAuthn registration options error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Finish passkey registration — verify the attestation and store the credential
// @route   POST /api/auth/webauthn/register/verify
// @access  Private
const verifyRegistration = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!user.currentChallenge) {
      return res.status(400).json({ message: 'No registration challenge in progress' });
    }

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: user.currentChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ verified: false, message: 'Passkey could not be verified' });
    }

    const { credential } = verification.registrationInfo;

    user.webAuthnCredentials.push({
      credentialID: credential.id,
      credentialPublicKey: Buffer.from(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || [],
    });
    user.webAuthnRegistered = true;
    user.currentChallenge = undefined;
    await user.save();

    res.json({ verified: true });
  } catch (error) {
    console.error('WebAuthn registration verify error:', error);
    res.status(400).json({ verified: false, message: error.message });
  }
};

// @desc    Begin passkey login — issue an authentication challenge for an account
// @route   POST /api/auth/webauthn/login/options
// @access  Public
const getLoginOptions = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.webAuthnCredentials || user.webAuthnCredentials.length === 0) {
      return res.status(404).json({ message: 'No passkey registered for this account' });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: user.webAuthnCredentials.map((cred) => ({
        id: cred.credentialID,
        transports: cred.transports,
      })),
      userVerification: 'preferred',
    });

    user.currentChallenge = options.challenge;
    await user.save();

    res.json(options);
  } catch (error) {
    console.error('WebAuthn login options error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Finish passkey login — verify the assertion and issue a session token
// @route   POST /api/auth/webauthn/login/verify
// @access  Public
const verifyLogin = async (req, res) => {
  try {
    const { email, response } = req.body;
    const user = await User.findOne({ email });
    if (!user || !user.currentChallenge) {
      return res.status(400).json({ message: 'No login challenge in progress' });
    }

    const dbCred = user.webAuthnCredentials.find((c) => c.credentialID === response.id);
    if (!dbCred) {
      return res.status(400).json({ message: 'Passkey not recognised for this account' });
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: user.currentChallenge,
      expectedOrigin,
      expectedRPID: rpID,
      requireUserVerification: false,
      credential: {
        id: dbCred.credentialID,
        publicKey: new Uint8Array(dbCred.credentialPublicKey),
        counter: dbCred.counter,
        transports: dbCred.transports,
      },
    });

    if (!verification.verified) {
      return res.status(401).json({ message: 'Passkey verification failed' });
    }

    // Persist the new signature counter (replay protection) and clear the challenge.
    dbCred.counter = verification.authenticationInfo.newCounter;
    user.currentChallenge = undefined;
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
    console.error('WebAuthn login verify error:', error);
    res.status(401).json({ message: error.message });
  }
};

module.exports = {
  getRegistrationOptions,
  verifyRegistration,
  getLoginOptions,
  verifyLogin,
};
