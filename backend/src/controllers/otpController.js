const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const EmailOtp = require('../models/EmailOtp');
const User = require('../models/User');
const { sendMailWithin, isMailConfigured } = require('../utils/mailer');
const { isValidStudentEmail, normalizeEmail } = require('../config/emailPolicy');

const OTP_TTL_MS = 10 * 60 * 1000; // code valid 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s between sends
const MAX_OTP_ATTEMPTS = 5; // wrong guesses before the code is burned
const PURPOSE = 'student-registration';
// Short so a verified-but-unused email can't be registered days later; long enough for the photo + passkey steps.
const VERIFY_TOKEN_TTL = '20m';

// crypto.randomInt is unbiased, unlike Math.random() — matters for a security code.
const generateOtp = () => String(crypto.randomInt(100000, 1000000));

// Signed proof that this exact email completed OTP verification.
const issueVerificationToken = (email) =>
  jwt.sign({ email, purpose: PURPOSE }, process.env.JWT_SECRET, { expiresIn: VERIFY_TOKEN_TTL });

const isEmailVerificationValid = (token, email) => {
  if (!token) return false;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    return payload.purpose === PURPOSE && payload.email === normalizeEmail(email);
  } catch {
    return false;
  }
};

// POST /api/auth/otp/send — public
const sendOtp = async (req, res) => {
  try {
    const email = normalizeEmail(req.body.email);

    // Server-side domain enforcement (the browser check is UX only).
    if (!isValidStudentEmail(email)) {
      return res.status(400).json({ message: 'Please use your college email ending in @nitp.ac.in.' });
    }

    const existing = await User.findOne({ $or: [{ email }, { loginId: email }] });
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists. Please log in instead.' });
    }

    // Resend cooldown to prevent inbox spam.
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

    // Bounded wait: a provider that refuses us fails fast and the student is told so; a
    // merely slow one stops holding this request open (see utils/mailer.js).
    const { delivered, pending, error } = await sendMailWithin({
      to: email,
      subject: 'Your NITP-SafeExit verification code',
      text: `Your NITP-SafeExit verification code is ${otp}. It expires in 10 minutes. If you did not request this, you can ignore this email.`,
      html: `<p>Your NITP-SafeExit verification code is <strong style="font-size:20px;letter-spacing:3px">${otp}</strong>.</p><p>It expires in 10 minutes. If you didn't request this, you can ignore this email.</p>`,
    });

    // A confirmed failure inside the deadline. The OTP row is already written, but saying
    // "code sent" here would leave the student waiting on mail that will never arrive.
    // 502 (not 500) because the failure is the upstream mail service, not this app.
    if (error) {
      console.error(`[otp] send to ${email} failed: ${error.message}`);
      // Drop the row we just wrote. It stamped lastSentAt, which would hold this student
      // behind the 60s resend cooldown for a code that was never delivered. Nothing usable
      // is lost: the upsert above already overwrote any previous otpHash, so the earlier
      // code was dead the moment this request ran.
      try {
        await EmailOtp.deleteOne({ email, purpose: PURPOSE });
      } catch {
        // Best-effort; the student can still retry once the cooldown lapses.
      }
      return res.status(502).json({
        message: 'We could not send the verification email just now. Please try again in a moment.',
      });
    }

    const body = { message: 'Verification code sent to your college email.' };
    // Dev-only fallback when SMTP isn't configured; never once SMTP is live.
    if (!delivered && !pending && !isMailConfigured() && process.env.NODE_ENV !== 'production') {
      body.devOtp = otp;
    }
    return res.status(200).json(body);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// POST /api/auth/otp/verify — public
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
    const emailVerificationToken = issueVerificationToken(email);
    return res.status(200).json({ verified: true, emailVerificationToken });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { sendOtp, verifyOtp, isEmailVerificationValid };
