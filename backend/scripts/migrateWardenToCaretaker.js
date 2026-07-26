
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../src/config/db');

// Request collections and the old -> new field names each one carries.
const REQUEST_COLLECTIONS = [
  { name: 'outingrequests', fields: { wardenSignature: 'caretakerSignature', targetWarden: 'targetCaretaker' } },
  { name: 'leaveapplications', fields: { wardenSignature: 'caretakerSignature', targetWarden: 'targetCaretaker' } },
  { name: 'complaints', fields: { targetWarden: 'targetCaretaker' } },
];

const run = async () => {
  await connectDB();
  const db = mongoose.connection;

  // 1. The role value itself. $rename can't touch values, so this is a plain update.
  const roles = await db.collection('users').updateMany(
    { role: 'Warden' },
    { $set: { role: 'Caretaker' } }
  );
  console.log(`users.role 'Warden' -> 'Caretaker': ${roles.modifiedCount} account(s).`);

  // 2. Field renames. $rename on a missing field is a no-op per document, but we
  //    still scope the filter so the counts reported are meaningful on a re-run.
  for (const { name, fields } of REQUEST_COLLECTIONS) {
    const collection = db.collection(name);

    for (const [from, to] of Object.entries(fields)) {
      const res = await collection.updateMany(
        { [from]: { $exists: true } },
        { $rename: { [from]: to } }
      );
      console.log(`${name}.${from} -> ${to}: ${res.modifiedCount} document(s).`);
    }
  }

  await db.close();
  console.log('\nMigration complete. Staff must sign in again — the caretaker login page uses new localStorage keys, so device Quick Login (PIN/passkey) needs one fresh setup.');
  process.exit(0);
};

// Hard stop: running this now would demote every real Warden account to Caretaker.
console.error(
  [
    'REFUSING TO RUN — this migration is retired.',
    '',
    "'Warden' is a live role again (one rank above caretaker, per-hostel accounts).",
    'Step 1 of this script sets role: Warden -> Caretaker, which would wipe out',
    'every warden account on the instance.',
    '',
    'If you genuinely need the historic 2025 rename on an old database, do it by',
    'hand against that database only, and never against one that has wardens.',
  ].join('\n')
);
process.exit(1);

// eslint-disable-next-line no-unreachable
run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
