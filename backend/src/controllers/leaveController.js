const LeaveApplication = require('../models/LeaveApplication');
const sseHub = require('../utils/sseHub');
const { notifyCaretakers, notifyWarden } = require('../utils/pushService');
const { isBeforeEveningCurfew } = require('../utils/outingRules');
const {
  scopedStudentFilter,
  forwardedToFilter,
  requestInScope,
  resolveTargetCaretaker,
  resolveWardenForHostel,
} = require('../utils/hostelScope');
const { isSignatureDataUrl } = require('../utils/signature');

const MIN_LEAD_TIME_MS = 24 * 60 * 60 * 1000;


const ACTIVE_LEAVE_STATUSES = ['Pending', 'Approved', 'Out'];

// A row counts as "decided" if it carries a frozen verdict, or — for rows written before
// `decision` existed — if its status still happens to be the verdict. The second clause is
// what keeps pre-existing history visible without a migration.
const DECIDED_FILTER = {
  $or: [
    { decision: { $in: ['Approved', 'Rejected'] } },
    { decision: { $exists: false }, status: { $in: ['Approved', 'Rejected'] } },
  ],
};

// `status` moved on but the pass never got used as decided (student cancelled, or the leave
// date came and went). History still shows the verdict; this is the footnote explaining it.
const LAPSED_STATUSES = ['Cancelled', 'Expired'];

// Normalises a history row: legacy docs get `decision` derived from status, and every row
// gets `lapsed` so the dashboards don't each have to re-derive it.
const withDecisionMeta = (doc) => {
  const obj = doc.toObject();
  obj.decision = obj.decision || (['Approved', 'Rejected'].includes(obj.status) ? obj.status : null);
  obj.lapsed = LAPSED_STATUSES.includes(obj.status) ? obj.status : null;
  return obj;
};

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


