// One-off, idempotent: node scripts/migrateStaffLoginId.js — drops the stale non-sparse email_1 index (it makes email:null collide across staff), backfills loginId, strips fabricated *.safeexit.local staff emails.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

// Matches every synthetic-staff-email variant (@warden/@guard/@security/@admin).
const isSyntheticStaffEmail = (email) =>
  typeof email === 'string' && /\.safeexit\.local$/i.test(email);

const run = async () => {
  await connectDB();
  const collection = mongoose.connection.collection('users');

  try {
    await collection.dropIndex('email_1');
    console.log('Dropped stale index email_1.');
  } catch (err) {
    // 27 = IndexNotFound — already gone.
    if (err.code === 27 || /index not found/i.test(err.message)) {
      console.log('No stale email_1 index (already migrated).');
    } else {
      throw err;
    }
  }

  const users = await User.find({});
  let updated = 0;

  for (const user of users) {
    let changed = false;

    if (!user.loginId) {
      const isStudent = user.role === 'Student';
      const key = isStudent ? user.email : user.studentId;
      if (key) {
        user.loginId = String(key).trim().toLowerCase();
        changed = true;
      }
    }

    if (isSyntheticStaffEmail(user.email)) {
      user.email = undefined;
      changed = true;
    }

    if (changed) {
      await user.save();
      updated += 1;
    }
  }

  // Ensure the new sparse indexes exist right away.
  await User.syncIndexes();

  await mongoose.connection.close();
  console.log(`Migration complete. Accounts updated: ${updated}.`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
