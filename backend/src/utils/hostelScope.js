const { Op, literal } = require('sequelize');
const { User } = require('../models');
const { genderForHostel } = require('../config/hostels');
const { ciEquals } = require('./ciCompare');

// ---------------------------------------------------------------------------
// What changed here, and why it is the biggest performance change in the migration
//
// The MongoDB version could not express "rows whose student is in my hostel" in one
// query, so it faked it: User.distinct('_id') for the whole hostel, then
// `{ student: { $in: [...every one of those ids] } }` shipped into every subsequent
// query. Two round trips, an unbounded id list crossing the wire twice, on every
// 30-second caretaker dashboard poll. Fine at 200 students; ruinous at full enrolment,
// and the honest technical form of the scaling worry that prompted this migration.
//
// In SQL the pattern does not get faster — it disappears. Scope is a JOIN against users
// with a WHERE on the joined row, so these helpers make NO database call at all. They
// return query fragments a caller merges into one statement, and the planner does the
// rest using users_role_hostel_ci.
//
// That is why they are no longer async. Call sites that used to `await` a scope filter
// now just build one.
// ---------------------------------------------------------------------------

const HOSTEL_SCOPED_ROLES = ['Caretaker', 'Warden'];

const isHostelScoped = (user) => !!user && HOSTEL_SCOPED_ROLES.includes(user.role);

const scopeGenders = (managedGender) =>
  managedGender === 'Female' ? ['Female']
  : managedGender === 'Male' ? ['Male', 'Other']
  : [];

// Case-insensitive hostel compare so stored/canonical spellings always line up.
const sameHostel = (a, b) =>
  !!a && !!b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

// A predicate that matches no row, for the "assigned to nothing, so sees nothing" cases.
// The Mongo equivalent was `{ student: { $in: [] } }`; this is the SQL one, and unlike an
// empty $in it is obvious in a logged query what it means.
const MATCH_NOTHING = { [Op.and]: [literal('false')] };

// Combines scope fragments with a caller's own filter without either clobbering the
// other. A plain spread cannot do this: both sides may carry an [Op.or], and the second
// would silently win — turning a scoped query into an unscoped one.
const mergeWhere = (...clauses) => {
  const parts = clauses.filter((c) => c && Object.keys(c).length + Object.getOwnPropertySymbols(c).length > 0);
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { [Op.and]: parts };
};

// The scope fragment for any table with a `student` association: outing_requests,
// leave_applications, scan_logs, sos_alerts, delay_notices.
//
// Returns { where, include } to merge into a findAll/count. `studentAttributes` is what
// the caller wants back from the joined user — pass [] for a count, which joins for the
// filter without transferring any user columns.
//
// It takes the MODEL, not just the user, because only two of those five tables have a
// targetCaretaker column. MongoDB hid that: a filter on a field a document does not have
// simply matches nothing, so for scan logs, SOS alerts and delay notices the caretaker's
// `{ targetCaretaker: me }` arm silently never matched, and the `{ targetCaretaker: null }`
// arm matched every row — the scope quietly degraded to "students in my hostel". Postgres
// would instead raise "column does not exist", so the degradation is made explicit here.
// Same behaviour as before; the difference is that now it is a decision rather than a
// side effect of an untyped query language.
//
// NOTE for callers that also paginate: pass `subQuery: false` alongside a limit, or
// Sequelize wraps the base table in a subquery that the joined-column predicates in
// `where` cannot see.
const passScope = (Model, user, studentAttributes) => {
  const routable = !!Model.rawAttributes.targetCaretaker;
  const studentInclude = (options = {}) => [
    { association: 'student', ...(studentAttributes ? { attributes: studentAttributes } : {}), ...options },
  ];

  if (!isHostelScoped(user)) return { where: {}, include: studentInclude() };

  if (user.role === 'Warden') {
    if (!user.managedHostel) return { where: MATCH_NOTHING, include: studentInclude() };
    return {
      where: {},
      include: studentInclude({
        required: true,
        where: { [Op.and]: [{ role: 'Student' }, ciEquals('student.hostel_name', user.managedHostel)] },
      }),
    };
  }

  if (user.managedHostel) {
    const inMyHostel = [
      { '$student.role$': 'Student' },
      ciEquals('student.hostel_name', user.managedHostel),
    ];

    // A table with no routing column has only one rule: the student is mine.
    if (!routable) {
      return {
        where: {},
        include: studentInclude({
          required: true,
          where: { [Op.and]: [{ role: 'Student' }, ciEquals('student.hostel_name', user.managedHostel)] },
        }),
      };
    }

    // Two ways a caretaker sees a routable row: it was routed to them explicitly, or
    // nobody was named and the student lives in their hostel. The second arm reads the
    // JOINED table, so the join has to be a LEFT one (required:false) — an INNER join
    // here would drop rows routed to this caretaker whose student belongs to a different
    // hostel, which is precisely the cross-hostel request the routing exists to allow.
    return {
      where: {
        [Op.or]: [
          { targetCaretaker: user._id },
          { [Op.and]: [{ targetCaretaker: null }, ...inMyHostel] },
        ],
      },
      include: studentInclude({ required: false }),
    };
  }

  // A caretaker with no hostel assigned yet keeps the legacy gender fallback.
  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { where: MATCH_NOTHING, include: studentInclude() };
  return {
    where: {},
    include: studentInclude({ required: true, where: { role: 'Student', gender: { [Op.in]: genders } } }),
  };
};

