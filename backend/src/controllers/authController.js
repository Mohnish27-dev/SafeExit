const { Op } = require('sequelize');
const { sequelize, User, WebauthnCredential } = require('../models');
const generateToken = require('../utils/generateToken');
const { isAllowedAdminLoginId } = require('../config/adminAllowlist');
const { isValidStudentEmail } = require('../config/emailPolicy');
const { isValidHostel, genderForHostel, canonicalHostelName } = require('../config/hostels');
const { isEmailVerificationValid } = require('./otpController');
const { isSignatureDataUrl } = require('../utils/signature');
const { ciEquals } = require('../utils/ciCompare');
const {
  normalizeCloseContacts,
  normalizeGuardianPhoneNumber,
} = require('../utils/closeContacts');

// loginId is the canonical key: student email or normalized staff ID; `email` accepted as legacy alias.
const resolveLoginId = (body = {}) =>
  (body.loginId || body.email || '').trim().toLowerCase();

const findByLoginId = (key, options = {}) =>
  User.findOne({ where: { [Op.or]: [{ loginId: key }, { email: key }] }, ...options });

const normalizePersonName = (value) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Password login only: also accepts the roll number (case-insensitive studentId match).
//
// The roll-number branch was a RegExp built from user input and anchored by hand. It is a
// parameterised lower() comparison now — nothing to escape, and it matches the shape of
// the users_student_id index rather than forcing a scan.
const findByIdentifier = async (rawKey) => {
  const key = String(rawKey || '').trim().toLowerCase();
  if (!key) return null;
  return (
    (await findByLoginId(key)) ||
    (await User.findOne({ where: { [Op.and]: [ciEquals('student_id', String(rawKey).trim())] } }))
  );
};
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

// The credentials array used to be embedded on the user document, so it came along with
// every read. It is a table now, and only the four WebAuthn handlers need it.
const WITH_CREDENTIALS = { include: [{ association: 'webAuthnCredentials' }] };

// In production set RP_ID / RP_ORIGIN to the real frontend domain.
const rpName = process.env.RP_NAME || 'NITP-SafeExit';
const rpID = process.env.RP_ID || 'localhost';
const origin = process.env.RP_ORIGIN || 'http://localhost:3000';

// The profile payload, in one place, so /profile, PATCH /profile and /refresh cannot
// drift apart in what they expose.
const profilePayload = (user, extra = {}) => ({
  _id: user.id,
  name: user.name,
  loginId: user.loginId,
  email: user.email,
  role: user.role,
  studentId: user.studentId,
  roomNumber: user.roomNumber,
  department: user.department,
  year: user.year,
  phoneNumber: user.phoneNumber,
  guardianPhoneNumber: user.guardianPhoneNumber,
  // Sorted in JS, not by the query: there are at most two (the slot CHECK guarantees it),
  // and ordering an include costs either a separate query or an order clause repeated at
  // every call site. The profile form fills its two rows positionally, so the order has to
  // be stable — Postgres gives no guarantee without an ORDER BY.
  closeContacts: [...(user.closeContacts || [])]
    .sort((a, b) => a.slot - b.slot)
    .map((c) => c.toJSON()),
  gender: user.gender,
  hostelName: user.hostelName,
  managedGender: user.managedGender,
  managedHostel: user.managedHostel,
  webAuthnRegistered: user.webAuthnRegistered,
  ...extra,
});

