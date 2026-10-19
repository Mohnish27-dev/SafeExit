// Outings have no request or approval step any more: the gate's exit scan creates the
// outing (controllers/scanController.js). What is left here is read-only — the student's
// history, the overdue lists, staff history of outings decided under the old flow — plus
// cancel, so a student can clear a request left over from before the change.
const { Op } = require('sequelize');
const { OutingRequest, DelayNotice } = require('../models');
const { expireStaleRequests } = require('../utils/passExpiry');
const { isReturnLate } = require('../utils/outingRules');
const sseHub = require('../utils/sseHub');
const { readPageParams, sendPage } = require('../utils/pagination');
const { estimatedRowCount } = require('../utils/rowCount');
const { passScope, mergeWhere, canReadSignatures } = require('../utils/hostelScope');
const { signaturePresence, withSignatureFlags } = require('../utils/signature');
const { hideGirlFromGuard } = require('../config/hostels');

const HISTORY_STUDENT_FIELDS = ['id', 'name', 'studentId', 'roomNumber', 'hostelName'];
const WIDE_STUDENT_FIELDS = [...HISTORY_STUDENT_FIELDS, 'department', 'year'];
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

// POST /api/outing — private (Student)
//
// Retired. There is nothing to request: the student shows their QR at the gate and the exit
// scan records the outing. Kept as a clear 410 rather than a 404 so an app still cached on a
// phone shows the student what to do instead of a generic failure.
const createOutingRequest = (req, res) =>
  res.status(410).json({
    message:
      'Outings no longer need a request. Just show your QR code to the guard at the main gate.',
  });

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

// GET /api/outing/overdue — private (staff)
//
// Deliberately *not* paginated. Its filter is `status: 'Out'`, so the result is bounded by
// how many students are off campus right now — it cannot grow with deployment age. And
// because the overdue test runs after the fetch, a window would produce a page of zero
// overdue rows while later ones held real cases, which is a worse failure than the size.
// Gate practice at 8 PM: the guard phones overdue boys themselves, but an overdue girl is
// phoned by the female guard at her hostel — the gate guard only passes on her name and
// roll number. So the gate guard gets no number at all for a girl (neither hers nor any
// staff member's) and no room, only her hostel; the row is flagged so the screen says who calls.
// Mutates the plain rows in place.
const shapeOverdueForGuard = (rows) => {
  for (const o of rows) {
    if (o.student && hideGirlFromGuard(o.student)) o.hostelGuardCalls = true;
  }
};

const getOverdueOutings = async (req, res) => {
  try {
    const canViewEmergencyContacts = ['Admin', 'Caretaker', 'Warden', 'ChiefWarden']
      .includes(req.user.role);
    const studentFields = [
      'id', 'name', 'studentId', 'roomNumber', 'hostelName', 'phoneNumber', 'gender', 'department', 'year',
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

    if (req.user.role === 'Guard') shapeOverdueForGuard(overdue);

    res.json(overdue);
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
    const scope = passScope(OutingRequest, req.user, HISTORY_STUDENT_FIELDS);
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
    const scope = passScope(OutingRequest, req.user, HISTORY_STUDENT_FIELDS);
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

    // Only requests left over from the old flow can still be open. Once scanned out, the
    // trip is live and must close via the gate.
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
  getOverdueOutings,
  getCaretakerRequestHistory,
  getWardenRequestHistory,
  cancelOutingRequest,
  streamOutingEvents
};
