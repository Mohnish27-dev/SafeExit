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

const ScanLog = mongoose.model('ScanLog', scanLogSchema);
module.exports = ScanLog;
