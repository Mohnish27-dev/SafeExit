const { Op } = require('sequelize');
const { OutingRequest, LeaveApplication, DelayNotice } = require('../models');
const { ACTIVE_PASS_STATUSES } = require('../config/passStatuses');
const { expireStaleRequests, expireStaleApplications } = require('../utils/passExpiry');
const { notifyCaretakers, notifyWarden } = require('../utils/pushService');
const {
  isDeparturePassed,
  resolveOutingPolicy,
  normalizeOutingType,
  isWithinDepartureWindow,
  computeReturnDeadline,
  isReturnLate,
} = require('../utils/outingRules');
const sseHub = require('../utils/sseHub');
const { readPageParams, sendPage } = require('../utils/pagination');
const { estimatedRowCount } = require('../utils/rowCount');
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

const clockLabel = (minutes) => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

const QUEUE_STUDENT_FIELDS = ['id', 'name', 'studentId', 'roomNumber', 'hostelName'];
const WIDE_STUDENT_FIELDS = [...QUEUE_STUDENT_FIELDS, 'department', 'year'];
const SIGNATURE_ATTRIBUTES = [
  'studentSignature', 'studentSignatureMime',
  'caretakerSignature', 'caretakerSignatureMime',
  'wardenSignature', 'wardenSignatureMime',
];

// History lists sort on decidedAt, which is NULL for anything still with the warden.
//
// This is one of the few places the two databases genuinely disagree. MongoDB sorts a
// missing or null field as the LOWEST value, so a descending sort put undecided rows at
// the bottom. Postgres treats NULL as the HIGHEST, so a bare DESC would float every
// Forwarded row to the top of the history and push the newest decisions off the first
// page. NULLS LAST restores the order the dashboards were built around.
const NEWEST_DECISION_FIRST = [
  ['decidedAt', 'DESC NULLS LAST'],
  ['updatedAt', 'DESC NULLS LAST'],
];

// A row counts as "decided" if it carries a frozen verdict, or — for rows written before
// `decision` existed — if its status still happens to be the verdict. The second clause is
// what keeps pre-existing history visible without a migration. Auto-approved outings never
// get a `decision` (no human ruled on them) and are excluded outright.
//
// `autoApproved: false` rather than "not true": the column is NOT NULL DEFAULT false, so
// unlike the Mongo field it can never be absent, and the two spellings are now identical.
const DECIDED_FILTER = {
  autoApproved: false,
  [Op.or]: [
    { decision: { [Op.in]: ['Approved', 'Rejected'] } },
    { decision: null, status: { [Op.in]: ['Approved', 'Rejected'] } },
  ],
};

// `status` moved on but the pass never got used as decided.
const LAPSED_STATUSES = ['Cancelled', 'Expired'];

const withDecisionMeta = (doc) => {
  const obj = doc.toJSON();
  obj.decision = obj.decision || (['Approved', 'Rejected'].includes(obj.status) ? obj.status : null);
  obj.lapsed = LAPSED_STATUSES.includes(obj.status) ? obj.status : null;
  return obj;
};

// 'Forwarded' counts as live too — a request sitting with the warden must block a second
// one just like a Pending one does, or a student could stack approvals.
// Sourced from config/passStatuses.js because the partial unique index
// one_active_outing_per_student filters on the same list; if the two drift, the index
// enforces a different rule than this check and the double-submit race reopens.
const ACTIVE_STATUSES = ACTIVE_PASS_STATUSES;

// The database's name for that index. A unique violation carrying it is the lost
// double-submit race, not a bug — see the catch in createOutingRequest.
const ONE_ACTIVE_OUTING_CONSTRAINT = 'one_active_outing_per_student';

const isOneActivePassViolation = (error, constraint) =>
  error?.name === 'SequelizeUniqueConstraintError' &&
  (error.parent?.constraint === constraint || error.parent?.constraint === undefined);

// Shared by the pre-check below and the unique-violation branch in the catch, so a student
// who loses the insert race sees exactly the message they'd have seen by arriving a moment
// later.
const blockingOutingMessage = (status) =>
  status === 'Out'
    ? 'You already have an outing in progress. Log your entry at the gate before creating a new request.'
    : status === 'Forwarded'
    ? 'Your outing request is with the warden for a decision. Wait for the outcome or cancel it before creating a new one.'
    : `You already have a ${String(status).toLowerCase()} outing request. Complete that journey or cancel it before creating a new one.`;

