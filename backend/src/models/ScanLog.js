const mongoose = require('mongoose');

// One gate movement (IN/OUT scan); source of truth for movement logs and campus status.
const scanLogSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Optional so seeded/system logs still validate.
  guard: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  direction: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true
  },
  // At most one of outing/leave is set (Outing-first resolution in scanController).
  outing: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'OutingRequest'
  },
  leave: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LeaveApplication'
  },
  passType: {
    type: String,
    enum: ['Outing', 'Leave']
  },
  // 'N/A' when there is no window to judge against.
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


// getScanLogs default — no filter, newest first.
scanLogSchema.index({ createdAt: -1 });

// The caretaker/warden hostel scope, which filters student:{$in:[...]} then sorts.
scanLogSchema.index({ student: 1, createdAt: -1 });

// getScanLogs with ?direction=IN|OUT.
scanLogSchema.index({ direction: 1, createdAt: -1 });

const ScanLog = mongoose.model('ScanLog', scanLogSchema);
module.exports = ScanLog;
