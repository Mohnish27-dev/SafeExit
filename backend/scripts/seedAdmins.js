// npm run seed:admins — standalone admin provisioning; the server runs the same ensureAdmins on every boot.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const { ensureAdmins } = require('../src/utils/ensureAdmins');

const run = async () => {
  await connectDB();
  const { created, updated } = await ensureAdmins();
  await mongoose.connection.close();
  console.log(`Done. Admins ensured (created: ${created}, updated: ${updated}).`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
