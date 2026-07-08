const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const Complaint = require('../models/Complaint');
const SOSAlert = require('../models/SOSAlert');

// @desc    Aggregate counts for the admin overview dashboard
// @route   GET /api/admin/overview
// @access  Private (Admin)
const getOverview = async (req, res) => {
  try {
    const [
      totalStudents,
      studentsInside,
      studentsOutside,
      studentsOverdue,
      totalGuards,
      guardsOnDuty,
      totalWardens,
      activeSOS,
      pendingOutings,
      studentsOut,
      openComplaints
    ] = await Promise.all([
      User.countDocuments({ role: 'Student' }),
      User.countDocuments({ role: 'Student', campusStatus: 'Inside' }),
      User.countDocuments({ role: 'Student', campusStatus: 'Outside' }),
      User.countDocuments({ role: 'Student', campusStatus: 'Overdue' }),
      User.countDocuments({ role: 'Guard' }),
      User.countDocuments({ role: 'Guard', onDuty: true }),
      User.countDocuments({ role: 'Warden' }),
      SOSAlert.countDocuments({ status: 'Active' }),
      OutingRequest.countDocuments({ status: 'Pending' }),
      OutingRequest.countDocuments({ status: 'Out' }),
      Complaint.countDocuments({ status: { $in: ['Open', 'In Progress'] } })
    ]);

    res.json({
      students: {
        total: totalStudents,
        inside: studentsInside,
        outside: studentsOutside,
        overdue: studentsOverdue
      },
      guards: { total: totalGuards, onDuty: guardsOnDuty },
      wardens: { total: totalWardens },
      activeSOS,
      pendingOutings,
      studentsOut,
      openComplaints
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    List users by role with profile + live status
// @route   GET /api/admin/users?role=Student|Guard|Warden
// @access  Private (Admin)
const getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    // Guards may only browse the student roster, never staff accounts.
    if (req.user.role === 'Guard') filter.role = 'Student';

    // Guards only see non-confidential fields (photo, name, roll number, status).
    const guardFields = 'name studentId campusStatus lastSeenAt photo';
    const allFields   = 'name email role studentId department year roomNumber hostelName phoneNumber campusStatus lastSeenAt onDuty lastActiveAt webAuthnRegistered createdAt photo';

    const users = await User.find(filter)
      .select(req.user.role === 'Guard' ? guardFields : allFields)
      .sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getOverview,
  getUsers
};
