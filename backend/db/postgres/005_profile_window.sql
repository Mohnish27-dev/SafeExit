-- ============================================================================
-- 005 — Profile-update window: app_settings table + profile columns on users.
--
-- Adds the infrastructure for the annual profile-update window
-- (see src/utils/profileWindow.js):
--   * app_settings    — campus-wide runtime config (reopen dates, backfill marker)
--   * profile_unlocked     — legacy flag, kept for the one-time backfill only
--   * profile_confirmed_at — when the student last submitted their own details
--
-- Safe to re-run: every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- ============================================================================

-- The app_settings table stores campus-wide values an admin changes at runtime
-- (today: when the profile-update window was last reopened).
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Superseded by profile_confirmed_at; kept only for the one-time backfill in
-- src/utils/profileWindow.js.  Nothing reads it after that.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_unlocked boolean NOT NULL DEFAULT false;

-- When the student last submitted their own details.  Editable = confirmed
-- before the current window opened (every 1 July IST, or an admin's
-- "reopen for all").
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_confirmed_at timestamptz;
