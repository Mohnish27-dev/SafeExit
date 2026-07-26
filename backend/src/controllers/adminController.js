const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const Complaint = require('../models/Complaint');
const SOSAlert = require('../models/SOSAlert');
const { getOverdueStudentIds } = require('../utils/overdue');
const { isValidHostel, genderForHostel, canonicalHostelName } = require('../config/hostels');

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
      totalCaretakers,
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
      User.countDocuments({ role: 'Caretaker' }),
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
      caretakers: { total: totalCaretakers },
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
    const allFields   = 'name email role studentId department year roomNumber hostelName phoneNumber gender managedGender managedHostel managedDepartment campusStatus lastSeenAt onDuty lastActiveAt webAuthnRegistered createdAt photo';

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

// Maintenance departments a Department account can service (mirrors Complaint.category).
const DEPARTMENT_CATEGORIES = ['Electrical', 'Plumbing', 'Cleaning', 'Wifi', 'Furniture'];

// One caretaker account per hostel; exceptId lets a caretaker re-save its own hostel without a duplicate conflict.
const findCaretakerForHostel = (managedHostel, exceptId) => {
  const filter = { role: 'Caretaker', managedHostel };
  if (exceptId) filter._id = { $ne: exceptId };
  return User.findOne(filter);
};

const findWardenForHostel = (managedHostel, exceptId) => {
  const filter = { role: 'Warden', managedHostel };
  if (exceptId) filter._id = { $ne: exceptId };
  return User.findOne(filter);
};

const wardenHostelClashMessage = async (hostel, exceptId) => {
  const existing = await findWardenForHostel(hostel, exceptId);
  if (!existing) return null;
  return `${hostel} hostel already has a warden account (${existing.loginId}). Share that ID with the new warden, or reset its PIN — don't create a second one.`;
};

// One Department account per category; exceptId lets an account re-save its own department.
const findDepartmentForCategory = (managedDepartment, exceptId) => {
  const filter = { role: 'Department', managedDepartment };
  if (exceptId) filter._id = { $ne: exceptId };
  return User.findOne(filter);
};

// POST /api/admin/staff — private (Admin)
const createStaff = async (req, res) => {
  try {
    const { name, staffId, role, pin, phoneNumber, managedHostel, managedDepartment } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    if (!staffId || !staffId.trim()) {
      return res.status(400).json({ message: 'A staff ID is required.' });
    }
    // Admins come only from the .env allowlist — this endpoint can't mint one.
    if (!['Caretaker', 'Warden', 'Guard', 'Department'].includes(role)) {
      return res.status(400).json({ message: 'Role must be Caretaker, Warden, Guard, or Department.' });
    }
    if (!pin || String(pin).trim().length < 4) {
      return res.status(400).json({ message: 'An initial PIN of at least 4 characters is required.' });
    }
    // A caretaker/warden must be tied to exactly one hostel for request routing and privacy.
    if ((role === 'Caretaker' || role === 'Warden') && !isValidHostel(managedHostel)) {
      return res.status(400).json({ message: `Select the ${role.toLowerCase()}'s hostel.` });
    }
    if (role === 'Caretaker') {
      const hostel = canonicalHostelName(managedHostel);
      const existing = await findCaretakerForHostel(hostel);
      if (existing) {
        return res.status(409).json({
          message: `${hostel} hostel already has a caretaker account (${existing.loginId}). Share that ID with the new caretaker, or reset its PIN — don't create a second one.`,
        });
      }
    }
    if (role === 'Warden') {
      const hostel = canonicalHostelName(managedHostel);
      const clash = await wardenHostelClashMessage(hostel);
      if (clash) return res.status(409).json({ message: clash });
    }
    // A department account services exactly one category, one account per department.
    if (role === 'Department') {
      if (!DEPARTMENT_CATEGORIES.includes(managedDepartment)) {
        return res.status(400).json({ message: 'Select a valid department.' });
      }
      const existing = await findDepartmentForCategory(managedDepartment);
      if (existing) {
        return res.status(409).json({
          message: `The ${managedDepartment} department already has an account (${existing.loginId}). Share that ID, or reset its PIN — don't create a second one.`,
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
      // Caretakers AND wardens carry a specific hostel; managedGender is derived for the
      // auto-approval rules and the gender-wide SOS scope.
      managedHostel: role === 'Caretaker' || role === 'Warden' ? canonicalHostelName(managedHostel) : undefined,
      managedGender: role === 'Caretaker' || role === 'Warden' ? genderForHostel(managedHostel) : undefined,
      // Department accounts carry the maintenance category they service.
      managedDepartment: role === 'Department' ? managedDepartment : undefined,
    });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      loginId: user.loginId,
      role: user.role,
      studentId: user.studentId,
      phoneNumber: user.phoneNumber,
      managedHostel: user.managedHostel,
      managedGender: user.managedGender,
      managedDepartment: user.managedDepartment,
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
    if (!user || !['Caretaker', 'Warden', 'Guard', 'Department'].includes(user.role)) {
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

// PATCH /api/admin/staff/:id/scope — private (Admin); an unassigned caretaker sees no students until scoped.
const updateStaffScope = async (req, res) => {
  try {
    const { managedHostel, managedDepartment } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || !['Caretaker', 'Warden', 'Department'].includes(user.role)) {
      return res.status(404).json({ message: 'Staff member not found.' });
    }

    // Department accounts are re-scoped by category, keeping one account per department.
    if (user.role === 'Department') {
      if (!DEPARTMENT_CATEGORIES.includes(managedDepartment)) {
        return res.status(400).json({ message: 'Select a valid department.' });
      }
      const clash = await findDepartmentForCategory(managedDepartment, user._id);
      if (clash) {
        return res.status(409).json({
          message: `The ${managedDepartment} department already has an account (${clash.loginId}). Remove or reassign that one first.`,
        });
      }
      user.managedDepartment = managedDepartment;
      await user.save();
      return res.json({
        _id: user._id,
        name: user.name,
        loginId: user.loginId,
        role: user.role,
        managedDepartment: user.managedDepartment,
      });
    }

    if (!isValidHostel(managedHostel)) {
      return res.status(400).json({ message: 'Select a valid campus hostel.' });
    }
    const hostel = canonicalHostelName(managedHostel);

    // Preserve the one-per-hostel invariant for whichever staff slot is being scoped.
    if (user.role === 'Warden') {
      const clashMsg = await wardenHostelClashMessage(hostel, user._id);
      if (clashMsg) {
        return res.status(409).json({
          message: `${hostel} hostel already has a warden account. Remove or reassign that one first.`,
        });
      }
    } else {
      const clash = await findCaretakerForHostel(hostel, user._id);
      if (clash) {
        return res.status(409).json({
          message: `${hostel} hostel already has a caretaker account (${clash.loginId}). Remove or reassign that one first.`,
        });
      }
    }

    // Keep the derived gender in step with the assigned hostel.
    user.managedHostel = hostel;
    user.managedGender = genderForHostel(hostel);
    await user.save();

    res.json({
      _id: user._id,
      name: user.name,
      loginId: user.loginId,
      role: user.role,
      managedHostel: user.managedHostel,
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
    if (!user || !['Caretaker', 'Warden', 'Guard', 'Department'].includes(user.role)) {
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
