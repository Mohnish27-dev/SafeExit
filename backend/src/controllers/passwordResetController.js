const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const EmailOtp = require('../models/EmailOtp');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { sendMail, isMailConfigured } = require('../utils/mailer');
const { isValidStudentEmail, normalizeEmail } = require('../config/emailPolicy');

// Student password recovery. Shares the EmailOtp collection with registration, keyed on (email, purpose) so the two flows' codes never clobber each other.

const OTP_TTL_MS = 10 * 60 * 1000; // code valid 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s between sends
const MAX_OTP_ATTEMPTS = 5; // wrong guesses before the code is burned
const PURPOSE = 'password-reset';
// Short so a verified-but-unused code can't become a password change hours later.
const RESET_TOKEN_TTL = '15m';

const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// Signed proof that this exact email just passed the reset OTP.
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

// Students only — staff have no mailbox on file and recover through an admin.
const findStudentByEmail = (email) =>
  User.findOne({ role: 'Student', $or: [{ email }, { loginId: email }] });

// POST /api/auth/password/forgot — public
const requestPasswordReset = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    if (!isValidStudentEmail(email)) {
      return res.status(400).json({ message: 'Please enter your college email ending in @nitp.ac.in.' });
    }

    const user = await findStudentByEmail(email);
    // 404 reveals account existence — accepted enumeration tradeoff for a single-college app.
    if (!user) {
      return res.status(404).json({ message: 'No student account is registered with this email.' });
    }
    if (!user.password) {
      return res.status(400).json({ message: 'This account has no password set. Please contact an administrator.' });
    }

    // Per-email resend cooldown to prevent inbox spam.
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
    // Dev-only fallback when SMTP isn't configured; never in prod.
    if (!delivered && !isMailConfigured() && process.env.NODE_ENV !== 'production') {
      body.devOtp = otp;
    }
    return res.status(200).json(body);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/password/verify-otp — public
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

    // Burn the single-use code, hand back the signed proof.
    await EmailOtp.deleteOne({ _id: record._id });
    const resetToken = issueResetToken(email);
    return res.status(200).json({ verified: true, resetToken });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/password/reset — public, guarded by the signed reset token
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

    // Pre-save hook salts + bcrypt-hashes it.
    user.password = newPassword;
    await user.save();

    // Real session so the frontend can re-enrol Quick Login against the new password.
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
