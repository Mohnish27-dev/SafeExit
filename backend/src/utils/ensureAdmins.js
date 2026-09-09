const { Op } = require('sequelize');
const { User } = require('../models');
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
      where: { [Op.or]: [{ loginId }, { email: legacyEmail }] },
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
        // null, not undefined: the column is nullable and UNIQUE, which is exactly the
        // `unique + sparse` the Mongoose field had, so many admins can share "no email".
        if (existing.email === legacyEmail) existing.email = null;
        if (pinChanged) existing.password = admin.pin; // re-hashed by the beforeSave hook
        await existing.save();
        updated += 1;
      }
      continue;
    }

    await User.create({
      name: admin.name,
      loginId,
      password: admin.pin, // hashed by the User model's beforeSave hook
      role: 'Admin',
      studentId: admin.adminId,
    });
    created += 1;
  }

  return { created, updated };
};

module.exports = { ensureAdmins };
