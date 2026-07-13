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
  // Which college outing rule set governs this pass. This, combined with the
  // student's `gender` (on the User doc), decides the departure window, the
  // fixed return deadline, and whether a warden must approve the pass:
  //   'Nearby'  — female-only: a short walk (café/food nearby), no warden
  //               approval, departs 6:00 AM-6:30 PM, must return by 8:00 PM.
  //   'Market'  — female-only: a trip to the local market, warden approval
  //               required, departs 6:00 AM-2:30 PM, must return by 5:30 PM.
  //   'General' — male students: a single combined outing path (nearby and
  //               market share identical rules for them), no warden approval,
  //               departs 6:00 AM-7:59 PM (just before the fixed 8:00 PM
  //               return), must return by 8:00 PM.
  // The exact windows/deadlines live in utils/outingRules.js, never here.
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
  // How punctual the student's return was, stamped when the gate entry scan
  // closes the trip (status → 'Returned'). Mirrors the ScanLog's punctuality so
  // the student's own dashboards — which read the pass, not the scan logs — can
  // tell a late return apart from an on-time one. Stays null for trips that
  // never closed via an entry scan (still Out, Expired, Cancelled, etc.).
  returnPunctuality: {
    type: String,
    enum: ['On-Time', 'Overdue', null],
    default: null
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
