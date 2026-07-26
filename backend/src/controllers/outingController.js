const OutingRequest = require('../models/OutingRequest');
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
const {
  scopedStudentFilter,
  forwardedToFilter,
  requestInScope,
  resolveTargetCaretaker,
  resolveWardenForHostel,
} = require('../utils/hostelScope');
const { isSignatureDataUrl } = require('../utils/signature');

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
const ACTIVE_STATUSES = ['Pending', 'Approved', 'Forwarded', 'Out'];

// Lazy read-time expiry of Pending/Forwarded/Approved passes whose departure window
// closed; Out/Returned/Rejected are never touched. Saves are best-effort per doc.
// Forwarded must expire here too: it blocks new requests, so a stale one sitting with
// the warden would otherwise lock the student out indefinitely.
const EXPIRABLE_STATUSES = ['Pending', 'Approved', 'Forwarded'];
const expireStaleRequests = async (requests) => {
  const list = Array.isArray(requests) ? requests : [requests];
  await Promise.all(
    list.map(async (reqDoc) => {
      if (!reqDoc) return;
      if (!EXPIRABLE_STATUSES.includes(reqDoc.status)) return;
      if (!isDeparturePassed(reqDoc.outTime)) return;
      reqDoc.status = 'Expired';
      try {
        await reqDoc.save();
      } catch (err) {
        // Lost-race save is fine; next read retries the persist.
      }
    })
  );
  return requests;
};

// POST /api/outing — private (Student)
const createOutingRequest = async (req, res) => {
  const { destination, purpose, outTime, outingType, targetCaretakerId, studentSignature } = req.body;

  try {
    // The student's drawn signature is required to file a request.
    if (!isSignatureDataUrl(studentSignature)) {
      return res.status(400).json({ message: 'Your signature is required to submit this request.' });
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
        message:
          blocking.status === 'Out'
            ? 'You already have an outing in progress. Log your entry at the gate before creating a new request.'
            : blocking.status === 'Forwarded'
            ? 'Your outing request is with the warden for a decision. Wait for the outcome or cancel it before creating a new one.'
            : `You already have a ${blocking.status.toLowerCase()} outing request. Complete that journey or cancel it before creating a new one.`,
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
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/myrequests — private (Student)
const getMyOutingRequests = async (req, res) => {
  try {
    const requests = await OutingRequest.find({ student: req.user._id }).sort({ createdAt: -1 });
    await expireStaleRequests(requests);
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/pending — private (Caretaker/Guard)
const getPendingRequests = async (req, res) => {
  try {
    const requests = await OutingRequest.find({ status: 'Pending', ...(await scopedStudentFilter(req.user)) })
      .populate('student', 'name studentId roomNumber hostelName')
      .sort({ createdAt: 1 });

    await expireStaleRequests(requests);
    const stillPending = requests.filter((r) => r.status === 'Pending');

    res.json(stillPending);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getOverdueOutings = async (req, res) => {
  try {
    const scope = await scopedStudentFilter(req.user);
    const outings = await OutingRequest.find({ status: 'Out', ...scope })
      .populate('student', 'name studentId roomNumber hostelName phoneNumber department year')
      .sort({ inTime: 1 });

    const overdue = outings.filter((o) => isReturnLate(o.inTime));
    res.json(overdue);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/outing/:id/status — private (Caretaker/Guard)
const updateRequestStatus = async (req, res) => {
  const { status, remarks, caretakerSignature } = req.body;

  // Only Approved/Rejected here — trip-lifecycle statuses belong to the gate scan flow and must not be settable by a caretaker.
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({
      message: 'Status can only be set to Approved or Rejected.',
    });
  }

  // Approving mints a pass — the caretaker must sign it. (Rejection needs no signature.)
  if (status === 'Approved' && !isSignatureDataUrl(caretakerSignature)) {
    return res.status(400).json({ message: 'Your signature is required to approve this request.' });
  }

  try {
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
    const requests = await OutingRequest.find(forwardedToFilter(req.user))
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedBy', 'name')
      .sort({ forwardedAt: 1 });

    await expireStaleRequests(requests);
    const stillForwarded = requests.filter((r) => r.status === 'Forwarded');

    res.json(stillForwarded);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/history — private (Caretaker); every decided request in their scope,
// whoever signed it, plus anything still sitting with the warden. Keyed off the frozen
// `decision`, not `status`, so a later cancel/expire/gate scan can't erase the record.
const getCaretakerRequestHistory = async (req, res) => {
  try {
    const requests = await OutingRequest.find({
      $and: [
        { $or: [DECIDED_FILTER, { status: 'Forwarded' }] },
        await scopedStudentFilter(req.user),
      ],
    })
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedTo', 'name')
      .populate('approvedBy', 'name role')
      .sort({ decidedAt: -1, updatedAt: -1 });

    res.json(requests.map(withDecisionMeta));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/outing/warden-history — private (Warden); every decided request in their hostel,
// not just the escalations they personally ruled on, so the warden and caretaker see the
// same record.
const getWardenRequestHistory = async (req, res) => {
  try {
    const requests = await OutingRequest.find({
      $and: [DECIDED_FILTER, await scopedStudentFilter(req.user)],
    })
      .populate('student', 'name studentId roomNumber hostelName')
      .populate('forwardedBy', 'name')
      .populate('approvedBy', 'name role')
      .sort({ decidedAt: -1, updatedAt: -1 });

    res.json(requests.map(withDecisionMeta));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/outing/:id/warden-status — private (Warden). Final decision on a forwarded
// request. Approve (with the warden's signature) -> Approved and the pass is live;
// reject -> Rejected.
const updateWardenRequestStatus = async (req, res) => {
  const { status, remarks, wardenSignature } = req.body;

  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({ message: 'Status can only be set to Approved or Rejected.' });
  }

  if (status === 'Approved' && !isSignatureDataUrl(wardenSignature)) {
    return res.status(400).json({ message: 'Your signature is required to approve this request.' });
  }

  try {
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
  req.socket.setTimeout(0);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');

  sseHub.addClient(res);

  // Keeps proxies from killing the idle connection.
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseHub.removeClient(res);
  });
};

module.exports = {
  createOutingRequest,
  getMyOutingRequests,
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
