const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const Complaint = require('../models/Complaint');
const SOSAlert = require('../models/SOSAlert');
const { getOverdueStudentIds } = require('../utils/overdue');

// @desc    Aggregate counts for the admin overview dashboard
// @route   GET /api/admin/overview
// @access  Private (Admin)
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
      // 'Overdue' is a live time-based condition, never a stored campusStatus
      // (the scan machine only ever writes Inside/Outside). Derive it at read
      // time from passes still 'Out' past their return window.
      getOverdueStudentIds(),
      User.countDocuments({ role: 'Guard' }),
      User.countDocuments({ role: 'Guard', onDuty: true }),
      User.countDocuments({ role: 'Warden' }),
      SOSAlert.countDocuments({ status: 'Active' }),
      OutingRequest.countDocuments({ status: 'Pending' }),
      OutingRequest.countDocuments({ status: 'Out' }),
      Complaint.countDocuments({ status: { $in: ['Open', 'In Progress'] } })
    ]);

    // An overdue student's campusStatus is still 'Outside' (it's never flipped to
    // 'Overdue'), so they're included in the Outside count above. Subtract them so
    // the Outside and Overdue tiles are disjoint buckets — Outside = out but still
    // on time, Overdue = out past the return window.
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
    const allFields   = 'name email role studentId department year roomNumber hostelName phoneNumber gender managedGender campusStatus lastSeenAt onDuty lastActiveAt webAuthnRegistered createdAt photo';

    const users = await User.find(filter)
      .select(req.user.role === 'Guard' ? guardFields : allFields)
      .sort({ createdAt: -1 })
      .lean();

    // Overlay the live 'Overdue' status onto students who are out past their
    // return window. campusStatus is only ever stored as Inside/Outside, so this
    // derived value (not persisted) is what lets the roster views and their
    // ?filter=overdue query surface late students without a background job.
    const overdueIds = await getOverdueStudentIds();
    for (const u of users) {
      if (overdueIds.has(String(u._id))) u.campusStatus = 'Overdue';
    }

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
    const { name, staffId, role, pin, phoneNumber, managedGender } = req.body;

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
    // A Warden must be tied to exactly one hostel so the system can route each
    // student's requests to the right warden and keep the other hostel's student
    // details private. 'Male' = boys' hostel, 'Female' = girls' hostel.
    if (role === 'Warden' && !['Male', 'Female'].includes(managedGender)) {
      return res.status(400).json({ message: "Select the warden's hostel (Boys' or Girls')." });
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
      // Only meaningful for wardens; left unset for guards.
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

// @desc    Assign / change the hostel a Warden oversees
// @route   PATCH /api/admin/staff/:id/scope
// @access  Private (Admin)
//
// This is how wardens created before the per-hostel split (or any warden without
// a hostel yet) get scoped. An unassigned warden sees no students until this is
// set, so this endpoint is what turns them "on" for their hostel.
const updateStaffScope = async (req, res) => {
  try {
    const { managedGender } = req.body;
    if (!['Male', 'Female'].includes(managedGender)) {
      return res.status(400).json({ message: "Hostel must be 'Male' (boys') or 'Female' (girls')." });
    }

    const user = await User.findById(req.params.id);
    // Only wardens have a hostel scope — never students, guards, or admins.
    if (!user || user.role !== 'Warden') {
      return res.status(404).json({ message: 'Warden not found.' });
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
  updateStaffScope,
  removeStaff
};
