// Boot-time guard for db/postgres/006_leave_parent_phone.sql.
//
// The LeaveApplication model selects parent_phone on every query, so a database without
// the column fails every leave read AND every gate scan (the scan resolves the student's
// leave). Adding it here, idempotently, means a deploy that forgot to run 006 still works.
// The format CHECK is left to 006: the API validates the number itself.
const ensureLeaveSchema = async (sequelize) => {
  await sequelize.query('ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS parent_phone text;');
};

// Exactly ten digits. Mirrors the leave_parent_phone_format CHECK in 006 and the leave form.
const PARENT_PHONE_RE = /^[0-9]{10}$/;

module.exports = { ensureLeaveSchema, PARENT_PHONE_RE };
