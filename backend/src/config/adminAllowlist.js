// Admin access allowlist — the real security boundary for the admin console
// Configure it via ADMIN_n_NAME / ADMIN_n_ID / ADMIN_n_PIN env vars in
// backend/.env, scanned until the first gap.
const buildAllowlistFromEnv = () => {
  const list = [];
  for (let i = 1; ; i += 1) {
    const name = process.env[`ADMIN_${i}_NAME`];
    const adminId = process.env[`ADMIN_${i}_ID`];
    const pin = process.env[`ADMIN_${i}_PIN`];
    if (!name || !adminId || !pin) break;
    list.push({ name, adminId, pin });
  }
  if (list.length === 0) {
    console.warn(
      '[adminAllowlist] No ADMIN_*_ env vars found — the admin console has NO ' +
        'authorized users. Set ADMIN_1_NAME/ID/PIN in backend/.env.'
    );
  }
  return list;
};

const ADMIN_ALLOWLIST = buildAllowlistFromEnv();

const normalizeId = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

// Canonical loginId for an admin is their normalized Admin ID.
const buildAdminLoginId = (adminId) => normalizeId(adminId);

const isAllowedAdminLoginId = (loginId) =>
  ADMIN_ALLOWLIST.some((a) => buildAdminLoginId(a.adminId) === normalizeId(loginId));

module.exports = {
  ADMIN_ALLOWLIST,
  isAllowedAdminLoginId,
  buildAdminLoginId,
};
