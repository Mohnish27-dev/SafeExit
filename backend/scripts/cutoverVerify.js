#!/usr/bin/env node
// Phase 4 — the gate on the cutover. Run it after the final ETL, before the switch.
//
//   node scripts/cutoverVerify.js
//   node scripts/cutoverVerify.js --since 2026-09-09T18:30:00Z
//
// STRICTLY READ-ONLY against both databases. It issues counts and projections and
// writes nothing to either side.
//
// Exit 0 means cut over. Exit 1 means do not.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS FOR, AND WHY IT IS NOT A ROW COUNT.
//
// The counts are SUPPOSED to differ. The ETL deliberately skips the July test cohort's
// orphans and the five 'Department' accounts, so Postgres holds fewer rows than Atlas by
// design and always will (scripts/etl.js documents the policy). A script that demanded
// equality would fail every time it ran and be ignored by the second cutover rehearsal.
//
// The question worth gating on is narrower: DID ANYTHING GET WRITTEN TO ATLAS AFTER THE
// ETL READ IT? That is the one loss the cutover can cause and the one nobody would
// notice — a pass approved, or a student walked out through the gate, in the minutes
// between the final ETL and the switch. It lands in Mongo, is absent from Postgres, and
// the next morning a student who is Outside is marked Inside.
//
// Every row is reconciled by legacy_id, and every missing row is dated. An ObjectId
// carries its creation time in its first four bytes, so a document can be dated without
// reading any field and without trusting createdAt.
//
//   missing + created BEFORE the ETL saw the data  ->  an expected skip. Reported, not fatal.
//   missing + created AFTER                        ->  BLOCKER. This is the lost write.
//
// The cutoff is self-calibrating: the newest ObjectId that actually made it into
// Postgres is, by definition, the high-water mark of what the ETL read. --since overrides
// it when you want to assert a specific freeze time instead.
//
// It also checks the two fields whose disagreement is expensive rather than merely untidy:
// student_id, because a printed college ID card resolves by roll number and nothing at the
// gate survives it changing; and campus_status, because it is what decides whether the
// next scan is an exit or an entry.
// ---------------------------------------------------------------------------

require('dotenv').config();

const { MongoClient } = require('mongoose').mongo;
const { Client } = require('pg');
const { migrationPoolConfig } = require('../src/config/postgres');

const MONGO_DB = 'test'; // what mongoInventory.js resolved MONGO_URI's default to

const sinceArg = (() => {
  const i = process.argv.indexOf('--since');
  if (i === -1) return null;
  const d = new Date(process.argv[i + 1]);
  if (Number.isNaN(+d)) {
    console.error(`--since needs an ISO date, got "${process.argv[i + 1]}"`);
    process.exit(2);
  }
  return d;
})();

// collection -> table. The same eight pairings scripts/etl.js loads.
const PAIRS = [
  ['users', 'users'],
  ['outingrequests', 'outing_requests'],
  ['leaveapplications', 'leave_applications'],
  ['scanlogs', 'scan_logs'],
  ['sosalerts', 'sos_alerts'],
  ['delaynotices', 'delay_notices'],
  ['pushsubscriptions', 'push_subscriptions'],
  ['emailotps', 'email_otps'],
];

const line = (...a) => console.log(...a);
const heading = (t) => line(`\n${t}\n${'-'.repeat(t.length)}`);

const blockers = [];
const warnings = [];
const blocker = (m) => { blockers.push(m); line(`  BLOCKER  ${m}`); };
const warn = (m) => { warnings.push(m); line(`  warn     ${m}`); };

// The first 4 bytes of an ObjectId are the creation time in seconds.
const objectIdDate = (hex) => new Date(parseInt(String(hex).slice(0, 8), 16) * 1000);

