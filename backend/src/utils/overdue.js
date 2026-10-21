const { OutingRequest, LeaveApplication } = require('../models');
const { isReturnLate } = require('./outingRules');

// 'Overdue' and 'On Leave' are never stored — both are derived at read time from passes
// still 'Out'. Only an outing can be overdue, judged by the same isReturnLate the gate scan
// uses. A leave's return date is the student's own expected return, not a deadline, so a
// student holding a leave still 'Out' is on leave however long it runs: never overdue, and
// never phoned by the gate. The two sets are disjoint, so the dashboard tiles never count a
// student twice. Returns Sets of student id strings.
const getAwayStudentIds = async () => {
  const [outings, leaves] = await Promise.all([
    OutingRequest.findAll({ where: { status: 'Out' }, attributes: ['studentId', 'inTime'], raw: true }),
    LeaveApplication.findAll({ where: { status: 'Out' }, attributes: ['studentId', 'returnDate'], raw: true }),
  ]);

  const overdueIds = new Set();
  const onLeaveIds = new Set();
  for (const o of outings) if (isReturnLate(o.inTime)) overdueIds.add(String(o.studentId));
  for (const l of leaves) onLeaveIds.add(String(l.studentId));
  // Only reachable through bad data (one live outing and one live leave): a late outing is
  // what the guard has to act on.
  for (const id of overdueIds) onLeaveIds.delete(id);
  return { overdueIds, onLeaveIds };
};

const getOverdueStudentIds = async () => (await getAwayStudentIds()).overdueIds;

module.exports = { getAwayStudentIds, getOverdueStudentIds };
