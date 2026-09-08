#!/usr/bin/env node
// Phase 2 — load the MongoDB data into PostgreSQL.
//
//   node scripts/etl.js --dry-run    # read Mongo, transform, report, write NOTHING
//   node scripts/etl.js              # do it, inside one transaction
//
// READ-ONLY against MongoDB. The only writes are to the database in DATABASE_URL.
//
// Re-runnable. Every table with a legacy_id upserts on it, so a half-finished run can
// simply be run again; child tables upsert on their natural key. Nothing here depends on
// the target being empty.
//
// ---------------------------------------------------------------------------
// ORPHAN POLICY: rows whose REQUIRED student/user no longer exists are SKIPPED.
//
// mongoInventory.js found ~360 such rows. They are not a data-quality problem, they are
// one event: every one points at a user deleted around the end of July 2026, and there
// is not a single orphan in August or September in any collection. That is a wiped
// cohort of test accounts, not lost student history. The mongodump keeps every skipped
// row, so this is reversible.
//
// Rows whose OPTIONAL reference dangles (approvedBy, guard, handledBy, targetCaretaker)
// are kept with that column set to NULL — "approved by an account that no longer exists"
// is the honest representation, and the alternative is discarding a real record.
//
// Every skip and every nulled reference is counted and printed. Nothing is dropped
// silently.
// ---------------------------------------------------------------------------

require('dotenv').config();

const crypto = require('node:crypto');
const { MongoClient } = require('mongoose').mongo;
const { Client } = require('pg');

const { migrationPoolConfig } = require('../src/config/postgres');
const { canonicalHostelName } = require('../src/config/hostels');
const User = require('../src/models/User');

const DRY_RUN = process.argv.includes('--dry-run');
const MONGO_DB = 'test'; // what mongoInventory.js resolved MONGO_URI's default to

// Read off the Mongoose schema rather than retyped here, so this cannot drift from the
// app's own definition — and it is the same list 001_schema.sql's role CHECK asserts.
//
// Five accounts in the source data carry role 'Department' (Electrical/Plumbing/Cleaning/
// WIFI/Furniture DEPT, all created 2026-07-30). That value is in NEITHER enum: Mongo
// accepted a role its own schema forbids. They are leftovers of the removed complaints
// feature — the dead `complaints` collection is the other half — no controller, route or
// middleware implements the role, and authorizeRoles would 403 them from everything. They
// are skipped, along with the single push subscription that references them. The mongodump
// keeps them if the feature is ever revived.
const VALID_ROLES = User.schema.path('role').enumValues;

// --- reporting --------------------------------------------------------------

const report = [];
const line = (...a) => console.log(...a);
const heading = (t) => line(`\n${t}\n${'-'.repeat(t.length)}`);

const tally = (table) => {
  const t = { table, read: 0, written: 0, skipped: {}, nulled: {} };
  report.push(t);
  return t;
};
const skip = (t, reason) => { t.skipped[reason] = (t.skipped[reason] || 0) + 1; };
const nulled = (t, field) => { t.nulled[field] = (t.nulled[field] || 0) + 1; };

// --- value transforms -------------------------------------------------------

// Mongo stores '' for "not filled in" on optional strings. Postgres distinguishes it from
// NULL, and 002's users_guardian_phone_format rejects '' while allowing NULL. 16 users
// have one today. Map it, never copy it.
const str = (v) => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};

const lower = (v) => { const s = str(v); return s === null ? null : s.toLowerCase(); };
const date = (v) => (v instanceof Date && !Number.isNaN(+v) ? v : null);
const bool = (v) => v === true;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Splits "data:image/png;base64,AAAA" into the bytes and the mime type. Stored decoded
// because bytea of the decoded bytes is ~25% smaller than the base64 text, and the data
// layer rebuilds the exact same string for the API — the JSON contract does not change.
const blob = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  if (!s) return null;
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(s);
  const mime = m ? m[1] : 'image/png';
  const b64 = m ? m[2] : s;
  let bytes;
  try {
    bytes = Buffer.from(b64, 'base64');
  } catch {
    return null;
  }
  return bytes.length ? { bytes, mime } : null;
};

// --- postgres helpers -------------------------------------------------------

let pg = null;

