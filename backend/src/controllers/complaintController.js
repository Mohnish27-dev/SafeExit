const Complaint = require('../models/Complaint');
const sseHub = require('../utils/sseHub');
const { notifyWardens } = require('../utils/pushService');
const { scopedStudentFilter, requestInScope, resolveTargetWarden } = require('../utils/wardenScope');

// POST /api/complaint — private (Student)
const createComplaint = async (req, res) => {
  const { category, description, targetWardenId } = req.body;

  try {
    // Resolve the routed warden (default = own-hostel warden); enforces the
    // same-gender fence server-side before we persist the complaint.
    let targetWarden;
    try {
      targetWarden = await resolveTargetWarden(req.user, targetWardenId);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }

    const complaint = await Complaint.create({
      student: req.user._id,
      roomNumber: req.user.roomNumber,
      category,
      description,
      targetWarden: targetWarden ? targetWarden._id : undefined,
    });

    // No student PII in the broadcast — the SSE hub reaches out-of-hostel wardens too.
    sseHub.broadcast('complaint:created', {
      id: complaint._id,
      category: complaint.category,
      status: complaint.status,
    });

    const scope = targetWarden
      ? { wardenId: targetWarden._id }
      : { hostelName: req.user.hostelName, gender: req.user.gender };
    notifyWardens(scope, {
      title: '📝 New Complaint',
      body: `A ${category || 'general'} complaint has been filed${req.user.roomNumber ? ` (Room ${req.user.roomNumber})` : ''}.`,
      url: '/dashboard/warden?view=complaints',
    });

    res.status(201).json(complaint);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/complaint/mycomplaints — private (Student)
const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ student: req.user._id }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/complaint — private (Warden/Admin)
const getComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ ...(await scopedStudentFilter(req.user)) })
      .populate('student', 'name studentId roomNumber')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/complaint/:id/status — private (Warden/Admin)
const updateComplaintStatus = async (req, res) => {
  const { status, resolutionComments } = req.body;

  try {
    const complaint = await Complaint.findById(req.params.id).populate('student', 'gender hostelName');

    if (complaint) {
      // The warden must be the routed target (or, for legacy untargeted complaints,
      // own this student's hostel).
      if (!requestInScope(req.user, complaint, complaint.student)) {
        return res.status(403).json({
          message: 'This complaint is not routed to you.',
        });
      }

      complaint.status = status;
      if (resolutionComments) complaint.resolutionComments = resolutionComments;

      const updatedComplaint = await complaint.save();

      sseHub.broadcast('complaint:updated', {
        id: updatedComplaint._id,
        status: updatedComplaint.status,
      });

      res.json(updatedComplaint);
    } else {
      res.status(404).json({ message: 'Complaint not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/complaint/stream — private (Warden/Admin), SSE
const streamComplaintEvents = (req, res) => {
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
  createComplaint,
  getMyComplaints,
  getComplaints,
  updateComplaintStatus,
  streamComplaintEvents
};
