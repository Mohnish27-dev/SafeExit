const mongoose = require('mongoose');

// Student profile is referenced (not copied) so the latest name/room/phone is always shown.
const sosAlertSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['harassment', 'medical', 'unsafe', 'stalking', 'other'],
    default: 'other',
    lowercase: true,
    trim: true,
    required: true
  },
  note: {
    type: String
  },
  location: {
    type: String
  },
  coords: {
    lat: Number,
    lng: Number,
    accuracy: Number // metres, from the browser Geolocation API
  },
  status: {
    type: String,
    enum: ['Active', 'Acknowledged', 'Resolved'],
    default: 'Active'
  },
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

// Indexes. The SOS views poll hardest of anything in the app — every 8s on both the
// admin and caretaker dashboards — so these matter more than the low write volume
// suggests.

// getMySOSAlerts — the student's own alerts.
sosAlertSchema.index({ student: 1, createdAt: -1 });

// getSOSAlerts with ?status= (the dashboards' Active filter), 8s poll.
sosAlertSchema.index({ status: 1, createdAt: -1 });

// getSOSAlerts unfiltered, and the analytics $match on createdAt.
sosAlertSchema.index({ createdAt: -1 });

const SOSAlert = mongoose.model('SOSAlert', sosAlertSchema);
module.exports = SOSAlert;