const iso = (d) => (d ? d.toISOString().replace('.000Z', 'Z') : 'never');

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set — this script compares the two databases, so it needs both.');
    process.exit(2);
  }

  const mongo = new MongoClient(process.env.MONGO_URI);
  await mongo.connect();
  const db = mongo.db(MONGO_DB);

  const pg = new Client(migrationPoolConfig());
  await pg.connect();

  const [{ version }] = (await pg.query('SELECT version()')).rows;
  line(`  source   : MongoDB, database "${MONGO_DB}"`);
  line(`  target   : ${version.split(',')[0]}`);

  // ---- gather -------------------------------------------------------------
  //
  // _id only from Mongo and legacy_id only from Postgres. Neither side ships a document
  // body, so this stays cheap enough to re-run as often as the cutover needs.

  const sides = [];
  for (const [coll, table] of PAIRS) {
    const mongoIds = (await db.collection(coll).find({}, { projection: { _id: 1 } }).toArray())
      .map((d) => String(d._id));
    const { rows } = await pg.query(
      `SELECT legacy_id FROM ${table} WHERE legacy_id IS NOT NULL`
    );
    const pgIds = rows.map((r) => r.legacy_id);
    const pgTotal = (await pg.query(`SELECT count(*)::int n FROM ${table}`)).rows[0].n;
    sides.push({ coll, table, mongoIds, pgIds: new Set(pgIds), pgTotal });
  }

  // The high-water mark: the newest thing the ETL demonstrably read.
  const loadedDates = sides.flatMap((s) => [...s.pgIds]).map(objectIdDate);
  const highWater = sinceArg || (loadedDates.length
    ? new Date(Math.max(...loadedDates.map(Number)))
    : null);

  if (!highWater) {
    blocker('Postgres holds no legacy_id at all — the ETL has not run against this database.');
  }

  heading('1. Row counts (they are expected to differ — see the header of this file)');
  line(`  ${'collection'.padEnd(20)} ${'mongo'.padStart(7)} ${'postgres'.padStart(9)} ${'matched'.padStart(8)}`);
  for (const s of sides) {
    const matched = s.mongoIds.filter((id) => s.pgIds.has(id)).length;
    line(`  ${s.coll.padEnd(20)} ${String(s.mongoIds.length).padStart(7)} ${String(s.pgTotal).padStart(9)} ${String(matched).padStart(8)}`);
  }

  heading('2. Rows in Mongo that are not in Postgres');
  line(`  cutoff: ${iso(highWater)}` +
       (sinceArg ? '  (--since)' : '  (newest row the ETL loaded)'));

  let lostWrites = 0;
  let expectedSkips = 0;
  for (const s of sides) {
    const missing = s.mongoIds.filter((id) => !s.pgIds.has(id));
    if (!missing.length) continue;

    const late = highWater ? missing.filter((id) => objectIdDate(id) > highWater) : missing;
    const early = missing.length - late.length;
    expectedSkips += early;

    line(`  ${s.coll.padEnd(20)} missing ${String(missing.length).padStart(4)}` +
         `   expected skips ${String(early).padStart(4)}   created after the cutoff ${String(late.length).padStart(4)}`);

    if (late.length) {
      lostWrites += late.length;
      blocker(`${late.length} row(s) in "${s.coll}" were created after the ETL read the data — ` +
              'they exist only in Mongo. Re-run the ETL with writes frozen.');
      for (const id of late.slice(0, 5)) line(`             ${id}  ${iso(objectIdDate(id))}`);
      if (late.length > 5) line(`             ... and ${late.length - 5} more`);
    }
  }
  if (!lostWrites && !expectedSkips) line('  none — every Mongo row is present in Postgres.');

  heading('3. Rows in Postgres whose Mongo document is gone');
  let orphanedRows = 0;
  for (const s of sides) {
    const mongoSet = new Set(s.mongoIds);
    const stale = [...s.pgIds].filter((id) => !mongoSet.has(id));
    if (!stale.length) continue;
    orphanedRows += stale.length;
    // Not a blocker: deleting from Atlas after the ETL is a legitimate thing an admin may
    // have done, and Postgres is about to become the system of record anyway. But it is
    // worth seeing, because the other explanation is that the ETL loaded the wrong database.
    warn(`${stale.length} row(s) in "${s.table}" reference a Mongo document that no longer exists`);
  }
  if (!orphanedRows) line('  none.');

  heading('4. The two fields whose disagreement is expensive');

  // 4a. Roll numbers must be byte-exact: a printed college ID card resolves by this, and
  // resolveStudent's fallback is the only thing that works when a phone screen will not scan.
  const mongoUsers = await db.collection('users')
    .find({ role: 'Student' }, { projection: { _id: 1, studentId: 1, campusStatus: 1, updatedAt: 1 } })
    .toArray();
  const { rows: pgUsers } = await pg.query(
    "SELECT legacy_id, student_id, campus_status FROM users WHERE legacy_id IS NOT NULL AND role = 'Student'"
  );
  const pgByLegacy = new Map(pgUsers.map((r) => [r.legacy_id, r]));

  let rollMismatch = 0;
  let statusMismatch = 0;
  for (const u of mongoUsers) {
    const row = pgByLegacy.get(String(u._id));
    if (!row) continue; // already accounted for in section 2

    const mongoRoll = u.studentId === undefined || u.studentId === null ? null : String(u.studentId);
    if (mongoRoll !== row.student_id) {
      rollMismatch += 1;
      if (rollMismatch <= 5) {
        blocker(`roll number changed for ${u._id}: mongo "${mongoRoll}" vs postgres "${row.student_id}"`);
      }
    }

    // A default of 'Inside' on both sides, so an absent Mongo field is not a mismatch.
    const mongoStatus = u.campusStatus || 'Inside';
    if (mongoStatus !== row.campus_status) {
      // Same direction test as section 5. A gate scan on the migrated copy moves this
      // field legitimately during a rehearsal; a gate scan on Mongo after the ETL is the
      // movement that gets lost.
      const mongoMoved = highWater && u.updatedAt instanceof Date && u.updatedAt > highWater;
      statusMismatch += 1;
      if (statusMismatch <= 5) {
        if (mongoMoved) {
          blocker(`campus status for ${u._id} is "${mongoStatus}" in Mongo and "${row.campus_status}" in Postgres, ` +
                  `and Mongo changed it at ${iso(u.updatedAt)} — the next gate scan would go the wrong direction`);
        } else {
          warn(`campus status for ${u._id}: Postgres moved "${mongoStatus}" to "${row.campus_status}" ` +
               '(a scan on the migrated copy) — the final ETL overwrites it');
        }
      }
    }
  }
  if (rollMismatch > 5) line(`  ... and ${rollMismatch - 5} more roll numbers`);
  if (statusMismatch > 5) line(`  ... and ${statusMismatch - 5} more campus statuses`);
  if (!rollMismatch && !statusMismatch) {
    line(`  ok — ${pgByLegacy.size} students compared, roll numbers and campus status agree.`);
  }

  // 4b. Pass status, on the rows that DID migrate.
  //
  // Section 2 dates rows by their ObjectId, which catches a pass CREATED during the gap
  // and misses a pass APPROVED during it — the row already existed, so its id is old, but
  // its status moved from Pending to Approved in Mongo only. A student would arrive at the
  // barrier holding an approval the new database has never heard of. Comparing the status
  // of every matched pass is the cheapest way to see it.
  // Which side moved decides whether a disagreement is fatal, and Mongo's own updatedAt
  // is what says so:
  //
  //   Mongo moved after the cutoff   -> a real decision the final ETL has not read. BLOCKER.
  //   Mongo did not                  -> the Postgres copy moved on its own, which is what a
  //                                     rehearsal on a live dev stack does every time an
  //                                     outing lapses to Expired. The final ETL upserts on
  //                                     legacy_id and overwrites it. Worth seeing, not fatal.
  //
  // Getting this backwards would make the script cry wolf on every rehearsal, which is the
  // same as not having it.
  heading('5. Pass status agreement (a decision during the gap changes no id)');
  let driftedPasses = 0;
  for (const [coll, table] of [['outingrequests', 'outing_requests'], ['leaveapplications', 'leave_applications']]) {
    const mongoPasses = await db.collection(coll)
      .find({}, { projection: { _id: 1, status: 1, updatedAt: 1 } })
      .toArray();
    const { rows } = await pg.query(
      `SELECT legacy_id, status FROM ${table} WHERE legacy_id IS NOT NULL`
    );
    const byLegacy = new Map(rows.map((r) => [r.legacy_id, r.status]));

    let drift = 0;
    let stale = 0;
    for (const d of mongoPasses) {
      const pgStatus = byLegacy.get(String(d._id));
      if (pgStatus === undefined) continue; // section 2 already owns this one
      if (d.status === pgStatus) continue;

      const mongoMoved = highWater && d.updatedAt instanceof Date && d.updatedAt > highWater;
      if (mongoMoved) {
        drift += 1;
        if (drift <= 5) {
          blocker(`${coll} ${d._id} is "${d.status}" in Mongo but "${pgStatus}" in Postgres, ` +
                  `and Mongo changed it at ${iso(d.updatedAt)} — after the ETL read the data`);
        }
      } else {
        stale += 1;
        if (stale <= 3) {
          warn(`${coll} ${d._id}: Postgres moved "${d.status}" to "${pgStatus}" on its own ` +
               '(a lapse on the migrated copy) — the final ETL overwrites it');
        }
      }
    }
    if (drift > 5) line(`  ... and ${drift - 5} more decided in Mongo`);
    if (stale > 3) line(`  ... and ${stale - 3} more moved by the Postgres copy`);
    driftedPasses += drift;
    line(`  ${coll.padEnd(20)} compared ${String(byLegacy.size).padStart(4)}` +
         `   decided in Mongo after the ETL ${String(drift).padStart(4)}` +
         `   moved by the Postgres copy ${String(stale).padStart(4)}`);
  }

  // ---- verdict ------------------------------------------------------------
  heading('Verdict');
  line(`  expected skips (the July cohort and the 'Department' accounts): ${expectedSkips}`);
  line(`  rows written after the ETL read the data                      : ${lostWrites}`);
  line(`  passes decided after the ETL read the data                    : ${driftedPasses}`);
  line(`  warnings                                                      : ${warnings.length}`);

  await mongo.close();
  await pg.end();

  if (blockers.length) {
    line(`\n  DO NOT CUT OVER — ${blockers.length} blocker(s).`);
    line('  Freeze writes (MAINTENANCE_MODE=true), re-run npm run pg:etl, then run this again.');
    process.exit(1);
  }

  line('\n  OK to cut over.');
  line('  Next: switch DATABASE_URL, deploy, MAINTENANCE_MODE=false, then scan one real exit and one real entry.');
};

run().catch(async (err) => {
  console.error(`\nVERIFY FAILED: ${err.message}`);
  if (err.detail) console.error(`  detail: ${err.detail}`);
  console.error('\nNothing was written — this script only reads.');
  process.exit(2);
});
