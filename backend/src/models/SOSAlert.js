const mongoose = require('mongoose');

// An emergency SOS raised by a student. Surfaced live to Warden / Guard / Admin
// so they can acknowledge and resolve it. The student profile is referenced (not
// copied) so the latest name / room / phone is always shown.
const sosAlertSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Mirrors the alert types offered on the student SOS screen.
  type: {
    type: String,
    enum: ['harassment', 'medical', 'unsafe', 'stalking', 'other'],
    required: true
  },
  note: {
    type: String
  },
  // Optional free-text / coordinates captured at raise time.
  location: {
    type: String
  },
  status: {
    type: String,
    enum: ['Active', 'Acknowledged', 'Resolved'],
    default: 'Active'
  },
  // Whoever (warden/admin/guard) acknowledged or resolved the alert.
  handledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  resolutionNote: {
    type: String
  }
}, {
  timestamps: true
});

const SOSAlert = mongoose.model('SOSAlert', sosAlertSchema);
module.exports = SOSAlert;
