const mongoose = require('mongoose');

// A student's "I'll be late" notice for an outing they're currently out on.
// Advisory only: newExpectedTime never feeds isReturnLate, so the gate scan and
// the overdue sweep keep judging punctuality against the pass's own inTime.
const delayNoticeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // OutingRequest._id. Delay notices are outing-only — a leave return date is
  // an intention over days, not a same-day deadline to be late against.
  trip: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // 'Leave' stays in the enum so notices filed before the outing-only rule
  // still load; nothing writes it now.
  tripType: {
    type: String,
    enum: ['Outing', 'Leave'],
    default: 'Outing',
    required: true
  },
  reason: {
    type: String,
    enum: ['Traffic', 'Transport', 'Medical', 'Family', 'Weather', 'Other'],
    required: true
  },
  note: {
    type: String,
    maxlength: 300
  },
  // The student's own estimate. Staff-facing information, not a new deadline.
  newExpectedTime: {
    type: Date
  },
  // Snapshot of the deadline at filing time, so later reads keep the audit trail
  // even though nothing rewrites the pass.
  originalInTime: {
    type: Date
  },
  // Was the student already past their return time when they filed?
  filedWhileOverdue: {
    type: Boolean,
    default: false
  },
  status: {
    type: String,
    enum: ['Pending', 'Acknowledged'],
    default: 'Pending'
  },
  acknowledgedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  acknowledgedAt: {
    type: Date
  },
  acknowledgementNote: {
    type: String,
    maxlength: 300
  }
}, {
  timestamps: true
});

delayNoticeSchema.index({ student: 1, trip: 1 });
delayNoticeSchema.index({ trip: 1, status: 1 });

const DelayNotice = mongoose.model('DelayNotice', delayNoticeSchema);
module.exports = DelayNotice;
