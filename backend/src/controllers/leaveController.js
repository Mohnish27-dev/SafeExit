const LeaveApplication = require('../models/LeaveApplication');
const sseHub = require('../utils/sseHub');
const { isBeforeEveningCurfew } = require('../utils/outingRules');

const MIN_LEAD_TIME_MS = 24 * 60 * 60 * 1000;

// Lazily transition stale applications at read time, mirroring
// outingController's expireStaleRequests pattern:
//
// 1. **Pending-and-missed**: the warden never acted and the departure date
//    has already passed — there's no point keeping it in the approval queue.
// 2. **Approved-and-unused**: the trip was approved but the student never
//    actually scanned out through the gate (see scanController), and the
//    departure date has passed. Once a student does scan out, gate
//    integration flips status to 'Out' before this can ever fire — so this
//    only catches passes that were approved but never used, mirroring
//    outingController's Approved-and-unused -> Expired pattern.
//
// 'Out' -> 'Returned' only happens via an actual gate entry scan (see
// scanController), never lazily here — mirroring OutingRequest's
// Out/Returned states, which are also never touched by time-based expiry.
// 'Rejected'/'Cancelled' are terminal and never touched. Persistence is
// best-effort and per-doc so one failed save doesn't block the whole list.
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
        // Leave the in-memory doc updated for this response even if the
        // write lost a race; the next read will retry the persist.
      }
    })
  );
  return applications;
};

// @desc    Create a new multi-day leave application
// @route   POST /api/leave
// @access  Private (Student)
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

    // The 24-hour lead time is the actual enforcement layer — the client
    // shows the same rule for a good UX, but this is what makes it real.
    const earliestAllowed = new Date(Date.now() + MIN_LEAD_TIME_MS);
    if (leaveDateObj.getTime() < earliestAllowed.getTime()) {
      return res.status(400).json({
        message: 'Leave applications must be submitted at least 24 hours before the leave date.',
        earliestAllowed: earliestAllowed.toISOString(),
      });
    }

    // Departure window: a leave pass may only be used to depart between 6:00 AM
    // and 5:30 PM (campus time) on its departure day, so a leave departing
    // outside that window could never be used at the gate. Reject it up front
    // for EVERY student (leave timing is gender-agnostic). The gate re-enforces
    // the same 5:30 PM late cap at scan time (see scanController's
    // isAfterLeaveCurfew), so this early check is a friendly guard rail, not the
    // security boundary — an application that gets Approved is already compliant.
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

    res.status(201).json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in student's leave applications
// @route   GET /api/leave/myrequests
// @access  Private (Student)
const getMyLeaveApplications = async (req, res) => {
  try {
    const applications = await LeaveApplication.find({ student: req.user._id }).sort({ createdAt: -1 });
    await expireStaleApplications(applications);
    res.json(applications);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all pending leave applications
// @route   GET /api/leave/pending
// @access  Private (Warden)
const getPendingLeaveApplications = async (req, res) => {
  try {
    const applications = await LeaveApplication.find({ status: 'Pending' })
      .populate('student', 'name studentId roomNumber hostelName')
      .sort({ leaveDate: 1 });

    // Expire any pending applications whose leave date has already passed so
    // the warden never sees stale entries they can no longer act on.
    await expireStaleApplications(applications);
    const stillPending = applications.filter((a) => a.status === 'Pending');

    res.json(stillPending);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Approve/reject a leave application
// @route   PATCH /api/leave/:id/status
// @access  Private (Warden)
const updateLeaveStatus = async (req, res) => {
  const { status, remarks } = req.body;

  try {
    const application = await LeaveApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    // Guard against approving an application whose leave date has already
    // passed — the warden may have had the card open past the window.
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

// @desc    Cancel a leave application (student withdraws their own request)
// @route   PATCH /api/leave/:id/cancel
// @access  Private (Student)
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

// @desc    Live stream of leave-application changes so the warden dashboard
//          updates in real time.
// @route   GET /api/leave/stream
// @access  Private (Warden)
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
  updateLeaveStatus,
  cancelLeaveApplication,
  streamLeaveEvents,
};
