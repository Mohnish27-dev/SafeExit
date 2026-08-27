const mongoose = require('mongoose');
const { ACTIVE_PASS_STATUSES, ONE_ACTIVE_LEAVE_INDEX } = require('../config/passStatuses');

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

// Indexes — mirrors models/OutingRequest.js; see the notes there.

// createLeaveApplication's active-application block, plus the gate scan's
// resolveApprovedPass/resolveOutPass. {student:1} prefix serves getMyLeaveApplications.
leaveApplicationSchema.index({ student: 1, status: 1, createdAt: -1 });

// getPendingLeaveApplications — the caretaker queue, oldest first.
leaveApplicationSchema.index({ status: 1, createdAt: 1 });

// getForwardedLeaveApplications — the warden's action queue.
leaveApplicationSchema.index({ forwardedTo: 1, status: 1, forwardedAt: 1 });

// The targetCaretaker branch of the caretaker scope filter (utils/hostelScope.js).
leaveApplicationSchema.index({ targetCaretaker: 1 });

// getAllLeaveApplications — unfiltered campus-wide list.
leaveApplicationSchema.index({ createdAt: -1 });

// getLeaveHistory / getWardenLeaveHistory sort.
leaveApplicationSchema.index({ decidedAt: -1 });

// Correctness guard, not a performance one — the mirror of the index in
// models/OutingRequest.js. See the long note there for why the check-then-create in
// createLeaveApplication cannot close this race in application code, why $in inside
// partialFilterExpression needs MongoDB 6.0+, and why utils/verifyIndexes.js asserts the
// build by name at startup instead of trusting autoIndex.
leaveApplicationSchema.index(
  { student: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_PASS_STATUSES } },
    name: ONE_ACTIVE_LEAVE_INDEX,
  }
);

const LeaveApplication = mongoose.model('LeaveApplication', leaveApplicationSchema);
module.exports = LeaveApplication;
