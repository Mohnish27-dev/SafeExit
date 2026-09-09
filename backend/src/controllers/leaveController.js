const { Op } = require('sequelize');
const { LeaveApplication, OutingRequest } = require('../models');
const { ACTIVE_PASS_STATUSES } = require('../config/passStatuses');
const { expireStaleRequests, expireStaleApplications } = require('../utils/passExpiry');
const sseHub = require('../utils/sseHub');
const { readPageParams, sendPage } = require('../utils/pagination');
const { estimatedRowCount } = require('../utils/rowCount');
const { notifyCaretakers, notifyWarden } = require('../utils/pushService');
const {
  getLeaveSubmissionTimingViolation,
  isBeforeEveningCurfew,
} = require('../utils/outingRules');
const {
  passScope,
  mergeWhere,
  forwardedToFilter,
  requestInScope,
  canReadSignatures,
  resolveTargetCaretaker,
  resolveWardenForHostel,
} = require('../utils/hostelScope');
const {
  fetchOwnSignature,
  sendSignatureRequired,
  signaturePresence,
  withSignatureFlags,
} = require('../utils/signature');

const QUEUE_STUDENT_FIELDS = ['id', 'name', 'studentId', 'roomNumber', 'hostelName'];
const WIDE_STUDENT_FIELDS = [...QUEUE_STUDENT_FIELDS, 'department', 'year'];
const SIGNATURE_ATTRIBUTES = [
  'studentSignature', 'studentSignatureMime',
  'caretakerSignature', 'caretakerSignatureMime',
  'wardenSignature', 'wardenSignatureMime',
];

// See the note in outingController: MongoDB sorted a null decidedAt as the lowest value
// and Postgres sorts it as the highest, so without NULLS LAST every undecided row would
// jump to the top of the history.
const NEWEST_DECISION_FIRST = [
  ['decidedAt', 'DESC NULLS LAST'],
  ['updatedAt', 'DESC NULLS LAST'],
];

// 'Forwarded' counts as live too — an application sitting with the warden must block a
// second one just like a Pending one does, or a student could stack approvals.
// Sourced from config/passStatuses.js because the partial unique index
// one_active_leave_per_student filters on the same list; if the two drift, the index
// enforces a different rule than this check and the double-submit race reopens.
const ACTIVE_LEAVE_STATUSES = ACTIVE_PASS_STATUSES;

const ONE_ACTIVE_LEAVE_CONSTRAINT = 'one_active_leave_per_student';

const isOneActivePassViolation = (error, constraint) =>
  error?.name === 'SequelizeUniqueConstraintError' &&
  (error.parent?.constraint === constraint || error.parent?.constraint === undefined);

// Shared by the pre-check below and the unique-violation branch in the catch, so a student
// who loses the insert race sees exactly the message they'd have seen by arriving a moment
// later.
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
  [Op.or]: [
    { decision: { [Op.in]: ['Approved', 'Rejected'] } },
    { decision: null, status: { [Op.in]: ['Approved', 'Rejected'] } },
  ],
};

// `status` moved on but the pass never got used as decided (student cancelled, or the leave
// date came and went). History still shows the verdict; this is the footnote explaining it.
const LAPSED_STATUSES = ['Cancelled', 'Expired'];

// Normalises a history row: legacy rows get `decision` derived from status, and every row
// gets `lapsed` so the dashboards don't each have to re-derive it.
const withDecisionMeta = (doc) => {
  const obj = doc.toJSON();
  obj.decision = obj.decision || (['Approved', 'Rejected'].includes(obj.status) ? obj.status : null);
  obj.lapsed = LAPSED_STATUSES.includes(obj.status) ? obj.status : null;
  return obj;
};

