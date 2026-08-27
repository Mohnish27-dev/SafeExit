const mongoose = require('mongoose');
const { ACTIVE_PASS_STATUSES, ONE_ACTIVE_OUTING_INDEX } = require('../config/passStatuses');

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
    // 'Forwarded' = a caretaker escalated it to the hostel warden 
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Out', 'Returned', 'Expired', 'Cancelled', 'Forwarded'],
    default: 'Pending'
  },
  // True when approved by the system rule, not a caretaker (approvedBy stays null).
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

  overdueNotifiedAt: {
    type: Date,
    default: null
  },

  // Separate marker for the student's own browser push.
  studentOverdueNotifiedAt: {
    type: Date,
    default: null
  },

  actualOutTime: {
    type: Date,
    default: null
  },
  actualInTime: {
    type: Date,
    default: null
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
  // The warden's own signature, stamped when a forwarded request is warden-approved.
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

// Indexes. Every query below was a full collection scan before these existed, which is
// what made the polled dashboards (15s student, 30s caretaker) expensive on the on-prem
// Mongo. Writes here are a few hundred a day, so the index count is cheap.

// createOutingRequest's active-pass block, and the gate scan's pass resolution
// (findOne({student, status}).sort({createdAt:-1}) in controllers/scanController.js).
// The {student:1} prefix also serves getMyOutingRequests — a student's own rows number
// in the tens, so the small in-memory sort for its createdAt order costs nothing.
outingRequestSchema.index({ student: 1, status: 1, createdAt: -1 });

// getPendingRequests — the caretaker queue, oldest first.
outingRequestSchema.index({ status: 1, createdAt: 1 });

// getOverdueOutings and the 5-minute overdue sweep, both keyed on status:'Out'.
outingRequestSchema.index({ status: 1, inTime: 1 });

// getForwardedRequests — the warden's action queue.
outingRequestSchema.index({ forwardedTo: 1, status: 1, forwardedAt: 1 });

// The targetCaretaker branch of the caretaker scope filter (utils/hostelScope.js).
outingRequestSchema.index({ targetCaretaker: 1 });

// getAllOutingRequests — chief-warden campus-wide list, polled every 30s with no filter,
// so the sort is all it can be served by.
outingRequestSchema.index({ createdAt: -1 });

// The history endpoints' sort. DECIDED_FILTER has no selective predicate, so without
// this a caretaker opening history scans and blocking-sorts the whole collection.
outingRequestSchema.index({ decidedAt: -1 });

// ---- The one index that is a correctness guard, not a performance one ----
//
// createOutingRequest reads the active requests, finds nothing blocking, then creates.
// Two concurrent POSTs from one student both pass that check and both succeed — two live
// passes for one student. createLimiter (20/min, per-user) does not prevent it; nothing in
// application code can, because "no document matching X exists" is not something a single
// Mongo operation can assert while inserting.
//
// So the database asserts it. This makes the second insert fail with E11000, which
// createOutingRequest converts into the same 409 the pre-check would have returned. The
// gate scan solves its own version of this with an atomic conditional findOneAndUpdate
// (see the campusStatus flip in controllers/scanController.js); a create has no document
// to conditionally update, so a unique index is the equivalent tool.
//
// CAVEAT ON $in: only MongoDB 6.0+ accepts $in inside partialFilterExpression. On an older
// server this index silently fails to build and the race is unguarded again, which is why
// utils/verifyIndexes.js asserts by name at startup instead of trusting autoIndex.
// Pre-existing data with two active rows for one student ALSO fails the build — run
// scripts/checkActivePassDuplicates.js to find and clear those first.
outingRequestSchema.index(
  { student: 1 },
  {
    unique: true,
    partialFilterExpression: { status: { $in: ACTIVE_PASS_STATUSES } },
    name: ONE_ACTIVE_OUTING_INDEX,
  }
);

const OutingRequest = mongoose.model('OutingRequest', outingRequestSchema);
module.exports = OutingRequest;
