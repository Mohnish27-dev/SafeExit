// ---------------------------------------------------------------------------
// One-off migration: move staff off synthetic emails onto `loginId`
// ---------------------------------------------------------------------------
// Run once (from the backend/ folder):  node scripts/migrateStaffLoginId.js
//
// Background: staff (Warden/Guard/Admin) used to be given a fabricated email
// like "wdn001@warden.safeexit.local" purely to satisfy a `required+unique`
// email field and to key passkey login on. We now key every account on a
// canonical `loginId` and only keep a real email for students. This script
// makes the existing database match that model:
//
//   1. Drops the stale non-sparse `email_1` unique index. That old index makes
//      `email: null` collide across staff, so it MUST go before we can clear
//      fabricated emails. Mongoose recreates a sparse unique index on boot.
//   2. For every account, backfills `loginId`:
//        - staff  -> normalized studentId (their Warden/Guard/Admin ID)
//        - student -> their real email
//   3. Clears any "*.safeexit.local" fabricated email left on staff docs.
//
// Idempotent: safe to run more than once.
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');
const User = require('../src/models/User');

// Any "*.safeexit.local" address is a fabricated staff handle from the old
// scheme (seen variants: @warden / @guard / @security / @admin). Match them all.
const isSyntheticStaffEmail = (email) =>
  typeof email === 'string' && /\.safeexit\.local$/i.test(email);

const run = async () => {
  await connectDB();
  const collection = mongoose.connection.collection('users');

  // 1. Drop the legacy non-sparse unique index on email, if it exists.
  try {
    await collection.dropIndex('email_1');
    console.log('Dropped stale index email_1.');
  } catch (err) {
    // 27 = IndexNotFound — already gone, nothing to do.
    if (err.code === 27 || /index not found/i.test(err.message)) {
      console.log('No stale email_1 index (already migrated).');
    } else {
      throw err;
    }
  }

  // 2 + 3. Backfill loginId and strip fabricated staff emails.
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

  // Make sure the new sparse indexes exist right away (boot would also do this).
  await User.syncIndexes();

  await mongoose.connection.close();
  console.log(`Migration complete. Accounts updated: ${updated}.`);
  process.exit(0);
};

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
