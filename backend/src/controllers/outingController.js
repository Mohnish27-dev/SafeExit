const OutingRequest = require('../models/OutingRequest');

// @desc    Create new outing request
// @route   POST /api/outing
// @access  Private (Student)
const createOutingRequest = async (req, res) => {
  const { destination, purpose, outTime, inTime } = req.body;

  try {
    const outingRequest = await OutingRequest.create({
      student: req.user._id,
      destination,
      purpose,
      outTime,
      inTime
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