// POST /api/auth/register — public
const registerUser = async (req, res) => {
  const {
    name,
    email,
    password,
    role,
    studentId,
    roomNumber,
    department,
    year,
    phoneNumber,
    hostelName,
    emailVerificationToken,
    closeContacts,
    guardianPhoneNumber,
    // Temporary compatibility alias for clients deployed before the API field was named.
    emergencyContact,
  } = req.body;

  try {
    // Role is resolved server-side; body `role` is untrusted. Self-registration mints Students ONLY — a missing role must still hit the verification gate.
    const requestedRole = (role || '').trim();
    if (requestedRole && requestedRole !== 'Student') {
      return res.status(403).json({
        message: `${requestedRole} accounts cannot be self-registered. Contact an administrator to be provisioned.`,
      });
    }
    const resolvedRole = 'Student';

    // Server-side, unconditional: college domain + verified-inbox token (browser form can be bypassed).
    if (!isValidStudentEmail(email)) {
      return res.status(400).json({ message: 'Please use your college email ending in @nitp.ac.in.' });
    }
    if (!isEmailVerificationValid(emailVerificationToken, email)) {
      return res.status(403).json({ message: 'Please verify your college email with the code we sent before continuing.' });
    }
    // Password must be a real secret, never the public roll number.
    if (!password || String(password).length < 6) {
      return res.status(400).json({ message: 'Please choose a password with at least 6 characters.' });
    }
    // Hostel is the source of truth: it's required, must be a known campus hostel,
    // and the student's gender is DERIVED from it (the form has no separate gender
    // question, and deriving server-side stops a spoofed body from mismatching).
    if (!isValidHostel(hostelName)) {
      return res.status(400).json({ message: 'Please select your hostel.' });
    }
    // Canonical spelling matters more than it used to: users.hostel_name is a real foreign
    // key to hostels(name), so "kautilya" would now be rejected by the database rather than
    // quietly stored as a second spelling.
    const resolvedHostel = canonicalHostelName(hostelName);
    const resolvedGender = genderForHostel(hostelName);

    const closeContactResult = normalizeCloseContacts(closeContacts, phoneNumber);
    if (closeContactResult.error) {
      return res.status(400).json({ message: closeContactResult.error });
    }
    const guardianPhoneResult = normalizeGuardianPhoneNumber(
      guardianPhoneNumber ?? emergencyContact,
      phoneNumber
    );
    if (guardianPhoneResult.error) {
      return res.status(400).json({ message: guardianPhoneResult.error });
    }

    const loginId = resolveLoginId(req.body) || (studentId || '').trim().toLowerCase();
    if (!loginId) {
      return res.status(400).json({ message: 'A login identifier (email or ID) is required.' });
    }

    const userExists = await findByLoginId(loginId);

    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Only students carry a real email; staff email stays unset (no synthetic addresses).
    const realEmail = resolvedRole === 'Student' ? (email || '').trim().toLowerCase() : null;

    // One transaction, because the close contacts are their own table now. Registration
    // requires at least one, so a user row committed without them would be an account the
    // form could never have produced — created by a failure, not by a person.
    //
    // `slot` is what makes the two-contact cap structural: it is CHECKed to 1..2 and
    // UNIQUE per user, so a third has nowhere to go even on a write path that skips the
    // old Mongoose validator.
    const user = await sequelize.transaction(async (tx) =>
      User.create(
        {
          name, loginId, email: realEmail, password, role: resolvedRole,
          studentId, roomNumber, department, year, phoneNumber,
          gender: resolvedGender, hostelName: resolvedHostel,
          guardianPhoneNumber: guardianPhoneResult.phoneNumber,
          closeContacts: closeContactResult.contacts.map((c, i) => ({ ...c, slot: i + 1 })),
        },
        { include: [{ association: 'closeContacts' }], transaction: tx }
      )
    );

    if (user) {
      const token = generateToken(res, user.id);
      res.status(201).json({
        _id: user.id,
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

// POST /api/auth/login — public
const authUser = async (req, res) => {
  const { password } = req.body;

  try {
    const user = await findByIdentifier(req.body.loginId || req.body.email);

    if (user && (await user.matchPassword(password))) {
      // Valid credentials are not enough — Admin accounts must be allowlisted.
      if (user.role === 'Admin' && !isAllowedAdminLoginId(user.loginId)) {
        return res.status(403).json({ message: 'This account is not authorized for admin access.' });
      }

      // Admin login requires the configured name, Admin ID, and PIN.
      if (
        user.role === 'Admin' &&
        normalizePersonName(req.body.name) !== normalizePersonName(user.name)
      ) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }

      const token = generateToken(res, user.id);

      if (['Guard', 'Caretaker', 'Admin', 'Warden', 'ChiefWarden'].includes(user.role)) {
        user.lastActiveAt = new Date();
        if (user.role === 'Guard') user.onDuty = true;
        await user.save();
      }

      res.json({
        _id: user.id,
        name: user.name,
        loginId: user.loginId,
        email: user.email,
        role: user.role,
        studentId: user.studentId,
        managedGender: user.managedGender,
        managedHostel: user.managedHostel,
        // Flag only, never the bytes: this response is cached into sessionStorage per tab,
        // and only the capture screens need the actual image (they read /auth/profile).
        // Boolean(user.signature) was free when the base64 sat on the user document; it is
        // a keyed existence check now, so the login path still never touches a blob.
        hasSignature: await User.hasSignature(user.id),
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

// GET /api/auth/profile — private
//
// The one read that deliberately DOES pull the owner's own photo and signature bytes:
// every capture UI reads them from here. Nothing else includes those associations.
const getUserProfile = async (req, res) => {
  const user = await User.findByPk(req.user._id, {
    include: ['closeContacts', 'photoRow', 'signatureRow'],
  });

  if (user) {
    res.json(profilePayload(user, {
      photo: user.photo,
      // The owner's own signature bytes; every capture UI reads them from here.
      signature: user.signature,
      hasSignature: Boolean(user.signature),
    }));
  } else {
    res.status(404).json({ message: 'User not found' });
  }
};

// PATCH /api/auth/profile — private (gender backfill + own photo + own signature)
const updateUserProfile = async (req, res) => {
  const { gender, hostelName, photo, signature } = req.body;

  // Reject oversized payloads early; a data-URL face photo should be well under this.
  if (photo !== undefined) {
    if (photo !== null && typeof photo !== 'string') {
      return res.status(400).json({ message: 'Invalid photo.' });
    }
    if (typeof photo === 'string' && photo.length > 1_500_000) {
      return res.status(413).json({ message: 'Photo is too large.' });
    }
  }

  // Signature: a PNG or JPEG data URL, or null to clear.
  if (signature !== undefined && signature !== null && !isSignatureDataUrl(signature)) {
    return res.status(400).json({
      message: 'Signature must be a PNG or JPEG image under 400KB. Please capture it again.',
    });
  }

  // At least one supported field must be present.
  if (gender === undefined && photo === undefined && signature === undefined && hostelName === undefined) {
    return res.status(400).json({ message: 'Nothing to update.' });
  }

  if (gender !== undefined && !['Male', 'Female', 'Other'].includes(gender)) {
    return res.status(400).json({ message: 'Please select a valid gender.' });
  }

  if (hostelName !== undefined && !isValidHostel(hostelName)) {
    return res.status(400).json({ message: 'Please select a valid hostel.' });
  }

  try {
    const user = await User.findByPk(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (hostelName !== undefined) {
      if (user.role !== 'Student') {
        return res.status(403).json({ message: 'Only students can set a hostel.' });
      }
      if (user.hostelName) {
        return res.status(403).json({
          message: 'Hostel is already set and can only be changed by an administrator.',
        });
      }
      // Hostel is the source of truth for gender — same derivation registration uses.
      // A boy picking a girls' hostel is rejected rather than silently rewriting gender.
      const impliedGender = genderForHostel(hostelName);
      if (user.gender && user.gender !== impliedGender) {
        return res.status(400).json({
          message: 'That hostel does not match the gender on your account. Contact your caretaker.',
        });
      }
      user.hostelName = canonicalHostelName(hostelName);
      user.gender = impliedGender;
    }

    if (gender !== undefined && hostelName === undefined) {
      if (user.gender) {
        return res.status(403).json({
          message: 'Gender is already set and can only be changed by an administrator.',
        });
      }
      user.gender = gender;
    }

    // The blob writes and the user row move together: a photo saved against a hostel
    // change that then failed would leave the profile in a state the form never asked for.
    //
    // Both are scoped to the authenticated caller — no id from the body, so no
    // cross-account writes.
    await sequelize.transaction(async (tx) => {
      await user.save({ transaction: tx });
      if (photo !== undefined) {
        await User.setPhoto(user.id, photo || null, { transaction: tx });
      }
      // Freely re-writable, like photo (unlike gender's one-time write above): a signature
      // drawn badly on a phone should be fixable. Already-submitted requests keep the
      // snapshot they were signed with, so history is unaffected.
      if (signature !== undefined) {
        await User.setSignature(user.id, signature || null, { transaction: tx });
      }
    });

    // Re-read so the response reflects what was actually stored, including the blobs
    // written above — they live in other tables, so `user` cannot know about them.
    const fresh = await User.findByPk(user.id, {
      include: ['closeContacts', 'photoRow', 'signatureRow'],
    });

    res.json(profilePayload(fresh, {
      photo: fresh.photo,
      signature: fresh.signature,
      hasSignature: Boolean(fresh.signature),
    }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/logout — public
const logoutUser = (req, res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: 'Logged out successfully' });
};

// POST /api/auth/refresh — private; re-mints Bearer token from the 30-day cookie after mobile OS wipes sessionStorage.
const refreshSession = async (req, res) => {
  try {
    const user = await User.findByPk(req.user._id, { include: ['closeContacts'] });
    if (!user) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    const token = generateToken(res, user.id);

    if (['Guard', 'Caretaker', 'Admin', 'Warden', 'ChiefWarden'].includes(user.role)) {
      user.lastActiveAt = new Date();
      if (user.role === 'Guard') user.onDuty = true;
      await user.save();
    }

    res.json(profilePayload(user, {
      hasSignature: await User.hasSignature(user.id),
      token,
    }));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// WebAuthn: challenge is stashed on the user row between /options and /verify, cleared after use.

// POST /api/auth/webauthn/register/options — private
const getRegistrationOptions = async (req, res) => {
  try {
    const user = await User.findByPk(req.user._id, WITH_CREDENTIALS);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.loginId || user.email || user.studentId,
      userDisplayName: user.name,
      // Stable per-user handle so re-registration maps to the same account.
      //
      // NOTE FOR CUTOVER: this is the uuid now, where it used to be the ObjectId. An
      // authenticator that enrolled before the migration carries the old handle, so its
      // credential still authenticates (that path matches on credentialID, not this) but a
      // re-registration mints a second credential rather than replacing the first. Both
      // work; the account simply lists two passkeys.
      userID: new TextEncoder().encode(String(user.id)),
      attestationType: 'none',
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

// POST /api/auth/webauthn/register/verify — private
const verifyRegistration = async (req, res) => {
  try {
    const user = await User.findByPk(req.user._id, WITH_CREDENTIALS);
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
    const exists = user.webAuthnCredentials.some((c) => c.credentialID === credential.id);

    // The credential row and the flag that advertises it move together. Half of this
    // committing would either claim a passkey that does not exist or hide one that does.
    await sequelize.transaction(async (tx) => {
      if (!exists) {
        await WebauthnCredential.create(
          {
            userId: user.id,
            credentialID: credential.id,
            publicKey: Buffer.from(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports || [],
          },
          { transaction: tx }
        );
      }
      user.webAuthnRegistered = true;
      user.currentChallenge = null;
      await user.save({ transaction: tx });
    });

    res.json({ verified: true, webAuthnRegistered: true });
  } catch (error) {
    console.error('WebAuthn registration error:', error);
    res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/webauthn/login/options — public
const getAuthenticationOptions = async (req, res) => {
  const loginId = resolveLoginId(req.body);
  try {
    const user = await findByLoginId(loginId, WITH_CREDENTIALS);
    if (!user || !user.webAuthnRegistered || user.webAuthnCredentials.length === 0) {
      return res.status(404).json({ message: 'No passkey registered for this account' });
    }
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

// POST /api/auth/webauthn/login/verify — public
const verifyAuthentication = async (req, res) => {
  const { response } = req.body;
  const loginId = resolveLoginId(req.body);
  try {
    const user = await findByLoginId(loginId, WITH_CREDENTIALS);
    if (!user || !user.currentChallenge) {
      return res.status(400).json({ message: 'No login in progress for this account' });
    }
    if (user.role === 'Admin' && !isAllowedAdminLoginId(user.loginId)) {
      return res.status(403).json({ message: 'This account is not authorized for admin access.' });
    }

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
          // bytea comes back as a Buffer, which is what this always was.
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

    // Replay protection: persist the authenticator's monotonic counter. It lives on its
    // own row now, so it saves separately from the user — in the same transaction, because
    // a committed login that lost the counter bump would leave the replay window open.
    await sequelize.transaction(async (tx) => {
      cred.counter = authenticationInfo.newCounter;
      await cred.save({ transaction: tx });

      user.currentChallenge = null;
      if (['Guard', 'Caretaker', 'Admin', 'Warden', 'ChiefWarden'].includes(user.role)) {
        user.lastActiveAt = new Date();
        if (user.role === 'Guard') user.onDuty = true;
      }
      await user.save({ transaction: tx });
    });

    const token = generateToken(res, user.id);
    res.json({
      _id: user.id,
      name: user.name,
      loginId: user.loginId,
      email: user.email,
      role: user.role,
      studentId: user.studentId,
      hasSignature: await User.hasSignature(user.id),
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
  refreshSession,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
};