const blockingLeaveForOutingMessage = (status) =>
  status === 'Out'
    ? 'You are currently on leave outside campus. Log your entry at the gate before creating an outing request.'
    : status === 'Forwarded'
    ? 'Your leave application is with the warden for a decision. Wait for the outcome or cancel it before requesting an outing.'
    : `You already have an active leave application (${String(status).toLowerCase()}). Complete or cancel that leave before requesting an outing.`;


// POST /api/outing — private (Student)
const createOutingRequest = async (req, res) => {
  const { destination, purpose, outTime, outingType, targetCaretakerId } = req.body;

  try {
    // Stamped from the student's saved profile signature — never accepted from the body,
    // so no client can substitute someone else's signature.
    //
    // KEEP THIS FIRST: the frontend re-submits automatically after the student captures a
    // signature in response to this 428, which is only safe while the rejection happens
    // before any row is created or state is touched.
    const studentSignature = await fetchOwnSignature(req.user);
    if (!studentSignature) {
      return sendSignatureRequired(
        res,
        'Add your signature to your profile before submitting a request.'
      );
    }

    // Must be 'Inside' to request — prevents stacking passes while off-campus.
    if (req.user.campusStatus && req.user.campusStatus !== 'Inside') {
      return res.status(409).json({
        message:
          'You are currently marked outside campus. Log your entry at the gate before creating a new outing request.',
        campusStatus: req.user.campusStatus,
      });
    }

    const activeRequests = await OutingRequest.findAll({
      where: { studentId: req.user._id, status: { [Op.in]: ACTIVE_STATUSES } },
    });

    await expireStaleRequests(activeRequests);
    const blocking = activeRequests.find((r) => ACTIVE_STATUSES.includes(r.status));
    if (blocking) {
      return res.status(409).json({
        message: blockingOutingMessage(blocking.status),
        status: blocking.status,
        activeRequestId: blocking.id,
      });
    }

    const activeLeaves = await LeaveApplication.findAll({
      where: { studentId: req.user._id, status: { [Op.in]: ACTIVE_STATUSES } },
    });
    await expireStaleApplications(activeLeaves);
    const blockingLeave = activeLeaves.find((l) => ACTIVE_STATUSES.includes(l.status));
    if (blockingLeave) {
      return res.status(409).json({
        message: blockingLeaveForOutingMessage(blockingLeave.status),
        status: blockingLeave.status,
        activeLeaveId: blockingLeave.id,
      });
    }

    // Gender comes from the authenticated user row, never the body.
    const gender = req.user.gender;
    const resolvedType = normalizeOutingType(gender, outingType);
    const policy = resolveOutingPolicy(gender, resolvedType);

    const departure = new Date(outTime);
    if (Number.isNaN(departure.getTime())) {
      return res.status(400).json({ message: 'A valid departure time is required.' });
    }

    // Authoritative window check — client shows the same window for UX only.
    if (!isWithinDepartureWindow(gender, resolvedType, departure)) {
      return res.status(400).json({
        message: `Departure for this outing must be between ${clockLabel(
          policy.departStartMinutes
        )} and ${clockLabel(policy.departEndMinutes)} (campus time). Please choose a time in that window.`,
        window: {
          start: clockLabel(policy.departStartMinutes),
          end: clockLabel(policy.departEndMinutes),
        },
      });
    }

    // Return time is fixed by college rule (8:00 PM, or 5:30 PM for market), never student-chosen.
    const inTime = computeReturnDeadline(gender, resolvedType, departure);

    // Male general and female nearby outings are auto-approved (no caretaker step).
    const autoApproved = !policy.requiresCaretaker;

    // Only caretaker-gated outings carry a routed target. Resolve it (default = own-hostel
    // caretaker) and enforce the same-gender fence server-side before storing.
    let targetCaretaker = null;
    if (!autoApproved) {
      try {
        targetCaretaker = await resolveTargetCaretaker(req.user, targetCaretakerId);
      } catch (err) {
        return res.status(err.statusCode || 400).json({ message: err.message });
      }
    }

    const outingRequest = await OutingRequest.create({
      studentId: req.user._id,
      destination,
      purpose,
      outingType: resolvedType,
      outTime: departure,
      inTime,
      status: autoApproved ? 'Approved' : 'Pending',
      autoApproved,
      // The setter decodes this data URL into bytea plus its mime type.
      studentSignature,
      targetCaretaker: targetCaretaker ? targetCaretaker.id : null,
    });

    sseHub.broadcast('outing:changed', {
      reason: 'created',
      id: outingRequest.id,
      status: outingRequest.status,
    });

    if (!autoApproved) {
      // Route to the chosen caretaker when resolved; else fall back to hostel routing.
      const scope = targetCaretaker
        ? { caretakerId: targetCaretaker.id }
        : { hostelName: req.user.hostelName, gender };
      notifyCaretakers(scope, {
        title: '🔔 New Outing Request',
        body: `${req.user.name} has requested a ${resolvedType} outing to ${destination}.`,
        url: '/dashboard/caretaker?view=requests',
      });
    }

    res.status(201).json(outingRequest);
  } catch (error) {
    // Lost the insert race. The pre-check above found nothing blocking, but a concurrent
    // POST from the same student committed first and one_active_outing_per_student — the
    // partial unique index filtered to ACTIVE_STATUSES — rejected this one. That is not a
    // server error; it is the same "you already have a live request" the pre-check
    // reports, so re-read the winner and answer identically.
    //
    // The Mongo version matched error.code === 11000. Postgres raises a named
    // SequelizeUniqueConstraintError, so the check can now assert WHICH constraint fired
    // rather than treating every duplicate-key error as this one.
    if (isOneActivePassViolation(error, ONE_ACTIVE_OUTING_CONSTRAINT)) {
      const blocking = await OutingRequest.findOne({
        where: { studentId: req.user._id, status: { [Op.in]: ACTIVE_STATUSES } },
        attributes: ['id', 'status'],
      });

      return res.status(409).json({
        message: blocking
          ? blockingOutingMessage(blocking.status)
          : 'You already have a live outing request. Complete that journey or cancel it before creating a new one.',
        status: blocking ? blocking.status : undefined,
        activeRequestId: blocking ? blocking.id : undefined,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/myrequests — private (Student)
const getMyOutingRequests = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const where = { studentId: req.user._id };
    // Signature bytes are excluded by the model's defaultScope, so this list is narrow
    // without having to remember a projection.
    const requests = await OutingRequest.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
    });
    await expireStaleRequests(requests);

    // my-outings shows an "approved & signed by" badge off these two flags and fetches the
    // image from /:id/signatures when the card expands.
    const presence = await signaturePresence(
      OutingRequest,
      requests.map((r) => r.id),
      ['caretakerSignature', 'wardenSignature']
    );

    return sendPage(
      res,
      requests.map((request) => withSignatureFlags({
        ...request.toJSON(),
        // Live display state only. The stored status remains 'Out' until the gate
        // records a return, preserving the movement lifecycle and audit history.
        isOverdue: request.status === 'Out' && isReturnLate(request.inTime),
      }, presence)),
      {
        limit,
        skip,
        label: 'outing/myrequests',
        count: () => OutingRequest.count({ where }),
      }
    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/:id/signatures — private (owner student / routed staff)
// Signature bytes for one request, kept off every list response. Immutable once stamped,
// so the client caches what it fetches.
const getOutingSignatures = async (req, res) => {
  try {
    // The one place that opts back in to the bytes. Naming the attributes explicitly
    // overrides the defaultScope exclusion for this query only.
    const request = await OutingRequest.findByPk(req.params.id, {
      attributes: ['id', 'studentId', 'targetCaretaker', 'forwardedTo', ...SIGNATURE_ATTRIBUTES],
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName'] }],
    });

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }
    if (!canReadSignatures(req.user, request, request.student)) {
      return res.status(403).json({ message: 'This request is not in your scope.' });
    }

    res.json({
      studentSignature: request.studentSignature || null,
      caretakerSignature: request.caretakerSignature || null,
      wardenSignature: request.wardenSignature || null,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/all — private (ChiefWarden). Campus-wide, read-only oversight.
// Signatures are intentionally omitted from this list response; the dashboard needs
// operational details, not large immutable image snapshots.
//
// The worst list in the app: no filter at all, growing by every pass the campus has
// ever issued. Bounded hard — see utils/pagination.js.
const getAllOutingRequests = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const requests = await OutingRequest.findAll({
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

    await expireStaleRequests(requests);
    return sendPage(res, requests, {
      limit,
      skip,
      label: 'outing/all',
      // The analogue of Mongo's estimatedDocumentCount: this is the one list with no
      // predicate at all, so an exact count would seq-scan the whole table just to fill
      // in a header. See utils/rowCount.js.
      count: () => estimatedRowCount(OutingRequest),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/pending — private (Caretaker)
const getPendingRequests = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(OutingRequest, req.user, QUEUE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, { status: 'Pending' });

    const requests = await OutingRequest.findAll({
      where,
      include: scope.include,
      order: [['createdAt', 'ASC']],
      offset: skip,
      limit,
      subQuery: false,
    });

    await expireStaleRequests(requests);
    const stillPending = requests.filter((r) => r.status === 'Pending');

    // The approval modal shows the student's signature before the caretaker signs off; the
    // flag tells it whether there is one to fetch.
    const presence = await signaturePresence(
      OutingRequest,
      stillPending.map((r) => r.id),
      ['studentSignature']
    );

    // `fetched` is the window, not stillPending.length — expiry above can drop rows, and
    // a short *result* from a full window must not read as "nothing more to fetch".
    return sendPage(res, stillPending.map((r) => withSignatureFlags(r.toJSON(), presence)), {
      limit,
      skip,
      fetched: requests.length,
      label: 'outing/pending',
      count: () => OutingRequest.count({ where, include: scope.include, distinct: true }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/overdue — private (staff)
//
// Deliberately *not* paginated. Its filter is `status: 'Out'`, so the result is bounded by
// how many students are off campus right now — it cannot grow with deployment age. And
// because the overdue test runs after the fetch, a window would produce a page of zero
// overdue rows while later ones held real cases, which is a worse failure than the size.
const getOverdueOutings = async (req, res) => {
  try {
    const canViewEmergencyContacts = ['Admin', 'Caretaker', 'Warden', 'ChiefWarden']
      .includes(req.user.role);
    const studentFields = [
      'id', 'name', 'studentId', 'roomNumber', 'hostelName', 'phoneNumber', 'department', 'year',
      ...(canViewEmergencyContacts ? ['guardianPhoneNumber'] : []),
    ];

    const scope = passScope(OutingRequest, req.user, studentFields);
    // closeContacts was a word in a projection string when it was an embedded array. It is
    // a table, so the wider staff view is a nested include and a guard's query never joins
    // it at all.
    if (canViewEmergencyContacts) {
      scope.include[0].include = [{ association: 'closeContacts' }];
    }

    const outings = await OutingRequest.findAll({
      where: mergeWhere(scope.where, { status: 'Out' }),
      include: scope.include,
      order: [['inTime', 'ASC']],
      subQuery: false,
    });

    const overdue = outings.filter((o) => isReturnLate(o.inTime)).map((o) => o.toJSON());

    // Attach any delay notice the student filed, so the dashboards can tell
    // "late but explained" apart from "late and unaccounted for". One lookup for
    // the whole page, not one per row.
    if (overdue.length) {
      const notices = await DelayNotice.findAll({
        where: { outingId: { [Op.in]: overdue.map((o) => o._id) } },
        include: [{ association: 'acknowledgedByUser', attributes: ['id', 'name', 'role'] }],
        order: [['createdAt', 'DESC']],
      });

      const byTrip = new Map();
      for (const n of notices) {
        const key = String(n.outingId);
        if (!byTrip.has(key)) byTrip.set(key, n.toJSON()); // newest wins (sorted desc)
      }
      for (const o of overdue) o.delayNotice = byTrip.get(String(o._id)) || null;
    }

    res.json(overdue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/outing/:id/status — private (Caretaker)
const updateRequestStatus = async (req, res) => {
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
        'Add your signature in your profile before approving requests.'
      );
    }

    const request = await OutingRequest.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName'] }],
    });

    if (request) {
      // Server-side scope re-check: the caretaker must be the routed target (or, for
      // legacy untargeted requests, own this student's hostel).
      if (!requestInScope(req.user, request, request.student)) {
        return res.status(403).json({
          message: 'This request is not routed to you.',
        });
      }

      // Only a still-Pending request can be decided; live/terminal passes can't be flipped back.
      if (request.status !== 'Pending') {
        return res.status(409).json({
          message: `This request has already been ${request.status.toLowerCase()} and can no longer be changed.`,
          status: request.status,
        });
      }

      // Approving after the departure window closed would mint an already-expired pass.
      if (status === 'Approved' && isDeparturePassed(request.outTime)) {
        request.status = 'Expired';
        await request.save();

        sseHub.broadcast('outing:changed', {
          reason: 'expired',
          id: request.id,
          status: 'Expired',
        });

        return res.status(409).json({
          message:
            'This request has expired — the departure time has already passed. It can no longer be approved.',
          status: 'Expired',
        });
      }

      request.status = status;
      if (remarks) request.remarks = remarks;

      if (['Approved', 'Rejected'].includes(status)) {
         request.approvedBy = req.user._id;
         // Immutable audit verdict — `status` moves on from here (Out/Returned/Cancelled/
         // Expired), `decision` does not, so history stays complete.
         request.decision = status;
         request.decidedAt = new Date();
         request.decidedByRole = 'Caretaker';
      }

      if (status === 'Approved') {
        request.caretakerSignature = caretakerSignature;
      }

      await request.save();

      sseHub.broadcast('outing:changed', {
        reason: 'status',
        id: request.id,
        status: request.status,
      });

      res.json(request);
    } else {
      res.status(404).json({ message: 'Request not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/outing/:id/forward — private (Caretaker)
const forwardOutingRequest = async (req, res) => {
  const { note } = req.body;

  try {
    const request = await OutingRequest.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName', 'name'] }],
    });

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (!requestInScope(req.user, request, request.student)) {
      return res.status(403).json({ message: 'This request is not routed to you.' });
    }

    if (request.status !== 'Pending') {
      return res.status(409).json({
        message: `Only a pending request can be forwarded — this one is already ${request.status.toLowerCase()}.`,
        status: request.status,
      });
    }

    // Don't forward a pass whose departure window already closed; expire it instead.
    if (isDeparturePassed(request.outTime)) {
      request.status = 'Expired';
      await request.save();
      sseHub.broadcast('outing:changed', { reason: 'expired', id: request.id, status: 'Expired' });
      return res.status(409).json({
        message: 'This request has expired — the departure time has already passed. It can no longer be forwarded.',
        status: 'Expired',
      });
    }

    const warden = await resolveWardenForHostel(request.student.hostelName);
    if (!warden) {
      return res.status(409).json({
        message:
          'No warden is assigned to this hostel yet, so this request can\'t be forwarded. Decide it yourself or ask an admin to assign a warden.',
      });
    }

    request.status = 'Forwarded';
    request.forwardedTo = warden.id;
    request.forwardedBy = req.user._id;
    request.forwardedNote = note || null;
    request.forwardedAt = new Date();

    await request.save();

    sseHub.broadcast('outing:changed', { reason: 'forwarded', id: request.id, status: 'Forwarded' });

    notifyWarden(warden.id, {
      title: '⬆️ Outing Forwarded to You',
      body: `${req.user.name} forwarded ${request.student.name}'s outing request for your decision.`,
      url: '/dashboard/warden?view=requests',
    });

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/forwarded — private (Warden); the warden's action queue.
const getForwardedRequests = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const where = forwardedToFilter(req.user);
    const requests = await OutingRequest.findAll({
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

    await expireStaleRequests(requests);
    const stillForwarded = requests.filter((r) => r.status === 'Forwarded');

    return sendPage(res, stillForwarded, {
      limit,
      skip,
      fetched: requests.length,
      label: 'outing/forwarded',
      count: () => OutingRequest.count({ where }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/history — private (Caretaker); every decided request in their scope,
// whoever signed it, plus anything still sitting with the warden. Keyed off the frozen
// `decision`, not `status`, so a later cancel/expire/gate scan can't erase the record.
const getCaretakerRequestHistory = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(OutingRequest, req.user, QUEUE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, {
      [Op.or]: [DECIDED_FILTER, { status: 'Forwarded' }],
    });

    const requests = await OutingRequest.findAll({
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

    return sendPage(res, requests.map(withDecisionMeta), {
      limit,
      skip,
      label: 'outing/history',
      count: () => OutingRequest.count({ where, include: scope.include, distinct: true }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/warden-history — private (Warden); every decided request in their hostel,
// not just the escalations they personally ruled on, so the warden and caretaker see the
// same record.
const getWardenRequestHistory = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const scope = passScope(OutingRequest, req.user, QUEUE_STUDENT_FIELDS);
    const where = mergeWhere(scope.where, DECIDED_FILTER);

    const requests = await OutingRequest.findAll({
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

    return sendPage(res, requests.map(withDecisionMeta), {
      limit,
      skip,
      label: 'outing/warden-history',
      count: () => OutingRequest.count({ where, include: scope.include, distinct: true }),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/outing/:id/warden-status — private (Warden). Final decision on a forwarded
// request. Approve (with the warden's signature) -> Approved and the pass is live;
// reject -> Rejected.
const updateWardenRequestStatus = async (req, res) => {
  const { status, remarks } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status can only be set to Approved or Rejected.' });
  }

  // See updateRequestStatus: the signature read moved inside the try with the queries.
  try {
    const wardenSignature =
      status === 'Approved' ? await fetchOwnSignature(req.user) : null;
    if (status === 'Approved' && !wardenSignature) {
      return sendSignatureRequired(
        res,
        'Add your signature in your profile before approving requests.'
      );
    }

    const request = await OutingRequest.findByPk(req.params.id, {
      include: [{ association: 'student', attributes: ['id', 'gender', 'hostelName'] }],
    });

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (!requestInScope(req.user, request, request.student)) {
      return res.status(403).json({ message: 'This request was not forwarded to you.' });
    }

    if (request.status !== 'Forwarded') {
      return res.status(409).json({
        message: `This request is ${request.status.toLowerCase()} and can no longer be decided.`,
        status: request.status,
      });
    }

    // Approving after the departure window closed would mint an already-expired pass.
    if (status === 'Approved' && isDeparturePassed(request.outTime)) {
      request.status = 'Expired';
      await request.save();
      sseHub.broadcast('outing:changed', { reason: 'expired', id: request.id, status: 'Expired' });
      return res.status(409).json({
        message: 'This request has expired — the departure time has already passed. It can no longer be approved.',
        status: 'Expired',
      });
    }

    request.status = status;
    if (remarks) request.remarks = remarks;
    request.approvedBy = req.user._id;
    // Immutable audit verdict; see the note in updateRequestStatus.
    request.decision = status;
    request.decidedAt = new Date();
    request.decidedByRole = 'Warden';
    if (status === 'Approved') {
      request.wardenSignature = wardenSignature;
      // Mirror into caretakerSignature too: the student's my-outings view and the gate
      // scan both read caretakerSignature as "the signed pass", so a warden-approved
      // pass must carry it there to display and validate like any other.
      request.caretakerSignature = wardenSignature;
    }

    await request.save();

    sseHub.broadcast('outing:changed', { reason: 'warden-status', id: request.id, status: request.status });

    if (request.forwardedBy) {
      notifyCaretakers(
        { caretakerId: request.forwardedBy },
        {
          title: status === 'Approved' ? '✅ Warden Approved Outing' : '❌ Warden Rejected Outing',
          body: `The warden ${status.toLowerCase()} an outing request you forwarded.`,
          url: '/dashboard/caretaker?view=requests',
        }
      );
    }

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/outing/:id/cancel — private (Student)
const cancelOutingRequest = async (req, res) => {
  try {
    const request = await OutingRequest.findByPk(req.params.id);

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (String(request.studentId) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You can only cancel your own outing requests.' });
    }

    // Once scanned out, the trip is live and must close via the gate. Forwarded is
    // cancellable — it's still undecided, and since it now blocks new requests the
    // student needs a way out while the warden holds it. The warden's decision endpoint
    // re-checks for 'Forwarded', so a cancel won during the race turns their action
    // into a 409.
    if (!['Pending', 'Approved', 'Forwarded'].includes(request.status)) {
      return res.status(409).json({
        message: `Cannot cancel a request that is already ${request.status.toLowerCase()}.`,
        status: request.status,
      });
    }

    request.status = 'Cancelled';
    await request.save();

    sseHub.broadcast('outing:changed', {
      reason: 'cancelled',
      id: request.id,
      status: 'Cancelled',
    });

    res.json(request);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/stream — private (Caretaker/Guard), SSE
const streamOutingEvents = (req, res) => {
  sseHub.attach(req, res);
};

module.exports = {
  createOutingRequest,
  getMyOutingRequests,
  getOutingSignatures,
  getAllOutingRequests,
  getPendingRequests,
  getOverdueOutings,
  updateRequestStatus,
  forwardOutingRequest,
  getForwardedRequests,
  getCaretakerRequestHistory,
  getWardenRequestHistory,
  updateWardenRequestStatus,
  cancelOutingRequest,
  streamOutingEvents
};
