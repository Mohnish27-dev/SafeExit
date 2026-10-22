// Boot-time guard for db/postgres/006_leave_parent_phone.sql and 007_leave_workflow.sql.
//
// The LeaveApplication model selects these columns on every query, so a database without
// them fails every leave read AND every gate scan (the scan resolves the student's leave).
// Adding them here, idempotently, means a deploy that forgot 006/007 still works. The
// format CHECKs are left to the files: the API validates both values itself.
//
// The decided_by_role CHECK is the exception: without 'System' every boy's submission is
// refused by the database, so it is widened here too — but only when it still lacks the
// new roles, so an up-to-date database is not re-validated under a table lock every boot.
const DECIDED_BY_ROLE_CHECK = 'leave_applications_decided_by_role_check';

const ensureLeaveSchema = async (sequelize) => {
  await sequelize.query('ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS parent_phone text;');
  await sequelize.query('ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS expected_departure_time text;');
  await sequelize.query('ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS is_emergency boolean NOT NULL DEFAULT false;');
  await sequelize.query('ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS ticket bytea;');
  await sequelize.query('ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS ticket_mime text;');
  await sequelize.query('ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS revoked_at timestamptz;');

  const [rows] = await sequelize.query(
    'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = :name',
    { replacements: { name: DECIDED_BY_ROLE_CHECK } }
  );
  const def = rows[0]?.def || '';
  if (!def.includes('System') || !def.includes('ChiefWarden')) {
    await sequelize.transaction(async (transaction) => {
      await sequelize.query(
        `ALTER TABLE leave_applications DROP CONSTRAINT IF EXISTS ${DECIDED_BY_ROLE_CHECK};`,
        { transaction }
      );
      await sequelize.query(
        `ALTER TABLE leave_applications ADD CONSTRAINT ${DECIDED_BY_ROLE_CHECK}
           CHECK (decided_by_role IN ('Caretaker','Warden','ChiefWarden','System'));`,
        { transaction }
      );
    });
  }
};

// Exactly ten digits. Mirrors the leave_parent_phone_format CHECK in 006 and the leave form.
const PARENT_PHONE_RE = /^[0-9]{10}$/;

// 'HH:MM', 24-hour. Mirrors leave_expected_departure_time_format in 007 and the form's
// <input type="time">, which always submits this shape.
const DEPARTURE_TIME_RE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;

// The latest expected departure the form accepts. It only bounds what a student writes on
// the application — the leave QR still works at any hour of the leave date, whatever time
// they gave. Zero-padded 'HH:MM' strings compare correctly as plain strings.
const LATEST_DEPARTURE_TIME = '17:30';

// The optional travel ticket: a photo or a PDF e-ticket. 700 KB decoded is ~933 KB once
// base64'd, so a whole application stays under nginx's DEFAULT 1 MB client_max_body_size —
// the college proxy needs no config change, and nothing can fail there with a bare 413.
// The form downsizes photos to fit and refuses a larger PDF with a clear message.
const MAX_TICKET_BYTES = 700 * 1024;
const TICKET_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

module.exports = {
  ensureLeaveSchema,
  PARENT_PHONE_RE,
  DEPARTURE_TIME_RE,
  LATEST_DEPARTURE_TIME,
  MAX_TICKET_BYTES,
  TICKET_MIME_TYPES,
};
