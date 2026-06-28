const SOSAlert = require('../models/SOSAlert');

// @desc    Raise a new SOS alert
// @route   POST /api/sos
// @access  Private (Student)
const createSOSAlert = async (req, res) => {
  const { type, note, location } = req.body;

  try {
    const alert = await SOSAlert.create({
      student: req.user._id,
      type,
      note,
      location
    });

    const populated = await alert.populate('student', 'name studentId roomNumber hostelName phoneNumber department year');
    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get the logged-in student's own SOS alerts
// @route   GET /api/sos/mine
// @access  Private (Student)
const getMySOSAlerts = async (req, res) => {
  try {
    const alerts = await SOSAlert.find({ student: req.user._id }).sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all SOS alerts (optionally filtered by status)
// @route   GET /api/sos
// @access  Private (Admin / Warden / Guard)
const getSOSAlerts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const alerts = await SOSAlert.find(filter)
      .populate('student', 'name studentId roomNumber hostelName phoneNumber department year')
      .populate('handledBy', 'name role')
      .sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Acknowledge / resolve an SOS alert
// @route   PATCH /api/sos/:id/status
// @access  Private (Admin / Warden)
const updateSOSStatus = async (req, res) => {
  const { status, resolutionNote } = req.body;

  try {
    const alert = await SOSAlert.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ message: 'SOS alert not found' });
    }

    if (status) alert.status = status;
    if (resolutionNote) alert.resolutionNote = resolutionNote;
    alert.handledBy = req.user._id;

    const updated = await alert.save();
    const populated = await updated.populate('student', 'name studentId roomNumber hostelName phoneNumber');
    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createSOSAlert,
  getMySOSAlerts,
  getSOSAlerts,
  updateSOSStatus
};
