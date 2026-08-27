const User = require('../models/User');
const OutingRequest = require('../models/OutingRequest');
const SOSAlert = require('../models/SOSAlert');
const { getOverdueStudentIds } = require('../utils/overdue');
const { readPageParams, sendPage } = require('../utils/pagination');
const { isValidHostel, genderForHostel, canonicalHostelName } = require('../config/hostels');

// 'Overdue' is a derived overlay that the gate scan never writes — it only ever stores
// 'Inside' or 'Outside'. But the User enum permits it and legacy rows may carry it, so
// "not inside" is the union of both. Counting bare 'Outside' would leave such a row in
// `total` and in none of the three tiles. Matches caretakerController's occupancy query.
const OUTSIDE_STATUSES = ['Outside', 'Overdue'];

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
      studentsOut
    ] = await Promise.all([
      User.countDocuments({ role: 'Student' }),
      User.countDocuments({ role: 'Student', campusStatus: 'Inside' }),
      User.countDocuments({ role: 'Student', campusStatus: { $in: OUTSIDE_STATUSES } }),
      // 'Overdue' is never stored — derived live from passes still 'Out' past their return window.
      getOverdueStudentIds(),
      User.countDocuments({ role: 'Guard' }),
      User.countDocuments({ role: 'Guard', onDuty: true }),
      User.countDocuments({ role: 'Caretaker' }),
      User.countDocuments({ role: 'Warden' }),
      SOSAlert.countDocuments({ status: 'Active' }),
      OutingRequest.countDocuments({ status: 'Pending' }),
      OutingRequest.countDocuments({ status: 'Out' })
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
      studentsOut
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/users?role= — private (Admin/Guard)
//
// `photo` is deliberately NOT selected here. Face photos are base64 data URLs of a few
// hundred KB each, so including them turned a roster of 400 students into a multi-hundred-
// megabyte JSON document — built in memory, serialised, and held until the socket drained,
// on an endpoint the security dashboard polls. `hasPhoto` tells the client which rows have
// one; the bytes come from GET /api/admin/users/:id/photo when a row is actually opened.
const getUsers = async (req, res) => {
  try {
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    // Guards may only browse students, and only non-confidential fields.
    if (req.user.role === 'Guard') filter.role = 'Student';

    const guardFields = 'name studentId campusStatus lastSeenAt';
    const allFields   = 'name email role studentId department year roomNumber hostelName phoneNumber gender managedGender managedHostel campusStatus lastSeenAt onDuty lastActiveAt webAuthnRegistered createdAt';

    const { limit, skip } = readPageParams(req);
    const users = await User.find(filter)
      .select(req.user.role === 'Guard' ? guardFields : allFields)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Which of these rows has a photo, without transferring any. The filter examines the
    // field server-side but the projection is _id only, so nothing but ObjectIds crosses
    // the wire. Scoped to the page's ids, so this second query stays as bounded as the first.
    const ids = users.map((u) => u._id);
    const withPhoto = await User.find({ _id: { $in: ids }, photo: { $nin: [null, ''] } })
      .select('_id')
      .lean();
    const photoIds = new Set(withPhoto.map((u) => String(u._id)));

    // Overlay derived (never persisted) 'Overdue' onto late students.
    const overdueIds = await getOverdueStudentIds();
    for (const u of users) {
      if (overdueIds.has(String(u._id))) u.campusStatus = 'Overdue';
      u.hasPhoto = photoIds.has(String(u._id));
    }

    return sendPage(res, users, {
      limit,
      skip,
      label: 'admin/users',
      count: () => User.countDocuments(filter),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/users/:id/photo — private (Admin/Guard)
//
// One student's face photo, on demand. Returned as JSON carrying the stored data URL
// rather than raw image bytes, so the client fetches it through apiFetch with its
// tab-scoped Bearer token. An <img src> would have to fall back to the shared cookie,
// and per the note in authMiddleware.js cookies are not tab-scoped: a browser with a
// second role logged in elsewhere would authorise the request as the wrong user.
const getUserPhoto = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('role photo').lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Mirrors the roster fence in getUsers: a guard may only look at students.
    if (req.user.role === 'Guard' && user.role !== 'Student') {
      return res.status(403).json({ message: 'Not authorised to view this photo.' });
    }

    // Immutable per upload and only ever read by staff, so let the browser keep it for
    // the session — this endpoint exists to be called once per row that gets opened.
    res.set('Cache-Control', 'private, max-age=300');
    res.json({ photo: user.photo || null });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /api/admin/students/counts — private (Admin/Guard)
//
// The security dashboard needs three numbers, and used to get them by downloading every
// student row every 15 seconds and tallying campusStatus client-side. That is the most
// expensive possible way to count, and once getUsers became paginated it was also wrong:
// a campus past PAGE_DEFAULT_LIMIT would have shown the tally of the first page only.
// These are index-served counts, so the answer costs the same at 40 students or 4000.
const getStudentCounts = async (req, res) => {
  try {
    const [total, inside, outside, overdueIds] = await Promise.all([
      User.countDocuments({ role: 'Student' }),
      User.countDocuments({ role: 'Student', campusStatus: 'Inside' }),
      User.countDocuments({ role: 'Student', campusStatus: { $in: OUTSIDE_STATUSES } }),
      getOverdueStudentIds(),
    ]);

    // Same disjoint-tiles rule as getOverview: an overdue student is still stored
    // 'Outside', so it has to come back out of that bucket.
    const overdue = overdueIds.size;

    res.json({
      total,
      inside,
      outside: Math.max(0, outside - overdue),
      overdue,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Trim, lowercase, strip whitespace — must match the login pages' helper.
const buildStaffLoginId = (id) => (id || '').trim().toLowerCase().replace(/\s+/g, '');

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

// POST /api/admin/staff — private (Admin)
const createStaff = async (req, res) => {
  try {
    const { name, staffId, role, pin, phoneNumber, managedHostel } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required.' });
    }
    if (!staffId || !staffId.trim()) {
      return res.status(400).json({ message: 'A staff ID is required.' });
    }
    // Admins come only from the .env allowlist — this endpoint can't mint one.
    if (!['Caretaker', 'Warden', 'ChiefWarden', 'Guard'].includes(role)) {
      return res.status(400).json({ message: 'Role must be Caretaker, Warden, Chief Warden, or Guard.' });
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
    // The Chief Warden is campus-wide, so there is no hostel scope and only one
    // account is needed. Admin can reset/replace that account from People.
    if (role === 'ChiefWarden') {
      const existing = await User.findOne({ role: 'ChiefWarden' });
      if (existing) {
        return res.status(409).json({
          message: `A Chief Warden account already exists (${existing.loginId}). Reset its PIN or remove it before creating another.`,
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
    if (!user || !['Caretaker', 'Warden', 'ChiefWarden', 'Guard'].includes(user.role)) {
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
    const { managedHostel } = req.body;
    const user = await User.findById(req.params.id);
    if (!user || !['Caretaker', 'Warden'].includes(user.role)) {
      return res.status(404).json({ message: 'Staff member not found.' });
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
    if (!user || !['Caretaker', 'Warden', 'ChiefWarden', 'Guard'].includes(user.role)) {
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
  getUserPhoto,
  getStudentCounts,
  createStaff,
  resetStaffPin,
  updateStaffScope,
  removeStaff
};
