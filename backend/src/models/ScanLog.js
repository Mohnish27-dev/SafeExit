const mongoose = require('mongoose');

// A single gate movement: a guard scanning a student's QR for entry (IN) or exit (OUT).
// These rows are the source of truth for the admin "Movement Logs" view and for a
// student's current campus status (derived from their most recent scan).
const scanLogSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // The guard who performed the scan. Optional so seeded/system logs still validate.
  guard: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  direction: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true
  },
  // The outing pass this movement is tied to, when one exists.
  outing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OutingRequest'
  },
  // Whether the movement was within the approved window. 'N/A' when there is no
  // window to judge against (e.g. an exit without a return time yet).
  punctuality: {
    type: String,
    enum: ['On-Time', 'Overdue', 'N/A'],
    default: 'N/A'
  },
  gate: {
    type: String,
    default: 'Main Gate'
  }
}, {
  timestamps: true
});

const ScanLog = mongoose.model('ScanLog', scanLogSchema);
module.exports = ScanLog;
