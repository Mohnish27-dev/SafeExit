-- ============================================================================
-- SafeExit — turn on the deferred checks from 002_post_etl_constraints.sql.
--
-- Run this only after the ETL has loaded the data AND the offender queries listed in 002
-- return zero rows. Until then those constraints are enforced on new writes but not on
-- the migrated rows; this file closes that gap.
--
-- VALIDATE takes a SHARE UPDATE EXCLUSIVE lock: it scans the table but does not block
-- reads or writes, so it is safe to run on a live database.
--
-- Re-running is harmless — validating an already-valid constraint is a no-op.
-- ============================================================================

ALTER TABLE users              VALIDATE CONSTRAINT users_guardian_phone_format;
ALTER TABLE users              VALIDATE CONSTRAINT users_student_has_hostel;
ALTER TABLE close_contacts     VALIDATE CONSTRAINT close_contacts_mobile_format;
ALTER TABLE outing_requests    VALIDATE CONSTRAINT outing_decision_complete;
ALTER TABLE outing_requests    VALIDATE CONSTRAINT outing_window_ordered;
ALTER TABLE leave_applications VALIDATE CONSTRAINT leave_decision_complete;
ALTER TABLE leave_applications VALIDATE CONSTRAINT leave_window_ordered;
ALTER TABLE scan_logs          VALIDATE CONSTRAINT scan_logs_pass_type_matches;
