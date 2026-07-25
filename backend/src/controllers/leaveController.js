const LeaveApplication = require('../models/LeaveApplication');
const sseHub = require('../utils/sseHub');
const { notifyCaretakers } = require('../utils/pushService');
const { isBeforeEveningCurfew } = require('../utils/outingRules');
const { scopedStudentFilter, requestInScope, resolveTargetCaretaker } = require('../utils/caretakerScope');
const { isSignatureDataUrl } = require('../utils/signature');

const MIN_LEAD_TIME_MS = 24 * 60 * 60 * 1000;


const ACTIVE_LEAVE_STATUSES = ['Pending', 'Approved', 'Out'];

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
  const { destination, reason, leaveDate, returnDate, acknowledgement, targetCaretakerId, studentSignature } = req.body;

  try {
    if (!destination || !reason || !leaveDate || !returnDate) {
      return res.status(400).json({ message: 'Destination, reason, leave date and return date are all required.' });
    }

    // The student's drawn signature is required to file an application.
    if (!isSignatureDataUrl(studentSignature)) {
      return res.status(400).json({ message: 'Your signature is required to submit this application.' });
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

    // One live leave at a time. Expire any stale Pending/Approved passes first so a
    // missed leave date doesn't wrongly block a fresh application.
    const existingActive = await LeaveApplication.find({
      student: req.user._id,
      status: { $in: ACTIVE_LEAVE_STATUSES },
    });
    await expireStaleApplications(existingActive);
    const blockingLeave = existingActive.find((doc) => ACTIVE_LEAVE_STATUSES.includes(doc.status));

    if (blockingLeave) {
      const message =
        blockingLeave.status === 'Out'
          ? 'You are currently on leave. Return to campus and get scanned back in at the gate before applying for new leave.'
          : blockingLeave.status === 'Approved'
          ? 'You already have an approved leave pass. Complete or cancel that leave before applying again.'
          : 'You already have a leave application awaiting approval. Wait for a decision or cancel it before applying again.';

      return res.status(409).json({
        message,
        status: blockingLeave.status,
        activeLeaveId: blockingLeave._id,
      });
    }

    // Resolve the routed caretaker (default = own-hostel caretaker); enforces the
    // same-gender fence server-side before we persist the application.
    let targetCaretaker;
    try {
      targetCaretaker = await resolveTargetCaretaker(req.user, targetCaretakerId);
    } catch (err) {
      return res.status(err.statusCode || 400).json({ message: err.message });
    }

    const application = await LeaveApplication.create({
      student: req.user._id,
      destination,
      reason,
      leaveDate: leaveDateObj,
      returnDate: returnDateObj,
      acknowledgement: true,
      status: 'Pending',
      studentSignature,
      targetCaretaker: targetCaretaker ? targetCaretaker._id : undefined,
    });

    sseHub.broadcast('leave:changed', {
      reason: 'created',
      id: application._id,
      status: application.status,
    });

    const scope = targetCaretaker
      ? { caretakerId: targetCaretaker._id }
      : { hostelName: req.user.hostelName, gender: req.user.gender };
    notifyCaretakers(scope, {
      title: '📋 New Leave Application',
      body: `${req.user.name} has applied for leave from ${leaveDateObj.toLocaleDateString()} to ${returnDateObj.toLocaleDateString()}.`,
      url: '/dashboard/caretaker?view=leave',
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

// GET /api/leave/pending — private (Caretaker)
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

// GET /api/leave/history — private (Caretaker); caretaker-actioned outcomes only, scoped to their hostel.
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

// PATCH /api/leave/:id/status — private (Caretaker)
const updateLeaveStatus = async (req, res) => {
  const { status, remarks, caretakerSignature } = req.body;

  // Only Approved/Rejected here — trip-lifecycle statuses belong to the gate scan flow and must not be settable by a caretaker.
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({
      message: 'Status can only be set to Approved or Rejected.',
    });
  }

  // Approving mints a pass — the caretaker must sign it. (Rejection needs no signature.)
  if (status === 'Approved' && !isSignatureDataUrl(caretakerSignature)) {
    return res.status(400).json({ message: 'Your signature is required to approve this application.' });
  }

  try {
    const application = await LeaveApplication.findById(req.params.id).populate('student', 'gender hostelName');

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    // Server-side scope re-check: the caretaker must be the routed target (or, for
    // legacy untargeted applications, own this student's hostel).
    if (!requestInScope(req.user, application, application.student)) {
      return res.status(403).json({
        message: 'This application is not routed to you.',
      });
    }

    // Only a still-Pending application can be decided; live/terminal passes can't be flipped back.
    if (application.status !== 'Pending') {
      return res.status(409).json({
        message: `This application has already been ${application.status.toLowerCase()} and can no longer be changed.`,
        status: application.status,
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

    if (status === 'Approved') {
      application.caretakerSignature = caretakerSignature;
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

// GET /api/leave/stream — private (Caretaker), SSE
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
