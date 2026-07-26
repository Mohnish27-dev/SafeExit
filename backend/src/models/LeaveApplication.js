const mongoose = require('mongoose');

const leaveApplicationSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  destination: {
    type: String,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  leaveDate: {
    type: Date,
    required: true
  },
  returnDate: {
    type: Date,
    required: true
  },
  // Audit trail of what the student agreed to — not a security boundary.
  acknowledgement: {
    type: Boolean,
    default: false
  },
  status: {
    // Pending/Approved -> Expired happens lazily at read time; Out/Returned only via gate scans.
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Expired', 'Out', 'Returned', 'Forwarded'],
    default: 'Pending'
  },

  decision: {
    type: String,
    enum: ['Approved', 'Rejected'],
    default: undefined
  },
  decidedAt: {
    type: Date,
    default: null
  },
  decidedByRole: {
    type: String,
    enum: ['Caretaker', 'Warden'],
    default: undefined
  },
  remarks: {
    type: String
  },
  // Drawn signatures (base64 image data URLs), same storage style as User.photo.

  studentSignature: {
    type: String
  },
  caretakerSignature: {
    type: String
  },
  // The warden's own signature, stamped when a forwarded application is warden-approved.
  wardenSignature: {
    type: String
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetCaretaker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  forwardedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  forwardedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  forwardedNote: {
    type: String
  },
  forwardedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

const LeaveApplication = mongoose.model('LeaveApplication', leaveApplicationSchema);
module.exports = LeaveApplication;
