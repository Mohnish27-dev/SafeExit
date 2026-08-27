const LeaveApplication = require('../models/LeaveApplication');
const { ACTIVE_PASS_STATUSES } = require('../config/passStatuses');
const sseHub = require('../utils/sseHub');
const { readPageParams, sendPage } = require('../utils/pagination');
const { notifyCaretakers, notifyWarden } = require('../utils/pushService');
const {
  getLeaveSubmissionTimingViolation,
  isBeforeEveningCurfew,
} = require('../utils/outingRules');
const {
  scopedStudentFilter,
  forwardedToFilter,
  requestInScope,
  canReadSignatures,
  resolveTargetCaretaker,
  resolveWardenForHostel,
} = require('../utils/hostelScope');
const {
  fetchOwnSignature,
  sendSignatureRequired,
  LIST_PROJECTION,
  signaturePresence,
  withSignatureFlags,
} = require('../utils/signature');

// 'Forwarded' counts as live too — an application sitting with the warden must block a
// second one just like a Pending one does, or a student could stack approvals.
// Sourced from config/passStatuses.js because the unique partial index in
// models/LeaveApplication.js filters on the same list; if the two drift, the index enforces
// a different rule than this check and the double-submit race reopens.
const ACTIVE_LEAVE_STATUSES = ACTIVE_PASS_STATUSES;

// Shared by the pre-check below and the E11000 branch in the catch, so a student who loses
// the insert race sees exactly the message they'd have seen by arriving a moment later.
const blockingLeaveMessage = (status) =>
  status === 'Out'
    ? 'You are currently on leave. Return to campus and get scanned back in at the gate before applying for new leave.'
    : status === 'Approved'
    ? 'You already have an approved leave pass. Complete or cancel that leave before applying again.'
    : status === 'Forwarded'
    ? 'Your leave application is with the warden for a decision. Wait for the outcome or cancel it before applying again.'
    : 'You already have a leave application awaiting approval. Wait for a decision or cancel it before applying again.';

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

// Lazy read-time expiry of Pending/Forwarded/Approved passes whose leaveDate passed;
// Out/Returned/Rejected/Cancelled are never touched.
// Forwarded must expire here too: it blocks new applications, so a stale one sitting
// with the warden would otherwise lock the student out indefinitely.
//
// One updateMany for the whole page rather than a save() per row — see the twin comment
// in outingController.js for why a read path must not fan out N writes.
const EXPIRABLE_STATUSES = ['Pending', 'Approved', 'Forwarded'];
const expireStaleApplications = async (applications) => {
  const list = Array.isArray(applications) ? applications : [applications];
  const now = Date.now();
  const stale = list.filter(
    (doc) =>
      doc &&
      EXPIRABLE_STATUSES.includes(doc.status) &&
      now > new Date(doc.leaveDate).getTime()
  );
  if (!stale.length) return applications;

  try {
    // The status guard makes this a no-op for any row a concurrent request already moved
    // on (a cancel, a warden decision), so expiry can never overwrite a real decision.
    await LeaveApplication.updateMany(
      { _id: { $in: stale.map((doc) => doc._id) }, status: { $in: EXPIRABLE_STATUSES } },
      { $set: { status: 'Expired' } }
    );
  } catch (err) {
    // A read must not fail because a bookkeeping write did; the next read retries it.
    console.warn(`[leave] lazy expiry write failed: ${err.message}`);
  }

  for (const doc of stale) {
    doc.status = 'Expired';
    if (typeof doc.unmarkModified === 'function') doc.unmarkModified('status');
  }
  return applications;
};

