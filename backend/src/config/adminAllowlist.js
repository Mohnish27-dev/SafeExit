// ---------------------------------------------------------------------------
// Admin access allowlist
// ---------------------------------------------------------------------------
// ONLY the people listed here may register for or log into the SafeExit admin
// console. Every other account is rejected with HTTP 403, even if it somehow
// carries role: 'Admin'. This is the real security boundary — the frontend
// mirrors it only for friendlier error messages.
//
// To change who has admin access, edit the ADMIN_*_ env vars in backend/.env
// (a gitignored file) — NOT this source file. Each admin needs three vars:
//   - ADMIN_n_NAME : the exact full name the admin types on the login page
//   - ADMIN_n_ID   : the Admin ID they type (this IS their login identifier)
//   - ADMIN_n_PIN  : the PIN that doubles as their account password
//
// Nothing secret lives in this file anymore, so it is safe to commit.
// Build the allowlist by scanning ADMIN_1_*, ADMIN_2_*, ... until a gap.
const buildAllowlistFromEnv = () => {
  const list = [];
  for (let i = 1; ; i += 1) {
    const name = process.env[`ADMIN_${i}_NAME`];
    const adminId = process.env[`ADMIN_${i}_ID`];
    const pin = process.env[`ADMIN_${i}_PIN`];
    // Stop at the first index that isn't fully configured.
    if (!name || !adminId || !pin) break;
    list.push({ name, adminId, pin });
  }
  if (list.length === 0) {
    // Fail loud rather than silently allowing nobody (or, worse, everyone).
    console.warn(
      '[adminAllowlist] No ADMIN_*_ env vars found — the admin console has NO ' +
        'authorized users. Set ADMIN_1_NAME/ID/PIN in backend/.env.'
    );
  }
  return list;
};

const ADMIN_ALLOWLIST = buildAllowlistFromEnv();

// Normalize a display name: trim, lowercase, collapse internal whitespace.
const normalizeName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// Normalize an Admin ID / email: trim, lowercase, strip all whitespace.
const normalizeId = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

// Every account is keyed on a canonical `loginId`. For admins that is simply
// their normalized Admin ID (e.g. "adm-mohnish") — no synthetic email anymore.
const buildAdminLoginId = (adminId) => normalizeId(adminId);

// Find the allowlist entry matching the supplied identity fields. Any field that
// is `undefined` is ignored, so callers can match on whatever they have (e.g.
// name + adminId at registration, or just loginId at login). Returns null if no
// entry matches every provided field.
const findAllowedAdmin = ({ name, adminId, loginId } = {}) =>
  ADMIN_ALLOWLIST.find((a) => {
    if (name !== undefined && normalizeName(a.name) !== normalizeName(name)) return false;
    if (adminId !== undefined && normalizeId(a.adminId) !== normalizeId(adminId)) return false;
    if (loginId !== undefined && buildAdminLoginId(a.adminId) !== normalizeId(loginId)) return false;
    return true;
  }) || null;

// True if the given loginId belongs to one of the authorized admins.
const isAllowedAdminLoginId = (loginId) =>
  ADMIN_ALLOWLIST.some((a) => buildAdminLoginId(a.adminId) === normalizeId(loginId));

module.exports = {
  ADMIN_ALLOWLIST,
  findAllowedAdmin,
  isAllowedAdminLoginId,
  buildAdminLoginId,
};
