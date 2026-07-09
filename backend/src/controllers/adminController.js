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

// Normalize a staff ID into the canonical loginId the account is keyed on:
// trim, lowercase, strip all whitespace (matches the login pages' helper).
const buildStaffLoginId = (id) => (id || '').trim().toLowerCase().replace(/\s+/g, '');

// @desc    Create a Warden or Guard account (admin-provisioned)
// @route   POST /api/admin/staff
// @access  Private (Admin)
//
// This is how staff get accounts now that self-registration of privileged roles
// is blocked. An admin fills in a new hire's details; the staff member then logs
// in on the staff page with the ID + PIN set here and (optionally) attaches a
// device passkey. No .env edit or redeploy per staff member.
const createStaff = async (req, res) => {
  try {
    const { name, staffId, role, pin, phoneNumber } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    if (!staffId || !staffId.trim()) {
      return res.status(400).json({ message: 'A staff ID is required.' });
    }
    // Admins are provisioned only via the .env allowlist — never through this
    // endpoint — so an admin can't mint another admin here.
    if (!['Warden', 'Guard'].includes(role)) {
      return res.status(400).json({ message: 'Role must be Warden or Guard.' });
    }
    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ message: 'An initial PIN of at least 4 characters is required.' });
    }

    const loginId = buildStaffLoginId(staffId);
    const exists = await User.findOne({ $or: [{ loginId }, { email: loginId }] });
    if (exists) {
      return res.status(400).json({ message: 'An account with this ID already exists.' });
    }

    const user = await User.create({
      name: name.trim(),
      loginId,
      password: String(pin).trim(), // hashed by the User model's pre-save hook
      role,
      studentId: staffId.trim(),
      phoneNumber,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      loginId: user.loginId,
      role: user.role,
      studentId: user.studentId,
      phoneNumber: user.phoneNumber,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Reset a Warden/Guard PIN (admin-provisioned recovery)
// @route   PATCH /api/admin/staff/:id/pin
// @access  Private (Admin)
//
// For the "staff lost their device / forgot their PIN" case. Resetting also
// revokes any registered passkeys and forces re-enrolment, so a lost device
// cannot keep signing in after the account has been recovered.
const resetStaffPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ message: 'A new PIN of at least 4 characters is required.' });
    }

    const user = await User.findById(req.params.id);
    // Scope strictly to staff so this endpoint can never reset a student's or
    // another admin's credentials.
    if (!user || !['Warden', 'Guard'].includes(user.role)) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    user.password = String(pin).trim(); // re-hashed by the pre-save hook
    user.webAuthnCredentials = [];
    user.webAuthnRegistered = false;
    user.currentChallenge = undefined;
    await user.save();

    res.json({ message: 'PIN reset. Existing passkeys were revoked; the staff member must set one up again.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Remove a Warden or Guard account
// @route   DELETE /api/admin/staff/:id
// @access  Private (Admin)
const removeStaff = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    // Only staff accounts are removable here — never students or admins.
    if (!user || !['Warden', 'Guard'].includes(user.role)) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    await user.deleteOne();
    res.json({ message: 'Staff member removed.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getOverview,
  getUsers,
  createStaff,
  resetStaffPin,
  removeStaff
};
