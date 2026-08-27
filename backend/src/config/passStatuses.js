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

module.exports = {
  ACTIVE_PASS_STATUSES,
  ONE_ACTIVE_OUTING_INDEX,
  ONE_ACTIVE_LEAVE_INDEX,
};
