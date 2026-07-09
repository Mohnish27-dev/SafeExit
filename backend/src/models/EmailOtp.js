const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// One pending email-verification code per (email, purpose). We store only a
// bcrypt HASH of the OTP — never the plain code — so a database leak can't be
// replayed. The document auto-expires via a TTL index, and an attempt counter
// caps brute-force guessing of the 6-digit space.
const emailOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    purpose: { type: String, default: 'student-registration' },
    // Wrong-guess counter. Once it hits MAX_OTP_ATTEMPTS the code is dead and the
    // user must request a fresh one — stops guessing all 1,000,000 combinations.
    attempts: { type: Number, default: 0 },
    // Timestamp of the last send, used to enforce a resend cooldown.
    lastSentAt: { type: Date, default: Date.now },
    // Absolute expiry. The TTL index below tells Mongo to delete the doc once
    // this moment passes, so stale codes clean themselves up.
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// At most one live code per email+purpose, so a resend overwrites the previous.
emailOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });
// TTL index: Mongo removes the document as soon as `expiresAt` is in the past.
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Hash a plain OTP for storage / comparison.
emailOtpSchema.statics.hashOtp = function (otp) {
  return bcrypt.hash(String(otp), 10);
};

emailOtpSchema.methods.matchOtp = function (otp) {
  return bcrypt.compare(String(otp), this.otpHash);
};

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
