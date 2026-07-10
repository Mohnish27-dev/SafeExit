const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const EmailOtp = require('../models/EmailOtp');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { sendMail, isMailConfigured } = require('../utils/mailer');
const { isValidStudentEmail, normalizeEmail } = require('../config/emailPolicy');

// Password recovery for STUDENTS who have forgotten their password (and therefore
// can no longer decrypt their device Quick Login PIN, which is just the password
// encrypted under the PIN — see safeexit/src/app/lib/quickLogin.js).
//
// The flow mirrors the registration OTP in otpController.js, but with the OPPOSITE
// account precondition: registration requires the email to be FREE, reset requires
// it to already own a student account. We reuse the same EmailOtp collection —
// keyed on (email, purpose) — under a distinct purpose so a pending registration
// code and a pending reset code for the same address never clobber each other.
//
// After a successful reset we hand back a real session token (like /auth/login),
// so the frontend can drop the student straight into Quick Login setup and
// re-enrol the PIN (and optionally a passkey) against the NEW password. The
// server-side passkey credentials are unaffected by a password change and keep
// working; only the device-local PIN needs re-enrolling because it cached the old
// password.

// --- Tunables (kept in step with otpController) ---------------------------
const OTP_TTL_MS = 10 * 60 * 1000; // code is valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // must wait 60s between sends
const MAX_OTP_ATTEMPTS = 5; // wrong guesses before the code is burned
const PURPOSE = 'password-reset';
// The reset token proves "this email just passed OTP" to the reset endpoint. Kept
// short so a verified-but-unused code can't be turned into a password change hours
// later, but long enough to type a new password twice.
const RESET_TOKEN_TTL = '15m';

const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// Signed proof that `email` completed the reset OTP. The final reset step requires
// this instead of re-checking the code, so the password can only be changed for
// the exact address that received (and entered) the code.
const issueResetToken = (email) =>
  jwt.sign({ email, purpose: PURPOSE }, process.env.JWT_SECRET, { expiresIn: RESET_TOKEN_TTL });

const isResetTokenValid = (token, email) => {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.purpose === PURPOSE && payload.email === normalizeEmail(email);
  } catch {
    return false;
  }
};

// Reset is an email-based recovery, so it only applies to accounts that actually
// have a college email — i.e. students. Staff are identified by loginId and have
// no mailbox on file, so they recover through an admin, not here.
const findStudentByEmail = (email) =>
  User.findOne({ role: 'Student', $or: [{ email }, { loginId: email }] });

// @desc    Start password recovery: email a 6-digit reset code to a student
// @route   POST /api/auth/password/forgot
// @access  Public
const requestPasswordReset = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!isValidStudentEmail(email)) {
      return res.status(400).json({ message: 'Please enter your college email ending in @nitp.ac.in.' });
    }

    const user = await findStudentByEmail(email);
    // Mirrors registration's 409-on-existing: here we surface 404-on-missing so a
    // student who mistypes their address gets a clear dead end instead of waiting
    // for a code that will never arrive. (This does reveal whether an address has
    // an account — the same enumeration tradeoff the registration endpoint already
    // makes — which is an acceptable UX call for a single-college app.)
    if (!user) {
      return res.status(404).json({ message: 'No student account is registered with this email.' });
    }
    // An account created via passkey-only would have no password to reset. In this
    // app students always set a password at registration, but guard anyway.
    if (!user.password) {
      return res.status(400).json({ message: 'This account has no password set. Please contact an administrator.' });
    }

    // Per-email resend cooldown so the endpoint can't be used to spam an inbox.
    const prior = await EmailOtp.findOne({ email, purpose: PURPOSE });
    if (prior && Date.now() - prior.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      const waitMs = RESEND_COOLDOWN_MS - (Date.now() - prior.lastSentAt.getTime());
      return res.status(429).json({
        message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
      });
    }

    const otp = generateOtp();
    const otpHash = await EmailOtp.hashOtp(otp);
    await EmailOtp.findOneAndUpdate(
      { email, purpose: PURPOSE },
      { email, purpose: PURPOSE, otpHash, attempts: 0, lastSentAt: new Date(), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      { upsert: true, setDefaultsOnInsert: true }
    );

    const { delivered } = await sendMail({
      to: email,
      subject: 'Your SafeExit password reset code',
      text: `Your SafeExit password reset code is ${otp}. It expires in 10 minutes. If you did not request a password reset, you can ignore this email — your password will not change.`,
      html: `<p>Your SafeExit password reset code is <strong style="font-size:20px;letter-spacing:3px">${otp}</strong>.</p><p>It expires in 10 minutes. If you didn't request a password reset, you can safely ignore this email — your password will not change.</p>`,
    });

    const body = { message: 'Password reset code sent to your college email.' };
    // Local dev with no SMTP: surface the code so the flow is testable. Never in prod.
    if (!delivered && !isMailConfigured() && process.env.NODE_ENV !== 'production') {
      body.devOtp = otp;
    }
    return res.status(200).json(body);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Verify a reset code and issue a short-lived reset token
// @route   POST /api/auth/password/verify-otp
// @access  Public
const verifyResetOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();

    if (!isValidStudentEmail(email)) {
      return res.status(400).json({ message: 'Please enter your college email ending in @nitp.ac.in.' });
    }
    if (!otp) {
      return res.status(400).json({ message: 'Please enter the 6-digit code.' });
    }

    const record = await EmailOtp.findOne({ email, purpose: PURPOSE });
    if (!record || record.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ message: 'This code has expired. Please request a new one.' });
    }
    if (record.attempts >= MAX_OTP_ATTEMPTS) {
      return res.status(429).json({ message: 'Too many incorrect attempts. Please request a new code.' });
    }

    const ok = await record.matchOtp(otp);
    if (!ok) {
      record.attempts += 1;
      await record.save();
      const remaining = Math.max(0, MAX_OTP_ATTEMPTS - record.attempts);
      return res.status(400).json({ message: `Incorrect code. ${remaining} attempt(s) remaining.` });
    }

    // Correct. Burn the code (single-use) and hand back a signed proof that the
    // reset endpoint will require before changing the password.
    await EmailOtp.deleteOne({ _id: record._id });
    const resetToken = issueResetToken(email);
    return res.status(200).json({ verified: true, resetToken });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Set a new password using a verified reset token, then sign the user in
// @route   POST /api/auth/password/reset
// @access  Public (guarded by the signed reset token)
const resetPassword = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const { resetToken, newPassword } = req.body;

    if (!isResetTokenValid(resetToken, email)) {
      return res.status(403).json({ message: 'Your reset session has expired. Please start again.' });
    }
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ message: 'Please choose a password with at least 6 characters.' });
    }

    const user = await findStudentByEmail(email);
    if (!user) {
      return res.status(404).json({ message: 'Account not found.' });
    }

    // Assigning triggers the model's pre-save hook, which salts + bcrypt-hashes it.
    user.password = newPassword;
    await user.save();

    // Issue a real session so the frontend can go straight to Quick Login setup and
    // re-enrol the PIN (and optionally a passkey) against this new password.
    const token = generateToken(res, user._id);
    return res.status(200).json({
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
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { requestPasswordReset, verifyResetOtp, resetPassword };
