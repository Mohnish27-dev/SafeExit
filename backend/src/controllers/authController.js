const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { isAllowedAdminLoginId } = require('../config/adminAllowlist');
const { isValidStudentEmail, normalizeEmail } = require('../config/emailPolicy');
const { isEmailVerificationValid } = require('./otpController');

// Every account is keyed on a single canonical identifier: `loginId`.
//   - Students: their real @nitp.ac.in email.
//   - Staff (Warden/Guard/Admin): their normalized staff ID (e.g. "wdn001").
// Staff therefore no longer need a fabricated "*.safeexit.local" email just to
// have a unique handle. Callers may still send the old `email` field; we accept
// it as a legacy alias. Returns a normalized (trimmed, lowercased) key.
const resolveLoginId = (body = {}) =>
  (body.loginId || body.email || '').trim().toLowerCase();

// Look a user up by their canonical loginId, falling back to a legacy `email`
// match so accounts created before this field existed still resolve.
const findByLoginId = (key) =>
  User.findOne({ $or: [{ loginId: key }, { email: key }] });

// Escape a user-supplied string so it can be embedded in a RegExp literal without
// being interpreted as regex metacharacters (ReDoS / injection safety).
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Password-login lookup. Beyond loginId/email, students may also sign in with
// their ROLL NUMBER, which is stored in `studentId` (as entered, so match it
// case-insensitively). This lets a student type the roll number they know instead
// of their full college email. Only used by authUser — the WebAuthn/staff paths
// keep the stricter findByLoginId.
const findByIdentifier = async (rawKey) => {
  const key = String(rawKey || '').trim().toLowerCase();
  if (!key) return null;
  return (
    (await User.findOne({ $or: [{ loginId: key }, { email: key }] })) ||
    (await User.findOne({ studentId: new RegExp(`^${escapeRegex(String(rawKey).trim())}$`, 'i') }))
  );
};
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
  const { name, email, password, role, studentId, roomNumber, department, year, phoneNumber, gender, emailVerificationToken } = req.body;

  try {
    // Privileged roles are NEVER self-registered through this public endpoint.
    // Only Students may self-register (and they verify a real @nitp.ac.in email).
    //   - Admins are pre-provisioned from the ADMIN_*_ allowlist in the (gitignored)
    //     .env via `npm run seed:admins` / ensureAdmins on boot.
    //   - Wardens and Guards are provisioned at runtime by an admin from the
    //     dashboard (POST /api/admin/staff).
    // This closes the hole where anyone could POST role:'Warden' / 'Guard' and
    // instantly gain staff powers — approving outings, reading student data, or
    // authorising gate exits — just by opening the staff login page.
    if (['Admin', 'Warden', 'Guard'].includes(role)) {
      return res.status(403).json({
        message: `${role} accounts cannot be self-registered. Contact an administrator to be provisioned.`,
      });
    }

    // Students may only register with a real, VERIFIED @nitp.ac.in email. Both
    // checks run server-side because the browser form can be bypassed with a
    // direct API call — which is exactly how the "make a second account from a
    // personal Gmail" bypass would work.
    //   1. Domain check: the address must be a college email.
    //   2. Verification check: they must present the short-lived token minted by
    //      /otp/verify for THIS email, proving they actually control the inbox.
    // Together these guarantee one real student = one account (the DB's unique
    // email index is the final backstop).
    if (role === 'Student') {
      if (!isValidStudentEmail(email)) {
        return res.status(400).json({ message: 'Please use your college email ending in @nitp.ac.in.' });
      }
      if (!isEmailVerificationValid(emailVerificationToken, email)) {
        return res.status(403).json({ message: 'Please verify your college email with the code we sent before continuing.' });
      }
      // The password is the student's login secret and must be a REAL secret they
      // choose — never the (public) roll number. Enforce a minimum length here so
      // the browser check can't be bypassed with a direct API call.
      if (!password || String(password).length < 6) {
        return res.status(400).json({ message: 'Please choose a password with at least 6 characters.' });
      }
      if (!['Male', 'Female', 'Other'].includes(gender)) {
        return res.status(400).json({ message: 'Please select your gender.' });
      }
    }

    // Canonical account key. Students identify with their real email; staff
    // (Warden/Guard) identify with their staff ID (sent as studentId). Either
    // way we settle on one normalized loginId — no synthetic email required.
    const loginId = resolveLoginId(req.body) || (studentId || '').trim().toLowerCase();
    if (!loginId) {
      return res.status(400).json({ message: 'A login identifier (email or ID) is required.' });
    }

    const userExists = await findByLoginId(loginId);

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Only students carry a real email. For staff we leave it unset so the DB
    // never stores a fabricated "*.safeexit.local" address.
    const realEmail = role === 'Student' ? (email || '').trim().toLowerCase() : undefined;

    const user = await User.create({
      name, loginId, email: realEmail, password, role,
      studentId, roomNumber, department, year, phoneNumber,
      gender: role === 'Student' ? gender : undefined,
    });

    if (user) {
      const token = generateToken(res, user._id);
      res.status(201).json({
        _id: user._id,
        name: user.name,
        loginId: user.loginId,
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
  const { password } = req.body;

  try {
    // Students may authenticate with either their college email or their roll
    // number; staff with their loginId. The secret is a real, user-chosen
    // password (roll number is public and is NOT a valid secret).
    const user = await findByIdentifier(req.body.loginId || req.body.email);

    if (user && (await user.matchPassword(password))) {
      // Even with valid credentials, only allowlisted admins may use an Admin account.
      if (user.role === 'Admin' && !isAllowedAdminLoginId(user.loginId)) {
        return res.status(403).json({ message: 'This account is not authorized for admin access.' });
      }

      // PIN login for an admin is a ONE-TIME bootstrap to attach the first
      // passkey to a device. Once a passkey exists, the PIN is no longer a valid
      // way in — the registered hardware authenticator becomes the required
      // factor, so a leaked/guessed PIN alone cannot sign in.
      if (user.role === 'Admin' && user.webAuthnRegistered) {
        return res.status(403).json({
          message:
            'This admin already has a passkey. Please sign in with your fingerprint / device passkey instead of the PIN.',
        });
      }

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
        loginId: user.loginId,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        webAuthnRegistered: user.webAuthnRegistered,
        token
      });
    } else {
      res.status(401).json({ message: 'Invalid credentials' });
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
      loginId: user.loginId,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      roomNumber: user.roomNumber,
      department: user.department,
      year: user.year,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      webAuthnRegistered: user.webAuthnRegistered
    });
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// @desc    Update the logged-in student's own profile (currently: gender only,
//          to backfill accounts created before the field existed)
// @route   PATCH /api/auth/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  const { gender } = req.body;

  if (!['Male', 'Female', 'Other'].includes(gender)) {
    return res.status(400).json({ message: 'Please select a valid gender.' });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.gender = gender;
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      loginId: user.loginId,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      roomNumber: user.roomNumber,
      department: user.department,
      year: user.year,
      phoneNumber: user.phoneNumber,
      gender: user.gender,
      webAuthnRegistered: user.webAuthnRegistered,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
      // Label shown in the OS/browser passkey manager. Use the canonical loginId
      // (email for students, staff ID for staff) — never a fabricated address.
      userName: user.loginId || user.email || user.studentId,
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
  const loginId = resolveLoginId(req.body);
  try {
    const user = await findByLoginId(loginId);
    if (!user || !user.webAuthnRegistered || user.webAuthnCredentials.length === 0) {
      return res.status(404).json({ message: 'No passkey registered for this account' });
    }
    // Block passkey login for any Admin account outside the allowlist.
    if (user.role === 'Admin' && !isAllowedAdminLoginId(user.loginId)) {
      return res.status(403).json({ message: 'This account is not authorized for admin access.' });
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
  const { response } = req.body;
  const loginId = resolveLoginId(req.body);
  try {
    const user = await findByLoginId(loginId);
    if (!user || !user.currentChallenge) {
      return res.status(400).json({ message: 'No login in progress for this account' });
    }
    // Block passkey login for any Admin account outside the allowlist.
    if (user.role === 'Admin' && !isAllowedAdminLoginId(user.loginId)) {
      return res.status(403).json({ message: 'This account is not authorized for admin access.' });
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
      loginId: user.loginId,
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
  updateUserProfile,
  logoutUser,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
};
