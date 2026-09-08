#!/usr/bin/env node
// Phase 0 of the PostgreSQL migration: measure the source data before moving it.
//
//   node scripts/mongoInventory.js
//   node scripts/mongoInventory.js --json > inventory.json
//
// STRICTLY READ-ONLY. It issues nothing but find/count/aggregate. Safe to run against
// the live Atlas cluster during working hours.
//
// It answers three questions that the migration plan cannot proceed without:
//
//   1. WHICH DATABASE holds the data. MONGO_URI ends at the host with no database name,
//      so the driver has been using its default all along. Dumping the wrong database is
//      a silent way to lose everything.
//
//   2. HOW BIG the base64 blobs are. Face photos are ~300KB and signatures up to 400KB,
//      and every outing/leave row stores up to three signature snapshots. The total
//      decides whether they stay in Postgres as bytea or move to disk.
//
//   3. WHETHER THE DATA CAN SATISFY THE NEW CONSTRAINTS. PostgreSQL will enforce rules
//      MongoDB never did — real foreign keys, one live pass per student, unique roll
//      numbers, hostel names from a fixed list. Any row that violates one of those fails
//      the ETL. Finding them now is a quiet afternoon; finding them at cutover is not.

require('dotenv').config();
// The driver comes from mongoose rather than a direct 'mongodb' dependency: mongoose
// bundles it, so this can never version-skew against the connection the app itself uses,
// and package.json does not grow a dependency that exists only for one script.
const { MongoClient } = require('mongoose').mongo;
const { ACTIVE_PASS_STATUSES } = require('../src/config/passStatuses');
const { canonicalHostelName, hostelNames } = require('../src/config/hostels');

const JSON_OUT = process.argv.includes('--json');
const report = { generatedAt: new Date().toISOString() };
const log = (...args) => { if (!JSON_OUT) console.log(...args); };

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
const heading = (t) => log(`\n${t}\n${'-'.repeat(t.length)}`);

// A finding is something that will break the migration if left alone.
const findings = [];
const flag = (severity, message, detail) => {
  findings.push({ severity, message, detail });
  log(`  ${severity === 'blocker' ? 'BLOCKER' : 'warn   '} ${message}`);
  if (detail && !JSON_OUT) console.log(`          ${detail}`);
};

// ---------------------------------------------------------------------------

const findDataDatabase = async (client) => {
  heading('1. Which database holds the data?');

  const admin = client.db().admin();
  let dbs = [];
  try {
    ({ databases: dbs } = await admin.listDatabases());
  } catch (err) {
    // A restricted Atlas user may not be allowed to list databases.
    log(`  (cannot list databases: ${err.message})`);
  }

  const defaultDb = client.db().databaseName;
  log(`  driver default database (from MONGO_URI): "${defaultDb}"`);

  const candidates = [];
  for (const d of dbs) {
    if (['admin', 'local', 'config'].includes(d.name)) continue;
    const names = await client.db(d.name).listCollections().toArray();
    const hasUsers = names.some((c) => c.name === 'users');
    log(`  ${d.name.padEnd(20)} ${String(d.sizeOnDisk ? mb(d.sizeOnDisk) : '?').padStart(10)}` +
        `  collections: ${names.map((c) => c.name).join(', ') || '(none)'}`);
    if (hasUsers) candidates.push(d.name);
  }

  const chosen = process.env.MONGO_DB || (candidates.includes(defaultDb) ? defaultDb : candidates[0]) || defaultDb;

  if (candidates.length > 1) {
    flag('blocker', `${candidates.length} databases contain a "users" collection: ${candidates.join(', ')}`,
      'Set MONGO_DB explicitly and confirm with the deployment before dumping.');
  }
  if (candidates.length && !candidates.includes(defaultDb)) {
    flag('blocker', `the driver default database "${defaultDb}" is NOT where the data lives`,
      `Data appears to be in "${candidates[0]}". mongodump --db must name it explicitly.`);
  }

  log(`\n  => using database: "${chosen}"`);
  log(`  => dump it with: mongodump --uri "$MONGO_URI" --db ${chosen} --out ./dump`);
  report.database = { chosen, defaultDb, candidates };
  return client.db(chosen);
};

