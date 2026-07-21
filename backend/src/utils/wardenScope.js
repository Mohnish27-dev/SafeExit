const User = require('../models/User');

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

// Mongo filter fragment restricting a query's `student` ref to the caller's scope.
// - Admin/Guard (and any non-Warden): {} (no restriction).
// - Warden WITH a managedHostel: students of exactly that hostel (per-hostel routing).
// - Warden with only a legacy managedGender: students of that gender (migration fallback).
// - Warden with neither: { student: { $in: [] } } -> matches nothing.
async function scopedStudentFilter(user) {
  if (!user || user.role !== 'Warden') return {};

  if (user.managedHostel) {
    const ids = await User.find({ role: 'Student', hostelName: user.managedHostel })
      .collation({ locale: 'en', strength: 2 }) // case-insensitive hostelName match
      .distinct('_id');
    return { student: { $in: ids } };
  }

  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { student: { $in: [] } };
  const ids = await User.find({ role: 'Student', gender: { $in: genders } }).distinct('_id');
  return { student: { $in: ids } };
}

// Single-doc guard for approve/reject endpoints: may this warden act on a
// request belonging to this student? Hostel-first, with the legacy gender fallback.
// `student` must be a populated doc/object carrying at least { hostelName, gender }.
function studentInScope(user, student) {
  if (!user || user.role !== 'Warden') return true; // Admin/Guard unrestricted
  if (!student) return false;
  if (user.managedHostel) return sameHostel(student.hostelName, user.managedHostel);
  return scopeGenders(user.managedGender).includes(student.gender);
}

module.exports = { scopedStudentFilter, studentInScope };
