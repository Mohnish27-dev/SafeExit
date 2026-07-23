const mongoose = require('mongoose');

const outingRequestSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    required: true
  },
  // With the student's gender, selects the rule set (windows/deadlines live in utils/outingRules.js): Nearby/Market are female-only, General is the single male path.
  outingType: {
    type: String,
    enum: ['Nearby', 'Market', 'General'],
    default: 'General'
  },
  outTime: {
    type: Date,
    required: true
  },
  inTime: {
    type: Date,
    required: true
  },
  status: {
    // Approved -> Expired happens lazily at read time when outTime passes unused.
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Out', 'Returned', 'Expired', 'Cancelled'],
    default: 'Pending'
  },
  // True when approved by the system rule, not a warden (approvedBy stays null).
  autoApproved: {
    type: Boolean,
    default: false
  },
  // Stamped when the entry scan closes the trip; student dashboards read this, not scan logs.
  returnPunctuality: {
    type: String,
    enum: ['On-Time', 'Overdue', null],
    default: null
  },
  // Real gate-scan timestamps (QR scanned by security). Distinct from the scheduled
  // outTime/inTime — student dashboards read these to show actual exit/entry at the gate.
  actualOutTime: {
    type: Date,
    default: null
  },
  actualInTime: {
    type: Date,
    default: null
  },
  remarks: {
    type: String
  },
  // Drawn signatures (base64 image data URLs), same storage style as User.photo.
  studentSignature: {
    type: String
  },
  wardenSignature: {
    type: String
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetWarden: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const OutingRequest = mongoose.model('OutingRequest', outingRequestSchema);
module.exports = OutingRequest;
