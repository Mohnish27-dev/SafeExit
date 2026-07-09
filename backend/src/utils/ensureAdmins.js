const User = require('../models/User');
const { ADMIN_ALLOWLIST, buildAdminLoginId } = require('../config/adminAllowlist');

// ---------------------------------------------------------------------------
// Ensure the admin accounts exist and match the .env allowlist
// ---------------------------------------------------------------------------
// Idempotent: safe to call on every server boot. For each ADMIN_*_ entry it
//   - creates the account if missing
//   - refreshes name + PIN if the account already exists
// so operators never have to run a separate seed step. Assumes the DB is
// already connected. Returns a small summary for logging.
const ensureAdmins = async () => {
  if (ADMIN_ALLOWLIST.length === 0) {
    console.warn('[ensureAdmins] No ADMIN_*_ env vars set — skipping admin seeding.');
    return { created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;

  for (const admin of ADMIN_ALLOWLIST) {
    const loginId = buildAdminLoginId(admin.adminId);
    // Match on the new canonical loginId, but also on the legacy synthetic email
    // (<id>@admin.safeexit.local) so admins provisioned before this change are
    // migrated in place rather than duplicated.
    const legacyEmail = `${loginId}@admin.safeexit.local`;
    const existing = await User.findOne({
      $or: [{ loginId }, { email: legacyEmail }],
    });

    if (existing) {
      // Keep normal restarts write-free: only save when the .env identity or PIN
      // actually differs from what's stored. The password is hashed, so we detect
      // a PIN change with matchPassword rather than a string compare.
      const identityChanged =
        existing.name !== admin.name ||
        existing.loginId !== loginId ||
        existing.studentId !== admin.adminId ||
        existing.role !== 'Admin' ||
        // Clear any fabricated legacy email left over from the old scheme.
        existing.email === legacyEmail;
      const pinChanged = !(await existing.matchPassword(admin.pin));

      if (identityChanged || pinChanged) {
        existing.name = admin.name;
        existing.loginId = loginId;
        existing.studentId = admin.adminId;
        existing.role = 'Admin';
        if (existing.email === legacyEmail) existing.email = undefined;
        if (pinChanged) existing.password = admin.pin; // re-hashed by pre-save hook
        await existing.save();
        updated += 1;
      }
      continue;
    }

    await User.create({
      name: admin.name,
      loginId, // canonical key — the admin's normalized ID, no synthetic email
      password: admin.pin, // hashed by the User model's pre-save hook
      role: 'Admin',
      studentId: admin.adminId,
    });
    created += 1;
  }

  return { created, updated };
};

module.exports = { ensureAdmins };
