// Single source of truth for "this student already has a live pass".
//
// Read by BOTH the blocking check in controllers/outingController.js +
// controllers/leaveController.js AND the unique partial indexes in
// models/OutingRequest.js + models/LeaveApplication.js. Keep it that way: if the list the
// controller checks ever drifts from the list the index filters on, the index silently
// enforces a different rule than the 409 does and the double-submit race reopens.
//
// 'Forwarded' is in here for the same reason it is in the controller check — a request
// sitting with the warden must block a second one, or a student could stack approvals.
// 'Out' is in here because a student who is physically off campus must not be able to
// mint a second pass.
const ACTIVE_PASS_STATUSES = ['Pending', 'Approved', 'Forwarded', 'Out'];

// Name the indexes explicitly rather than letting Mongo derive one from the key spec.
// utils/verifyIndexes.js looks them up by these names at startup to prove the build
// actually succeeded, because a failed partial-index build is otherwise silent and would
// leave the race unguarded while looking fine.
const ONE_ACTIVE_OUTING_INDEX = 'one_active_outing_per_student';
const ONE_ACTIVE_LEAVE_INDEX = 'one_active_leave_per_student';

// ---------------------------------------------------------------------------
// The full status vocabularies.
//
// These lived on the Mongoose schemas as `enum:` arrays, which made the model the single
// source of truth and let test/schemaDdl.test.js check the Postgres CHECK constraints
// against it. Sequelize has no enum for a plain text column — the CHECK in
// db/postgres/001_schema.sql IS the validation now — so the list moves here, where both
// the DDL test and any application code that needs to enumerate statuses can read it.
//
// Keep in step with 001_schema.sql. schemaDdl.test.js fails if they drift, which is the
// whole point: a status added to one side and not the other is how the double-submit race
// reopens quietly.
// ---------------------------------------------------------------------------

const OUTING_STATUSES = [
  'Pending', 'Approved', 'Rejected', 'Out', 'Returned', 'Expired', 'Cancelled', 'Forwarded',
];

// Same set as outings; listed separately because the two tables' CHECKs are separate and
// nothing forces them to stay identical.
const LEAVE_STATUSES = [
  'Pending', 'Approved', 'Rejected', 'Cancelled', 'Expired', 'Out', 'Returned', 'Forwarded',
];

// ChiefWarden is the campus-wide hostel oversight role: below Admin, but not tied to one
// hostel like Warden/Caretaker.
const USER_ROLES = ['Student', 'Caretaker', 'Warden', 'ChiefWarden', 'Guard', 'Admin'];

// 'Overdue' is derived at read time and never written by the gate scan, but the column
// permits it because legacy rows carry it.
const CAMPUS_STATUSES = ['Inside', 'Outside', 'Overdue'];

module.exports = {
  ACTIVE_PASS_STATUSES,
  ONE_ACTIVE_OUTING_INDEX,
  ONE_ACTIVE_LEAVE_INDEX,
  OUTING_STATUSES,
  LEAVE_STATUSES,
  USER_ROLES,
  CAMPUS_STATUSES,
};
