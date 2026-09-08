const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, legacyId, timestampFields, blobAttribute, blobColumns } = require('./_shared');

// Every index this model relies on lives in db/postgres/001_schema.sql, with the same
// per-query notes the Mongoose schema carried. Sequelize does NOT declare them here:
// nothing in this app calls sync(), so an index declared in a model would be a comment
// that looks like code. test/schemaDdl.test.js pins the DDL instead.
//
// The one that is a CORRECTNESS guard rather than a performance one:
//
//   CREATE UNIQUE INDEX one_active_outing_per_student ON outing_requests (student_id)
//     WHERE status IN ('Pending','Approved','Forwarded','Out');
//
// createOutingRequest reads the active requests, finds nothing blocking, then creates.
// Two concurrent POSTs from one student both pass that check; only the database can
// reject the second. It surfaces here as a SequelizeUniqueConstraintError whose
// `.parent.constraint` is that index name, which the controller turns into the same 409
// the pre-check would have returned. The status list MUST stay identical to
// ACTIVE_PASS_STATUSES in config/passStatuses.js — if they drift, the index enforces a
// different rule than the 409 does and the double-submit race reopens silently.

const SIGNATURE_ATTRIBUTES = ['studentSignature', 'caretakerSignature', 'wardenSignature'];

const OutingRequest = getSequelize().define(
  'OutingRequest',
  {
    id: uuidPk(),
    legacyId: legacyId(),

    // The foreign key. The `student` association declared in models/index.js reads
    // through it, and toJSON collapses the two back into the single `student` field the
    // API has always returned — an id when nothing was included, the populated object
    // when it was.
    studentId: { type: DataTypes.UUID, allowNull: false, field: 'student_id' },

    destination: { type: DataTypes.TEXT, allowNull: false },
    purpose: { type: DataTypes.TEXT, allowNull: false },

    // With the student's gender, selects the rule set (windows and deadlines live in
    // utils/outingRules.js): Nearby/Market are female-only, General is the single male
    // path.
    outingType: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'General', field: 'outing_type' },

    outTime: { type: DataTypes.DATE, allowNull: false, field: 'out_time' },
    inTime: { type: DataTypes.DATE, allowNull: false, field: 'in_time' },

    // Approved -> Expired happens lazily at read time when outTime passes unused.
    // 'Forwarded' = a caretaker escalated it to the hostel warden.
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'Pending' },

    // True when approved by the system rule rather than a caretaker (approvedBy stays null).
    autoApproved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'auto_approved' },

    // Stamped when the entry scan closes the trip; student dashboards read this, not the
    // scan logs.
    returnPunctuality: { type: DataTypes.TEXT, field: 'return_punctuality' },

    overdueNotifiedAt: { type: DataTypes.DATE, field: 'overdue_notified_at' },
    // Separate marker for the student's own browser push.
    studentOverdueNotifiedAt: { type: DataTypes.DATE, field: 'student_overdue_notified_at' },

    actualOutTime: { type: DataTypes.DATE, field: 'actual_out_time' },
    actualInTime: { type: DataTypes.DATE, field: 'actual_in_time' },

    decision: { type: DataTypes.TEXT },
    decidedAt: { type: DataTypes.DATE, field: 'decided_at' },
    decidedByRole: { type: DataTypes.TEXT, field: 'decided_by_role' },
    remarks: { type: DataTypes.TEXT },

    // Immutable signature snapshots, stamped at submit/approval time. bytea now rather
    // than base64 text — the getters rebuild the exact data URL the API returns, so
    // nothing outside this model knows the difference.
    //
    // These stay inline rather than moving to a side table (unlike the user's photo and
    // signature): Postgres TOASTs large values out of the main heap, so a query that does
    // not name the column never reads those pages. The defaultScope below is what keeps
    // list endpoints from naming them.
    ...blobAttribute('studentSignature', 'student_signature', 'image/png'),
    ...blobAttribute('caretakerSignature', 'caretaker_signature', 'image/png'),
    ...blobAttribute('wardenSignature', 'warden_signature', 'image/png'),

    approvedBy: { type: DataTypes.UUID, field: 'approved_by' },
    targetCaretaker: { type: DataTypes.UUID, field: 'target_caretaker' },
    forwardedTo: { type: DataTypes.UUID, field: 'forwarded_to' },
    forwardedBy: { type: DataTypes.UUID, field: 'forwarded_by' },
    forwardedNote: { type: DataTypes.TEXT, field: 'forwarded_note' },
    forwardedAt: { type: DataTypes.DATE, field: 'forwarded_at' },

    ...timestampFields,
  },
  {
    tableName: 'outing_requests',

    // The structural version of what test/rosterPhotoBudget.test.js and
    // utils/signature.js LIST_PROJECTION did by convention: a row can carry three
    // signature blobs and these lists are polled every 15-30 seconds, so no query pulls
    // them unless it asks. Use .scope('withSignatures') — or name the attributes
    // explicitly — on the one endpoint that serves the bytes.
    defaultScope: {
      attributes: { exclude: SIGNATURE_ATTRIBUTES.flatMap(blobColumns) },
    },
    scopes: {
      withSignatures: {},
    },
  }
);

OutingRequest.SIGNATURE_ATTRIBUTES = SIGNATURE_ATTRIBUTES;

module.exports = OutingRequest;
