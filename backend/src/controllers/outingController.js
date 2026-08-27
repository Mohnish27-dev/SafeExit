const OutingRequest = require('../models/OutingRequest');
const { ACTIVE_PASS_STATUSES } = require('../config/passStatuses');
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
const DelayNotice = require('../models/DelayNotice');

const clockLabel = (minutes) => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

// A row counts as "decided" if it carries a frozen verdict, or — for rows written before
// `decision` existed — if its status still happens to be the verdict. The second clause is
// what keeps pre-existing history visible without a migration. Auto-approved outings never
// get a `decision` (no human ruled on them) and are excluded outright.
const DECIDED_FILTER = {
  autoApproved: { $ne: true },
  $or: [
    { decision: { $in: ['Approved', 'Rejected'] } },
    { decision: { $exists: false }, status: { $in: ['Approved', 'Rejected'] } },
  ],
};

// `status` moved on but the pass never got used as decided.
const LAPSED_STATUSES = ['Cancelled', 'Expired'];

const withDecisionMeta = (doc) => {
  const obj = doc.toObject();
  obj.decision = obj.decision || (['Approved', 'Rejected'].includes(obj.status) ? obj.status : null);
  obj.lapsed = LAPSED_STATUSES.includes(obj.status) ? obj.status : null;
  return obj;
};

// 'Forwarded' counts as live too — a request sitting with the warden must block a second
// one just like a Pending one does, or a student could stack approvals.
// Sourced from config/passStatuses.js because the unique partial index in
// models/OutingRequest.js filters on the same list; if the two drift, the index enforces a
// different rule than this check and the double-submit race reopens.
const ACTIVE_STATUSES = ACTIVE_PASS_STATUSES;

// Shared by the pre-check below and the E11000 branch in the catch, so a student who loses
// the insert race sees exactly the message they'd have seen by arriving a moment later.
const blockingOutingMessage = (status) =>
  status === 'Out'
    ? 'You already have an outing in progress. Log your entry at the gate before creating a new request.'
    : status === 'Forwarded'
    ? 'Your outing request is with the warden for a decision. Wait for the outcome or cancel it before creating a new one.'
    : `You already have a ${String(status).toLowerCase()} outing request. Complete that journey or cancel it before creating a new one.`;

// Lazy read-time expiry of Pending/Forwarded/Approved passes whose departure window
// closed; Out/Returned/Rejected are never touched.
// Forwarded must expire here too: it blocks new requests, so a stale one sitting with
// the warden would otherwise lock the student out indefinitely.
//
// One updateMany for the whole page, not one save() per row. The previous version fanned
// out N concurrent writes from a *read* path — a full history page meant hundreds of
// writes racing the gate's own traffic, which is the opposite of what a read should cost.
const EXPIRABLE_STATUSES = ['Pending', 'Approved', 'Forwarded'];
const expireStaleRequests = async (requests) => {
  const list = Array.isArray(requests) ? requests : [requests];
  const stale = list.filter(
    (doc) => doc && EXPIRABLE_STATUSES.includes(doc.status) && isDeparturePassed(doc.outTime)
  );
  if (!stale.length) return requests;

  try {
    // The status guard makes this a no-op for any row a concurrent request already moved
    // on (a cancel, a gate scan), so expiry can never overwrite a real decision.
    await OutingRequest.updateMany(
      { _id: { $in: stale.map((doc) => doc._id) }, status: { $in: EXPIRABLE_STATUSES } },
      { $set: { status: 'Expired' } }
    );
  } catch (err) {
    // A read must not fail because a bookkeeping write did; the next read retries it.
    console.warn(`[outing] lazy expiry write failed: ${err.message}`);
  }

  // Reflect it in the documents the caller is about to filter and serialise. Marked clean
  // afterwards so nothing downstream re-saves a field the database already holds.
  for (const doc of stale) {
    doc.status = 'Expired';
    if (typeof doc.unmarkModified === 'function') doc.unmarkModified('status');
  }
  return requests;
};

