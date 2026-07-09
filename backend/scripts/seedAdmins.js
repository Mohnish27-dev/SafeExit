// ---------------------------------------------------------------------------
// Seed / update the admin accounts (manual one-off)
// ---------------------------------------------------------------------------
// Run:  npm run seed:admins   (from the backend/ folder)
//
// NOTE: the server already runs this same logic on every boot (see
// src/utils/ensureAdmins.js), so you normally don't need this. It stays as a
// standalone command for provisioning against a DB without starting the server.
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
