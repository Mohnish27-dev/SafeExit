// npm run seed:admins — standalone admin provisioning; the server runs the same
// ensureAdmins on every boot. Creates the Google sign-in admin account
// (config/adminAllowlist.js) when the app is not running.
require('dotenv').config();
const { connectPostgres, closePostgres } = require('../src/config/sequelize');
const { ensureAdmins } = require('../src/utils/ensureAdmins');

const run = async () => {
  await connectPostgres();
  const { created, updated } = await ensureAdmins();
  await closePostgres();
  console.log(`Done. Admins ensured (created: ${created}, updated: ${updated}).`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