// GET /api/leave/history — private (Caretaker); every decided application in their scope,
// whoever signed it (them or the warden they escalated to), plus anything still sitting with
// the warden. Keyed off the frozen `decision`, not `status`, so a later cancel/expire/gate
// scan can't erase the record of what was approved.
const getLeaveHistory = async (req, res) => {
  try {
    const applications = await LeaveApplication.find({
      $and: [
        { $or: [DECIDED_FILTER, { status: 'Forwarded' }] },
        await scopedStudentFilter(req.user),
      ],
    })
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedTo', 'name')
      .populate('approvedBy', 'name role')
      .sort({ decidedAt: -1, updatedAt: -1 });

    res.json(applications.map(withDecisionMeta));
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
      // Immutable audit verdict — `status` moves on from here (Out/Returned/Cancelled/
      // Expired), `decision` does not, so history stays complete.
      application.decision = status;
      application.decidedAt = new Date();
      application.decidedByRole = 'Caretaker';
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


const forwardLeaveApplication = async (req, res) => {
  const { note } = req.body;

  try {
    const application = await LeaveApplication.findById(req.params.id).populate(
      'student',
      'gender hostelName name'
    );

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    // Only the caretaker this application is routed to may forward it.
    if (!requestInScope(req.user, application, application.student)) {
      return res.status(403).json({ message: 'This application is not routed to you.' });
    }

    if (application.status !== 'Pending') {
      return res.status(409).json({
        message: `Only a pending application can be forwarded — this one is already ${application.status.toLowerCase()}.`,
        status: application.status,
      });
    }

    // Don't forward a pass that's already past its leave date; expire it instead.
    if (Date.now() > new Date(application.leaveDate).getTime()) {
      application.status = 'Expired';
      await application.save();
      sseHub.broadcast('leave:changed', { reason: 'expired', id: application._id, status: 'Expired' });
      return res.status(409).json({
        message: 'This application has expired — the leave date has already passed. It can no longer be forwarded.',
        status: 'Expired',
      });
    }

    // Resolve the warden of the student's hostel. No warden assigned -> actionable error.
    const warden = await resolveWardenForHostel(application.student.hostelName);
    if (!warden) {
      return res.status(409).json({
        message:
          'No warden is assigned to this hostel yet, so this application can\'t be forwarded. Decide it yourself or ask an admin to assign a warden.',
      });
    }

    application.status = 'Forwarded';
    application.forwardedTo = warden._id;
    application.forwardedBy = req.user._id;
    application.forwardedNote = note || undefined;
    application.forwardedAt = new Date();

    const updated = await application.save();

    sseHub.broadcast('leave:changed', { reason: 'forwarded', id: updated._id, status: 'Forwarded' });

    notifyWarden(warden._id, {
      title: '⬆️ Leave Forwarded to You',
      body: `${req.user.name} forwarded ${application.student.name}'s leave application for your decision.`,
      url: '/dashboard/warden?view=leave',
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/forwarded — private (Warden); the warden's action queue.
const getForwardedLeaveApplications = async (req, res) => {
  try {
    const applications = await LeaveApplication.find(forwardedToFilter(req.user))
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedBy', 'name')
      .sort({ forwardedAt: 1 });

    // A forwarded pass can still go stale while it waits on the warden.
    await expireStaleApplications(applications);
    const stillForwarded = applications.filter((a) => a.status === 'Forwarded');

    res.json(stillForwarded);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/warden-history — private (Warden); every decided application in their
// hostel, not just the escalations they personally ruled on, so the warden and the caretaker
// see the same record. scopedStudentFilter's Warden branch resolves managedHostel -> student
// ids, and returns an empty set for an unassigned warden.
const getWardenLeaveHistory = async (req, res) => {
  try {
    const applications = await LeaveApplication.find({
      $and: [DECIDED_FILTER, await scopedStudentFilter(req.user)],
    })
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedBy', 'name')
      .populate('approvedBy', 'name role')
      .sort({ decidedAt: -1, updatedAt: -1 });

    res.json(applications.map(withDecisionMeta));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/leave/:id/warden-status — private (Warden). Final decision on a forwarded
// application. Warden approves (with their own signature) -> Approved and the pass is
// live; warden rejects (with reason) -> Rejected.
const updateWardenLeaveStatus = async (req, res) => {
  const { status, remarks, wardenSignature } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status can only be set to Approved or Rejected.' });
  }

  if (status === 'Approved' && !isSignatureDataUrl(wardenSignature)) {
    return res.status(400).json({ message: 'Your signature is required to approve this application.' });
  }

  if (status === 'Rejected' && !remarks) {
    return res.status(400).json({ message: 'A reason is required when rejecting a leave application.' });
  }

  try {
    const application = await LeaveApplication.findById(req.params.id).populate(
      'student',
      'gender hostelName'
    );

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    // Warden may act only on an application forwarded to THEM.
    if (!requestInScope(req.user, application, application.student)) {
      return res.status(403).json({ message: 'This application was not forwarded to you.' });
    }

    if (application.status !== 'Forwarded') {
      return res.status(409).json({
        message: `This application is ${application.status.toLowerCase()} and can no longer be decided.`,
        status: application.status,
      });
    }

    // Approving after the leave date passed would mint an already-expired pass.
    if (status === 'Approved' && Date.now() > new Date(application.leaveDate).getTime()) {
      application.status = 'Expired';
      await application.save();
      sseHub.broadcast('leave:changed', { reason: 'expired', id: application._id, status: 'Expired' });
      return res.status(409).json({
        message: 'This application has expired — the leave date has already passed. It can no longer be approved.',
        status: 'Expired',
      });
    }

    application.status = status;
    if (remarks) application.remarks = remarks;
    application.approvedBy = req.user._id;
    // Immutable audit verdict; see the note in updateLeaveStatus.
    application.decision = status;
    application.decidedAt = new Date();
    application.decidedByRole = 'Warden';
    if (status === 'Approved') {
      application.wardenSignature = wardenSignature;
      // Mirror into caretakerSignature too: the student's leave view reads
      // caretakerSignature as "the signed pass", so a warden-approved pass must carry
      // it there to render like a caretaker-signed one.
      application.caretakerSignature = wardenSignature;
    }

    const updated = await application.save();

    sseHub.broadcast('leave:changed', { reason: 'warden-status', id: updated._id, status: updated.status });

    // Let the caretaker who forwarded it know the outcome (their view is read-only now).
    if (application.forwardedBy) {
      notifyCaretakers(
        { caretakerId: application.forwardedBy },
        {
          title: status === 'Approved' ? '✅ Warden Approved Leave' : '❌ Warden Rejected Leave',
          body: `The warden ${status.toLowerCase()} a leave application you forwarded.`,
          url: '/dashboard/caretaker?view=leave',
        }
      );
    }

    res.json(updated);
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
  forwardLeaveApplication,
  getForwardedLeaveApplications,
  getWardenLeaveHistory,
  updateWardenLeaveStatus,
  cancelLeaveApplication,
  streamLeaveEvents,
};
