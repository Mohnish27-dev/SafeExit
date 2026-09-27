const { AppSetting } = require('../models');

// The annual profile-update window.
//
// Students move rooms, hostels and years every summer, and NIT Patna's academic year
// turns over in July. So every 1 July (campus time) every student may edit their own
// details again, once; submitting locks them until the next 1 July. There is no closing
// date — a student who never updates stays editable until they do.
//
// Nothing flips a flag at midnight. Editable is DERIVED:
//
//   windowStart = max(most recent 1 July 00:00 IST, the admin's last "reopen for all")
//   editable    = student AND (never confirmed OR confirmed before windowStart)
//
// A scheduled job would have to run exactly once, on a server that might be down that
// day, and would have to update every row. This way a server that boots on 3 July reaches
// the same answer, and "reopen for all" is one write instead of one per student.

// Asia/Kolkata has no DST, so a fixed offset names the instant exactly.
const CAMPUS_OFFSET = '+05:30';
const REOPENED_AT_KEY = 'profile_window_reopened_at';
// Records that the one-time profile_unlocked -> profile_confirmed_at backfill ran.
const BACKFILL_KEY = 'profile_confirmed_backfill';

const campusYear = (now) =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric' }).format(now));

const julyFirst = (year) => new Date(`${year}-07-01T00:00:00${CAMPUS_OFFSET}`);

// The most recent 1 July 00:00 IST at or before `now`.
const annualWindowStart = (now = new Date()) => {
  const year = campusYear(now);
  const thisYear = julyFirst(year);
  return now >= thisYear ? thisYear : julyFirst(year - 1);
};

const getReopenedAt = async () => {
  const row = await AppSetting.findByPk(REOPENED_AT_KEY);
  const at = row ? new Date(row.value) : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
};

const getProfileWindowStart = async (now = new Date()) => {
  const annual = annualWindowStart(now);
  const reopened = await getReopenedAt();
  return reopened && reopened > annual ? reopened : annual;
};

// Pure, so callers that already hold windowStart (a roster page) pay no extra query.
// Staff are never "editable": this window is for student details only, and a NULL
// profile_confirmed_at on an admin-provisioned account must not read as open.
const canEditProfile = (user, windowStart) => {
  if (!user || user.role !== 'Student') return false;
  const confirmedAt = user.profileConfirmedAt ? new Date(user.profileConfirmedAt) : null;
  return !confirmedAt || confirmedAt < windowStart;
};

const isProfileEditable = async (user) =>
  user?.role === 'Student' ? canEditProfile(user, await getProfileWindowStart()) : false;

const reopenProfileWindow = async (now = new Date()) => {
  await AppSetting.upsert({ key: REOPENED_AT_KEY, value: now.toISOString() });
  return now;
};

// Boot-time schema step, run before the server accepts requests. Idempotent.
//
// The backfill is the dangerous part: the new column starts NULL, and NULL means
// "editable", so without it every existing student would be unlocked the moment this
// deploys. It keeps each student exactly as locked as they were — profile_unlocked=false
// becomes "confirmed now" (locked until next 1 July), true stays NULL (still editable).
//
// It must run once and only once — a second run months later would lock anyone the
// window had since reopened. Keyed on a marker row rather than on "did the ADD COLUMN do
// anything", because 001_schema.sql may already have added the column. The marker insert
// and the UPDATE share a transaction, so two instances booting together cannot both run
// it, and a crash between them leaves neither.
const ensureProfileWindowSchema = async (sequelize) => {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS app_settings (
    key         text PRIMARY KEY,
    value       text NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
  );`);
  await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_unlocked boolean NOT NULL DEFAULT false;');
  await sequelize.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_confirmed_at timestamptz;');

  // Node's clock, not the database's now(): every other confirmation and every window
  // boundary is stamped by Node, and the two clocks differ (by ~1s on a dev box, measured).
  // Mixed clocks would let a reopen seconds after boot land "before" the backfill.
  const now = new Date().toISOString();
  return sequelize.transaction(async (transaction) => {
    const [claimed] = await sequelize.query(
      `INSERT INTO app_settings (key, value) VALUES (:key, :now)
       ON CONFLICT (key) DO NOTHING RETURNING key`,
      { replacements: { key: BACKFILL_KEY, now }, transaction }
    );
    if (!claimed.length) return 0;
    const [, result] = await sequelize.query(
      `UPDATE users SET profile_confirmed_at = :now
       WHERE role = 'Student' AND profile_confirmed_at IS NULL AND NOT profile_unlocked`,
      { replacements: { now }, transaction }
    );
    return result?.rowCount ?? 0;
  });
};

module.exports = {
  annualWindowStart,
  getProfileWindowStart,
  getReopenedAt,
  canEditProfile,
  isProfileEditable,
  reopenProfileWindow,
  ensureProfileWindowSchema,
};
