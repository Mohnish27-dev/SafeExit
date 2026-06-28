const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String }, // optional for webauthn-only, but usually required for first login
  role: { type: String, enum: ['Student', 'Warden', 'Guard', 'Admin'], default: 'Student' },
  studentId: { type: String }, // e.g., register number
  department: { type: String },
  year: { type: String },
  roomNumber: { type: String },
  hostelName: { type: String },
 

  // --- Live status (maintained by gate scans / duty toggles) ---
  // Where a student currently is, derived from their most recent ScanLog.
  campusStatus: { type: String, enum: ['Inside', 'Outside', 'Overdue'], default: 'Inside' },
  // Timestamp of the last gate scan involving this student.
  lastSeenAt: { type: Date },
  // For Guards: whether they are currently on duty. Flipped on login / scan activity.
  onDuty: { type: Boolean, default: false },
  // Last time this user (guard/warden) was active in the system.
  lastActiveAt: { type: Date },

  // WebAuthn / FIDO2 fields. webAuthnRegistered is a convenience flag; the real source of truth
  // is webAuthnCredentials, which holds the actual public keys verified via @simplewebauthn/server.
  webAuthnRegistered: { type: Boolean, default: false },
  // Transient challenge issued during a WebAuthn ceremony; verified on the next request.
  currentChallenge: { type: String },
  webAuthnCredentials: [{
    credentialID: { type: String },          // base64url-encoded credential id (WebAuthnCredential.id)
    publicKey: { type: Buffer },             // COSE public key bytes (WebAuthnCredential.publicKey)
    counter: { type: Number, default: 0 },   // signature counter, bumped on each auth to block replay
    transports: { type: [String], default: [] }
  }],
  // Short-lived challenge for the in-flight registration/authentication ceremony.
  // Cleared as soon as the ceremony is verified.
  currentChallenge: { type: String }
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
