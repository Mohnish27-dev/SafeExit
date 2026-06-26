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
  phoneNumber: { type: String },
  
  // WebAuthn specific fields (simple approach to just store whether biometrics are registered, 
  // or you could store an array of full credentials if using @simplewebauthn)
  webAuthnRegistered: { type: Boolean, default: false },
  // Transient challenge issued during a WebAuthn ceremony; verified on the next request.
  currentChallenge: { type: String },
  webAuthnCredentials: [{
    credentialID: String,        // base64url credential id
    credentialPublicKey: Buffer, // COSE public key bytes
    counter: Number,
    transports: [String]
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
