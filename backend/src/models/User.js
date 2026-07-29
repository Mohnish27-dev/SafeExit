const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const closeContactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  mobileNumber: { type: String, required: true, trim: true, match: /^\d{10,15}$/ },
  roomNumber: { type: String, required: true, trim: true, maxlength: 30 },
}, { _id: false });

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  loginId: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  // Students only; sparse+unique so many staff can share "no email".
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  password: { type: String }, // optional for webauthn-only, but usually required for first login

  // ChiefWarden is the campus-wide hostel oversight role: below Admin, but not
  // tied to one hostel like Warden/Caretaker accounts.
  role: { type: String, enum: ['Student', 'Caretaker', 'Warden', 'ChiefWarden', 'Guard', 'Admin', 'Department'], default: 'Student' },
  gender: { type: String, enum: ['Male', 'Female', 'Other'] },
  // Department staff scope: the single maintenance category this account services.
  // Complaints of this category route here; unset for non-Department users.
  managedDepartment: { type: String, enum: ['Electrical', 'Plumbing', 'Cleaning', 'Wifi', 'Furniture'] },

  managedGender: { type: String, enum: ['Male', 'Female'] },

  managedHostel: { type: String },
  studentId: { type: String }, // e.g., register number
  department: { type: String },
  year: { type: String },
  roomNumber: { type: String },
  hostelName: { type: String },
  phoneNumber: { type: String },
  // Required by student self-registration and reserved for emergency staff use.
  // Kept optional at schema level so legacy students and non-student accounts remain valid.
  guardianPhoneNumber: { type: String, trim: true, match: /^\d{10,15}$/ },
  // Students nominate one or two nearby people who can be contacted if needed.
  // Registration enforces the minimum; the schema also prevents later writes from
  // exceeding the two-person limit.
  closeContacts: {
    type: [closeContactSchema],
    default: undefined,
    validate: {
      validator: (contacts) => contacts == null || contacts.length <= 2,
      message: 'A maximum of two close contacts is allowed.',
    },
  },
  // Student face photo (base64 data URL). Owner-writable only; guards read it via /scan/preview.
  photo: { type: String },
  // Reusable signature (PNG or JPEG data URL), captured once during onboarding or from
  // the profile. The server stamps it onto every outing/leave request; those per-request
  // copies are immutable snapshots, so changing this never rewrites history.
  // Absent = "not set up yet" (see utils/signature.js).
  signature: { type: String },

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