// POST /api/outing — private (Student)
const createOutingRequest = async (req, res) => {
  const { destination, purpose, outTime, outingType, targetCaretakerId } = req.body;

  try {
    // Stamped from the student's saved profile signature — never accepted from the body,
    // so no client can substitute someone else's signature.
    //
    // KEEP THIS FIRST: the frontend re-submits automatically after the student captures a
    // signature in response to this 428, which is only safe while the rejection happens
    // before any document is created or state is touched.
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

    const activeRequests = await OutingRequest.find({
      student: req.user._id,
      status: { $in: ACTIVE_STATUSES },
    });

    await expireStaleRequests(activeRequests);
    const blocking = activeRequests.find((r) => ACTIVE_STATUSES.includes(r.status));
    if (blocking) {
      return res.status(409).json({
        message: blockingOutingMessage(blocking.status),
        status: blocking.status,
        activeRequestId: blocking._id,
      });
    }

    // Gender comes from the authenticated user doc, never the body.
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
      student: req.user._id,
      destination,
      purpose,
      outingType: resolvedType,
      outTime: departure,
      inTime,
      status: autoApproved ? 'Approved' : 'Pending',
      autoApproved,
      studentSignature,
      targetCaretaker: targetCaretaker ? targetCaretaker._id : undefined,
    });

    sseHub.broadcast('outing:changed', {
      reason: 'created',
      id: outingRequest._id,
      status: outingRequest.status,
    });

    if (!autoApproved) {
      // Route to the chosen caretaker when resolved; else fall back to hostel routing.
      const scope = targetCaretaker
        ? { caretakerId: targetCaretaker._id }
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
    // POST from the same student committed first and the unique partial index on
    // {student} filtered to ACTIVE_STATUSES rejected this one. That is not a server
    // error — it is the same "you already have a live request" the pre-check reports, so
    // re-read the winner and answer identically.
    if (error && error.code === 11000) {
      const blocking = await OutingRequest.findOne({
        student: req.user._id,
        status: { $in: ACTIVE_STATUSES },
      }).select('_id status');

      return res.status(409).json({
        message: blocking
          ? blockingOutingMessage(blocking.status)
          : 'You already have a live outing request. Complete that journey or cancel it before creating a new one.',
        status: blocking ? blocking.status : undefined,
        activeRequestId: blocking ? blocking._id : undefined,
      });
    }
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/myrequests — private (Student)
const getMyOutingRequests = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const filter = { student: req.user._id };
    const requests = await OutingRequest.find(filter)
      .select(LIST_PROJECTION)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);
    await expireStaleRequests(requests);

    // my-outings shows an "approved & signed by" badge off these two flags and fetches the
    // image from /:id/signatures when the card expands.
    const presence = await signaturePresence(
      OutingRequest,
      requests.map((r) => r._id),
      ['caretakerSignature', 'wardenSignature']
    );

    return sendPage(
      res,
      requests.map((request) => withSignatureFlags({
        ...request.toObject(),
        // Live display state only. The stored status remains 'Out' until the gate
        // records a return, preserving the movement lifecycle and audit history.
        isOverdue: request.status === 'Out' && isReturnLate(request.inTime),
      }, presence)),
      {
        limit,
        skip,
        label: 'outing/myrequests',
        count: () => OutingRequest.countDocuments(filter),
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
    const request = await OutingRequest.findById(req.params.id)
      .select('student targetCaretaker forwardedTo studentSignature caretakerSignature wardenSignature')
      .populate('student', 'gender hostelName');

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
    const requests = await OutingRequest.find({})
      .select('-studentSignature -caretakerSignature -wardenSignature')
      .populate('student', 'name studentId roomNumber hostelName department year')
      .populate('targetCaretaker', 'name')
      .populate('forwardedTo', 'name')
      .populate('forwardedBy', 'name')
      .populate('approvedBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    await expireStaleRequests(requests);
    return sendPage(res, requests, {
      limit,
      skip,
      label: 'outing/all',
      count: () => OutingRequest.estimatedDocumentCount(),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/pending — private (Caretaker/Guard)
const getPendingRequests = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const filter = { status: 'Pending', ...(await scopedStudentFilter(req.user)) };
    const requests = await OutingRequest.find(filter)
      .select(LIST_PROJECTION)
      .populate('student', 'name studentId roomNumber hostelName')
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit);

    await expireStaleRequests(requests);
    const stillPending = requests.filter((r) => r.status === 'Pending');

    // The approval modal shows the student's signature before the caretaker signs off; the
    // flag tells it whether there is one to fetch.
    const presence = await signaturePresence(
      OutingRequest,
      stillPending.map((r) => r._id),
      ['studentSignature']
    );

    // `fetched` is the window, not stillPending.length — expiry above can drop rows, and
    // a short *result* from a full window must not read as "nothing more to fetch".
    return sendPage(res, stillPending.map((r) => withSignatureFlags(r.toObject(), presence)), {
      limit,
      skip,
      fetched: requests.length,
      label: 'outing/pending',
      count: () => OutingRequest.countDocuments(filter),
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
    const scope = await scopedStudentFilter(req.user);
    const canViewEmergencyContacts = ['Admin', 'Caretaker', 'Warden', 'ChiefWarden']
      .includes(req.user.role);
    const studentFields = [
      'name',
      'studentId',
      'roomNumber',
      'hostelName',
      'phoneNumber',
      'department',
      'year',
      ...(canViewEmergencyContacts ? ['guardianPhoneNumber', 'closeContacts'] : []),
    ].join(' ');
    const outings = await OutingRequest.find({ status: 'Out', ...scope })
      .select(LIST_PROJECTION)
      .populate('student', studentFields)
      .sort({ inTime: 1 })
      .lean();

    const overdue = outings.filter((o) => isReturnLate(o.inTime));

    // Attach any delay notice the student filed, so the dashboards can tell
    // "late but explained" apart from "late and unaccounted for". One lookup for
    // the whole page, not one per row.
    if (overdue.length) {
      const notices = await DelayNotice.find({ trip: { $in: overdue.map((o) => o._id) } })
        .populate('acknowledgedBy', 'name role')
        .sort({ createdAt: -1 })
        .lean();

      const byTrip = new Map();
      for (const n of notices) {
        const key = String(n.trip);
        if (!byTrip.has(key)) byTrip.set(key, n); // newest wins (sorted desc)
      }
      for (const o of overdue) o.delayNotice = byTrip.get(String(o._id)) || null;
    }

    res.json(overdue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/outing/:id/status — private (Caretaker/Guard)
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

    const request = await OutingRequest.findById(req.params.id).populate('student', 'gender hostelName');

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
          id: request._id,
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

      const updatedRequest = await request.save();

      sseHub.broadcast('outing:changed', {
        reason: 'status',
        id: updatedRequest._id,
        status: updatedRequest.status,
      });

      res.json(updatedRequest);
    } else {
      res.status(404).json({ message: 'Request not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const forwardOutingRequest = async (req, res) => {
  const { note } = req.body;

  try {
    const request = await OutingRequest.findById(req.params.id).populate(
      'student',
      'gender hostelName name'
    );

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
      sseHub.broadcast('outing:changed', { reason: 'expired', id: request._id, status: 'Expired' });
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
    request.forwardedTo = warden._id;
    request.forwardedBy = req.user._id;
    request.forwardedNote = note || undefined;
    request.forwardedAt = new Date();

    const updated = await request.save();

    sseHub.broadcast('outing:changed', { reason: 'forwarded', id: updated._id, status: 'Forwarded' });

    notifyWarden(warden._id, {
      title: '⬆️ Outing Forwarded to You',
      body: `${req.user.name} forwarded ${request.student.name}'s outing request for your decision.`,
      url: '/dashboard/warden?view=requests',
    });

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/forwarded — private (Warden); the warden's action queue.
const getForwardedRequests = async (req, res) => {
  try {
    const { limit, skip } = readPageParams(req);
    const filter = forwardedToFilter(req.user);
    const requests = await OutingRequest.find(filter)
      .select(LIST_PROJECTION)
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedBy', 'name')
      .sort({ forwardedAt: 1 })
      .skip(skip)
      .limit(limit);

    await expireStaleRequests(requests);
    const stillForwarded = requests.filter((r) => r.status === 'Forwarded');

    return sendPage(res, stillForwarded, {
      limit,
      skip,
      fetched: requests.length,
      label: 'outing/forwarded',
      count: () => OutingRequest.countDocuments(filter),
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
    const filter = {
      $and: [
        { $or: [DECIDED_FILTER, { status: 'Forwarded' }] },
        await scopedStudentFilter(req.user),
      ],
    };
    const requests = await OutingRequest.find(filter)
      .select(LIST_PROJECTION)
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedTo', 'name')
      .populate('approvedBy', 'name role')
      .sort({ decidedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    return sendPage(res, requests.map(withDecisionMeta), {
      limit,
      skip,
      label: 'outing/history',
      count: () => OutingRequest.countDocuments(filter),
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
    const filter = { $and: [DECIDED_FILTER, await scopedStudentFilter(req.user)] };
    const requests = await OutingRequest.find(filter)
      .select(LIST_PROJECTION)
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedBy', 'name')
      .populate('approvedBy', 'name role')
      .sort({ decidedAt: -1, updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    return sendPage(res, requests.map(withDecisionMeta), {
      limit,
      skip,
      label: 'outing/warden-history',
      count: () => OutingRequest.countDocuments(filter),
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

    const request = await OutingRequest.findById(req.params.id).populate('student', 'gender hostelName');

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
      sseHub.broadcast('outing:changed', { reason: 'expired', id: request._id, status: 'Expired' });
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

    const updated = await request.save();

    sseHub.broadcast('outing:changed', { reason: 'warden-status', id: updated._id, status: updated.status });

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

    res.json(updated);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/outing/:id/cancel — private (Student)
const cancelOutingRequest = async (req, res) => {
  try {
    const request = await OutingRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    if (request.student.toString() !== req.user._id.toString()) {
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
    const updatedRequest = await request.save();

    sseHub.broadcast('outing:changed', {
      reason: 'cancelled',
      id: updatedRequest._id,
      status: 'Cancelled',
    });

    res.json(updatedRequest);
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
