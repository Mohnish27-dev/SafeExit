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
  outTime: {
    type: Date,
    required: true
  },
  inTime: {
    type: Date,
    required: true
  },
  status: {
    // 'Expired' = the pass was approved but its departure time (`outTime`)
    // passed before the student exited the gate, so it can no longer be used.
    // The transition is applied lazily when a request is read (see
    // outingController) — there is no background job flipping it.
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Out', 'Returned', 'Expired', 'Cancelled'],
    default: 'Pending'
  },
  // True when `status` was set to 'Approved' by the system rule (return time
  // on or before 5:30 PM) rather than by a warden/guard action. Kept distinct
  // from `approvedBy` (which stays null for these) so admin views can tell
  // the two apart.
  autoApproved: {
    type: Boolean,
    default: false
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

const OutingRequest = mongoose.model('OutingRequest', outingRequestSchema);
module.exports = OutingRequest;
