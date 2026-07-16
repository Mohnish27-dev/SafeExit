const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const Complaint = require('../models/Complaint');
const SOSAlert = require('../models/SOSAlert');
const { getOverdueStudentIds } = require('../utils/overdue');

// GET /api/admin/overview — private (Admin)
const getOverview = async (req, res) => {
  try {
    const [
      totalStudents,
      studentsInside,
      studentsOutside,
      overdueIds,
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
      // 'Overdue' is never stored — derived live from passes still 'Out' past their return window.
      getOverdueStudentIds(),
      User.countDocuments({ role: 'Guard' }),
      User.countDocuments({ role: 'Guard', onDuty: true }),
      User.countDocuments({ role: 'Warden' }),
      SOSAlert.countDocuments({ status: 'Active' }),
      OutingRequest.countDocuments({ status: 'Pending' }),
      OutingRequest.countDocuments({ status: 'Out' }),
      Complaint.countDocuments({ status: { $in: ['Open', 'In Progress'] } })
    ]);

    // Overdue students are still stored 'Outside' — subtract so the tiles are disjoint.
    const studentsOverdue = overdueIds.size;
    const onTimeOutside = Math.max(0, studentsOutside - studentsOverdue);

    res.json({
      students: {
        total: totalStudents,
        inside: studentsInside,
        outside: onTimeOutside,
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

// GET /api/admin/users?role= — private (Admin)
const getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    // Guards may only browse students, and only non-confidential fields.
    if (req.user.role === 'Guard') filter.role = 'Student';

    const guardFields = 'name studentId campusStatus lastSeenAt photo';
    const allFields   = 'name email role studentId department year roomNumber hostelName phoneNumber gender managedGender campusStatus lastSeenAt onDuty lastActiveAt webAuthnRegistered createdAt photo';

    const users = await User.find(filter)
      .select(req.user.role === 'Guard' ? guardFields : allFields)
      .sort({ createdAt: -1 })
      .lean();

    // Overlay derived (never persisted) 'Overdue' onto late students.
    const overdueIds = await getOverdueStudentIds();
    for (const u of users) {
      if (overdueIds.has(String(u._id))) u.campusStatus = 'Overdue';
    }

    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Trim, lowercase, strip whitespace — must match the login pages' helper.
const buildStaffLoginId = (id) => (id || '').trim().toLowerCase().replace(/\s+/g, '');

const HOSTEL_LABEL = { Male: "Boys' Hostel", Female: "Girls' Hostel" };

// One shared warden account per hostel; exceptId lets a warden re-save its own hostel without a duplicate conflict.
const findWardenForHostel = (managedGender, exceptId) => {
  const filter = { role: 'Warden', managedGender };
  if (exceptId) filter._id = { $ne: exceptId };
  return User.findOne(filter);
};

// POST /api/admin/staff — private (Admin)
const createStaff = async (req, res) => {
  try {
    const { name, staffId, role, pin, phoneNumber, managedGender } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    if (!staffId || !staffId.trim()) {
      return res.status(400).json({ message: 'A staff ID is required.' });
    }
    // Admins come only from the .env allowlist — this endpoint can't mint one.
    if (!['Warden', 'Guard'].includes(role)) {
      return res.status(400).json({ message: 'Role must be Warden or Guard.' });
    }
    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ message: 'An initial PIN of at least 4 characters is required.' });
    }
    // A warden must be tied to exactly one hostel for request routing and privacy.
    if (role === 'Warden' && !['Male', 'Female'].includes(managedGender)) {
      return res.status(400).json({ message: "Select the warden's hostel (Boys' or Girls')." });
    }
    if (role === 'Warden') {
      const existing = await findWardenForHostel(managedGender);
      if (existing) {
        return res.status(409).json({
          message: `The ${HOSTEL_LABEL[managedGender]} already has a warden account (${existing.loginId}). Share that ID with the new warden, or reset its PIN — don't create a second one.`,
        });
      }
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
      managedGender: role === 'Warden' ? managedGender : undefined,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      loginId: user.loginId,
      role: user.role,
      studentId: user.studentId,
      phoneNumber: user.phoneNumber,
      managedGender: user.managedGender,
      createdAt: user.createdAt,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /api/admin/staff/:id/pin — private (Admin); also revokes passkeys so a lost device can't keep signing in.
const resetStaffPin = async (req, res) => {
  try {
    const { pin } = req.body;
    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ message: 'A new PIN of at least 4 characters is required.' });
    }

    const user = await User.findById(req.params.id);
    // Staff only — never resets a student's or another admin's credentials.
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

// PATCH /api/admin/staff/:id/scope — private (Admin); an unassigned warden sees no students until scoped.
const updateStaffScope = async (req, res) => {
  try {
    const { managedGender } = req.body;
    if (!['Male', 'Female'].includes(managedGender)) {
      return res.status(400).json({ message: "Hostel must be 'Male' (boys') or 'Female' (girls')." });
    }

    const user = await User.findById(req.params.id);
    if (!user || user.role !== 'Warden') {
      return res.status(404).json({ message: 'Warden not found.' });
    }
    // Preserve the one-warden-per-hostel invariant.
    const clash = await findWardenForHostel(managedGender, user._id);
    if (clash) {
      return res.status(409).json({
        message: `The ${HOSTEL_LABEL[managedGender]} already has a warden account (${clash.loginId}). Remove or reassign that one first.`,
      });
    }

    user.managedGender = managedGender;
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      loginId: user.loginId,
      role: user.role,
      managedGender: user.managedGender,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// DELETE /api/admin/staff/:id — private (Admin)
const removeStaff = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
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
  updateStaffScope,
  removeStaff
};
