const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Stores only a bcrypt hash of the OTP so a DB leak can't be replayed; TTL index + attempt counter cap brute force.
const emailOtpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    otpHash: { type: String, required: true },
    purpose: { type: String, default: 'student-registration' },
    attempts: { type: Number, default: 0 },
    lastSentAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

// One live code per email+purpose — a resend overwrites.
emailOtpSchema.index({ email: 1, purpose: 1 }, { unique: true });
emailOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

emailOtpSchema.statics.hashOtp = function (otp) {
  return bcrypt.hash(String(otp), 10);
};

emailOtpSchema.methods.matchOtp = function (otp) {
  return bcrypt.compare(String(otp), this.otpHash);
};

module.exports = mongoose.model('EmailOtp', emailOtpSchema);
