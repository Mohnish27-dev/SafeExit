const SOSAlert = require('../models/SOSAlert');
const sseHub = require('../utils/sseHub');
const { notifyWardensAndAdmins } = require('../utils/pushService');
const { scopedStudentFilter, studentGenderInScope } = require('../utils/wardenScope');

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
    // listening on /api/sos/stream refetch the (gender-scoped) list on this
    // event. The payload deliberately carries NO student PII — since the SSE
    // hub broadcasts to every connected dashboard, including out-of-hostel
    // wardens, a name here would leak past the per-hostel visibility boundary.
    sseHub.broadcast('sos:created', {
      id: populated._id,
      type: populated.type,
      status: populated.status,
    });

    // Urgent push notification to wardens + admins — SOS alerts are
    // time-critical and need immediate attention even if no dashboard is open.
    const gender = req.user.gender;
    notifyWardensAndAdmins(gender, {
      title: '🚨 SOS ALERT',
      body: `${req.user.name} has raised an emergency${type ? ` (${type})` : ''}!`,
      url: '/dashboard/warden',
      urgency: 'high',
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

    Object.assign(filter, await scopedStudentFilter(req.user));

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
    const alert = await SOSAlert.findById(req.params.id).populate('student', 'gender');
    if (!alert) {
      return res.status(404).json({ message: 'SOS alert not found' });
    }

    // A warden may only act on alerts from students in their own hostel.
    if (!studentGenderInScope(req.user, alert.student?.gender)) {
      return res.status(403).json({
        message: 'This alert belongs to a student outside your hostel.',
      });
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
