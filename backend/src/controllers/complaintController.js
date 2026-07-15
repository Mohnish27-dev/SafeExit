const Complaint = require('../models/Complaint');
const sseHub = require('../utils/sseHub');
const { notifyWardens } = require('../utils/pushService');
const { scopedStudentFilter, studentGenderInScope } = require('../utils/wardenScope');

// @desc    Create new complaint
// @route   POST /api/complaint
// @access  Private (Student)
const createComplaint = async (req, res) => {
  const { category, description } = req.body;

  try {
    const complaint = await Complaint.create({
      student: req.user._id,
      roomNumber: req.user.roomNumber,
      category,
      description
    });

    // Push the new complaint to any open warden/admin dashboards instantly,
    // same real-time pattern as outing requests and SOS alerts.
    // No student PII in the payload: the SSE hub broadcasts to every connected
    // dashboard (including out-of-hostel wardens), so a name here would leak
    // past the per-hostel visibility boundary. Clients refetch the scoped list.
    sseHub.broadcast('complaint:created', {
      id: complaint._id,
      category: complaint.category,
      status: complaint.status,
    });

    // Push notification to the warden managing this student's hostel.
    const gender = req.user.gender;
    notifyWardens(gender, {
      title: '📝 New Complaint',
      body: `A ${category || 'general'} complaint has been filed${req.user.roomNumber ? ` (Room ${req.user.roomNumber})` : ''}.`,
      url: '/dashboard/warden',
    });

    res.status(201).json(complaint);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in student's complaints
// @route   GET /api/complaint/mycomplaints
// @access  Private (Student)
const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ student: req.user._id }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all complaints
// @route   GET /api/complaint
// @access  Private (Warden/Admin)
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

// @desc    Update complaint status
// @route   PATCH /api/complaint/:id/status
// @access  Private (Warden/Admin)
const updateComplaintStatus = async (req, res) => {
  const { status, resolutionComments } = req.body;

  try {
    const complaint = await Complaint.findById(req.params.id).populate('student', 'gender');

    if (complaint) {
      // A warden may only act on complaints from students in their own hostel.
      if (!studentGenderInScope(req.user, complaint.student?.gender)) {
        return res.status(403).json({
          message: 'This complaint belongs to a student outside your hostel.',
        });
      }

      complaint.status = status;
      if (resolutionComments) complaint.resolutionComments = resolutionComments;

      const updatedComplaint = await complaint.save();

      // Let every other open warden/admin dashboard reflect the resolution
      // instantly, and let the student's own "My Complaints" poll pick it up.
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

// @desc    Live stream of complaint changes (new complaints, status updates)
//          so warden/admin dashboards update in real time.
// @route   GET /api/complaint/stream
// @access  Private (Warden/Admin)
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

  // Proxies/load balancers tend to kill idle connections; a periodic comment
  // keeps this one alive without triggering any client-side event handler.
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
