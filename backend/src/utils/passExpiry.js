const OutingRequest = require('../models/OutingRequest');
const LeaveApplication = require('../models/LeaveApplication');
const { isDeparturePassed } = require('./outingRules');

const EXPIRABLE_STATUSES = ['Pending', 'Approved', 'Forwarded'];

const expireStaleRequests = async (requests) => {
  const list = Array.isArray(requests) ? requests : [requests];
  const stale = list.filter(
    (doc) => doc && EXPIRABLE_STATUSES.includes(doc.status) && isDeparturePassed(doc.outTime)
  );
  if (!stale.length) return requests;

  try {
    await OutingRequest.updateMany(
      { _id: { $in: stale.map((doc) => doc._id) }, status: { $in: EXPIRABLE_STATUSES } },
      { $set: { status: 'Expired' } }
    );
  } catch (err) {
    console.warn(`[outing] lazy expiry write failed: ${err.message}`);
  }

  for (const doc of stale) {
    doc.status = 'Expired';
    if (typeof doc.unmarkModified === 'function') doc.unmarkModified('status');
  }
  return requests;
};

const expireStaleApplications = async (applications) => {
  const list = Array.isArray(applications) ? applications : [applications];
  const now = Date.now();
  const stale = list.filter(
    (doc) =>
      doc &&
      EXPIRABLE_STATUSES.includes(doc.status) &&
      now > new Date(doc.leaveDate).getTime()
  );
  if (!stale.length) return applications;

  try {
    await LeaveApplication.updateMany(
      { _id: { $in: stale.map((doc) => doc._id) }, status: { $in: EXPIRABLE_STATUSES } },
      { $set: { status: 'Expired' } }
    );
  } catch (err) {
    console.warn(`[leave] lazy expiry write failed: ${err.message}`);
  }

  for (const doc of stale) {
    doc.status = 'Expired';
    if (typeof doc.unmarkModified === 'function') doc.unmarkModified('status');
  }
  return applications;
};

module.exports = {
  EXPIRABLE_STATUSES,
  expireStaleRequests,
  expireStaleApplications,
};
