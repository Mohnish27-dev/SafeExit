const mongoose = require('mongoose');

const complaintSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  category: {
    type: String,
    enum: ['Maintenance', 'Electrical', 'Plumbing', 'Cleaning', 'Security', 'Other'],
    required: true
  },
  roomNumber: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Open', 'In Progress', 'Resolved', 'Rejected'],
    default: 'Open'
  },
  resolutionComments: {
    type: String
  },
  targetWarden: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

const Complaint = mongoose.model('Complaint', complaintSchema);
module.exports = Complaint;
