-- ============================================================================
-- 006 — Parent's phone number on every leave application.
--
-- The leave form asks for a parent's 10-digit mobile number (boys and girls alike), so the
-- caretaker and warden deciding the leave can call home. Stored per application, not on
-- the user: it records the number given for that trip.
--
-- Nullable: applications filed before this column existed have no number. The API
-- requires one on every new application (leaveController.createLeaveApplication).
--
-- Safe to re-run. server.js also adds the column at boot (utils/leaveSchema.js), because
-- the model selects it on every leave query: a deploy that forgot this file would
-- otherwise break leave reads and gate scans alike.
-- ============================================================================

ALTER TABLE leave_applications ADD COLUMN IF NOT EXISTS parent_phone text;

-- Exactly ten digits, nothing else (no +91, spaces or dashes; the form strips them).
ALTER TABLE leave_applications
  ADD CONSTRAINT leave_parent_phone_format
  CHECK (parent_phone IS NULL OR parent_phone ~ '^[0-9]{10}$');
