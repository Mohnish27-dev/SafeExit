const LeaveApplication = require('../models/LeaveApplication');
const sseHub = require('../utils/sseHub');
const { notifyWardens } = require('../utils/pushService');
const { isBeforeEveningCurfew } = require('../utils/outingRules');
const { scopedStudentFilter, studentGenderInScope } = require('../utils/wardenScope');

const MIN_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

// Lazy read-time expiry of Pending/Approved passes whose leaveDate passed; Out/Returned/Rejected/Cancelled are never touched. Saves are best-effort per doc.
const expireStaleApplications = async (applications) => {
  const list = Array.isArray(applications) ? applications : [applications];
  const now = Date.now();
  await Promise.all(
    list.map(async (appDoc) => {
      if (!appDoc) return;
      if (appDoc.status === 'Pending' && now > new Date(appDoc.leaveDate).getTime()) {
        appDoc.status = 'Expired';
      } else if (appDoc.status === 'Approved' && now > new Date(appDoc.leaveDate).getTime()) {
        appDoc.status = 'Expired';
      } else {
        return;
      }
      try {
        await appDoc.save();
      } catch (err) {
        // Lost-race save is fine; next read retries the persist.
      }
    })
  );
  return applications;
};

// POST /api/leave — private (Student)
const createLeaveApplication = async (req, res) => {
  const { destination, reason, leaveDate, returnDate, acknowledgement } = req.body;

  try {
    if (!destination || !reason || !leaveDate || !returnDate) {
      return res.status(400).json({ message: 'Destination, reason, leave date and return date are all required.' });
    }

    if (acknowledgement !== true) {
      return res.status(400).json({
        message: 'You must acknowledge that the college is not responsible for you during the leave period.',
      });
    }

    const leaveDateObj = new Date(leaveDate);
    const returnDateObj = new Date(returnDate);

    if (Number.isNaN(leaveDateObj.getTime()) || Number.isNaN(returnDateObj.getTime())) {
      return res.status(400).json({ message: 'Leave date and return date must be valid dates.' });
    }

    if (returnDateObj.getTime() <= leaveDateObj.getTime()) {
      return res.status(400).json({ message: 'Return date must be after the leave date.' });
    }

    // 24-hour lead time enforced here; client shows the same rule for UX only.
    const earliestAllowed = new Date(Date.now() + MIN_LEAD_TIME_MS);
    if (leaveDateObj.getTime() < earliestAllowed.getTime()) {
      return res.status(400).json({
        message: 'Leave applications must be submitted at least 24 hours before the leave date.',
        earliestAllowed: earliestAllowed.toISOString(),
      });
    }

    // Friendly guard rail — the gate re-enforces the 5:30 PM curfew at scan time.
    if (!isBeforeEveningCurfew(leaveDateObj)) {
      return res.status(400).json({
        message:
          'Leave departure must be between 6:00 AM and 5:30 PM (campus time) on the departure day. Please choose a leave time in that window.',
      });
    }

    const application = await LeaveApplication.create({
      student: req.user._id,
      destination,
      reason,
      leaveDate: leaveDateObj,
      returnDate: returnDateObj,
      acknowledgement: true,
      status: 'Pending',
    });

    sseHub.broadcast('leave:changed', {
      reason: 'created',
      id: application._id,
      status: application.status,
    });

    const gender = req.user.gender;
    notifyWardens(gender, {
      title: '📋 New Leave Application',
      body: `${req.user.name} has applied for leave from ${leaveDateObj.toLocaleDateString()} to ${returnDateObj.toLocaleDateString()}.`,
      url: '/dashboard/warden?view=leave',
    });

    res.status(201).json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/myrequests — private (Student)
const getMyLeaveApplications = async (req, res) => {
  try {
    const applications = await LeaveApplication.find({ student: req.user._id }).sort({ createdAt: -1 });
    await expireStaleApplications(applications);
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/pending — private (Warden)
const getPendingLeaveApplications = async (req, res) => {
  try {
    const applications = await LeaveApplication.find({ status: 'Pending', ...(await scopedStudentFilter(req.user)) })
      .populate('student', 'name studentId roomNumber hostelName')
      .sort({ leaveDate: 1 });

    await expireStaleApplications(applications);
    const stillPending = applications.filter((a) => a.status === 'Pending');

    res.json(stillPending);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/history — private (Warden); warden-actioned outcomes only, scoped to their hostel.
const getLeaveHistory = async (req, res) => {
  try {
    const applications = await LeaveApplication.find({
      status: { $in: ['Approved', 'Rejected'] },
      ...(await scopedStudentFilter(req.user)),
    })
      .populate('student', 'name studentId roomNumber hostelName')
      .sort({ updatedAt: -1 });

    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/leave/:id/status — private (Warden)
const updateLeaveStatus = async (req, res) => {
  const { status, remarks } = req.body;

  try {
    const application = await LeaveApplication.findById(req.params.id).populate('student', 'gender');

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    // Server-side scope re-check: wardens may only act on their own hostel's students.
    if (!studentGenderInScope(req.user, application.student?.gender)) {
      return res.status(403).json({
        message: 'This application belongs to a student outside your hostel.',
      });
    }

    // Approving after the leave date passed would mint an already-expired pass.
    if (
      application.status === 'Pending' &&
      status === 'Approved' &&
      Date.now() > new Date(application.leaveDate).getTime()
    ) {
      application.status = 'Expired';
      await application.save();

      sseHub.broadcast('leave:changed', {
        reason: 'expired',
        id: application._id,
        status: 'Expired',
      });

      return res.status(409).json({
        message: 'This application has expired — the leave date has already passed. It can no longer be approved.',
        status: 'Expired',
      });
    }

    if (status === 'Rejected' && !remarks) {
      return res.status(400).json({ message: 'A reason is required when rejecting a leave application.' });
    }

    application.status = status;
    if (remarks) application.remarks = remarks;

    if (['Approved', 'Rejected'].includes(status)) {
      application.approvedBy = req.user._id;
    }

    const updatedApplication = await application.save();

    sseHub.broadcast('leave:changed', {
      reason: 'status',
      id: updatedApplication._id,
      status: updatedApplication.status,
    });

    res.json(updatedApplication);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/leave/:id/cancel — private (Student)
const cancelLeaveApplication = async (req, res) => {
  try {
    const application = await LeaveApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    if (application.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only cancel your own leave applications.' });
    }

    if (application.status !== 'Pending' && application.status !== 'Approved') {
      return res.status(409).json({
        message: `Cannot cancel an application that is already ${application.status.toLowerCase()}.`,
        status: application.status,
      });
    }

    application.status = 'Cancelled';
    const updatedApplication = await application.save();

    sseHub.broadcast('leave:changed', {
      reason: 'cancelled',
      id: updatedApplication._id,
      status: 'Cancelled',
    });

    res.json(updatedApplication);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/stream — private (Warden), SSE
const streamLeaveEvents = (req, res) => {
  req.socket.setTimeout(0);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  sseHub.addClient(res);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseHub.removeClient(res);
  });
};

module.exports = {
  createLeaveApplication,
  getMyLeaveApplications,
  getPendingLeaveApplications,
  getLeaveHistory,
  updateLeaveStatus,
  cancelLeaveApplication,
  streamLeaveEvents,
};