const countCollections = async (db) => {
  heading('2. Row counts');
  const expected = ['users', 'outingrequests', 'leaveapplications', 'scanlogs',
    'sosalerts', 'delaynotices', 'pushsubscriptions', 'emailotps'];
  const counts = {};
  const existing = (await db.listCollections().toArray()).map((c) => c.name);
  for (const name of expected) {
    if (!existing.includes(name)) { log(`  ${name.padEnd(20)} (collection absent)`); counts[name] = 0; continue; }
    counts[name] = await db.collection(name).countDocuments();
    log(`  ${name.padEnd(20)} ${String(counts[name]).padStart(8)}`);
  }
  const unexpected = existing.filter((c) => !expected.includes(c));
  if (unexpected.length) log(`  other collections present: ${unexpected.join(', ')}`);
  report.counts = counts;
  return counts;
};

// $strLenBytes measures the stored base64. Decoded bytes — what Postgres bytea will
// actually hold — are about 3/4 of that.
const BASE64_TO_BYTEA = 0.75;

const measureBlobs = async (db) => {
  heading('3. Base64 blob volume (bytea vs on-disk)');

  const sumOf = async (coll, fields) => {
    const group = { _id: null };
    for (const f of fields) {
      group[`${f}_n`] = { $sum: { $cond: [{ $gt: [{ $strLenBytes: { $ifNull: [`$${f}`, ''] } }, 0] }, 1, 0] } };
      group[`${f}_bytes`] = { $sum: { $strLenBytes: { $ifNull: [`$${f}`, ''] } } };
      group[`${f}_max`] = { $max: { $strLenBytes: { $ifNull: [`$${f}`, ''] } } };
    }
    const [row] = await db.collection(coll).aggregate([{ $group: group }]).toArray();
    return row || {};
  };

  const users = await sumOf('users', ['photo', 'signature']);
  const outings = await sumOf('outingrequests', ['studentSignature', 'caretakerSignature', 'wardenSignature']);
  const leaves = await sumOf('leaveapplications', ['studentSignature', 'caretakerSignature', 'wardenSignature']);

  const line = (label, row, field) => {
    const n = row[`${field}_n`] || 0;
    const bytes = row[`${field}_bytes`] || 0;
    const max = row[`${field}_max`] || 0;
    log(`  ${label.padEnd(34)} ${String(n).padStart(7)} rows  ${mb(bytes).padStart(10)} base64` +
        `  -> ${mb(bytes * BASE64_TO_BYTEA).padStart(10)} bytea   (largest ${Math.round(max / 1024)} KB)`);
    return bytes;
  };

  let total = 0;
  total += line('users.photo', users, 'photo');
  total += line('users.signature', users, 'signature');
  total += line('outing.studentSignature', outings, 'studentSignature');
  total += line('outing.caretakerSignature', outings, 'caretakerSignature');
  total += line('outing.wardenSignature', outings, 'wardenSignature');
  total += line('leave.studentSignature', leaves, 'studentSignature');
  total += line('leave.caretakerSignature', leaves, 'caretakerSignature');
  total += line('leave.wardenSignature', leaves, 'wardenSignature');

  log(`\n  total blob payload: ${mb(total)} base64  ->  ${mb(total * BASE64_TO_BYTEA)} as bytea`);
  log('  Rule of thumb: under ~20 GB, bytea in Postgres is the right call — one backup,');
  log('  one consistency boundary, no orphaned files. Above that, revisit.');

  report.blobs = { totalBase64Bytes: total, estimatedByteaBytes: Math.round(total * BASE64_TO_BYTEA) };
  return total;
};

