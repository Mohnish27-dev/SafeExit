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
    // 'Expired' = never acted on by the warden and the departure date passed.
    // 'Completed' = was approved and the return date has now passed — purely
    // informational, there is no gate/QR integration for this feature.
    // Both transitions are applied lazily at read time (see leaveController),
    // mirroring OutingRequest's pattern — there is no background job.
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Expired', 'Completed'],
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
