-- ============================================================================
-- SafeExit — post-cutover cleanup. DO NOT RUN UNTIL THE MIGRATION IS SETTLED.
--
-- legacy_id holds the source MongoDB ObjectId. It earns its keep during Phase 2 (the ETL
-- resolves foreign keys by it, and ON CONFLICT (legacy_id) DO UPDATE is what makes re-runs
-- idempotent) and during the grace period after cutover, when old JWTs still carry Mongo
-- ObjectIds — see backend/src/utils/generateToken.js. The auth middleware falls back to a
-- legacy_id lookup so students are not all force-logged-out at the moment of cutover.
--
-- Preconditions, all of them:
--   1. The Atlas cluster has been read-only for at least two weeks and nothing has needed it.
--   2. Every JWT issued before cutover has expired, so no request can still present an
--      ObjectId subject.
--   3. The legacy_id fallback has been removed from the auth middleware.
--   4. A fresh pg_dump has been taken.
--
-- Dropping a column is instant and does not rewrite the table, but it is not reversible
-- without that dump.
-- ============================================================================

ALTER TABLE users              DROP COLUMN IF EXISTS legacy_id;
ALTER TABLE outing_requests    DROP COLUMN IF EXISTS legacy_id;
ALTER TABLE leave_applications DROP COLUMN IF EXISTS legacy_id;
ALTER TABLE scan_logs          DROP COLUMN IF EXISTS legacy_id;
ALTER TABLE sos_alerts         DROP COLUMN IF EXISTS legacy_id;
ALTER TABLE delay_notices      DROP COLUMN IF EXISTS legacy_id;
ALTER TABLE push_subscriptions DROP COLUMN IF EXISTS legacy_id;
ALTER TABLE email_otps         DROP COLUMN IF EXISTS legacy_id;
