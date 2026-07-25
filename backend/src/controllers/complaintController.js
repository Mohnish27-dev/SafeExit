const Complaint = require('../models/Complaint');
const User = require('../models/User');
const sseHub = require('../utils/sseHub');
const { notifyWardens, notifyDepartment } = require('../utils/pushService');
const { scopedStudentFilter, resolveTargetWarden } = require('../utils/wardenScope');

// Categories that route to a maintenance department (i.e. everything except 'Other').
const DEPARTMENT_CATEGORIES = ['Electrical', 'Plumbing', 'Cleaning', 'Wifi', 'Furniture'];

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
      // Route to the matching maintenance department (unset for 'Other').
      targetCategory: DEPARTMENT_CATEGORIES.includes(category) ? category : undefined,
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
    // Wardens keep an oversight notification.
    notifyWardens(scope, {
      title: '📝 New Complaint',
      body: `A ${category || 'general'} complaint has been filed${req.user.roomNumber ? ` (Room ${req.user.roomNumber})` : ''}.`,
      url: '/dashboard/warden?view=complaints',
    });
    // The servicing department is notified directly.
    if (DEPARTMENT_CATEGORIES.includes(category)) {
      notifyDepartment(category, {
        title: `📝 New ${category} Complaint`,
        body: `A ${category} complaint has been filed${req.user.roomNumber ? ` (Room ${req.user.roomNumber})` : ''}.`,
        url: '/dashboard/department?view=complaints',
      });
    }

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

// GET /api/complaint — private (Warden/Admin/Department)
const getComplaints = async (req, res) => {
  try {
    // Department accounts see only their category; wardens/admins keep hostel scope.
    const filter = req.user.role === 'Department'
      ? { category: req.user.managedDepartment }
      : { ...(await scopedStudentFilter(req.user)) };

    const complaints = await Complaint.find(filter)
      .populate('student', 'name studentId roomNumber hostelName')
      .sort({ createdAt: -1 })
      .lean();

    // Warden/Admin oversight cards show which department is on the hook and how to
    // reach them. Look up the one account per department once, then map by category.
    if (req.user.role !== 'Department') {
      const departments = await User.find({ role: 'Department' })
        .select('managedDepartment name phoneNumber')
        .lean();
      const byCategory = {};
      for (const d of departments) {
        if (d.managedDepartment) byCategory[d.managedDepartment] = d;
      }
      for (const c of complaints) {
        const dept = byCategory[c.category];
        c.department = dept
          ? { name: dept.name, phoneNumber: dept.phoneNumber || null }
          : null;
      }
    }

    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/complaint/:id/status — private (Department/Admin)
const updateComplaintStatus = async (req, res) => {
  const { status, resolutionComments } = req.body;

  try {
    const complaint = await Complaint.findById(req.params.id).populate('student', 'gender hostelName');

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (req.user.role === 'Department') {
      // A department may only touch complaints of its own category…
      if (complaint.category !== req.user.managedDepartment) {
        return res.status(403).json({ message: 'This complaint is not routed to your department.' });
      }
      // …and may only progress it, never resolve or reject it.
      if (!['Acknowledged', 'In Progress'].includes(status)) {
        return res.status(403).json({
          message: 'Departments can only mark a complaint Acknowledged or In Progress.',
        });
      }
    }

    complaint.status = status;
    if (resolutionComments) complaint.resolutionComments = resolutionComments;

    const updatedComplaint = await complaint.save();

    sseHub.broadcast('complaint:updated', {
      id: updatedComplaint._id,
      status: updatedComplaint.status,
    });

    res.json(updatedComplaint);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/complaint/:id/resolve — private (Student); the student closes their own complaint.
const resolveMyComplaint = async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);

    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }
    // Owner-only: a student can only resolve a complaint they filed.
    if (String(complaint.student) !== String(req.user._id)) {
      return res.status(403).json({ message: 'This is not your complaint.' });
    }
    if (complaint.status === 'Resolved') {
      return res.status(409).json({ message: 'This complaint is already resolved.' });
    }

    complaint.status = 'Resolved';
    const updatedComplaint = await complaint.save();

    sseHub.broadcast('complaint:updated', {
      id: updatedComplaint._id,
      status: updatedComplaint.status,
    });

    res.json(updatedComplaint);
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
  resolveMyComplaint,
  streamComplaintEvents
};
