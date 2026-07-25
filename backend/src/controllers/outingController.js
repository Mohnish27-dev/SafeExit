const OutingRequest = require('../models/OutingRequest');
const { notifyCaretakers } = require('../utils/pushService');
const {
  isDeparturePassed,
  resolveOutingPolicy,
  normalizeOutingType,
  isWithinDepartureWindow,
  computeReturnDeadline,
  isReturnLate,
} = require('../utils/outingRules');
const sseHub = require('../utils/sseHub');
const { scopedStudentFilter, requestInScope, resolveTargetCaretaker } = require('../utils/caretakerScope');
const { isSignatureDataUrl } = require('../utils/signature');

const clockLabel = (minutes) => {
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
};

// Lazy read-time expiry of Approved-but-unused and Pending-and-missed passes; Out/Returned/Rejected are never touched. Saves are best-effort per doc.
const expireStaleRequests = async (requests) => {
  const list = Array.isArray(requests) ? requests : [requests];
  await Promise.all(
    list.map(async (reqDoc) => {
      if (!reqDoc) return;
      if (reqDoc.status !== 'Approved' && reqDoc.status !== 'Pending') return;
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

    const ACTIVE_STATUSES = ['Pending', 'Approved', 'Out'];
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

    // Once scanned out, the trip is live and must close via the gate.
    if (request.status !== 'Pending' && request.status !== 'Approved') {
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
  cancelOutingRequest,
  streamOutingEvents
};
