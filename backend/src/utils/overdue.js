const { OutingRequest, LeaveApplication } = require('../models');
const { isReturnLate } = require('./outingRules');

// 'Overdue' is never stored — derived at read time from passes still 'Out' past their
// return window, using the same isReturnLate the gate scan uses. Returns a Set of student
// id strings.
const getOverdueStudentIds = async () => {
  const [outings, leaves] = await Promise.all([
    OutingRequest.findAll({ where: { status: 'Out' }, attributes: ['studentId', 'inTime'], raw: true }),
    LeaveApplication.findAll({ where: { status: 'Out' }, attributes: ['studentId', 'returnDate'], raw: true }),
  ]);

  const ids = new Set();
  for (const o of outings) if (isReturnLate(o.inTime)) ids.add(String(o.studentId));
  for (const l of leaves) if (isReturnLate(l.returnDate)) ids.add(String(l.studentId));
  return ids;
};

module.exports = { getOverdueStudentIds };
