const { DataTypes, Op } = require('sequelize');
const bcrypt = require('bcryptjs');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, legacyId, timestampFields } = require('./_shared');

// Stores only a bcrypt hash of the OTP, so a database leak cannot be replayed; the
// attempt counter caps brute force. One live code per email+purpose — a resend overwrites
// via the UNIQUE (email, purpose) constraint.
const EmailOtp = getSequelize().define(
  'EmailOtp',
  {
    id: uuidPk(),
    legacyId: legacyId(),

    email: {
      type: DataTypes.TEXT,
      allowNull: false,
      // The schema CHECKs email = lower(email); Mongoose did it with `lowercase: true`.
      set(value) {
        this.setDataValue('email', typeof value === 'string' ? value.trim().toLowerCase() : value);
      },
    },
    otpHash: { type: DataTypes.TEXT, allowNull: false, field: 'otp_hash' },
    purpose: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'student-registration' },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    lastSentAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'last_sent_at' },
    expiresAt: { type: DataTypes.DATE, allowNull: false, field: 'expires_at' },

    ...timestampFields,
  },
  { tableName: 'email_otps' }
);

// An OTP hash is not something to hand back in a response, and nothing ever asked for it.
EmailOtp.jsonHidden = new Set(['otpHash']);

EmailOtp.hashOtp = (otp) => bcrypt.hash(String(otp), 10);

EmailOtp.prototype.matchOtp = function (otp) {
  return bcrypt.compare(String(otp), this.otpHash);
};

// MongoDB expired these with a TTL index. Postgres has no TTL, and pg_cron was
// deliberately not adopted — utils/overdueSweep.js already ticks every five minutes, so
// it calls this. The email_otps_expires index is what keeps it cheap.
//
// This is a tidy-up, not a security boundary: expiry is checked at read time regardless
// of when the sweep last ran, so a row that outlives its expiresAt is never accepted.
EmailOtp.purgeExpired = () => EmailOtp.destroy({ where: { expiresAt: { [Op.lt]: new Date() } } });

module.exports = EmailOtp;
