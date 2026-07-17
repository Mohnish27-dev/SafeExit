const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  // Canonical login key: student college email, or normalized staff ID (e.g. "wdn001").
  loginId: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  // Students only; sparse+unique so many staff can share "no email".
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String }, // optional for webauthn-only, but usually required for first login
  role: { type: String, enum: ['Student', 'Warden', 'Guard', 'Admin'], default: 'Student' },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  // Warden's hostel scope; unset = sees no students until assigned by admin.
  managedGender: { type: String, enum: ['Male', 'Female'] },
  studentId: { type: String }, // e.g., register number
  department: { type: String },
  year: { type: String },
  roomNumber: { type: String },
  hostelName: { type: String },
  phoneNumber: { type: String },
  // Student face photo (base64 data URL). Owner-writable only; guards read it via /scan/preview.
  photo: { type: String },

  // Live status, maintained by gate scans / duty toggles.
  campusStatus: { type: String, enum: ['Inside', 'Outside', 'Overdue'], default: 'Inside' },
  lastSeenAt: { type: Date },
  onDuty: { type: Boolean, default: false },
  lastActiveAt: { type: Date },

  // webAuthnRegistered is a convenience flag; webAuthnCredentials is the source of truth.
  webAuthnRegistered: { type: Boolean, default: false },
  // Transient challenge issued during a WebAuthn ceremony; verified on the next request.
  currentChallenge: { type: String },
  webAuthnCredentials: [{
    credentialID: { type: String },          // base64url-encoded credential id
    publicKey: { type: Buffer },             // COSE public key bytes
    counter: { type: Number, default: 0 },   // bumped on each auth to block replay
    transports: { type: [String], default: [] }
  }]
}, {
  timestamps: true
});

userSchema.pre('save', async function() {
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.matchPassword = async function(enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);
module.exports = User;
