const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, legacyId, timestampFields, blobAttribute, blobColumns } = require('./_shared');

// Mirrors models/OutingRequest.js — including the one_active_leave_per_student partial
// unique index and the signature-excluding defaultScope. See the notes there.
//
// KNOWN GAP, carried over unchanged from MongoDB: the two per-table indexes cannot stop a
// student holding one active outing AND one active leave at once. That rule lives in
// application code (test/crossCollectionPassBlocking.test.js pins it) and stays there for
// now. Postgres can close it properly with a shared active_pass_locks table written in
// the same transaction as the pass — a deliberate post-cutover decision, not something to
// bundle into the port.

const SIGNATURE_ATTRIBUTES = ['studentSignature', 'caretakerSignature', 'wardenSignature'];

// The ticket bytes are excluded from every list like the signatures, but ticketMime is
// not: it is what tells a dashboard there is a ticket at all, and whether it is a PDF.
const LIST_EXCLUDED_ATTRIBUTES = [...SIGNATURE_ATTRIBUTES.flatMap(blobColumns), 'ticket'];

const LeaveApplication = getSequelize().define(
  'LeaveApplication',
  {
    id: uuidPk(),
    legacyId: legacyId(),

    studentId: { type: DataTypes.UUID, allowNull: false, field: 'student_id' },

    destination: { type: DataTypes.TEXT, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    leaveDate: { type: DataTypes.DATE, allowNull: false, field: 'leave_date' },
    returnDate: { type: DataTypes.DATE, allowNull: false, field: 'return_date' },
    // Parent's 10-digit mobile, given on the form so staff can call home. Null only on
    // applications filed before db/postgres/006_leave_parent_phone.sql.
    parentPhone: { type: DataTypes.TEXT, field: 'parent_phone' },
    // 'HH:MM' the student expects to leave. Informational: the leave QR works all day.
    // Null only on applications filed before db/postgres/007_leave_workflow.sql.
    expectedDepartureTime: { type: DataTypes.TEXT, field: 'expected_departure_time' },
    // A girl's application filed on the departure day itself.
    isEmergency: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'is_emergency' },
    // Optional travel ticket (photo or PDF), attached at submit only.
    ...blobAttribute('ticket', 'ticket', 'application/octet-stream'),

    // Audit trail of what the student agreed to — not a security boundary.
    acknowledgement: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

    // Pending/Approved -> Expired happens lazily at read time; Out/Returned only via
    // gate scans.
    status: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'Pending' },

    decision: { type: DataTypes.TEXT },
    decidedAt: { type: DataTypes.DATE, field: 'decided_at' },
    decidedByRole: { type: DataTypes.TEXT, field: 'decided_by_role' },
    remarks: { type: DataTypes.TEXT },
    // Set when staff revoked a boy's auto-approved leave. The row then reads as Rejected
    // (status and decision), and this is what tells the dashboards it was a revocation.
    revokedAt: { type: DataTypes.DATE, field: 'revoked_at' },

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
    tableName: 'leave_applications',
    defaultScope: {
      attributes: { exclude: LIST_EXCLUDED_ATTRIBUTES },
    },
    scopes: {
      withSignatures: {},
    },
  }
);

LeaveApplication.SIGNATURE_ATTRIBUTES = SIGNATURE_ATTRIBUTES;

module.exports = LeaveApplication;
