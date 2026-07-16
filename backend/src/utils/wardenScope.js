const User = require('../models/User');

// A warden's managedGender -> the set of student genders they may see.
// 'Other' rides with the boys' hostel, matching outingRules' male/general path.
const scopeGenders = (managedGender) =>
  managedGender === 'Female' ? ['Female']
  : managedGender === 'Male' ? ['Male', 'Other']
  : [];

// Mongo filter fragment restricting a query's `student` ref to the caller's scope.
// - Admin/Guard (and any non-Warden): {} (no restriction).
// - Warden with a hostel: { student: { $in: [matching student ids] } }.
// - Warden with NO hostel assigned: { student: { $in: [] } } -> matches nothing.
async function scopedStudentFilter(user) {
  if (!user || user.role !== 'Warden') return {};
  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { student: { $in: [] } };
  const ids = await User.find({ role: 'Student', gender: { $in: genders } }).distinct('_id');
  return { student: { $in: ids } };
}

// Single-doc guard for approve/reject endpoints: may this warden act on a
// request belonging to a student of this gender?
function studentGenderInScope(user, studentGender) {
  if (!user || user.role !== 'Warden') return true; // Admin/Guard unrestricted
  return scopeGenders(user.managedGender).includes(studentGender);
}

module.exports = { scopedStudentFilter, studentGenderInScope };