const blockingOutingForLeaveMessage = (status) =>
  status === 'Out'
    ? 'You already have an outing in progress. Log your entry at the gate before applying for leave.'
    : status === 'Forwarded'
    ? 'Your outing request is with the warden for a decision. Wait for the outcome or cancel it before applying for leave.'
    : `You already have an active outing request (${String(status).toLowerCase()}). Complete that journey or cancel it before applying for leave.`;


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
    // while the rejection happens before any row is created or state is touched.
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
    const existingActive = await LeaveApplication.findAll({
      where: { studentId: req.user._id, status: { [Op.in]: ACTIVE_LEAVE_STATUSES } },
    });
    await expireStaleApplications(existingActive);
    const blockingLeave = existingActive.find((doc) => ACTIVE_LEAVE_STATUSES.includes(doc.status));

    if (blockingLeave) {
      return res.status(409).json({
        message: blockingLeaveMessage(blockingLeave.status),
        status: blockingLeave.status,
        activeLeaveId: blockingLeave.id,
      });
    }

    const existingOutings = await OutingRequest.findAll({
      where: { studentId: req.user._id, status: { [Op.in]: ACTIVE_LEAVE_STATUSES } },
    });
    await expireStaleRequests(existingOutings);
    const blockingOuting = existingOutings.find((doc) => ACTIVE_LEAVE_STATUSES.includes(doc.status));
    if (blockingOuting) {
      return res.status(409).json({
        message: blockingOutingForLeaveMessage(blockingOuting.status),
        status: blockingOuting.status,
        activeRequestId: blockingOuting.id,
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
      studentId: req.user._id,
      destination,
      reason,
      leaveDate: leaveDateObj,
      returnDate: returnDateObj,
      acknowledgement: true,
      status: 'Pending',
      studentSignature,
      targetCaretaker: targetCaretaker ? targetCaretaker.id : null,
    });

    sseHub.broadcast('leave:changed', {
      reason: 'created',
      id: application.id,
      status: application.status,
    });

    const scope = targetCaretaker
      ? { caretakerId: targetCaretaker.id }
      : { hostelName: req.user.hostelName, gender: req.user.gender };
    notifyCaretakers(scope, {
      title: '📋 New Leave Application',
      body: `${req.user.name} has applied for leave from ${leaveDateObj.toLocaleDateString()} to ${returnDateObj.toLocaleDateString()}.`,
      url: '/dashboard/caretaker?view=leave',
    });

    res.status(201).json(application);
  } catch (error) {
    // Lost the insert race — a concurrent POST from the same student committed first and
    // one_active_leave_per_student rejected this one. Answer with the same 409 the
    // pre-check would have produced. See outingController for why the constraint name is
    // asserted rather than treating every duplicate key as this case.
    if (isOneActivePassViolation(error, ONE_ACTIVE_LEAVE_CONSTRAINT)) {
      const blocking = await LeaveApplication.findOne({
        where: { studentId: req.user._id, status: { [Op.in]: ACTIVE_LEAVE_STATUSES } },
        attributes: ['id', 'status'],
      });

      return res.status(409).json({
        message: blocking
          ? blockingLeaveMessage(blocking.status)
          : 'You already have a live leave application. Wait for a decision or cancel it before applying again.',
        status: blocking ? blocking.status : undefined,
        activeLeaveId: blocking ? blocking.id : undefined,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/myrequests — private (Student)
const getMyLeaveApplications = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const where = { studentId: req.user._id };
    const applications = await LeaveApplication.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
    });
    await expireStaleApplications(applications);

    const presence = await signaturePresence(
      LeaveApplication,
      applications.map((a) => a.id),
      ['caretakerSignature', 'wardenSignature']
    );

    return sendPage(res, applications.map((a) => withSignatureFlags(a.toJSON(), presence)), {
      limit,
      skip,
      label: 'leave/myrequests',
      count: () => LeaveApplication.count({ where }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/:id/signatures — private (owner student / routed staff)
const getLeaveSignatures = async (req, res) => {
  try {
    // Naming the signature attributes explicitly overrides the model's defaultScope
    // exclusion for this one query — the single endpoint that serves the bytes.
    const application = await LeaveApplication.findByPk(req.params.id, {
      attributes: ['id', 'studentId', 'targetCaretaker', 'forwardedTo', ...SIGNATURE_ATTRIBUTES],
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName'] }],
    });

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
    const applications = await LeaveApplication.findAll({
      include: [
        { association: 'student', attributes: WIDE_STUDENT_FIELDS },
        { association: 'targetCaretakerUser', attributes: ['id', 'name'] },
        { association: 'forwardedToUser', attributes: ['id', 'name'] },
        { association: 'forwardedByUser', attributes: ['id', 'name'] },
        { association: 'approvedByUser', attributes: ['id', 'name', 'role'] },
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
      subQuery: false,
    });

    await expireStaleApplications(applications);
    return sendPage(res, applications, {
      limit,
      skip,
      label: 'leave/all',
      // The analogue of estimatedDocumentCount — see utils/rowCount.js.
      count: () => estimatedRowCount(LeaveApplication),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/pending — private (Caretaker)
const getPendingLeaveApplications = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(LeaveApplication, req.user, QUEUE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, { status: 'Pending' });

    const applications = await LeaveApplication.findAll({
      where,
      include: scope.include,
      order: [['leaveDate', 'ASC']],
      offset: skip,
      limit,
      subQuery: false,
    });

    await expireStaleApplications(applications);
    const stillPending = applications.filter((a) => a.status === 'Pending');

    // The letter viewer renders the student's signature, and the decided-state block the
    // caretaker's or warden's.
    const presence = await signaturePresence(
      LeaveApplication,
      stillPending.map((a) => a.id),
      ['studentSignature', 'caretakerSignature', 'wardenSignature']
    );

    // `fetched` is the window, not stillPending.length — expiry above can drop rows, and a
    // short *result* from a full window must not read as "nothing more to fetch".
    return sendPage(res, stillPending.map((a) => withSignatureFlags(a.toJSON(), presence)), {
      limit,
      skip,
      fetched: applications.length,
      label: 'leave/pending',
      count: () => LeaveApplication.count({ where, include: scope.include, distinct: true }),
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
    const scope = passScope(LeaveApplication, req.user, QUEUE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, {
      [Op.or]: [DECIDED_FILTER, { status: 'Forwarded' }],
    });

    const applications = await LeaveApplication.findAll({
      where,
      include: [
        ...scope.include,
        { association: 'forwardedToUser', attributes: ['id', 'name'] },
        { association: 'approvedByUser', attributes: ['id', 'name', 'role'] },
      ],
      order: NEWEST_DECISION_FIRST,
      offset: skip,
      limit,
      subQuery: false,
    });

    // Same viewer as /leave/pending — mapLeaveHistory spreads mapLeavePending.
    const presence = await signaturePresence(
      LeaveApplication,
      applications.map((a) => a.id),
      ['studentSignature', 'caretakerSignature', 'wardenSignature']
    );

    return sendPage(
      res,
      applications.map((a) => withSignatureFlags(withDecisionMeta(a), presence)),
      {
        limit,
        skip,
        label: 'leave/history',
        count: () => LeaveApplication.count({ where, include: scope.include, distinct: true }),
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

    const application = await LeaveApplication.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName'] }],
    });

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
        id: application.id,
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

    await application.save();

    sseHub.broadcast('leave:changed', {
      reason: 'status',
      id: application.id,
      status: application.status,
    });

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// PATCH /api/leave/:id/forward — private (Caretaker)
const forwardLeaveApplication = async (req, res) => {
  const { note } = req.body;

  try {
    const application = await LeaveApplication.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName', 'name'] }],
    });

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
      sseHub.broadcast('leave:changed', { reason: 'expired', id: application.id, status: 'Expired' });
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
    application.forwardedTo = warden.id;
    application.forwardedBy = req.user._id;
    application.forwardedNote = note || null;
    application.forwardedAt = new Date();

    await application.save();

    sseHub.broadcast('leave:changed', { reason: 'forwarded', id: application.id, status: 'Forwarded' });

    notifyWarden(warden.id, {
      title: '⬆️ Leave Forwarded to You',
      body: `${req.user.name} forwarded ${application.student.name}'s leave application for your decision.`,
      url: '/dashboard/warden?view=leave',
    });

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/forwarded — private (Warden); the warden's action queue.
const getForwardedLeaveApplications = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const where = forwardedToFilter(req.user);
    const applications = await LeaveApplication.findAll({
      where,
      include: [
        { association: 'student', attributes: QUEUE_STUDENT_FIELDS },
        { association: 'forwardedByUser', attributes: ['id', 'name'] },
      ],
      order: [['forwardedAt', 'ASC']],
      offset: skip,
      limit,
      subQuery: false,
    });

    // A forwarded pass can still go stale while it waits on the warden.
    await expireStaleApplications(applications);
    const stillForwarded = applications.filter((a) => a.status === 'Forwarded');

    // ForwardedLeaveView renders the student's signature in the letter.
    const presence = await signaturePresence(
      LeaveApplication,
      stillForwarded.map((a) => a.id),
      ['studentSignature']
    );

    return sendPage(res, stillForwarded.map((a) => withSignatureFlags(a.toJSON(), presence)), {
      limit,
      skip,
      fetched: applications.length,
      label: 'leave/forwarded',
      count: () => LeaveApplication.count({ where }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/warden-history — private (Warden); every decided application in their
// hostel, not just the escalations they personally ruled on, so the warden and the caretaker
// see the same record. passScope's Warden branch joins on managedHostel, and matches
// nothing for an unassigned warden.
const getWardenLeaveHistory = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(LeaveApplication, req.user, QUEUE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, DECIDED_FILTER);

    const applications = await LeaveApplication.findAll({
      where,
      include: [
        ...scope.include,
        { association: 'forwardedByUser', attributes: ['id', 'name'] },
        { association: 'approvedByUser', attributes: ['id', 'name', 'role'] },
      ],
      order: NEWEST_DECISION_FIRST,
      offset: skip,
      limit,
      subQuery: false,
    });

    return sendPage(res, applications.map(withDecisionMeta), {
      limit,
      skip,
      label: 'leave/warden-history',
      count: () => LeaveApplication.count({ where, include: scope.include, distinct: true }),
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

    const application = await LeaveApplication.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName'] }],
    });

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
      sseHub.broadcast('leave:changed', { reason: 'expired', id: application.id, status: 'Expired' });
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

    await application.save();

    sseHub.broadcast('leave:changed', { reason: 'warden-status', id: application.id, status: application.status });

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

    res.json(application);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/leave/:id/cancel — private (Student)
const cancelLeaveApplication = async (req, res) => {
  try {
    const application = await LeaveApplication.findByPk(req.params.id);

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    if (String(application.studentId) !== String(req.user._id)) {
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
    await application.save();

    sseHub.broadcast('leave:changed', {
      reason: 'cancelled',
      id: application.id,
      status: 'Cancelled',
    });

    res.json(application);
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
