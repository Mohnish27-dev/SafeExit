const OutingRequest = require('../models/OutingRequest');
const { qualifiesForAutoApproval, isDeparturePassed } = require('../utils/outingRules');

// Lazily expire approved-but-unused passes at read time. A pass that was
// Approved (by warden or auto-rule) but whose departure `outTime` has passed
// without the student exiting the gate is no longer usable — the gate scan
// already refuses it. We flip such passes to 'Expired' here so every read
// (student dashboard, my-outings, warden views) reflects the same terminal
// state, instead of showing a stale "Approved/Active" pass forever. Only
// 'Approved' passes are eligible: 'Out'/'Returned' trips already left, and
// 'Pending' ones haven't been approved yet. Persistence is best-effort and
// per-doc so one failed save doesn't block the whole list response.
const expireStaleApproved = async (requests) => {
  const list = Array.isArray(requests) ? requests : [requests];
  await Promise.all(
    list.map(async (reqDoc) => {
      if (!reqDoc || reqDoc.status !== 'Approved') return;
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
    await expireStaleApproved(requests);
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
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update request status
// @route   PATCH /api/outing/:id/status
// @access  Private (Warden/Guard)
const updateRequestStatus = async (req, res) => {
  const { status, remarks } = req.body;

  try {
    const request = await OutingRequest.findById(req.params.id);

    if (request) {
      request.status = status;
      if (remarks) request.remarks = remarks;
      
      // If approved or rejected by warden
      if (['Approved', 'Rejected'].includes(status)) {
         request.approvedBy = req.user._id;
      }

      const updatedRequest = await request.save();
      res.json(updatedRequest);
    } else {
      res.status(404).json({ message: 'Request not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createOutingRequest,
  getMyOutingRequests,
  getPendingRequests,
  updateRequestStatus
};
