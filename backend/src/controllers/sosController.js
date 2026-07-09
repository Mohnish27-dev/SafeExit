const SOSAlert = require('../models/SOSAlert');
const sseHub = require('../utils/sseHub');

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

    // Push the emergency to every open warden / guard / admin dashboard the
    // instant it's raised, instead of waiting for their next poll. Clients
    // listening on /api/sos/stream refetch on this event; the payload carries
    // enough for a toast/badge without a round-trip.
    sseHub.broadcast('sos:created', {
      id: populated._id,
      type: populated.type,
      status: populated.status,
      studentName: populated.student?.name,
    });

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

    // Keep every other open console in sync when one responder acknowledges or
    // resolves an alert, so two wardens don't both chase the same emergency.
    sseHub.broadcast('sos:updated', {
      id: populated._id,
      status: populated.status,
      handledBy: req.user._id,
    });

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Live SSE stream of SOS events for responder dashboards
// @route   GET /api/sos/stream
// @access  Private (Admin / Warden / Guard)
const streamSOSEvents = (req, res) => {
  req.socket.setTimeout(0);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  sseHub.addClient(res);

  // Proxies/load balancers tend to kill idle connections; a periodic comment
  // keeps this one alive without triggering any client-side event handler.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseHub.removeClient(res);
  });
};

module.exports = {
  createSOSAlert,
  getMySOSAlerts,
  getSOSAlerts,
  updateSOSStatus,
  streamSOSEvents
};
