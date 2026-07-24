const app = require('./app');
const connectDB = require('./config/db');
const { ensureAdmins } = require('./utils/ensureAdmins');
const { startOverdueSweep } = require('./utils/overdueSweep');

const PORT = process.env.PORT || 5000;

connectDB().then(async () => {
  // Idempotent; unchanged .env = no writes.
  try {
    const { created, updated } = await ensureAdmins();
    if (created || updated) {
      console.log(`Admins ensured (created: ${created}, updated: ${updated}).`);
    }
  } catch (err) {
    console.error('Admin seeding failed:', err.message);
  }

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  startOverdueSweep();
}).catch(err => {
  console.error("Failed to connect to DB", err);
});