const checkConstraints = async (db) => {
  heading('4. Can the data satisfy the new PostgreSQL constraints?');

  const users = db.collection('users');

  // -- hostel names must match the hostels table (FK on users.hostel_name) -------------
  const hostelValues = (await users.distinct('hostelName')).filter((h) => h != null && h !== '');
  const unknown = hostelValues.filter((h) => canonicalHostelName(h) === null);
  const nonCanonical = hostelValues.filter((h) => canonicalHostelName(h) !== null && canonicalHostelName(h) !== h);
  log(`  distinct hostelName values: ${hostelValues.length} (${hostelValues.join(', ') || 'none'})`);
  if (unknown.length) {
    flag('blocker', `${unknown.length} hostelName value(s) are not in config/hostels.js: ${unknown.join(', ')}`,
      `The FK to hostels(name) will reject these. Valid: ${hostelNames().join(', ')}`);
  }
  if (nonCanonical.length) {
    flag('warn', `${nonCanonical.length} hostelName value(s) differ only in casing/spacing: ${nonCanonical.join(', ')}`,
      'The ETL must canonicalise via config/hostels.js canonicalHostelName() before insert.');
  }
  const managed = (await users.distinct('managedHostel')).filter((h) => h != null && h !== '');
  const unknownManaged = managed.filter((h) => canonicalHostelName(h) === null);
  if (unknownManaged.length) {
    flag('blocker', `managedHostel value(s) not in config/hostels.js: ${unknownManaged.join(', ')}`);
  }

  // -- students must have a hostel (002: users_student_has_hostel) ---------------------
  const studentsNoHostel = await users.countDocuments({
    role: 'Student', $or: [{ hostelName: null }, { hostelName: '' }, { hostelName: { $exists: false } }],
  });
  if (studentsNoHostel) {
    flag('warn', `${studentsNoHostel} student(s) have no hostelName`,
      'Blocks VALIDATE of users_student_has_hostel. Fix, or leave that constraint NOT VALID.');
  }

  // -- roll numbers must be unique among students (002: users_student_id_unique) -------
  const dupRolls = await users.aggregate([
    { $match: { role: 'Student', studentId: { $nin: [null, ''] } } },
    { $group: { _id: '$studentId', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $limit: 20 },
  ]).toArray();
  if (dupRolls.length) {
    flag('blocker', `${dupRolls.length}+ duplicate studentId (roll number) value(s)`,
      `e.g. ${dupRolls.slice(0, 5).map((d) => `${d._id} x${d.n}`).join(', ')} — ` +
      'the gate resolves ID-card scans by roll number, so a duplicate lets the wrong student through.');
  }

  // -- login_id / email uniqueness (already unique+sparse in Mongo, so this is a sanity check)
  for (const field of ['loginId', 'email']) {
    const dups = await users.aggregate([
      { $match: { [field]: { $nin: [null, ''] } } },
      { $group: { _id: `$${field}`, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } }, { $limit: 5 },
    ]).toArray();
    if (dups.length) flag('blocker', `duplicate ${field} values: ${dups.map((d) => d._id).join(', ')}`);
  }

  // -- one live pass per student (the partial unique indexes) --------------------------
  for (const [coll, label] of [['outingrequests', 'outing'], ['leaveapplications', 'leave']]) {
    const dups = await db.collection(coll).aggregate([
      { $match: { status: { $in: ACTIVE_PASS_STATUSES } } },
      { $group: { _id: '$student', n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ]).toArray();
    if (dups.length) {
      flag('blocker', `${dups.length} student(s) hold more than one active ${label}`,
        `CREATE UNIQUE INDEX one_active_${label}_per_student will fail. ` +
        'Run scripts/checkActivePassDuplicates.js to inspect and clear them.');
    } else {
      log(`  ok      no student holds two active ${label}s`);
    }
  }

  // -- phone formats (002: *_phone_format) --------------------------------------------
  const badGuardian = await users.countDocuments({
    guardianPhoneNumber: { $nin: [null, ''], $not: /^\d{10,15}$/ },
  });
  if (badGuardian) {
    flag('warn', `${badGuardian} guardianPhoneNumber value(s) are not 10-15 digits`,
      'Mongoose only validated on save(), so pre-rule rows were never re-checked.');
  }
  const badContact = await users.countDocuments({
    'closeContacts.mobileNumber': { $not: /^\d{10,15}$/ },
  });
  if (badContact) flag('warn', `${badContact} user(s) have a close contact mobile that is not 10-15 digits`);

  // -- close contacts cap of two (structural in Postgres: slot IN (1,2)) ---------------
  const tooManyContacts = await users.countDocuments({ 'closeContacts.2': { $exists: true } });
  if (tooManyContacts) {
    flag('blocker', `${tooManyContacts} user(s) have more than 2 close contacts`,
      'close_contacts.slot is CHECKed to 1..2 — the third has nowhere to go.');
  }

  // -- webauthn credential ids must be globally unique ---------------------------------
  const dupCreds = await users.aggregate([
    { $unwind: '$webAuthnCredentials' },
    { $group: { _id: '$webAuthnCredentials.credentialID', n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 }, _id: { $ne: null } } }, { $limit: 5 },
  ]).toArray();
  if (dupCreds.length) {
    flag('blocker', `${dupCreds.length} duplicate WebAuthn credentialID(s)`,
      'webauthn_credentials.credential_id is UNIQUE. A duplicate means real corruption.');
  }

  // -- referential integrity: every FK target must exist -------------------------------
  // There is no referential integrity in the system today, so dangling references are
  // entirely possible and each one fails an INSERT during the ETL.
  const userIds = new Set((await users.find({}, { projection: { _id: 1 } }).toArray()).map((u) => String(u._id)));
  log(`\n  checking referential integrity against ${userIds.size} users...`);

  const checkRefs = async (coll, field, { required = false } = {}) => {
    if (!(await db.listCollections({ name: coll }).toArray()).length) return;
    const rows = await db.collection(coll).find(
      { [field]: { $ne: null } }, { projection: { [field]: 1 } }
    ).toArray();
    const dangling = rows.filter((r) => r[field] && !userIds.has(String(r[field])));
    if (dangling.length) {
      flag(required ? 'blocker' : 'warn',
        `${coll}.${field}: ${dangling.length} reference(s) point at a user that no longer exists`,
        required
          ? 'This column is NOT NULL with ON DELETE RESTRICT — the ETL will reject those rows.'
          : 'Nullable FK: the ETL can null these out, but confirm that is acceptable.');
    }
  };

  await checkRefs('outingrequests', 'student', { required: true });
  await checkRefs('outingrequests', 'approvedBy');
  await checkRefs('outingrequests', 'targetCaretaker');
  await checkRefs('outingrequests', 'forwardedTo');
  await checkRefs('outingrequests', 'forwardedBy');
  await checkRefs('leaveapplications', 'student', { required: true });
  await checkRefs('leaveapplications', 'approvedBy');
  await checkRefs('leaveapplications', 'targetCaretaker');
  await checkRefs('leaveapplications', 'forwardedTo');
  await checkRefs('leaveapplications', 'forwardedBy');
  await checkRefs('scanlogs', 'student', { required: true });
  await checkRefs('scanlogs', 'guard');
  await checkRefs('sosalerts', 'student', { required: true });
  await checkRefs('sosalerts', 'handledBy');
  await checkRefs('delaynotices', 'student', { required: true });
  await checkRefs('delaynotices', 'acknowledgedBy');
  await checkRefs('pushsubscriptions', 'user', { required: true });

  // -- scan logs: at most one pass (CHECK scan_logs_one_pass) --------------------------
  if ((await db.listCollections({ name: 'scanlogs' }).toArray()).length) {
    const bothPasses = await db.collection('scanlogs').countDocuments({
      outing: { $ne: null }, leave: { $ne: null },
    });
    if (bothPasses) flag('blocker', `${bothPasses} scan log(s) reference both an outing and a leave`);
  }

  // -- delay notices: trip must resolve to a real pass (the new FKs) -------------------
  if ((await db.listCollections({ name: 'delaynotices' }).toArray()).length) {
    const notices = await db.collection('delaynotices')
      .find({}, { projection: { trip: 1, tripType: 1 } }).toArray();
    const outingIds = new Set((await db.collection('outingrequests')
      .find({}, { projection: { _id: 1 } }).toArray()).map((o) => String(o._id)));
    const leaveIds = new Set((await db.collection('leaveapplications')
      .find({}, { projection: { _id: 1 } }).toArray()).map((l) => String(l._id)));
    const orphans = notices.filter((n) => {
      const id = String(n.trip);
      return !outingIds.has(id) && !leaveIds.has(id);
    });
    const leaveTyped = notices.filter((n) => n.tripType === 'Leave').length;
    if (orphans.length) {
      flag('blocker', `${orphans.length} delay notice(s) point at a pass that does not exist`,
        'delay_notices now has real FKs to outing_requests / leave_applications. ' +
        'Delete these, or drop the FK for that column.');
    }
    if (leaveTyped) log(`  note    ${leaveTyped} delay notice(s) are tripType "Leave" (pre-rule rows; leave_id handles them)`);
  }
};

// ---------------------------------------------------------------------------

const main = async () => {
  if (!process.env.MONGO_URI) {
    console.error('FATAL: MONGO_URI is not set. Run this from backend/ with .env present.');
    process.exit(1);
  }

  const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    // Read-only by construction; this makes the intent explicit to the server too.
    readPreference: 'secondaryPreferred',
  });
  await client.connect();

  try {
    const db = await findDataDatabase(client);
    await countCollections(db);
    await measureBlobs(db);
    await checkConstraints(db);
  } finally {
    await client.close();
  }

  report.findings = findings;
  const blockers = findings.filter((f) => f.severity === 'blocker');

  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(report, null, 2));
  } else {
    heading('Summary');
    if (!findings.length) {
      console.log('  No blockers. The data satisfies every constraint the new schema adds.');
    } else {
      console.log(`  ${blockers.length} blocker(s), ${findings.length - blockers.length} warning(s).`);
      console.log('  Blockers must be cleared before the ETL will complete.');
    }
    console.log('\n  Next: mongodump the database named above — that dump is the rollback.');
  }

  process.exit(blockers.length ? 1 : 0);
};

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`);
  process.exit(1);
});
