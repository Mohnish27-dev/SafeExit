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
  // Recorded as an audit trail of what the student agreed to at submission
  // time. The rule itself is enforced server-side in the controller — this
  // field is not a security boundary.
  acknowledgement: {
    type: Boolean,
    default: false
  },
  status: {
    // 'Expired' = either never acted on by the warden and the leave date
    // passed, or approved but never actually used (no gate exit scan) before
    // the leave date passed — mirrors OutingRequest's Approved-and-unused
    // pattern. 'Out' = the student has scanned out through the gate on this
    // pass. 'Returned' = the student has scanned back in, closing the trip
    // (see scanController — this mirrors OutingRequest's Out/Returned pair
    // exactly). Lazy transitions (Pending/Approved -> Expired) are applied at
    // read time (see leaveController.expireStaleApplications), mirroring
    // OutingRequest's pattern — there is no background job.
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Expired', 'Out', 'Returned'],
    default: 'Pending'
  },
  remarks: {
    type: String
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const LeaveApplication = mongoose.model('LeaveApplication', leaveApplicationSchema);
module.exports = LeaveApplication;
