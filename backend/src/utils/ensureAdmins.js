const { Op } = require('sequelize');
const { User } = require('../models');
const { ADMIN_EMAILS } = require('../config/adminAllowlist');

// Idempotent boot-time provisioning of the Google sign-in admin account(s) in
// config/adminAllowlist.js. The account carries no password: the only way in is POST
// /api/auth/google with a Google token for that exact mailbox.
//
// Admin accounts from the ID + PIN era are left in place (other rows may point at them),
// but they can no longer sign in: password and passkey login are refused for the Admin
// role, and Google sign-in only admits an allowlisted email. They are reported at boot so
// they can be removed once nothing needs them.
const ensureAdmins = async () => {
  let created = 0;
  let updated = 0;

  for (const email of ADMIN_EMAILS) {
    const existing = await User.findOne({
      where: { [Op.or]: [{ email }, { loginId: email }] },
    });

    if (existing) {
      if (existing.role !== 'Admin') {
        // Never promote someone else's account into the admin console on a boot. A row
        // already holding this address (a student who registered with it, say) needs a
        // person to look at it.
        console.error(
          `[ensureAdmins] ${email} already belongs to a ${existing.role} account ` +
            `(${existing.id}); NOT converting it to Admin. Resolve this by hand.`
        );
        continue;
      }
      // Normal restarts are write-free; only a leftover PIN hash or a drifted key saves.
      if (existing.password || existing.email !== email || existing.loginId !== email) {
        existing.email = email;
        existing.loginId = email;
        existing.password = null;
        await existing.save();
        updated += 1;
      }
      continue;
    }

    // The email doubles as the name until the first Google sign-in replaces it with the
    // name on the Google profile (authController googleLogin).
    await User.create({ name: email, email, loginId: email, role: 'Admin' });
    created += 1;
  }

  const legacy = await User.findAll({
    where: { role: 'Admin', [Op.or]: [{ email: null }, { email: { [Op.notIn]: ADMIN_EMAILS } }] },
    attributes: ['id', 'loginId', 'name'],
  });
  if (legacy.length > 0) {
    console.warn(
      `[ensureAdmins] ${legacy.length} old ID + PIN admin account(s) can no longer sign in: ` +
        legacy.map((u) => u.loginId || u.id).join(', ')
    );
  }

  return { created, updated };
};

module.exports = { ensureAdmins };
