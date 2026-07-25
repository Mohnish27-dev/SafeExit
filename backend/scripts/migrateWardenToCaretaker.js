// One-off, idempotent: node scripts/migrateWardenToCaretaker.js — renames the
// warden designation to caretaker in existing data. Same people, same routing;
// only the stored role value and the field names change:
//   users.role            'Warden' -> 'Caretaker'
//   outingrequests        wardenSignature -> caretakerSignature, targetWarden -> targetCaretaker
//   leaveapplications     wardenSignature -> caretakerSignature, targetWarden -> targetCaretaker
//   complaints            targetWarden -> targetCaretaker
// Run this BEFORE deploying the renamed code: until it runs, the new code reads
// the new field names and would see legacy docs as unrouted/unsigned.
// Safe to re-run — every step matches only documents still on the old shape.
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

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
