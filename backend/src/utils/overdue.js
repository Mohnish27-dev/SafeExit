const OutingRequest = require('../models/OutingRequest');
const LeaveApplication = require('../models/LeaveApplication');
const { isReturnLate } = require('./outingRules');

// "Overdue" is not a stored state — it's a live, time-based condition: a student
// is overdue when they hold a pass that is still 'Out' AND its return window has
// already passed. Nothing in the system writes this down (there is no scan, no
// timer, no background job when a deadline lapses), so every dashboard that shows
// an overdue count must derive it at read time. This mirrors the lazy status
// convention documented on the pass models (OutingRequest.js: "no background job
// flipping it").
//
// The authoritative "who is out" signal is a pass whose `status` is 'Out'
// (OutingRequest via `inTime`, LeaveApplication via `returnDate`). We reuse the
// same absolute-instant comparison the gate scan uses (`isReturnLate`) so the
// verdict is identical to what a late entry scan would stamp.
//
// Returns a Set of student `_id` strings currently overdue.
const getOverdueStudentIds = async () => {
  const [outings, leaves] = await Promise.all([
    OutingRequest.find({ status: 'Out' }).select('student inTime').lean(),
    LeaveApplication.find({ status: 'Out' }).select('student returnDate').lean(),
  ]);

  const ids = new Set();
  for (const o of outings) if (isReturnLate(o.inTime)) ids.add(String(o.student));
  for (const l of leaves) if (isReturnLate(l.returnDate)) ids.add(String(l.student));
  return ids;
};

module.exports = { getOverdueStudentIds };
