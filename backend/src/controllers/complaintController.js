const Complaint = require('../models/Complaint');

// @desc    Create new complaint
// @route   POST /api/complaint
// @access  Private (Student)
const createComplaint = async (req, res) => {
  const { category, description } = req.body;

  try {
    const complaint = await Complaint.create({
      student: req.user._id,
      roomNumber: req.user.roomNumber,
      category,
      description
    });

    res.status(201).json(complaint);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get logged in student's complaints
// @route   GET /api/complaint/mycomplaints
// @access  Private (Student)
const getMyComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({ student: req.user._id }).sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all complaints
// @route   GET /api/complaint
// @access  Private (Warden/Admin)
const getComplaints = async (req, res) => {
  try {
    const complaints = await Complaint.find({})
      .populate('student', 'name studentId roomNumber')
      .sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update complaint status
// @route   PATCH /api/complaint/:id/status
// @access  Private (Warden/Admin)
const updateComplaintStatus = async (req, res) => {
  const { status, resolutionComments } = req.body;

  try {
    const complaint = await Complaint.findById(req.params.id);

    if (complaint) {
      complaint.status = status;
      if (resolutionComments) complaint.resolutionComments = resolutionComments;

      const updatedComplaint = await complaint.save();
      res.json(updatedComplaint);
    } else {
      res.status(404).json({ message: 'Complaint not found' });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  createComplaint,
  getMyComplaints,
  getComplaints,
  updateComplaintStatus
};
