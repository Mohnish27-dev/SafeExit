const User = require('../models/User');
const { genderForHostel } = require('../config/hostels');

// A warden's managedGender -> the set of student genders they may see.
// 'Other' rides with the boys' hostel, matching outingRules' male/general path.
// Used only as the LEGACY fallback for wardens not yet assigned a managedHostel.
const scopeGenders = (managedGender) =>
  managedGender === 'Female' ? ['Female']
  : managedGender === 'Male' ? ['Male', 'Other']
  : [];

// Case-insensitive hostel compare so stored/canonical spellings always line up.
const sameHostel = (a, b) =>
  !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// Student ids of the warden's own hostel (case-insensitive hostelName match).
const ownHostelStudentIds = (managedHostel) =>
  User.find({ role: 'Student', hostelName: managedHostel })
    .collation({ locale: 'en', strength: 2 })
    .distinct('_id');

// Mongo filter fragment restricting a REQUEST query (outing/leave/complaint) to the
// caller's scope. Routing is now request-keyed on `targetWarden`:
// - Admin/Guard (and any non-Warden): {} (no restriction).
// - Warden: requests routed to them (targetWarden === self) OR legacy requests with
//   no targetWarden whose student belongs to their own hostel (migration-safe).
// - Warden with only a legacy managedGender (no managedHostel): students of that gender.
// - Warden with neither: matches nothing.
async function scopedStudentFilter(user) {
  if (!user || user.role !== 'Warden') return {};

  if (user.managedHostel) {
    const ids = await ownHostelStudentIds(user.managedHostel);
    return {
      $or: [
        { targetWarden: user._id },
        { targetWarden: { $exists: false }, student: { $in: ids } },
        { targetWarden: null, student: { $in: ids } },
      ],
    };
  }

  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { student: { $in: [] } };
  const ids = await User.find({ role: 'Student', gender: { $in: genders } }).distinct('_id');
  return { student: { $in: ids } };
}

// Single-doc guard for approve/reject/handle endpoints: may this warden act on this
// request? The request carries `targetWarden` (routing key). `student` must be a
// populated doc/object carrying at least { hostelName, gender }.
// - targetWarden set -> only that warden may act.
// - targetWarden unset (legacy) -> hostel-first check, with the gender fallback.
function requestInScope(user, request, student) {
  if (!user || user.role !== 'Warden') return true; // Admin/Guard unrestricted
  if (request && request.targetWarden) {
    return String(request.targetWarden) === String(user._id);
  }
  return studentInScope(user, student);
}

// Legacy single-doc guard used where there is no routed request (kept for the
// gender fallback path and any hostel-only checks).
function studentInScope(user, student) {
  if (!user || user.role !== 'Warden') return true; // Admin/Guard unrestricted
  if (!student) return false;
  if (user.managedHostel) return sameHostel(student.hostelName, user.managedHostel);
  return scopeGenders(user.managedGender).includes(student.gender);
}

// GENDER-scoped filter for SOS: an emergency is never fenced to a single hostel, so
// every warden of the matching gender (plus admins, via notifyWardensAndAdmins) can
// see and act on it. Admin/Guard: unrestricted. Warden: all students of their gender.
async function genderScopedStudentFilter(user) {
  if (!user || user.role !== 'Warden') return {};
  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { student: { $in: [] } };
  const ids = await User.find({ role: 'Student', gender: { $in: genders } }).distinct('_id');
  return { student: { $in: ids } };
}

// Single-doc gender guard for SOS handle/resolve: may this warden act on an alert
// raised by this student? Yes when the student's gender is within the warden's scope.
function studentInGenderScope(user, student) {
  if (!user || user.role !== 'Warden') return true; // Admin/Guard unrestricted
  if (!student) return false;
  return scopeGenders(user.managedGender).includes(student.gender);
}

// Resolve the warden a new request should route to.
// - If `requestedWardenId` is supplied, it must be an assigned Warden whose managed
//   gender matches the student's gender (the boys<->girls fence). Mismatch -> throws.
// - Otherwise defaults to the warden of the student's own hostel (or null if none).
// Returns the warden doc, or null when no warden can be resolved (routing then falls
// back to hostel-based notification/scoping).
async function resolveTargetWarden(student, requestedWardenId) {
  const studentGender = student.gender || genderForHostel(student.hostelName);

  if (requestedWardenId) {
    const warden = await User.findById(requestedWardenId).select(
      '_id role managedGender managedHostel name'
    );
    if (!warden || warden.role !== 'Warden' || !warden.managedHostel) {
      const err = new Error('Selected warden is not available. Pick a valid warden.');
      err.statusCode = 400;
      throw err;
    }
    // Gender fence: the target's managed gender must match the student's gender.
    if (warden.managedGender !== studentGender) {
      const err = new Error('You can only send requests to a warden of your own gender scope.');
      err.statusCode = 403;
      throw err;
    }
    return warden;
  }

  // Default: the warden of the student's own hostel, if one is assigned.
  if (student.hostelName) {
    const warden = await User.findOne({ role: 'Warden', managedHostel: student.hostelName })
      .collation({ locale: 'en', strength: 2 })
      .select('_id role managedGender managedHostel name');
    return warden || null;
  }
  return null;
}

module.exports = {
  scopedStudentFilter,
  studentInScope,
  requestInScope,
  resolveTargetWarden,
  genderScopedStudentFilter,
  studentInGenderScope,
};
