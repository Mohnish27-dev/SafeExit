-- ============================================================================
-- SafeExit — constraints that are applied AFTER the ETL, not before it.
--
-- Why this file is separate from 001:
--
-- Everything here asserts a rule the *current* application enforces but that legacy
-- MongoDB rows may violate — Mongoose validators only run on save(), so a document
-- written before a rule existed was never re-checked. If these lived in 001 they would
-- run before any data was loaded and then fail the ETL, quite possibly at 2 a.m. on
-- cutover night, on a phone number typed in 2024.
--
-- So each CHECK is added NOT VALID (accepted instantly, enforced on every future write,
-- existing rows untouched), and the VALIDATE pass at the bottom is run separately once
-- the data has been cleaned. VALIDATE takes only a SHARE UPDATE EXCLUSIVE lock, so it
-- does not block reads or writes.
--
-- Run order:  001_schema.sql -> ETL -> 002 -> clean the data -> 003_validate_constraints.sql
--
-- If a VALIDATE in 003 fails, the query beside each constraint below finds the rows.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Phone number formats. Mongoose: match: /^\d{10,15}$/
-- Offenders:  SELECT id, name, guardian_phone_number FROM users
--             WHERE guardian_phone_number IS NOT NULL
--               AND guardian_phone_number !~ '^[0-9]{10,15}$';
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_guardian_phone_format
  CHECK (guardian_phone_number IS NULL OR guardian_phone_number ~ '^[0-9]{10,15}$')
  NOT VALID;

ALTER TABLE close_contacts
  ADD CONSTRAINT close_contacts_mobile_format
  CHECK (mobile_number ~ '^[0-9]{10,15}$')
  NOT VALID;


-- ---------------------------------------------------------------------------
-- A student belongs to a hostel; staff and guards do not.
-- Registration has enforced this for a while, but pre-rule accounts may predate it.
-- Offenders:  SELECT id, name, email FROM users WHERE role = 'Student' AND hostel_name IS NULL;
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD CONSTRAINT users_student_has_hostel
  CHECK (role <> 'Student' OR hostel_name IS NOT NULL)
  NOT VALID;


-- ---------------------------------------------------------------------------
-- Roll numbers are unique among students.
--
-- MongoDB never asserted this, but the gate's college-ID-card path resolves a student BY
-- roll number — if two students share one, the gate lets the wrong person through. This
-- is a partial unique INDEX, not a CHECK, so there is no NOT VALID form: it either builds
-- or it fails, which is the correct outcome for a rule this load-bearing.
--
-- Offenders:  SELECT student_id, count(*) FROM users
--             WHERE role = 'Student' AND student_id IS NOT NULL
--             GROUP BY student_id HAVING count(*) > 1;
--
-- Run scripts/mongoInventory.js BEFORE cutover — it reports duplicates from the source
-- data so this is never a surprise here.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS users_student_id_unique
  ON users (student_id)
  WHERE role = 'Student' AND student_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- A pass that was decided has both a decision and a timestamp.
-- Offenders:  SELECT id FROM outing_requests WHERE (decision IS NULL) <> (decided_at IS NULL);
-- ---------------------------------------------------------------------------
ALTER TABLE outing_requests
  ADD CONSTRAINT outing_decision_complete
  CHECK ((decision IS NULL) = (decided_at IS NULL))
  NOT VALID;

ALTER TABLE leave_applications
  ADD CONSTRAINT leave_decision_complete
  CHECK ((decision IS NULL) = (decided_at IS NULL))
  NOT VALID;


-- ---------------------------------------------------------------------------
-- An outing's return time is after its departure time.
-- Offenders:  SELECT id, out_time, in_time FROM outing_requests WHERE in_time <= out_time;
-- ---------------------------------------------------------------------------
ALTER TABLE outing_requests
  ADD CONSTRAINT outing_window_ordered
  CHECK (in_time > out_time)
  NOT VALID;

ALTER TABLE leave_applications
  ADD CONSTRAINT leave_window_ordered
  CHECK (return_date >= leave_date)
  NOT VALID;


-- ---------------------------------------------------------------------------
-- A scan log that names a pass type names a pass, and vice versa.
-- Offenders:  SELECT id FROM scan_logs
--             WHERE (pass_type IS NULL) <> (outing_id IS NULL AND leave_id IS NULL);
-- ---------------------------------------------------------------------------
ALTER TABLE scan_logs
  ADD CONSTRAINT scan_logs_pass_type_matches
  CHECK ((pass_type IS NULL) = (outing_id IS NULL AND leave_id IS NULL))
  NOT VALID;


-- The VALIDATE pass lives in 003_validate_constraints.sql, so that applying this file can
-- never fail on dirty legacy data and so that turning the checks on is a deliberate,
-- separately-run step.
