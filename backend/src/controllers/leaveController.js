const { Op } = require('sequelize');
const { LeaveApplication, OutingRequest, ScanLog } = require('../models');
const { ACTIVE_PASS_STATUSES } = require('../config/passStatuses');
const { expireStaleApplications } = require('../utils/passExpiry');
const sseHub = require('../utils/sseHub');
const { readPageParams, sendPage } = require('../utils/pagination');
const {
  PARENT_PHONE_RE,
  DEPARTURE_TIME_RE,
  LATEST_DEPARTURE_TIME,
  MAX_TICKET_BYTES,
  TICKET_MIME_TYPES,
} = require('../utils/leaveSchema');
const { parseDataUrl } = require('../models/_shared');
const { isDayScholar } = require('../config/hostels');
const { estimatedRowCount } = require('../utils/rowCount');
const {
  notifyCaretakers,
  notifyWardensForScope,
  notifyChiefWardens,
  notifyAdmins,
  notifyStudent,
} = require('../utils/pushService');
const { saveClaimedDecision } = require('../utils/claimForwarded');
const {
  getLeaveSubmissionTimingViolation,
  isEmergencyLeave,
  isLeaveDayOver,
  campusDayStart,
} = require('../utils/outingRules');
const {
  passScope,
  mergeWhere,
  requestInScope,
  canReadSignatures,
  resolveTargetCaretaker,
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
    : 'You already have a leave application awaiting approval. Wait for a decision or cancel it before applying again.';

// Girls' leave waits for a decision; boys' is approved on submit. 'Other' follows the boys'
// rule, as it does everywhere else (hostelScope.scopeGenders).
const needsApproval = (student) => student.gender === 'Female';

// A girl's application is open in these statuses. 'Forwarded' only exists on rows filed
// under the old caretaker-forwards-to-warden flow; those are decided like any other.
const UNDECIDED_STATUSES = ['Pending', 'Forwarded'];

// What a student may still cancel: anything not yet used at the gate or decided against.
const CANCELLABLE_STATUSES = ['Pending', 'Approved', 'Forwarded'];

// The roles that decide a girl's leave and may revoke a boy's.
const DECIDER_ROLES = ['Caretaker', 'Warden', 'ChiefWarden'];

// The marker on a boy's auto-approved leave, and what the boys' feed filters on.
const SYSTEM_ROLE = 'System';
const NOT_AUTO_APPROVED = {
  [Op.or]: [{ decidedByRole: null }, { decidedByRole: { [Op.ne]: SYSTEM_ROLE } }],
};

const fmtDay = (date) =>
  new Date(date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' });

// The ticket's bytes never ride in a response that also lists the row: they come from
// GET /:id/ticket. `ticketMime` stays, so the client knows a ticket exists.
const withoutTicketBytes = (application) => {
  const json = application.toJSON();
  delete json.ticket;
  return json;
};

// Validates the optional ticket data URL. Returns { ticket } or { error }.
const readTicket = (value) => {
  if (value === undefined || value === null || value === '') return { ticket: null };
  const parsed = parseDataUrl(value);
  if (!parsed || !TICKET_MIME_TYPES.includes(parsed.mime)) {
    return { error: 'The ticket must be a photo (JPEG, PNG or WebP) or a PDF.' };
  }
  if (parsed.buffer.length > MAX_TICKET_BYTES) {
    return { error: 'The ticket file is too large. Upload one under 700 KB, or a screenshot of the ticket.' };
  }
  return { ticket: value };
};

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

// Only a live outing blocks a leave application: outings have no request step, so the one
// that matters is a student who is out right now.
const OUTING_IN_PROGRESS_MESSAGE =
  'You already have an outing in progress. Log your entry at the gate before applying for leave.';


// POST /api/leave — private (Student)
//
// Boys: approved on submit (decidedByRole 'System'); the caretaker, wardens, chief warden
// and admins are told, and any of the first three may revoke it until he is Out.
// Girls: Pending, and sent to her caretaker, her hostel's wardens and the chief warden at
// once; whichever of them acts first decides it (decideLeaveApplication).
const createLeaveApplication = async (req, res) => {
  const { destination, reason, leaveDate, returnDate, acknowledgement, targetCaretakerId } = req.body;
  const parentPhone = typeof req.body.parentPhone === 'string' ? req.body.parentPhone.trim() : '';
  const expectedDepartureTime =
    typeof req.body.expectedDepartureTime === 'string' ? req.body.expectedDepartureTime.trim() : '';

  try {
    // Leave is leaving the hostel; a day scholar goes home every evening and has no
    // caretaker or warden to decide one.
    if (isDayScholar(req.user)) {
      return res.status(403).json({ code: 'DAY_SCHOLAR', message: 'Day scholars do not apply for leave.' });
    }
    if (!destination || !reason || !leaveDate || !returnDate) {
      return res.status(400).json({ message: 'Destination, reason, leave date and return date are all required.' });
    }
    // Boys and girls alike, so the caretaker and warden can call home about this leave.
    if (!PARENT_PHONE_RE.test(parentPhone)) {
      return res.status(400).json({ message: "Enter your parent's 10-digit mobile number (digits only)." });
    }
    // Only the expected hour, for the staff: the leave QR still works at any time that day.
    if (!DEPARTURE_TIME_RE.test(expectedDepartureTime)) {
      return res.status(400).json({ message: 'Enter the time you expect to leave on the leave date.' });
    }
    if (expectedDepartureTime > LATEST_DEPARTURE_TIME) {
      return res.status(400).json({ message: 'The expected departure time must be 5:30 PM or earlier.' });
    }
    const { ticket, error: ticketError } = readTicket(req.body.ticket);
    if (ticketError) {
      return res.status(400).json({ message: ticketError });
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

    // The departure is a day, not a time: the leave QR works at any hour of it. Whatever
    // instant the client sent is pinned to campus midnight of its campus day, so every new
    // row means the same thing and the dashboards can render it as a date.
    const leaveDateObj = campusDayStart(leaveDate);
    const returnDateObj = new Date(returnDate);

    if (!leaveDateObj || Number.isNaN(leaveDateObj.getTime()) || Number.isNaN(returnDateObj.getTime())) {
      return res.status(400).json({ message: 'Leave date and return date must be valid dates.' });
    }

    if (returnDateObj.getTime() <= leaveDateObj.getTime()) {
      return res.status(400).json({ message: 'Return date cannot be before the leave date.' });
    }

    if (getLeaveSubmissionTimingViolation(req.user.gender, leaveDateObj)) {
      return res.status(400).json({
        message: 'The leave date cannot be in the past.',
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

    // A request left open by the old outing flow does not block: the leave departure burns it
    // at the gate (scanController).
    const outingInProgress = await OutingRequest.findOne({
      where: { studentId: req.user._id, status: 'Out' },
      attributes: ['id', 'status'],
    });
    if (outingInProgress) {
      return res.status(409).json({
        message: OUTING_IN_PROGRESS_MESSAGE,
        status: outingInProgress.status,
        activeRequestId: outingInProgress.id,
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

    const autoApprove = !needsApproval(req.user);
    const isEmergency = isEmergencyLeave(req.user.gender, leaveDateObj);

    const application = await LeaveApplication.create({
      studentId: req.user._id,
      destination,
      reason,
      leaveDate: leaveDateObj,
      returnDate: returnDateObj,
      parentPhone,
      expectedDepartureTime,
      isEmergency,
      ticket,
      acknowledgement: true,
      studentSignature,
      targetCaretaker: targetCaretaker ? targetCaretaker.id : null,
      ...(autoApprove
        ? { status: 'Approved', decision: 'Approved', decidedAt: new Date(), decidedByRole: SYSTEM_ROLE }
        : { status: 'Pending' }),
    });

    sseHub.broadcast('leave:changed', {
      reason: 'created',
      id: application.id,
      status: application.status,
    });

    const caretakerScope = targetCaretaker
      ? { caretakerId: targetCaretaker.id }
      : { hostelName: req.user.hostelName, gender: req.user.gender };
    const wardenScope = { hostelName: req.user.hostelName };
    const span = `${fmtDay(leaveDateObj)} to ${fmtDay(returnDateObj)}, leaving around ${expectedDepartureTime}`;

    if (autoApprove) {
      const payload = {
        title: '🏠 Leave Auto-Approved',
        body: `${req.user.name} (${req.user.hostelName || 'no hostel'}) is on leave ${span}.`,
      };
      notifyCaretakers(caretakerScope, { ...payload, url: '/dashboard/caretaker?view=leave' });
      notifyWardensForScope(wardenScope, { ...payload, url: '/dashboard/warden?view=leave' });
      notifyChiefWardens({ ...payload, url: '/dashboard/chief-warden?view=leaves' });
      notifyAdmins({ ...payload, url: '/dashboard/admin?view=leave' });
    } else {
      const payload = {
        title: isEmergency ? '🚨 Emergency Leave Application' : '📋 New Leave Application',
        body: `${req.user.name} has applied for leave ${span}.${isEmergency ? ' She wants to leave today.' : ''}`,
      };
      notifyCaretakers(caretakerScope, { ...payload, url: '/dashboard/caretaker?view=leave' });
      notifyWardensForScope(wardenScope, { ...payload, url: '/dashboard/warden?view=leave' });
      notifyChiefWardens({ ...payload, url: '/dashboard/chief-warden?view=leaves' });
    }

    res.status(201).json(withoutTicketBytes(application));
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

// When the student actually left and came back, from the gate scans logged against each
// leave. The leave row stores only the planned dates; the gate's OUT and IN scans carry
// leave_id. Filtered on student_id too, so the read runs on scan_logs_student_created.
const actualGateTimes = async (studentId, leaveIds) => {
  const times = new Map();
  if (!leaveIds.length) return times;
  const logs = await ScanLog.findAll({
    where: { studentId, leaveId: { [Op.in]: leaveIds } },
    attributes: ['leaveId', 'direction', 'createdAt'],
    order: [['createdAt', 'ASC']],
    raw: true,
  });
  for (const log of logs) {
    const entry = times.get(log.leaveId) || { actualOutTime: null, actualInTime: null };
    if (log.direction === 'OUT' && !entry.actualOutTime) entry.actualOutTime = log.createdAt;
    if (log.direction === 'IN') entry.actualInTime = log.createdAt;
    times.set(log.leaveId, entry);
  }
  return times;
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
    const gateTimes = await actualGateTimes(req.user._id, applications.map((a) => a.id));

    const rows = applications.map((a) => ({
      ...withSignatureFlags(a.toJSON(), presence),
      ...(gateTimes.get(a.id) || { actualOutTime: null, actualInTime: null }),
    }));

    return sendPage(res, rows, {
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

// GET /api/leave/:id/ticket — private (owner student / staff in scope)
//
// The optional travel ticket, fetched only when someone opens it. Same read scope as the
// signatures: the owner, staff of the student's hostel, the chief warden and admins.
const getLeaveTicket = async (req, res) => {
  try {
    const application = await LeaveApplication.findByPk(req.params.id, {
      attributes: ['id', 'studentId', 'targetCaretaker', 'forwardedTo', 'ticket', 'ticketMime'],
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName'] }],
    });

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }
    if (!canReadSignatures(req.user, application, application.student)) {
      return res.status(403).json({ message: 'This application is not in your scope.' });
    }
    if (!application.ticket) {
      return res.status(404).json({ message: 'No ticket was attached to this application.' });
    }

    res.json({ ticket: application.ticket });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/all — private (ChiefWarden, Admin). Campus-wide oversight.
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

// GET /api/leave/pending — private (Caretaker, Warden, ChiefWarden)
//
// The decision queue: girls' applications still open, in the caller's scope. The same row
// sits in the caretaker's, every hostel warden's and the chief warden's queue at once;
// whoever acts first decides it. Emergencies (filed on the departure day) come first.
const getPendingLeaveApplications = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(LeaveApplication, req.user, QUEUE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, { status: { [Op.in]: UNDECIDED_STATUSES } });

    const applications = await LeaveApplication.findAll({
      where,
      include: [
        ...scope.include,
        { association: 'targetCaretakerUser', attributes: ['id', 'name'] },
      ],
      order: [['isEmergency', 'DESC'], ['leaveDate', 'ASC'], ['createdAt', 'ASC']],
      offset: skip,
      limit,
      subQuery: false,
    });

    await expireStaleApplications(applications);
    const stillOpen = applications.filter((a) => UNDECIDED_STATUSES.includes(a.status));

    // The letter viewer renders the student's signature.
    const presence = await signaturePresence(
      LeaveApplication,
      stillOpen.map((a) => a.id),
      ['studentSignature', 'caretakerSignature', 'wardenSignature']
    );

    // `fetched` is the window, not stillOpen.length — expiry above can drop rows, and a
    // short *result* from a full window must not read as "nothing more to fetch".
    return sendPage(res, stillOpen.map((a) => withSignatureFlags(a.toJSON(), presence)), {
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

// GET /api/leave/auto-approved — private (Caretaker, Warden, ChiefWarden, Admin)
//
// Boys' leave, approved on submit. Newest first, every status, so the feed doubles as the
// record: a row still 'Approved' can be revoked; one revoked shows who did it and why.
const getAutoApprovedLeaves = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(LeaveApplication, req.user, WIDE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, { decidedByRole: SYSTEM_ROLE });
    // A revoked row's decidedByRole moved on to the revoker, so it is matched by revokedAt.
    const revokedWhere = mergeWhere(scope.where, { revokedAt: { [Op.ne]: null } });
    const feedWhere = { [Op.or]: [where, revokedWhere] };

    const applications = await LeaveApplication.findAll({
      where: feedWhere,
      include: [
        ...scope.include,
        { association: 'targetCaretakerUser', attributes: ['id', 'name'] },
        { association: 'approvedByUser', attributes: ['id', 'name', 'role'] },
      ],
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
      subQuery: false,
    });

    await expireStaleApplications(applications);

    const presence = await signaturePresence(
      LeaveApplication,
      applications.map((a) => a.id),
      ['studentSignature']
    );

    return sendPage(
      res,
      applications.map((a) => withSignatureFlags(withDecisionMeta(a), presence)),
      {
        limit,
        skip,
        label: 'leave/auto-approved',
        count: () => LeaveApplication.count({ where: feedWhere, include: scope.include, distinct: true }),
      }
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/leave/history — private (Caretaker, Warden, ChiefWarden)
//
// Every girl's application someone decided, in the caller's scope, whoever decided it.
// Keyed off the frozen `decision`, not `status`, so a later cancel/expire/gate scan can't
// erase the record of what was approved. Boys' auto-approved leave lives in its own feed.
const getLeaveHistory = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(LeaveApplication, req.user, QUEUE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, DECIDED_FILTER, NOT_AUTO_APPROVED, { revokedAt: null });

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

// PATCH /api/leave/:id/status — private (Caretaker, Warden, ChiefWarden)
//
// Decides a girl's open application. The caretaker it is routed to, any warden of her
// hostel, or the chief warden may act; the first decision wins (saveClaimedDecision) and
// the rest get a 409 naming the outcome.
const decideLeaveApplication = async (req, res) => {
  const { status } = req.body;
  const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim() : '';

  // Only Approved/Rejected here — trip-lifecycle statuses belong to the gate scan flow.
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status can only be set to Approved or Rejected.' });
  }

  // Approving mints a pass, so it carries the decider's saved signature. (Rejection
  // needs none.) Inside the try: this is a DB read, so a failure belongs on the same 500
  // path as every other query in this handler.
  try {
    const signature = status === 'Approved' ? await fetchOwnSignature(req.user) : null;
    if (status === 'Approved' && !signature) {
      return sendSignatureRequired(
        res,
        'Add your signature in your profile before approving applications.'
      );
    }

    const application = await LeaveApplication.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'name', 'gender', 'hostelName'] }],
    });

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    if (!requestInScope(req.user, application, application.student)) {
      return res.status(403).json({ message: 'This application is not in your scope.' });
    }

    // Only an open application can be decided; live/terminal passes can't be flipped back.
    if (!UNDECIDED_STATUSES.includes(application.status)) {
      return res.status(409).json({
        message: `This application has already been ${application.status.toLowerCase()} and can no longer be changed.`,
        status: application.status,
      });
    }

    // Approving after the leave date passed would mint an already-expired pass.
    if (status === 'Approved' && isLeaveDayOver(application.leaveDate)) {
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
    // Immutable audit verdict — `status` moves on from here (Out/Returned/Cancelled/
    // Expired), `decision` does not, so history stays complete.
    application.decision = status;
    application.decidedAt = new Date();
    application.decidedByRole = req.user.role;
    if (status === 'Approved') {
      if (req.user.role === 'Caretaker') {
        application.caretakerSignature = signature;
      } else {
        application.wardenSignature = signature;
        // Mirror into caretakerSignature too: the student's leave view reads
        // caretakerSignature as "the signed pass", so a warden- or chief-warden-approved
        // pass must carry it there to render like a caretaker-signed one.
        application.caretakerSignature = signature;
      }
    }

    if (!(await saveClaimedDecision(LeaveApplication, application, UNDECIDED_STATUSES))) {
      const current = await LeaveApplication.findByPk(application.id, { attributes: ['id', 'status'] });
      return res.status(409).json({
        message: `Someone else has already acted on this application — it is now ${String(current?.status || 'decided').toLowerCase()}.`,
        status: current?.status,
      });
    }

    sseHub.broadcast('leave:changed', { reason: 'status', id: application.id, status: application.status });

    notifyStudent(application.studentId, {
      title: status === 'Approved' ? '✅ Leave Approved' : '❌ Leave Rejected',
      body:
        status === 'Approved'
          ? `Your leave from ${fmtDay(application.leaveDate)} is approved. Show your Leave QR at the gate.`
          : `Your leave application was rejected.${remarks ? ` ${remarks}` : ''}`,
      url: '/dashboard/student/leave-application',
    });

    res.json(withoutTicketBytes(application));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/leave/:id/revoke — private (Caretaker, Warden, ChiefWarden)
//
// Withdraws a boy's auto-approved leave, with a reason, any time before the gate takes him
// Out. The row reads as Rejected afterwards (so the gate refuses the leave QR), and
// revokedAt records that it was a revocation rather than an original rejection.
const revokeLeaveApplication = async (req, res) => {
  const remarks = typeof req.body.remarks === 'string' ? req.body.remarks.trim() : '';
  if (!remarks) {
    return res.status(400).json({ message: 'A reason is required to revoke a leave.' });
  }

  try {
    const application = await LeaveApplication.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'name', 'gender', 'hostelName'] }],
    });

    if (!application) {
      return res.status(404).json({ message: 'Leave application not found' });
    }

    if (!requestInScope(req.user, application, application.student)) {
      return res.status(403).json({ message: 'This application is not in your scope.' });
    }

    if (application.decidedByRole !== SYSTEM_ROLE) {
      return res.status(409).json({
        message: 'Only an auto-approved leave can be revoked.',
        status: application.status,
      });
    }

    if (application.status !== 'Approved') {
      return res.status(409).json({
        message:
          application.status === 'Out'
            ? 'The student has already left campus on this leave, so it can no longer be revoked.'
            : `This leave is already ${application.status.toLowerCase()} and can no longer be revoked.`,
        status: application.status,
      });
    }

    application.status = 'Rejected';
    application.decision = 'Rejected';
    application.decidedAt = new Date();
    application.decidedByRole = req.user.role;
    application.approvedBy = req.user._id;
    application.remarks = remarks;
    application.revokedAt = new Date();

    // Loses cleanly to a gate scan that took him Out a moment earlier.
    if (!(await saveClaimedDecision(LeaveApplication, application, ['Approved']))) {
      const current = await LeaveApplication.findByPk(application.id, { attributes: ['id', 'status'] });
      return res.status(409).json({
        message:
          current?.status === 'Out'
            ? 'The student has just left campus on this leave, so it can no longer be revoked.'
            : 'This leave changed before it could be revoked. Refresh and try again.',
        status: current?.status,
      });
    }

    sseHub.broadcast('leave:changed', { reason: 'revoked', id: application.id, status: application.status });

    notifyStudent(application.studentId, {
      title: '⛔ Leave Revoked',
      body: `Your leave from ${fmtDay(application.leaveDate)} was revoked by the ${req.user.role === 'ChiefWarden' ? 'chief warden' : req.user.role.toLowerCase()}: ${remarks}`,
      url: '/dashboard/student/leave-application',
    });

    res.json(withoutTicketBytes(application));
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

    // Forwarded (a row from the old flow) is cancellable too — it's still undecided. The
    // decision endpoint claims the row conditionally, so a cancel won during the race just
    // turns a staff member's action into a 409.
    if (!CANCELLABLE_STATUSES.includes(application.status)) {
      return res.status(409).json({
        message: `Cannot cancel an application that is already ${application.status.toLowerCase()}.`,
        status: application.status,
      });
    }

    application.status = 'Cancelled';

    // Claimed conditionally, like a decision: a plain save would overwrite a gate scan that
    // took the student Out (or a rejection) landing between the read above and this write,
    // leaving a student off campus on a leave that reads as Cancelled.
    if (!(await saveClaimedDecision(LeaveApplication, application, CANCELLABLE_STATUSES))) {
      const current = await LeaveApplication.findByPk(application.id, { attributes: ['id', 'status'] });
      const now = String(current?.status || 'changed').toLowerCase();
      return res.status(409).json({
        message:
          current?.status === 'Out'
            ? 'You have already left campus on this leave, so it can no longer be cancelled.'
            : `This application was just ${now} and can no longer be cancelled.`,
        status: current?.status,
      });
    }

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
  getLeaveTicket,
  getAllLeaveApplications,
  getPendingLeaveApplications,
  getAutoApprovedLeaves,
  getLeaveHistory,
  decideLeaveApplication,
  revokeLeaveApplication,
  cancelLeaveApplication,
  streamLeaveEvents,
  DECIDER_ROLES,
};
