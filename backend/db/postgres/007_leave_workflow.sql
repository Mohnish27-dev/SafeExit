-- ============================================================================
-- 007 — Leave workflow v2: boys auto-approved, girls decided by any of three, ticket,
-- departure time, emergency flag, revocation.
--
--   * Boys' leave is approved the moment it is submitted. Such a row is decided by nobody,
--     so decided_by_role gains 'System'. The caretaker, wardens or chief warden may revoke
--     it until the gate takes him Out; revoked_at marks a rejection that was a revocation.
--   * Girls' leave goes to the caretaker, the hostel's wardens and the chief warden at
--     once, and any of them decides it, so decided_by_role also gains 'ChiefWarden'.
--   * expected_departure_time is the hour the student expects to leave ('HH:MM', 24-hour,
--     campus time). Informational only: the leave QR still works all day.
--   * is_emergency marks a girl's application filed on the departure day itself.
--   * ticket / ticket_mime: optional travel ticket (image or PDF), attached at submit.
--
-- All new columns are nullable or defaulted, so applications filed before this file keep
-- reading as they did. Safe to re-run. server.js also applies all of this at boot
-- (utils/leaveSchema.js), because the model selects these columns on every leave query.
-- ============================================================================

ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS expected_departure_time text;
ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS is_emergency boolean NOT NULL DEFAULT false;
ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS ticket bytea;
ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS ticket_mime text;
ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

ALTER TABLE leave_applications DROP CONSTRAINT IF EXISTS leave_expected_departure_time_format;
ALTER TABLE leave_applications
  ADD CONSTRAINT leave_expected_departure_time_format
  CHECK (expected_departure_time IS NULL OR expected_departure_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- The inline CHECK from 001 carries Postgres's generated name.
ALTER TABLE leave_applications DROP CONSTRAINT IF EXISTS leave_applications_decided_by_role_check;
ALTER TABLE leave_applications
  ADD CONSTRAINT leave_applications_decided_by_role_check
  CHECK (decided_by_role IN ('Caretaker','Warden','ChiefWarden','System'));
