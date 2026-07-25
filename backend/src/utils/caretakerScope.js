const User = require('../models/User');
const { genderForHostel } = require('../config/hostels');

// A caretaker's managedGender -> the set of student genders they may see.
// 'Other' rides with the boys' hostel, matching outingRules' male/general path.
// Used only as the LEGACY fallback for caretakers not yet assigned a managedHostel.
const scopeGenders = (managedGender) =>
  managedGender === 'Female' ? ['Female']
  : managedGender === 'Male' ? ['Male', 'Other']
  : [];

// Case-insensitive hostel compare so stored/canonical spellings always line up.
const sameHostel = (a, b) =>
  !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Student ids of the caretaker's own hostel (case-insensitive hostelName match).
const ownHostelStudentIds = (managedHostel) =>
  User.find({ role: 'Student', hostelName: managedHostel })
    .collation({ locale: 'en', strength: 2 })
    .distinct('_id');

// Mongo filter fragment restricting a REQUEST query (outing/leave/complaint) to the
// caller's scope. Routing is now request-keyed on `targetCaretaker`:
// - Admin/Guard (and any non-Caretaker): {} (no restriction).
// - Caretaker: requests routed to them (targetCaretaker === self) OR legacy requests with
//   no targetCaretaker whose student belongs to their own hostel (migration-safe).
// - Caretaker with only a legacy managedGender (no managedHostel): students of that gender.
// - Caretaker with neither: matches nothing.
async function scopedStudentFilter(user) {
  if (!user || user.role !== 'Caretaker') return {};

  if (user.managedHostel) {
    const ids = await ownHostelStudentIds(user.managedHostel);
    return {
      $or: [
        { targetCaretaker: user._id },
        { targetCaretaker: { $exists: false }, student: { $in: ids } },
        { targetCaretaker: null, student: { $in: ids } },
      ],
    };
  }

  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { student: { $in: [] } };
  const ids = await User.find({ role: 'Student', gender: { $in: genders } }).distinct('_id');
  return { student: { $in: ids } };
}

// Single-doc guard for approve/reject/handle endpoints: may this caretaker act on this
// request? The request carries `targetCaretaker` (routing key). `student` must be a
// populated doc/object carrying at least { hostelName, gender }.
// - targetCaretaker set -> only that caretaker may act.
// - targetCaretaker unset (legacy) -> hostel-first check, with the gender fallback.
function requestInScope(user, request, student) {
  if (!user || user.role !== 'Caretaker') return true; // Admin/Guard unrestricted
  if (request && request.targetCaretaker) {
    return String(request.targetCaretaker) === String(user._id);
  }
  return studentInScope(user, student);
}

// Legacy single-doc guard used where there is no routed request (kept for the
// gender fallback path and any hostel-only checks).
function studentInScope(user, student) {
  if (!user || user.role !== 'Caretaker') return true; // Admin/Guard unrestricted
  if (!student) return false;
  if (user.managedHostel) return sameHostel(student.hostelName, user.managedHostel);
  return scopeGenders(user.managedGender).includes(student.gender);
}

// GENDER-scoped filter for SOS: an emergency is never fenced to a single hostel, so
// every caretaker of the matching gender (plus admins, via notifyCaretakersAndAdmins) can
// see and act on it. Admin/Guard: unrestricted. Caretaker: all students of their gender.
async function genderScopedStudentFilter(user) {
  if (!user || user.role !== 'Caretaker') return {};
  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { student: { $in: [] } };
  const ids = await User.find({ role: 'Student', gender: { $in: genders } }).distinct('_id');
  return { student: { $in: ids } };
}

// Single-doc gender guard for SOS handle/resolve: may this caretaker act on an alert
// raised by this student? Yes when the student's gender is within the caretaker's scope.
function studentInGenderScope(user, student) {
  if (!user || user.role !== 'Caretaker') return true; // Admin/Guard unrestricted
  if (!student) return false;
  return scopeGenders(user.managedGender).includes(student.gender);
}

// Resolve the caretaker a new request should route to.
// - If `requestedCaretakerId` is supplied, it must be an assigned Caretaker whose managed
//   gender matches the student's gender (the boys<->girls fence). Mismatch -> throws.
// - Otherwise defaults to the caretaker of the student's own hostel (or null if none).
// Returns the caretaker doc, or null when no caretaker can be resolved (routing then falls
// back to hostel-based notification/scoping).
async function resolveTargetCaretaker(student, requestedCaretakerId) {
  const studentGender = student.gender || genderForHostel(student.hostelName);

  if (requestedCaretakerId) {
    const caretaker = await User.findById(requestedCaretakerId).select(
      '_id role managedGender managedHostel name'
    );
    if (!caretaker || caretaker.role !== 'Caretaker' || !caretaker.managedHostel) {
      const err = new Error('Selected caretaker is not available. Pick a valid caretaker.');
      err.statusCode = 400;
      throw err;
    }
    // Gender fence: the target's managed gender must match the student's gender.
    if (caretaker.managedGender !== studentGender) {
      const err = new Error('You can only send requests to a caretaker of your own gender scope.');
      err.statusCode = 403;
      throw err;
    }
    return caretaker;
  }

  // Default: the caretaker of the student's own hostel, if one is assigned.
  if (student.hostelName) {
    const caretaker = await User.findOne({ role: 'Caretaker', managedHostel: student.hostelName })
      .collation({ locale: 'en', strength: 2 })
      .select('_id role managedGender managedHostel name');
    return caretaker || null;
  }
  return null;
}

module.exports = {
  scopedStudentFilter,
  studentInScope,
  requestInScope,
  resolveTargetCaretaker,
  genderScopedStudentFilter,
  studentInGenderScope,
};
