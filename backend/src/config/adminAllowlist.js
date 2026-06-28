// ---------------------------------------------------------------------------
// Admin access allowlist
// ---------------------------------------------------------------------------
// ONLY the people listed here may register for or log into the SafeExit admin
// console. Every other account is rejected with HTTP 403, even if it somehow
// carries role: 'Admin'. This is the real security boundary — the frontend
// mirrors it only for friendlier error messages.
//
// To change who has admin access, edit ADMIN_ALLOWLIST below.
//   - name    : the exact full name the admin types on the login page
//   - adminId : the Admin ID they type (also used to derive their login email)
//   - pin     : the 4-digit PIN that doubles as their account password
//
// SECURITY: change the PINs before deploying — they are committed in source.
const ADMIN_ALLOWLIST = [
  { name: 'Gungun Wadhwani', adminId: 'ADM-GUNGUN', pin: '4729' },
  { name: 'Mohnish Pamnani', adminId: 'ADM-MOHNISH', pin: '8163' },
];

// Normalize a display name: trim, lowercase, collapse internal whitespace.
const normalizeName = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// Normalize an Admin ID / email: trim, lowercase, strip all whitespace.
const normalizeId = (s) => (s || '').trim().toLowerCase().replace(/\s+/g, '');

// The admin login page derives each admin's email from their Admin ID:
//   `${adminId.toLowerCase().replace(/\s+/g, '')}@admin.safeexit.local`
// Mirror that here so we can match an existing Admin account by email at login.
const buildAdminEmail = (adminId) => `${normalizeId(adminId)}@admin.safeexit.local`;

// Find the allowlist entry matching the supplied identity fields. Any field that
// is `undefined` is ignored, so callers can match on whatever they have (e.g.
// name + adminId at registration, or just email at login). Returns null if no
// entry matches every provided field.
const findAllowedAdmin = ({ name, adminId, email } = {}) =>
  ADMIN_ALLOWLIST.find((a) => {
    if (name !== undefined && normalizeName(a.name) !== normalizeName(name)) return false;
    if (adminId !== undefined && normalizeId(a.adminId) !== normalizeId(adminId)) return false;
    if (email !== undefined && buildAdminEmail(a.adminId) !== normalizeId(email)) return false;
    return true;
  }) || null;

// True if the given email belongs to one of the authorized admins.
const isAllowedAdminEmail = (email) =>
  ADMIN_ALLOWLIST.some((a) => buildAdminEmail(a.adminId) === normalizeId(email));

module.exports = {
  ADMIN_ALLOWLIST,
  findAllowedAdmin,
  isAllowedAdminEmail,
  buildAdminEmail,
};
