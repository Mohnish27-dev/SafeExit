const OutingRequest = require('../models/OutingRequest');
const { qualifiesForAutoApproval, isDeparturePassed } = require('../utils/outingRules');
const sseHub = require('../utils/sseHub');

// Lazily expire stale requests at read time. Two categories qualify:
//
// 1. **Approved-but-unused**: the pass was approved (by warden or auto-rule)
//    but its departure `outTime` passed without the student exiting the gate,
//    so the gate scan would refuse it anyway. Flipping to 'Expired' keeps
//    every dashboard consistent with the gate's enforcement.
//
// 2. **Pending-and-missed**: the request was never acted on by the warden and
//    the departure time has already passed. There's no point keeping it in the
//    warden's approval queue — the student can't leave for a time that's gone.
//
// 'Out'/'Returned' trips have already left the gate, and 'Rejected' ones are
// terminal, so those are never touched. Persistence is best-effort and per-doc
// so one failed save doesn't block the whole list response.
const expireStaleRequests = async (requests) => {
  const list = Array.isArray(requests) ? requests : [requests];
  await Promise.all(
    list.map(async (reqDoc) => {
      if (!reqDoc) return;
      // Only 'Approved' and 'Pending' requests can expire on departure time.
      if (reqDoc.status !== 'Approved' && reqDoc.status !== 'Pending') return;
      if (!isDeparturePassed(reqDoc.outTime)) return;
      reqDoc.status = 'Expired';
      try {
        await reqDoc.save();
      } catch (err) {
        // Leave the in-memory doc as 'Expired' for this response even if the
        // write lost a race; the next read will retry the persist.
      }
    })
  );
  return requests;
};

// @desc    Create new outing request
// @route   POST /api/outing
// @access  Private (Student)
const createOutingRequest = async (req, res) => {
  const { destination, purpose, outTime, inTime } = req.body;

  try {
    // A student who is currently outside (or overdue) must log an entry at the
    // gate before requesting another outing — otherwise a single student could
    // stack passes while off-campus. campusStatus is flipped by gate scans, so
    // 'Inside' is the only state from which a fresh request is valid.
    if (req.user.campusStatus && req.user.campusStatus !== 'Inside') {
      return res.status(409).json({
        message:
          'You are currently marked outside campus. Log your entry at the gate before creating a new outing request.',
        campusStatus: req.user.campusStatus,
      });
    }

    // Low-risk trips returning by the campus cutoff skip warden review.
    const autoApproved = qualifiesForAutoApproval(inTime);

    const outingRequest = await OutingRequest.create({
      student: req.user._id,
      destination,
      purpose,
      outTime,
      inTime,
      status: autoApproved ? 'Approved' : 'Pending',
      autoApproved
    });

    // Push to any warden/guard dashboards currently open so a new pending
    // request shows up instantly instead of waiting for a manual refresh.
    sseHub.broadcast('outing:changed', {
      reason: 'created',
      id: outingRequest._id,
      status: outingRequest.status,
    });

    res.status(201).json(outingRequest);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in student's outing requests
// @route   GET /api/outing/myrequests
// @access  Private (Student)
const getMyOutingRequests = async (req, res) => {
  try {
    const requests = await OutingRequest.find({ student: req.user._id }).sort({ createdAt: -1 });
    await expireStaleRequests(requests);
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all pending requests
// @route   GET /api/outing/pending
// @access  Private (Warden/Guard)
const getPendingRequests = async (req, res) => {
  try {
    const requests = await OutingRequest.find({ status: 'Pending' })
      .populate('student', 'name studentId roomNumber')
      .sort({ createdAt: 1 });

    // Expire any pending requests whose departure time has already passed
    // so the warden never sees stale entries they can no longer act on.
    await expireStaleRequests(requests);
    const stillPending = requests.filter((r) => r.status === 'Pending');

    res.json(stillPending);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update request status
// @route   PATCH /api/outing/:id/status
// @access  Private (Warden/Guard)
const updateRequestStatus = async (req, res) => {
  const { status, remarks } = req.body;

  // This endpoint is a warden/guard *decision* on a pending request — the only
  // two verdicts it may issue are 'Approved' and 'Rejected'. Every other status
  // ('Out', 'Returned', 'Expired', 'Cancelled') belongs to the gate scan flow
  // (scanController) or the lazy-expiry logic and must never be settable here;
  // otherwise a warden could push a pass through its whole trip lifecycle —
  // e.g. mark a student 'Returned' who never scanned in — bypassing the gate
  // state machine entirely.
  if (!['Approved', 'Rejected'].includes(status)) {
    return res.status(400).json({
      message: 'Status can only be set to Approved or Rejected.',
    });
  }

  try {
    const request = await OutingRequest.findById(req.params.id);

    if (request) {
      // A decision can only be made on a request that is still awaiting one.
      // Once a pass has left 'Pending' (approved, rejected, out on a trip,
      // returned, expired or cancelled) it is out of the warden's hands — this
      // stops an already-live or terminal pass being flipped back to
      // Approved/Rejected.
      if (request.status !== 'Pending') {
        return res.status(409).json({
          message: `This request has already been ${request.status.toLowerCase()} and can no longer be changed.`,
          status: request.status,
        });
      }

      // Guard against approving a request whose departure time has already
      // passed. The warden may have had the pending card open and clicked
      // "Approve" after the window closed — accepting it now would create
      // an already-expired pass.
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
      
      // If approved or rejected by warden
      if (['Approved', 'Rejected'].includes(status)) {
         request.approvedBy = req.user._id;
      }

      const updatedRequest = await request.save();

      // Keep every other open warden/guard dashboard in sync (e.g. two wardens
      // reviewing the same queue) so an already-decided request disappears
      // from their pending list without a manual refresh.
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

// @desc    Cancel an outing request (student withdraws their own pass)
// @route   PATCH /api/outing/:id/cancel
// @access  Private (Student)
const cancelOutingRequest = async (req, res) => {
  try {
    const request = await OutingRequest.findById(req.params.id);

    if (!request) {
      return res.status(404).json({ message: 'Request not found' });
    }

    // Only the student who created the request can cancel it.
    if (request.student.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'You can only cancel your own outing requests.' });
    }

    // Only actionable passes (still waiting or approved but unused) can be cancelled.
    // Once the student has scanned out, the trip is live and must close normally.
    if (request.status !== 'Pending' && request.status !== 'Approved') {
      return res.status(409).json({
        message: `Cannot cancel a request that is already ${request.status.toLowerCase()}.`,
        status: request.status,
      });
    }

    request.status = 'Cancelled';
    const updatedRequest = await request.save();

    // Notify warden/guard dashboards so a cancelled pending request
    // disappears from their queue in real time.
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

// @desc    Live stream of outing-request changes (new requests, approvals,
//          rejections) so warden/guard dashboards update in real time.
// @route   GET /api/outing/stream
// @access  Private (Warden/Guard)
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

  // Proxies/load balancers tend to kill idle connections; a periodic comment
  // keeps this one alive without triggering any client-side event handler.
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
  updateRequestStatus,
  cancelOutingRequest,
  streamOutingEvents
};
