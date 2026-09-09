const { DataTypes } = require('sequelize');
const { getSequelize } = require('../config/sequelize');
const { uuidPk, legacyId, timestampFields } = require('./_shared');

// One gate movement (IN/OUT scan); the source of truth for movement logs and campus
// status. Written inside the scan transaction in controllers/scanController.js — the
// single most valuable win of this migration, because in MongoDB the five writes of a
// scan were sequential and unguarded, so process death between them could leave a
// student marked Outside with no scan log at all: an invisible gate movement.
const ScanLog = getSequelize().define(
  'ScanLog',
  {
    id: uuidPk(),
    legacyId: legacyId(),

    studentId: { type: DataTypes.UUID, allowNull: false, field: 'student_id' },
    // Optional, so seeded and system-generated logs still validate.
    guardId: { type: DataTypes.UUID, field: 'guard_id' },

    direction: { type: DataTypes.TEXT, allowNull: false },

    // At most one of these is ever set — Outing-first resolution in scanController — and
    // the scan_logs_one_pass CHECK in the schema now enforces that rather than trusting
    // the controller to.
    outingId: { type: DataTypes.UUID, field: 'outing_id' },
    leaveId: { type: DataTypes.UUID, field: 'leave_id' },
    passType: { type: DataTypes.TEXT, field: 'pass_type' },

    // 'N/A' when there is no window to judge against.
    punctuality: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'N/A' },
    gate: { type: DataTypes.TEXT, allowNull: false, defaultValue: 'Main Gate' },

    ...timestampFields,
  },
  { tableName: 'scan_logs' }
);

module.exports = ScanLog;
