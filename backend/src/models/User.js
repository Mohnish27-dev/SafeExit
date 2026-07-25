const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  loginId: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  // Students only; sparse+unique so many staff can share "no email".
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String }, // optional for webauthn-only, but usually required for first login
  role: { type: String, enum: ['Student', 'Caretaker', 'Guard', 'Admin', 'Department'], default: 'Student' },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  // Department staff scope: the single maintenance category this account services.
  // Complaints of this category route here; unset for non-Department users.
  managedDepartment: { type: String, enum: ['Electrical', 'Plumbing', 'Cleaning', 'Wifi', 'Furniture'] },
  // Caretaker's hostel scope (derived gender), kept for the existing auto-approval
  // rules; unset = legacy/unassigned. managedHostel is the real routing key.
  managedGender: { type: String, enum: ['Male', 'Female'] },
  // Caretaker's specific hostel (one of the campus hostels); requests route here.
  // Unset on a caretaker = not yet assigned (falls back to managedGender scope).
  managedHostel: { type: String },
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