// SOS is gender-scoped rather than hostel-fenced: any caretaker of the student's gender
// may act, so an away-hostel caretaker can never bottleneck an emergency.
const genderScopedPassScope = (user, studentAttributes) => {
  const studentInclude = (options = {}) => [
    { association: 'student', ...(studentAttributes ? { attributes: studentAttributes } : {}), ...options },
  ];

  if (!isHostelScoped(user)) return { where: {}, include: studentInclude() };
  const genders = scopeGenders(user.managedGender);
  if (genders.length === 0) return { where: MATCH_NOTHING, include: studentInclude() };
  return {
    where: {},
    include: studentInclude({ required: true, where: { role: 'Student', gender: { [Op.in]: genders } } }),
  };
};

const forwardedToFilter = (user) => ({
  status: 'Forwarded',
  forwardedTo: user._id,
});

// ---------------------------------------------------------------------------
// Per-row authorisation. These read objects already loaded, make no query, and are
// unchanged by the migration beyond the identity comparisons — which still work because
// models/index.js keeps `_id` readable on an instance.
// ---------------------------------------------------------------------------

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

  const ownerId = doc.student ? (doc.student._id || doc.student) : doc.studentId;
  if (ownerId && String(ownerId) === String(user._id)) return true;

  if (['Admin', 'ChiefWarden'].includes(user.role)) return true;
  if (!HOSTEL_SCOPED_ROLES.includes(user.role)) return false;

  if (doc.targetCaretaker && String(doc.targetCaretaker) === String(user._id)) return true;
  if (doc.forwardedTo && String(doc.forwardedTo) === String(user._id)) return true;
  return studentInScope(user, student);
}

// ---------------------------------------------------------------------------
// Routing lookups
// ---------------------------------------------------------------------------

const STAFF_ROUTING_ATTRIBUTES = ['id', 'role', 'name', 'managedGender', 'managedHostel'];

async function resolveTargetCaretaker(student, requestedCaretakerId) {
  const studentGender = student.gender || genderForHostel(student.hostelName);

  if (requestedCaretakerId) {
    const caretaker = await User.findByPk(requestedCaretakerId, { attributes: STAFF_ROUTING_ATTRIBUTES });
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
    return User.findOne({
      // ciEquals replaces .collation({locale:'en',strength:2}) and is what the
      // users_role_managed_ci functional index is built for.
      where: { role: 'Caretaker', [Op.and]: [ciEquals('managed_hostel', student.hostelName)] },
      attributes: STAFF_ROUTING_ATTRIBUTES,
    });
  }
  return null;
}

async function resolveWardenForHostel(hostelName) {
  if (!hostelName) return null;
  return User.findOne({
    where: { role: 'Warden', [Op.and]: [ciEquals('managed_hostel', hostelName)] },
    attributes: STAFF_ROUTING_ATTRIBUTES,
  });
}

module.exports = {
  HOSTEL_SCOPED_ROLES,
  MATCH_NOTHING,
  mergeWhere,
  passScope,
  genderScopedPassScope,
  forwardedToFilter,
  studentInScope,
  requestInScope,
  resolveTargetCaretaker,
  resolveWardenForHostel,
  studentInGenderScope,
  canReadSignatures,
  isHostelScoped,
  scopeGenders,
};
