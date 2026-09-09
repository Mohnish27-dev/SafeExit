// The cutover grace period, in one place.
//
// Primary keys are uuids now, but two things minted before the migration still arrive
// carrying a 24-character MongoDB ObjectId:
//
//   1. Every JWT issued before cutover. generateToken.js signs `{ id: <pk> }`, and a 30-day
//      expiry means the last pre-cutover token is valid for a month afterwards. Without a
//      fallback, cutover force-logs-out every student, warden and gate guard at the same
//      moment — including whoever is standing at the barrier at the time.
//   2. Every QR code a student's device has cached. The payload is identity-only, so the
//      pass is always re-resolved from the database, but the identity in it is the old id.
//
// Both resolve through the `legacy_id` column the ETL populated. That column disappears
// with db/postgres/004_drop_legacy_ids.sql, and at that point these lookups would not
// degrade to "no match" — they would raise `column users.legacy_id does not exist` on
// every request. So the fallback is a switch, not a permanent feature, and this module is
// the single grep target when it is time to remove it.
//
// DEFAULT ON, off only with LEGACY_ID_GRACE=false. The safe direction: forgetting to turn
// it on at cutover locks everyone out, while forgetting to turn it off costs one indexed
// lookup on tokens that are expiring anyway. 004's preconditions require the code itself
// to be deleted, so "on by default" cannot outlive the column.

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;

const legacyGraceEnabled = () => process.env.LEGACY_ID_GRACE !== 'false';

// True only for an id that is worth spending a legacy_id lookup on.
const isLegacyId = (value) =>
  legacyGraceEnabled() && OBJECT_ID_RE.test(String(value || '').trim());

module.exports = { OBJECT_ID_RE, legacyGraceEnabled, isLegacyId };
