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

const SOSAlert = mongoose.model('SOSAlert', sosAlertSchema);
module.exports = SOSAlert;
