const User = require('../models/User');
const { ADMIN_ALLOWLIST, buildAdminLoginId } = require('../config/adminAllowlist');

// Idempotent boot-time seeding from the ADMIN_*_ allowlist: creates missing admins, refreshes name/PIN.
const ensureAdmins = async () => {
  if (ADMIN_ALLOWLIST.length === 0) {
    console.warn('[ensureAdmins] No ADMIN_*_ env vars set — skipping admin seeding.');
    return { created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;

  for (const admin of ADMIN_ALLOWLIST) {
    const loginId = buildAdminLoginId(admin.adminId);
    // Also match the legacy synthetic email so pre-migration admins are migrated in place, not duplicated.
    const legacyEmail = `${loginId}@admin.safeexit.local`;
    const existing = await User.findOne({
      $or: [{ loginId }, { email: legacyEmail }],
    });

    if (existing) {
      // Only save when identity or PIN actually differs — keeps normal restarts write-free.
      const identityChanged =
        existing.name !== admin.name ||
        existing.loginId !== loginId ||
        existing.studentId !== admin.adminId ||
        existing.role !== 'Admin' ||
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
      loginId,
      password: admin.pin, // hashed by the User model's pre-save hook
      role: 'Admin',
      studentId: admin.adminId,
    });
    created += 1;
  }

  return { created, updated };
};

module.exports = { ensureAdmins };
