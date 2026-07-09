const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const EmailOtp = require('../models/EmailOtp');
const User = require('../models/User');
const { sendMail, isMailConfigured } = require('../utils/mailer');
const { isValidStudentEmail, normalizeEmail } = require('../config/emailPolicy');

// --- Tunables -------------------------------------------------------------
const OTP_TTL_MS = 10 * 60 * 1000; // code is valid for 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // must wait 60s between sends
const MAX_OTP_ATTEMPTS = 5; // wrong guesses before the code is burned
const PURPOSE = 'student-registration';
// The verification token proves "this email was verified" to the register
// endpoint. Kept short so a verified-but-unused email can't be registered days
// later, but long enough to finish the photo + passkey steps.
const VERIFY_TOKEN_TTL = '20m';

// Cryptographically-random 6-digit code (100000–999999). crypto.randomInt is
// unbiased, unlike Math.random(), which matters for a security code.
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// Signed proof that `email` completed OTP verification. Registration checks this
// instead of re-running the OTP, so the account can only be created for the exact
// address that received the code.
const issueVerificationToken = (email) =>
  jwt.sign({ email, purpose: PURPOSE }, process.env.JWT_SECRET, { expiresIn: VERIFY_TOKEN_TTL });

// Verify a token minted by issueVerificationToken and confirm it matches the
// email being registered. Returns true/false; never throws.
const isEmailVerificationValid = (token, email) => {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.purpose === PURPOSE && payload.email === normalizeEmail(email);
  } catch {
    return false;
  }
};

// @desc    Send a 6-digit verification code to a student's college email
// @route   POST /api/auth/otp/send
// @access  Public
const sendOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    // 1. Only real NIT Patna addresses. This is the server-side twin of the
    //    browser check — it's the one that actually enforces the domain.
    if (!isValidStudentEmail(email)) {
      return res.status(400).json({ message: 'Please use your college email ending in @nitp.ac.in.' });
    }

    // 2. If an account already owns this email, there is nothing to verify — and
    //    telling the user avoids a confusing dead end later at registration.
    const existing = await User.findOne({ $or: [{ email }, { loginId: email }] });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists. Please log in instead.' });
    }

    // 3. Resend cooldown, so the endpoint can't be used to spam an inbox.
    const prior = await EmailOtp.findOne({ email, purpose: PURPOSE });
    if (prior && Date.now() - prior.lastSentAt.getTime() < RESEND_COOLDOWN_MS) {
      const waitMs = RESEND_COOLDOWN_MS - (Date.now() - prior.lastSentAt.getTime());
      return res.status(429).json({
        message: `Please wait ${Math.ceil(waitMs / 1000)}s before requesting another code.`,
      });
    }

    // 4. Generate, hash, and (over)write the pending code for this email.
    const otp = generateOtp();
    const otpHash = await EmailOtp.hashOtp(otp);
    await EmailOtp.findOneAndUpdate(
      { email, purpose: PURPOSE },
      { email, purpose: PURPOSE, otpHash, attempts: 0, lastSentAt: new Date(), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
      { upsert: true, setDefaultsOnInsert: true }
    );

    // 5. Deliver it. In dev (no SMTP configured) this logs to the console.
    const { delivered } = await sendMail({
      to: email,
      subject: 'Your SafeExit verification code',
      text: `Your SafeExit verification code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Your SafeExit verification code is <strong style="font-size:20px;letter-spacing:3px">${otp}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    });

    const body = { message: 'Verification code sent to your college email.' };
    // Only when real email is NOT configured (local dev), surface the code so the
    // flow is testable without an inbox. Never leak it once SMTP is live.
    if (!delivered && !isMailConfigured() && process.env.NODE_ENV !== 'production') {
      body.devOtp = otp;
    }
    return res.status(200).json(body);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @desc    Verify a code and issue a short-lived email-verification token
// @route   POST /api/auth/otp/verify
// @access  Public
const verifyOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();

    if (!isValidStudentEmail(email)) {
      return res.status(400).json({ message: 'Please use your college email ending in @nitp.ac.in.' });
    }
    if (!otp) {
      return res.status(400).json({ message: 'Please enter the 6-digit code.' });
    }

    const record = await EmailOtp.findOne({ email, purpose: PURPOSE });
    // Missing or already TTL-expired.
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

    // Correct. Burn the code (single-use) and hand back a signed proof of
    // verification that the register endpoint will require.
    await EmailOtp.deleteOne({ _id: record._id });
    const emailVerificationToken = issueVerificationToken(email);
    return res.status(200).json({ verified: true, emailVerificationToken });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { sendOtp, verifyOtp, isEmailVerificationValid };
    