const { Op } = require('sequelize');
const { OutingRequest, LeaveApplication } = require('../models');
const { isDeparturePassed } = require('./outingRules');

const EXPIRABLE_STATUSES = ['Pending', 'Approved', 'Forwarded'];

// Lazy expiry: a pass whose departure window has passed unused becomes Expired the next
// time anyone reads it, rather than needing a background job.
//
// The status guard in the WHERE clause is not decoration — between the read that produced
// these rows and this write, a gate scan may have moved one of them to 'Out'. Re-asserting
// the expirable statuses means the UPDATE simply skips that row instead of expiring a pass
// the student is currently using.
const expireStale = async (Model, label, rows, isStale) => {
  const list = Array.isArray(rows) ? rows : [rows];
  const stale = list.filter((doc) => doc && EXPIRABLE_STATUSES.includes(doc.status) && isStale(doc));
  if (!stale.length) return rows;

  try {
    await Model.update(
      { status: 'Expired' },
      { where: { id: { [Op.in]: stale.map((doc) => doc.id) }, status: { [Op.in]: EXPIRABLE_STATUSES } } }
    );
  } catch (err) {
    console.warn(`[${label}] lazy expiry write failed: ${err.message}`);
  }

  for (const doc of stale) {
    // setDataValue, not assignment: the caller is about to serialise these rows and must
    // see 'Expired', but they must not come back as a pending change on a later save().
    // This is the Sequelize equivalent of the unmarkModified() the Mongoose version did.
    if (typeof doc.setDataValue === 'function') doc.setDataValue('status', 'Expired');
    else doc.status = 'Expired';
  }
  return rows;
};

const expireStaleRequests = (requests) =>
  expireStale(OutingRequest, 'outing', requests, (doc) => isDeparturePassed(doc.outTime));

const expireStaleApplications = (applications) =>
  expireStale(LeaveApplication, 'leave', applications, (doc) => Date.now() > new Date(doc.leaveDate).getTime());

module.exports = {
  EXPIRABLE_STATUSES,
  expireStaleRequests,
  expireStaleApplications,
};
