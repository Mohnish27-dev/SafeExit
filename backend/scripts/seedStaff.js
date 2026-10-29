require('dotenv').config();
const { connectPostgres, closePostgres } = require('../src/config/sequelize');
const { ensureStaff } = require('../src/utils/ensureStaff');

const run = async () => {
  await connectPostgres();
  const { created, updated } = await ensureStaff({ resetPasswords: true });
  await closePostgres();
  console.log(`Done. Staff ensured (created: ${created}, updated: ${updated}).`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Staff seeding failed:', err);
  process.exit(1);
});
