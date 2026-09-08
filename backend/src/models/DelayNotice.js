const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, legacyId, timestampFields } = require('./_shared');

// A student's "I'll be late" notice for an outing they are currently out on.
// Advisory only: newExpectedTime never feeds isReturnLate, so the gate scan and the
// overdue sweep keep judging punctuality against the pass's own inTime.
//
// MongoDB stored an untyped `trip` ObjectId plus a `tripType` discriminator, with no
// referential integrity in either direction — a notice could point at a deleted pass, or
// at a leave while claiming to be an outing. That splits here into two real foreign keys
// with a CHECK that exactly one is set. The `trip` / `tripType` virtuals below rebuild
// the old shape for readers, so nothing downstream had to change to read a notice.
const DelayNotice = getSequelize().define(
  'DelayNotice',
  {
    id: uuidPk(),
    legacyId: legacyId(),

    studentId: { type: DataTypes.UUID, allowNull: false, field: 'student_id' },

    // Exactly one of these is non-null (delay_notices_one_trip). Notices are outing-only
    // now — a leave return date is an intention over days, not a same-day deadline to be
    // late against — so leaveId exists only so notices filed before that rule still load.
    outingId: { type: DataTypes.UUID, field: 'outing_id' },
    leaveId: { type: DataTypes.UUID, field: 'leave_id' },

    // Read-only compatibility virtuals. Deliberately no setters: a writer must name the
    // column it means, so a new notice can never be filed against the wrong kind of pass
    // the way an untyped `trip` allowed.
    trip: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('outingId') || this.getDataValue('leaveId') || null;
      },
    },
    tripType: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.getDataValue('leaveId') ? 'Leave' : 'Outing';
      },
    },

    reason: { type: DataTypes.TEXT, allowNull: false },
    note: { type: DataTypes.TEXT },

    // The student's own estimate. Staff-facing information, not a new deadline.
    newExpectedTime: { type: DataTypes.DATE, field: 'new_expected_time' },
    // Snapshot of the deadline at filing time, so later reads keep the audit trail even
    // though nothing rewrites the pass.
    originalInTime: { type: DataTypes.DATE, field: 'original_in_time' },
    // Was the student already past their return time when they filed?
    filedWhileOverdue: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'filed_while_overdue' },

    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'Pending' },
    acknowledgedBy: { type: DataTypes.UUID, field: 'acknowledged_by' },
    acknowledgedAt: { type: DataTypes.DATE, field: 'acknowledged_at' },
    acknowledgementNote: { type: DataTypes.TEXT, field: 'acknowledgement_note' },

    ...timestampFields,
  },
  { tableName: 'delay_notices' }
);

// outingId/leaveId are the honest columns, but `trip`/`tripType` are what every reader
// downstream expects to find on a notice, so the response keeps carrying those two and
// not the pair behind them.
DelayNotice.jsonHidden = new Set(['outingId', 'leaveId', 'outingPass', 'leavePass']);

module.exports = DelayNotice;
