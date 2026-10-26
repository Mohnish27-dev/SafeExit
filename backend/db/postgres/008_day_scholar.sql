-- ============================================================================
-- 008 — Day scholars: students who live at home and have no hostel.
--
--   * users.residency says which kind of student a row is: 'Hostel' (every student until
--     now, hence the default) or 'DayScholar'.
--   * users_student_has_hostel is replaced. A hostel student still must have a hostel; a
--     day scholar must NOT have one (and so no room), and must carry a gender of their own,
--     because for everyone else gender is implied by the hostel and the gate's rule for
--     girls (config/hostels.hideGirlFromGuard) needs it. The IS NOT NULL is not redundant:
--     NULL IN (...) is NULL, and a CHECK lets NULL through.
--
-- A day scholar never has an outing: the gate logs their entries and exits in scan_logs
-- and nothing else, so they are never 'Outside', never overdue, and never phoned.
--
-- Safe to re-run. server.js also applies the column and the constraint at boot
-- (utils/residencySchema.js), because the User model selects residency on every query.
-- ============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS residency text NOT NULL DEFAULT 'Hostel';

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_residency_check;
ALTER TABLE users
  ADD CONSTRAINT users_residency_check
  CHECK (residency IN ('Hostel','DayScholar'));

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_student_has_hostel;
ALTER TABLE users
  ADD CONSTRAINT users_student_has_hostel
  CHECK (
    role <> 'Student'
    OR (residency = 'Hostel' AND hostel_name IS NOT NULL)
    OR (residency = 'DayScholar' AND hostel_name IS NULL AND room_number IS NULL
        AND gender IS NOT NULL AND gender IN ('Male','Female'))
  );
