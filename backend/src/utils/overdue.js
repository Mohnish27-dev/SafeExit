const OutingRequest = require('../models/OutingRequest');
const LeaveApplication = require('../models/LeaveApplication');
const { isReturnLate } = require('./outingRules');

// 'Overdue' is never stored — derived at read time from passes still 'Out' past their return window, using the same isReturnLate the gate scan uses. Returns a Set of student _id strings.
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