// POST /api/leave — private (Student)
const createLeaveApplication = async (req, res) => {
  const { destination, reason, leaveDate, returnDate, acknowledgement, targetCaretakerId } = req.body;

  try {
    if (!destination || !reason || !leaveDate || !returnDate) {
      return res.status(400).json({ message: 'Destination, reason, leave date and return date are all required.' });
    }

    // Stamped from the student's saved profile signature — never accepted from the body.
    //
    // KEEP THIS AHEAD of the active-leave query below: the frontend re-submits automatically
    // once the student captures a signature in response to this 428, which is only safe
    // while the rejection happens before any document is created or state is touched.
    const studentSignature = await fetchOwnSignature(req.user);
    if (!studentSignature) {
      return sendSignatureRequired(
        res,
        'Add your signature to your profile before submitting an application.'
      );
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

    const timingViolation = getLeaveSubmissionTimingViolation(req.user.gender, leaveDateObj);
    if (timingViolation === 'DEPARTURE_NOT_FUTURE') {
      return res.status(400).json({
        message: 'Leave departure must be in the future.',
      });
    }
    if (timingViolation === 'FEMALE_DEPARTURE_DAY') {
      return res.status(400).json({
        message:
          'Girls\' leave applications must be submitted before the departure day. To leave tomorrow, submit the application by the end of today.',
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
      return res.status(409).json({
        message: blockingLeaveMessage(blockingLeave.status),
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
    // Lost the insert race — a concurrent POST from the same student committed first and
    // the unique partial index on {student} filtered to ACTIVE_LEAVE_STATUSES rejected
    // this one. Answer with the same 409 the pre-check would have produced.
    if (error && error.code === 11000) {
      const blocking = await LeaveApplication.findOne({
        student: req.user._id,
        status: { $in: ACTIVE_LEAVE_STATUSES },
      }).select('_id status');

      return res.status(409).json({
        message: blocking
          ? blockingLeaveMessage(blocking.status)
          : 'You already have a live leave application. Wait for a decision or cancel it before applying again.',
        status: blocking ? blocking.status : undefined,
        activeLeaveId: blocking ? blocking._id : undefined,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/myrequests — private (Student)
const getMyLeaveApplications = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const filter = { student: req.user._id };
    const applications = await LeaveApplication.find(filter)
      .select(LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    await expireStaleApplications(applications);

    const presence = await signaturePresence(
      LeaveApplication,
      applications.map((a) => a._id),
      ['caretakerSignature', 'wardenSignature']
    );

    return sendPage(res, applications.map((a) => withSignatureFlags(a.toObject(), presence)), {
      limit,
      skip,
      label: 'leave/myrequests',
      count: () => LeaveApplication.countDocuments(filter),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/:id/signatures — private (owner student / routed staff)
const getLeaveSignatures = async (req, res) => {
  try {
    const application = await LeaveApplication.findById(req.params.id)
      .select('student targetCaretaker forwardedTo studentSignature caretakerSignature wardenSignature')
      .populate('student', 'gender hostelName');

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }
    if (!canReadSignatures(req.user, application, application.student)) {
      return res.status(403).json({ message: 'This application is not in your scope.' });
    }

    res.json({
      studentSignature: application.studentSignature || null,
      caretakerSignature: application.caretakerSignature || null,
      wardenSignature: application.wardenSignature || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/all — private (ChiefWarden). Campus-wide, read-only oversight.
// Unfiltered and grows with every application the campus has ever filed, so it is
// bounded hard — see utils/pagination.js.
const getAllLeaveApplications = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const applications = await LeaveApplication.find({})
      .select('-studentSignature -caretakerSignature -wardenSignature')
      .populate('student', 'name studentId roomNumber hostelName department year')
      .populate('targetCaretaker', 'name')
      .populate('forwardedTo', 'name')
      .populate('forwardedBy', 'name')
      .populate('approvedBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    await expireStaleApplications(applications);
    return sendPage(res, applications, {
      limit,
      skip,
      label: 'leave/all',
      count: () => LeaveApplication.estimatedDocumentCount(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/pending — private (Caretaker)
const getPendingLeaveApplications = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const filter = { status: 'Pending', ...(await scopedStudentFilter(req.user)) };
    const applications = await LeaveApplication.find(filter)
      .select(LIST_PROJECTION)
      .populate('student', 'name studentId roomNumber hostelName')
      .sort({ leaveDate: 1 })
      .skip(skip)
      .limit(limit);

    await expireStaleApplications(applications);
    const stillPending = applications.filter((a) => a.status === 'Pending');

    // The letter viewer renders the student's signature, and the decided-state block the
    // caretaker's or warden's.
    const presence = await signaturePresence(
      LeaveApplication,
      stillPending.map((a) => a._id),
      ['studentSignature', 'caretakerSignature', 'wardenSignature']
    );

    // `fetched` is the window, not stillPending.length — expiry above can drop rows, and a
    // short *result* from a full window must not read as "nothing more to fetch".
    return sendPage(res, stillPending.map((a) => withSignatureFlags(a.toObject(), presence)), {
      limit,
      skip,
      fetched: applications.length,
      label: 'leave/pending',
      count: () => LeaveApplication.countDocuments(filter),
    });
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
    const { limit, skip } = readPageParams(req);
    const filter = {
      $and: [
        { $or: [DECIDED_FILTER, { status: 'Forwarded' }] },
        await scopedStudentFilter(req.user),
      ],
    };
    const applications = await LeaveApplication.find(filter)
      .select(LIST_PROJECTION)
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedTo', 'name')
      .populate('approvedBy', 'name role')
      .sort({ decidedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    // Same viewer as /leave/pending — mapLeaveHistory spreads mapLeavePending.
    const presence = await signaturePresence(
      LeaveApplication,
      applications.map((a) => a._id),
      ['studentSignature', 'caretakerSignature', 'wardenSignature']
    );

    return sendPage(
      res,
      applications.map((a) => withSignatureFlags(withDecisionMeta(a), presence)),
      {
        limit,
        skip,
        label: 'leave/history',
        count: () => LeaveApplication.countDocuments(filter),
      }
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/leave/:id/status — private (Caretaker)
const updateLeaveStatus = async (req, res) => {
  const { status, remarks } = req.body;

  // Only Approved/Rejected here — trip-lifecycle statuses belong to the gate scan flow and must not be settable by a caretaker.
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({
      message: 'Status can only be set to Approved or Rejected.',
    });
  }

  // Approving mints a pass, so it carries the caretaker's saved signature. (Rejection
  // needs none.) Inside the try: this is a DB read now, so a failure belongs on the
  // same 500 path as every other query in this handler.
  try {
    const caretakerSignature =
      status === 'Approved' ? await fetchOwnSignature(req.user) : null;
    if (status === 'Approved' && !caretakerSignature) {
      return sendSignatureRequired(
        res,
        'Add your signature in your profile before approving applications.'
      );
    }

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
    const { limit, skip } = readPageParams(req);
    const filter = forwardedToFilter(req.user);
    const applications = await LeaveApplication.find(filter)
      .select(LIST_PROJECTION)
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedBy', 'name')
      .sort({ forwardedAt: 1 })
      .skip(skip)
      .limit(limit);

    // A forwarded pass can still go stale while it waits on the warden.
    await expireStaleApplications(applications);
    const stillForwarded = applications.filter((a) => a.status === 'Forwarded');

    // ForwardedLeaveView renders the student's signature in the letter.
    const presence = await signaturePresence(
      LeaveApplication,
      stillForwarded.map((a) => a._id),
      ['studentSignature']
    );

    return sendPage(res, stillForwarded.map((a) => withSignatureFlags(a.toObject(), presence)), {
      limit,
      skip,
      fetched: applications.length,
      label: 'leave/forwarded',
      count: () => LeaveApplication.countDocuments(filter),
    });
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
    const { limit, skip } = readPageParams(req);
    const filter = { $and: [DECIDED_FILTER, await scopedStudentFilter(req.user)] };
    const applications = await LeaveApplication.find(filter)
      .select(LIST_PROJECTION)
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedBy', 'name')
      .populate('approvedBy', 'name role')
      .sort({ decidedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    return sendPage(res, applications.map(withDecisionMeta), {
      limit,
      skip,
      label: 'leave/warden-history',
      count: () => LeaveApplication.countDocuments(filter),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/leave/:id/warden-status — private (Warden). Final decision on a forwarded
// application. Warden approves (with their own signature) -> Approved and the pass is
// live; warden rejects (with reason) -> Rejected.
const updateWardenLeaveStatus = async (req, res) => {
  const { status, remarks } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status can only be set to Approved or Rejected.' });
  }

  if (status === 'Rejected' && !remarks) {
    return res.status(400).json({ message: 'A reason is required when rejecting a leave application.' });
  }

  // See updateLeaveStatus: the signature read moved inside the try with the queries.
  // It only fires on 'Approved' and the remarks check only on 'Rejected', so the two
  // are mutually exclusive and reordering them changes no response.
  try {
    const wardenSignature =
      status === 'Approved' ? await fetchOwnSignature(req.user) : null;
    if (status === 'Approved' && !wardenSignature) {
      return sendSignatureRequired(
        res,
        'Add your signature in your profile before approving applications.'
      );
    }

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

    // Forwarded is cancellable too — it's still undecided, and since it now blocks new
    // applications the student needs a way out while the warden holds it. The warden's
    // decision endpoint re-checks for 'Forwarded', so a cancel won during the race just
    // turns their action into a 409.
    if (!['Pending', 'Approved', 'Forwarded'].includes(application.status)) {
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
  sseHub.attach(req, res);
};

module.exports = {
  createLeaveApplication,
  getMyLeaveApplications,
  getLeaveSignatures,
  getAllLeaveApplications,
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
