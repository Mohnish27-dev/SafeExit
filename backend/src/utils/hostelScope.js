const User = require('../models/User');
const { genderForHostel } = require('../config/hostels');


const HOSTEL_SCOPED_ROLES = ['Caretaker', 'Warden'];

const isHostelScoped = (user) => !!user && HOSTEL_SCOPED_ROLES.includes(user.role);


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

async function scopedStudentFilter(user) {
  if (!isHostelScoped(user)) return {};

  if (user.role === 'Warden') {
    if (!user.managedHostel) return { student: { $in: [] } };
    const ids = await ownHostelStudentIds(user.managedHostel);
    return { student: { $in: ids } };
  }

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


const forwardedToFilter = (user) => ({
  status: 'Forwarded',
  forwardedTo: user._id,
});

function requestInScope(user, request, student) {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  if (!isHostelScoped(user)) return false; // Guard/Student have no decision authority

  if (user.role === 'Warden') {
    return !!request && !!request.forwardedTo && String(request.forwardedTo) === String(user._id);
  }

  if (request && request.targetCaretaker) {
    return String(request.targetCaretaker) === String(user._id);
  }
  return studentInScope(user, student);
}

function studentInScope(user, student) {
  if (!isHostelScoped(user)) return true; // Admin/Guard unrestricted
  if (!student) return false;
  if (user.managedHostel) return sameHostel(student.hostelName, user.managedHostel);
  // A warden with no hostel is unassigned and sees nothing; only caretakers keep the
  // legacy gender fallback.
  if (user.role === 'Warden') return false;
  return scopeGenders(user.managedGender).includes(student.gender);
}
async function genderScopedStudentFilter(user) {
  if (!isHostelScoped(user)) return {};
  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { student: { $in: [] } };
  const ids = await User.find({ role: 'Student', gender: { $in: genders } }).distinct('_id');
  return { student: { $in: ids } };
}

function studentInGenderScope(user, student) {
  if (!isHostelScoped(user)) return true; // Admin/Guard unrestricted
  if (!student) return false;
  return scopeGenders(user.managedGender).includes(student.gender);
}

// Read scope for one row's signature bytes (GET /:id/signatures). Deliberately wider than
// requestInScope, which answers "may this staff member DECIDE this row": a warden's history
// covers their whole hostel, not only what was forwarded to them. Guards get nothing — no
// guard view renders a signature, and /scan/preview already carries what the gate needs.
function canReadSignatures(user, doc, student) {
  if (!user || !doc) return false;

  const ownerId = doc.student && (doc.student._id || doc.student);
  if (ownerId && String(ownerId) === String(user._id)) return true;

  if (['Admin', 'ChiefWarden'].includes(user.role)) return true;
  if (!HOSTEL_SCOPED_ROLES.includes(user.role)) return false;

  if (doc.targetCaretaker && String(doc.targetCaretaker) === String(user._id)) return true;
  if (doc.forwardedTo && String(doc.forwardedTo) === String(user._id)) return true;
  return studentInScope(user, student);
}


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


async function resolveWardenForHostel(hostelName) {
  if (!hostelName) return null;
  const warden = await User.findOne({ role: 'Warden', managedHostel: hostelName })
    .collation({ locale: 'en', strength: 2 })
    .select('_id role name managedGender managedHostel');
  return warden || null;
}

module.exports = {
  HOSTEL_SCOPED_ROLES,
  scopedStudentFilter,
  forwardedToFilter,
  studentInScope,
  requestInScope,
  resolveTargetCaretaker,
  resolveWardenForHostel,
  genderScopedStudentFilter,
  studentInGenderScope,
  canReadSignatures,
};
