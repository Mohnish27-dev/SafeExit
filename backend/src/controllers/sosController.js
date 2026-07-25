const SOSAlert = require('../models/SOSAlert');
const sseHub = require('../utils/sseHub');
const { notifyCaretakersAndAdmins } = require('../utils/pushService');
const { genderScopedStudentFilter, studentInGenderScope } = require('../utils/caretakerScope');

// POST /api/sos — private (Student)
const createSOSAlert = async (req, res) => {
  const { type, note, location, coords } = req.body;

  try {
    // Malformed GPS is silently dropped — an SOS must never fail on bad coords.
    let safeCoords;
    if (
      coords &&
      Number.isFinite(coords.lat) && Math.abs(coords.lat) <= 90 &&
      Number.isFinite(coords.lng) && Math.abs(coords.lng) <= 180
    ) {
      safeCoords = {
        lat: coords.lat,
        lng: coords.lng,
        accuracy: Number.isFinite(coords.accuracy) ? coords.accuracy : undefined
      };
    }

    const alert = await SOSAlert.create({
      student: req.user._id,
      type,
      note,
      location,
      coords: safeCoords
    });

    const populated = await alert.populate('student', 'name studentId roomNumber hostelName phoneNumber department year');

    // No student PII in the broadcast — the SSE hub reaches out-of-hostel caretakers too.
    sseHub.broadcast('sos:created', {
      id: populated._id,
      type: populated.type,
      status: populated.status,
    });

    // SOS is never fenced to one hostel — broadcast to EVERY caretaker of the student's
    // gender scope, plus all admins, so an away hostel caretaker can never bottleneck it.
    notifyCaretakersAndAdmins(req.user.gender, {
      title: '🚨 SOS ALERT',
      body: `${req.user.name} has raised an emergency${type ? ` (${type})` : ''}!${safeCoords ? ' 📍 Location attached' : ''}`,
      url: '/dashboard/caretaker?view=sos',
      adminUrl: '/dashboard/admin?view=sos',
      urgency: 'high',
    });

    res.status(201).json(populated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/sos/mine — private (Student)
const getMySOSAlerts = async (req, res) => {
  try {
    const alerts = await SOSAlert.find({ student: req.user._id }).sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/sos — private (Admin/Caretaker/Guard)
const getSOSAlerts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    Object.assign(filter, await genderScopedStudentFilter(req.user));

    const alerts = await SOSAlert.find(filter)
      .populate('student', 'name studentId roomNumber hostelName phoneNumber department year')
      .populate('handledBy', 'name role')
      .sort({ createdAt: -1 });
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/sos/:id/status — private (Admin/Caretaker)
const updateSOSStatus = async (req, res) => {
  const { status, resolutionNote } = req.body;

  try {
    const alert = await SOSAlert.findById(req.params.id).populate('student', 'gender hostelName');
    if (!alert) {
      return res.status(404).json({ message: 'SOS alert not found' });
    }

    // SOS is gender-scoped, not hostel-fenced: any caretaker of the student's gender may act.
    if (!studentInGenderScope(req.user, alert.student)) {
      return res.status(403).json({
        message: 'This alert is outside your scope.',
      });
    }

    if (status) alert.status = status;
    if (resolutionNote) alert.resolutionNote = resolutionNote;
    alert.handledBy = req.user._id;

    const updated = await alert.save();
    const populated = await updated.populate('student', 'name studentId roomNumber hostelName phoneNumber');

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

// GET /api/sos/stream — private (Admin/Caretaker/Guard), SSE
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

  // Keeps proxies from killing the idle connection.
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
