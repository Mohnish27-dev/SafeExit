const { OutingRequest, LeaveApplication } = require('../models');
const { isReturnLate } = require('./outingRules');

// 'Overdue' and 'On Leave' are never stored — both are derived at read time from passes
// still 'Out'. Only an outing can be overdue, judged by the same isReturnLate the gate scan
// uses. A leave's return date is the student's own expected return, not a deadline, so a
// student holding a leave still 'Out' is on leave however long it runs: never overdue, and
// never phoned by the gate. The two sets are disjoint, so the dashboard tiles never count a
// student twice. Returns Sets of student id strings.
const getAwayStudentIds = async (studentWhere) => {
  const include = studentWhere
    ? [{ association: 'student', where: studentWhere, attributes: [], required: true }]
    : undefined;
  const [outings, leaves] = await Promise.all([
    OutingRequest.findAll({ where: { status: 'Out' }, attributes: ['studentId', 'inTime'], raw: true, ...(include ? { include } : {}) }),
    LeaveApplication.findAll({ where: { status: 'Out' }, attributes: ['studentId', 'returnDate'], raw: true, ...(include ? { include } : {}) }),
  ]);

  const overdueIds = new Set();
  const onLeaveIds = new Set();
  const leaveReturnDates = new Map();
  for (const o of outings) if (isReturnLate(o.inTime)) overdueIds.add(String(o.studentId));
  for (const l of leaves) {
    const sid = String(l.studentId);
    onLeaveIds.add(sid);
    if (l.returnDate) leaveReturnDates.set(sid, l.returnDate);
  }
  // Only reachable through bad data (one live outing and one live leave): a late outing is
  // what the guard has to act on.
  for (const id of overdueIds) {
    onLeaveIds.delete(id);
    leaveReturnDates.delete(id);
  }
  return { overdueIds, onLeaveIds, leaveReturnDates };
};

const getOverdueStudentIds = async () => (await getAwayStudentIds()).overdueIds;

module.exports = { getAwayStudentIds, getOverdueStudentIds };