// Builds the INSERT from the row object's keys so the column list cannot drift from the
// values.
//
//   conflictCols  the ON CONFLICT target, as an array of column names. An array rather
//                 than raw SQL because substring-matching a "(legacy_id)" string against
//                 a key named "id" is true, which silently drops columns from the UPDATE.
//   returning     the column to read back, or null for the two 1:1 blob tables, whose
//                 primary key IS user_id — they have no `id` column and RETURNING id on
//                 them fails with `column "id" does not exist`.
const upsert = async (table, row, conflictCols, returning = 'id') => {
  const keys = Object.keys(row);
  const holes = keys.map((_, i) => `$${i + 1}`).join(', ');
  const sets = keys
    .filter((k) => k !== 'id' && !conflictCols.includes(k))
    .map((k) => `${k} = EXCLUDED.${k}`)
    .join(', ');
  const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${holes})
               ON CONFLICT (${conflictCols.join(', ')}) DO UPDATE SET ${sets}
               ${returning ? `RETURNING ${returning}` : ''}`;
  const { rows } = await pg.query(sql, keys.map((k) => row[k]));
  return returning ? rows[0][returning] : undefined;
};

// --- the load ---------------------------------------------------------------

const run = async () => {
  const mongo = new MongoClient(process.env.MONGO_URI);
  await mongo.connect();
  const db = mongo.db(MONGO_DB);

  pg = new Client(migrationPoolConfig());
  await pg.connect();

  const v = await pg.query('SELECT version(), current_database()');
  line(`  source : mongodb "${MONGO_DB}"`);
  line(`  target : ${v.rows[0].current_database} — ${v.rows[0].version.split(',')[0]}`);
  line(DRY_RUN ? '  MODE   : DRY RUN, nothing will be written\n' : '  MODE   : WRITING\n');

  await pg.query('BEGIN');

  // ---- users -------------------------------------------------------------
  // Loaded first: everything else resolves its foreign keys through the map this builds.
  const tUsers = tally('users');
  const tPhotos = tally('user_photos');
  const tSigs = tally('user_signatures');
  const tContacts = tally('close_contacts');
  const tCreds = tally('webauthn_credentials');

  const userMap = new Map(); // mongo _id string -> postgres uuid
  const mongoUsers = await db.collection('users').find({}).toArray();

  for (const u of mongoUsers) {
    tUsers.read += 1;

    const role = str(u.role) || 'Student';
    if (!VALID_ROLES.includes(role)) {
      // Not migrated, so nothing that references them is either — reqUser() below drops
      // those rows and reports them under their own table.
      skip(tUsers, `role "${role}" is not a role this app implements`);
      continue;
    }

    // users.hostel_name has a real FK to hostels(name); 'kautilya' is rejected where
    // 'Kautilya' is accepted. This is the whole point of promoting the config to a table.
    const hostel = canonicalHostelName(u.hostelName);
    if (u.hostelName && !hostel) {
      skip(tUsers, `unknown hostel "${u.hostelName}"`);
      continue;
    }
    const managed = canonicalHostelName(u.managedHostel);
    if (u.managedHostel && !managed) nulled(tUsers, 'managed_hostel');

    const id = await upsert('users', {
      id: crypto.randomUUID(),
      legacy_id: String(u._id),
      name: str(u.name) || 'Unknown',
      login_id: lower(u.loginId),
      email: lower(u.email),
      password: str(u.password),
      role,
      gender: str(u.gender),
      managed_gender: str(u.managedGender),
      managed_hostel: managed,
      student_id: str(u.studentId),
      department: str(u.department),
      year: str(u.year),
      room_number: str(u.roomNumber),
      hostel_name: hostel,
      phone_number: str(u.phoneNumber),
      guardian_phone_number: str(u.guardianPhoneNumber),
      campus_status: str(u.campusStatus) || 'Inside',
      last_seen_at: date(u.lastSeenAt),
      on_duty: bool(u.onDuty),
      last_active_at: date(u.lastActiveAt),
      webauthn_registered: bool(u.webAuthnRegistered),
      current_challenge: str(u.currentChallenge),
      created_at: date(u.createdAt) || new Date(),
      updated_at: date(u.updatedAt) || new Date(),
    }, ['legacy_id']);

    userMap.set(String(u._id), id);
    tUsers.written += 1;

    // Blobs move to their own 1:1 tables so a careless SELECT * on the roster physically
    // cannot pull them — the budget test/rosterPhotoBudget.test.js guards by convention.
    const photo = blob(u.photo);
    tPhotos.read += u.photo ? 1 : 0;
    if (photo) {
      await upsert('user_photos', {
        user_id: id, photo: photo.bytes, mime_type: photo.mime, byte_size: photo.bytes.length,
      }, ['user_id'], null);
      tPhotos.written += 1;
    } else if (u.photo) skip(tPhotos, 'unparseable data URL');

    const sig = blob(u.signature);
    tSigs.read += u.signature ? 1 : 0;
    if (sig) {
      await upsert('user_signatures', {
        user_id: id, signature: sig.bytes, mime_type: sig.mime, byte_size: sig.bytes.length,
      }, ['user_id'], null);
      tSigs.written += 1;
    } else if (u.signature) skip(tSigs, 'unparseable data URL');

    // Embedded array -> rows. slot is CHECKed to 1..2, so a third has nowhere to go;
    // Mongoose's max-2 validator only ran on save() and could be bypassed.
    const contacts = Array.isArray(u.closeContacts) ? u.closeContacts : [];
    tContacts.read += contacts.length;
    for (let i = 0; i < contacts.length; i += 1) {
      const c = contacts[i] || {};
      if (i >= 2) { skip(tContacts, 'beyond the 2-contact cap'); continue; }
      if (!str(c.name) || !str(c.mobileNumber) || !str(c.roomNumber)) {
        skip(tContacts, 'missing a required field');
        continue;
      }
      await upsert('close_contacts', {
        id: crypto.randomUUID(),
        user_id: id,
        slot: i + 1,
        name: str(c.name),
        mobile_number: str(c.mobileNumber),
        room_number: str(c.roomNumber),
      }, ['user_id', 'slot']);
      tContacts.written += 1;
    }

    const creds = Array.isArray(u.webAuthnCredentials) ? u.webAuthnCredentials : [];
    tCreds.read += creds.length;
    for (const c of creds) {
      if (!str(c.credentialID)) { skip(tCreds, 'no credentialID'); continue; }
      await upsert('webauthn_credentials', {
        id: crypto.randomUUID(),
        user_id: id,
        credential_id: str(c.credentialID),
        public_key: c.publicKey && c.publicKey.buffer ? Buffer.from(c.publicKey.buffer) : null,
        counter: Number.isFinite(c.counter) ? c.counter : 0,
        transports: Array.isArray(c.transports) ? c.transports : [],
      }, ['credential_id']);
      tCreds.written += 1;
    }
  }

  // Resolves a required reference, or reports why the row is being dropped.
  const reqUser = (t, ref) => {
    if (!ref) { skip(t, 'no student reference at all'); return undefined; }
    const id = userMap.get(String(ref));
    if (!id) { skip(t, 'student was deleted (the July cohort)'); return undefined; }
    return id;
  };
  // Resolves an optional reference; a dangling one becomes NULL rather than dropping the row.
  const optUser = (t, ref, field) => {
    if (!ref) return null;
    const id = userMap.get(String(ref));
    if (!id) { nulled(t, field); return null; }
    return id;
  };

  // ---- passes ------------------------------------------------------------
  // The three *_signature columns stay inline as bytea: Postgres TOASTs large values out
  // of the main heap, so a query that never names the column never reads those pages.
  const loadPasses = async (coll, table, t, extra) => {
    const map = new Map();
    for (const d of await db.collection(coll).find({}).toArray()) {
      t.read += 1;
      const student = reqUser(t, d.student);
      if (!student) continue;

      const sig = (field) => {
        const b = blob(d[field]);
        return b ? [b.bytes, b.mime] : [null, null];
      };
      const [ssig, ssigM] = sig('studentSignature');
      const [csig, csigM] = sig('caretakerSignature');
      const [wsig, wsigM] = sig('wardenSignature');

      const id = await upsert(table, {
        id: crypto.randomUUID(),
        legacy_id: String(d._id),
        student_id: student,
        destination: str(d.destination) || 'Unknown',
        status: str(d.status) || 'Pending',
        decision: str(d.decision),
        decided_at: date(d.decidedAt),
        decided_by_role: str(d.decidedByRole),
        remarks: str(d.remarks),
        student_signature: ssig,
        student_signature_mime: ssigM,
        caretaker_signature: csig,
        caretaker_signature_mime: csigM,
        warden_signature: wsig,
        warden_signature_mime: wsigM,
        approved_by: optUser(t, d.approvedBy, 'approved_by'),
        target_caretaker: optUser(t, d.targetCaretaker, 'target_caretaker'),
        forwarded_to: optUser(t, d.forwardedTo, 'forwarded_to'),
        forwarded_by: optUser(t, d.forwardedBy, 'forwarded_by'),
        forwarded_note: str(d.forwardedNote),
        forwarded_at: date(d.forwardedAt),
        created_at: date(d.createdAt) || new Date(),
        updated_at: date(d.updatedAt) || new Date(),
        ...extra(d),
      }, ['legacy_id']);

      map.set(String(d._id), id);
      t.written += 1;
    }
    return map;
  };

  const tOuting = tally('outing_requests');
  const outingMap = await loadPasses('outingrequests', 'outing_requests', tOuting, (d) => ({
    purpose: str(d.purpose) || 'Unknown',
    outing_type: str(d.outingType) || 'General',
    out_time: date(d.outTime) || new Date(),
    in_time: date(d.inTime) || new Date(),
    auto_approved: bool(d.autoApproved),
    return_punctuality: str(d.returnPunctuality),
    overdue_notified_at: date(d.overdueNotifiedAt),
    student_overdue_notified_at: date(d.studentOverdueNotifiedAt),
    actual_out_time: date(d.actualOutTime),
    actual_in_time: date(d.actualInTime),
  }));

  const tLeave = tally('leave_applications');
  const leaveMap = await loadPasses('leaveapplications', 'leave_applications', tLeave, (d) => ({
    reason: str(d.reason) || 'Unknown',
    leave_date: date(d.leaveDate) || new Date(),
    return_date: date(d.returnDate) || new Date(),
    acknowledgement: bool(d.acknowledgement),
  }));

  // ---- scan logs ---------------------------------------------------------
  const tScan = tally('scan_logs');
  for (const d of await db.collection('scanlogs').find({}).toArray()) {
    tScan.read += 1;
    const student = reqUser(tScan, d.student);
    if (!student) continue;

    // scan_logs_one_pass CHECKs that at most one is set. Outing-first, matching
    // scanController's own resolution order.
    let outing = d.outing ? outingMap.get(String(d.outing)) || null : null;
    let leave = d.leave ? leaveMap.get(String(d.leave)) || null : null;
    if (d.outing && !outing) nulled(tScan, 'outing_id');
    if (d.leave && !leave) nulled(tScan, 'leave_id');
    if (outing && leave) { leave = null; nulled(tScan, 'leave_id (both were set)'); }

    await upsert('scan_logs', {
      id: crypto.randomUUID(),
      legacy_id: String(d._id),
      student_id: student,
      guard_id: optUser(tScan, d.guard, 'guard_id'),
      direction: str(d.direction) || 'OUT',
      outing_id: outing,
      leave_id: leave,
      pass_type: outing ? 'Outing' : (leave ? 'Leave' : str(d.passType)),
      punctuality: str(d.punctuality) || 'N/A',
      gate: str(d.gate) || 'Main Gate',
      created_at: date(d.createdAt) || new Date(),
      updated_at: date(d.updatedAt) || new Date(),
    }, ['legacy_id']);
    tScan.written += 1;
  }

  // ---- SOS alerts --------------------------------------------------------
  const tSos = tally('sos_alerts');
  for (const d of await db.collection('sosalerts').find({}).toArray()) {
    tSos.read += 1;
    const student = reqUser(tSos, d.student);
    if (!student) continue;
    const c = d.coords || {};
    await upsert('sos_alerts', {
      id: crypto.randomUUID(),
      legacy_id: String(d._id),
      student_id: student,
      type: lower(d.type) || 'other',
      note: str(d.note),
      location: str(d.location),
      coord_lat: num(c.lat),
      coord_lng: num(c.lng),
      coord_accuracy: num(c.accuracy),
      status: str(d.status) || 'Active',
      handled_by: optUser(tSos, d.handledBy, 'handled_by'),
      resolution_note: str(d.resolutionNote),
      created_at: date(d.createdAt) || new Date(),
      updated_at: date(d.updatedAt) || new Date(),
    }, ['legacy_id']);
    tSos.written += 1;
  }

  // ---- delay notices -----------------------------------------------------
  // Mongo stored an untyped `trip` ObjectId plus a `tripType` discriminator with no
  // referential integrity. Here it is two real FKs with exactly one non-null.
  const tDelay = tally('delay_notices');
  for (const d of await db.collection('delaynotices').find({}).toArray()) {
    tDelay.read += 1;
    const student = reqUser(tDelay, d.student);
    if (!student) continue;

    const isLeave = String(d.tripType) === 'Leave';
    const trip = d.trip ? String(d.trip) : null;
    const outing = !isLeave && trip ? outingMap.get(trip) || null : null;
    const leave = isLeave && trip ? leaveMap.get(trip) || null : null;
    if (!outing && !leave) {
      // delay_notices_one_trip requires exactly one. A notice whose pass did not survive
      // has nothing to attach to.
      skip(tDelay, `trip (${d.tripType || 'Outing'}) no longer exists`);
      continue;
    }

    await upsert('delay_notices', {
      id: crypto.randomUUID(),
      legacy_id: String(d._id),
      student_id: student,
      outing_id: outing,
      leave_id: leave,
      reason: str(d.reason) || 'Other',
      note: str(d.note),
      new_expected_time: date(d.newExpectedTime),
      original_in_time: date(d.originalInTime),
      filed_while_overdue: bool(d.filedWhileOverdue),
      status: str(d.status) || 'Pending',
      acknowledged_by: optUser(tDelay, d.acknowledgedBy, 'acknowledged_by'),
      acknowledged_at: date(d.acknowledgedAt),
      acknowledgement_note: str(d.acknowledgementNote),
      created_at: date(d.createdAt) || new Date(),
      updated_at: date(d.updatedAt) || new Date(),
    }, ['legacy_id']);
    tDelay.written += 1;
  }

  // ---- push subscriptions ------------------------------------------------
  const tPush = tally('push_subscriptions');
  for (const d of await db.collection('pushsubscriptions').find({}).toArray()) {
    tPush.read += 1;
    const user = reqUser(tPush, d.user);
    if (!user) continue;
    const sub = d.subscription || {};
    const keys = sub.keys || {};
    if (!str(sub.endpoint) || !str(keys.p256dh) || !str(keys.auth)) {
      skip(tPush, 'incomplete subscription');
      continue;
    }
    await upsert('push_subscriptions', {
      id: crypto.randomUUID(),
      legacy_id: String(d._id),
      user_id: user,
      endpoint: str(sub.endpoint),
      p256dh: str(keys.p256dh),
      auth: str(keys.auth),
      created_at: date(d.createdAt) || new Date(),
      updated_at: date(d.updatedAt) || new Date(),
    }, ['legacy_id']);
    tPush.written += 1;
  }

  // ---- email OTPs --------------------------------------------------------
  // Short-lived by nature; anything expired is pointless to carry over.
  const tOtp = tally('email_otps');
  for (const d of await db.collection('emailotps').find({}).toArray()) {
    tOtp.read += 1;
    const expires = date(d.expiresAt);
    if (!expires || expires < new Date()) { skip(tOtp, 'already expired'); continue; }
    await upsert('email_otps', {
      id: crypto.randomUUID(),
      legacy_id: String(d._id),
      email: lower(d.email),
      otp_hash: str(d.otpHash),
      purpose: str(d.purpose) || 'student-registration',
      attempts: Number.isFinite(d.attempts) ? d.attempts : 0,
      last_sent_at: date(d.lastSentAt) || new Date(),
      expires_at: expires,
      created_at: date(d.createdAt) || new Date(),
      updated_at: date(d.updatedAt) || new Date(),
    }, ['legacy_id']);
    tOtp.written += 1;
  }

  // ---- finish ------------------------------------------------------------
  if (DRY_RUN) {
    await pg.query('ROLLBACK');
  } else {
    await pg.query('COMMIT');
  }

  heading('Result');
  let totalRead = 0;
  let totalWritten = 0;
  for (const t of report) {
    const skipped = Object.values(t.skipped).reduce((a, b) => a + b, 0);
    totalRead += t.read;
    totalWritten += t.written;
    line(`  ${t.table.padEnd(22)} read ${String(t.read).padStart(5)}   written ${String(t.written).padStart(5)}   skipped ${String(skipped).padStart(5)}`);
    for (const [reason, n] of Object.entries(t.skipped)) line(`      skipped ${String(n).padStart(5)}  ${reason}`);
    for (const [field, n] of Object.entries(t.nulled)) line(`      nulled  ${String(n).padStart(5)}  ${field} (referenced a deleted user)`);
  }
  line(`\n  totals: read ${totalRead}, written ${totalWritten}`);
  line(DRY_RUN
    ? '\n  DRY RUN — rolled back, nothing was written.'
    : '\n  Committed. Next: npm run pg:constraints, then check 003 before validating.');

  await mongo.close();
  await pg.end();
};

run().catch(async (err) => {
  console.error(`\nETL FAILED: ${err.message}`);
  if (err.detail) console.error(`  detail: ${err.detail}`);
  if (err.table) console.error(`  table : ${err.table}`);
  if (err.constraint) console.error(`  rule  : ${err.constraint}`);
  if (pg) { try { await pg.query('ROLLBACK'); await pg.end(); } catch { /* already gone */ } }
  console.error('\nNothing was written — the whole load runs in one transaction.');
  process.exit(1);
});
