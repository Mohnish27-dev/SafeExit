// Behavioural proof that the PostgreSQL schema's constraints actually FIRE.
//
// test/schemaDdl.test.js is a static reader: it proves the DDL *text* says what
// config/passStatuses.js and config/hostels.js say. That catches drift, but it cannot
// catch a constraint that was written correctly and then failed to take effect — a
// partial index whose WHERE clause does not match the rows it should, a CHECK that is
// still NOT VALID when it should be enforcing, a foreign key that never got created.
//
// These tests run the real INSERTs against a real server and assert the rejections. The
// thing being defended is the double-submit race: two concurrent POSTs from one student
// both pass the controller's check-then-create and both succeed. Only the database can
// stop that, so "the index exists" is not the claim worth testing — "the second INSERT
// is rejected, for each active status, and terminal statuses do not block" is.
//
// SKIPPED when DATABASE_URL is unset, so `npm test` stays green on a machine with no
// PostgreSQL. Set one up per backend/db/postgres/README.md and these turn on by themselves.
//
// Everything runs inside ONE transaction that is rolled back at the end, and each test
// body inside its own SAVEPOINT. The suite writes nothing that survives it — safe against
// the dev database, and would be safe against a populated one.

require('dotenv').config();

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');

const { ACTIVE_PASS_STATUSES } = require('../src/config/passStatuses');
const { hostelNames } = require('../src/config/hostels');

// Statuses that must NOT block a second pass — the complement of ACTIVE_PASS_STATUSES
// against the outing status CHECK. A pass that is finished, refused or abandoned frees
// the student to request another one.
const TERMINAL_STATUSES = ['Rejected', 'Returned', 'Expired', 'Cancelled'];

// SQLSTATE codes, named so a failure says which rule fired rather than a number.
const UNIQUE_VIOLATION = '23505';
const FK_VIOLATION = '23503';
const CHECK_VIOLATION = '23514';
const NOT_NULL_VIOLATION = '23502';

let client = null;
// Non-null when the suite cannot run; every test then skips with this as the reason
// rather than failing, so a missing or sleeping database never turns the suite red.
let unavailable = null;
let savepointSeq = 0;

test.before(async () => {
  if (!process.env.DATABASE_URL) {
    unavailable = 'DATABASE_URL is not set — see backend/db/postgres/README.md';
    return;
  }
  try {
    client = new Client({
      connectionString: process.env.DATABASE_URL,
      // Keep a hung server from wedging the whole test run.
      connectionTimeoutMillis: 5000,
      statement_timeout: 15000,
      application_name: 'safeexit-schema-tests',
    });
    await client.connect();
    // Fail clearly if the schema was never applied, rather than letting every test
    // report a confusing "relation does not exist".
    const { rows } = await client.query("SELECT to_regclass('public.outing_requests') AS t");
    if (!rows[0].t) {
      unavailable = 'schema not applied to this database — run `npm run pg:schema`';
      await client.end();
      client = null;
      return;
    }
    await client.query('BEGIN');
  } catch (err) {
    unavailable = `cannot reach PostgreSQL (${err.code || err.message})`;
    if (client) { try { await client.end(); } catch { /* already down */ } }
    client = null;
  }
});

test.after(async () => {
  if (!client) return;
  // Nothing this suite did is kept.
  try { await client.query('ROLLBACK'); } finally { await client.end(); }
});

// Runs the body inside a savepoint and unwinds it afterwards, so each test starts from
// the same state and a deliberate violation does not poison the outer transaction.
const isolated = (name, fn) => test(name, async (t) => {
  if (unavailable) return t.skip(unavailable);
  const sp = `sp_${savepointSeq += 1}`;
  await client.query(`SAVEPOINT ${sp}`);
  try {
    await fn(t);
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
  }
  return undefined;
});

// Asserts the statement is rejected, and by the rule we think. Wrapped in its own
// savepoint because an error aborts the enclosing transaction until it is unwound.
const rejects = async (fn, expectedCode, what) => {
  const sp = `rej_${savepointSeq += 1}`;
  await client.query(`SAVEPOINT ${sp}`);
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
  assert.ok(err, `${what}: expected the database to reject this, but it was accepted`);
  assert.equal(
    err.code,
    expectedCode,
    `${what}: expected SQLSTATE ${expectedCode}, got ${err.code} — ${err.message}`,
  );
  return err;
};

// --- fixtures ---------------------------------------------------------------

const mkStudent = async (overrides = {}) => {
  const id = crypto.randomUUID();
  const { hostel_name: hostelName = 'Kautilya', role = 'Student', gender = 'Male' } = overrides;
  await client.query(
    `INSERT INTO users (id, name, email, role, gender, hostel_name, student_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, 'Test Student', `s${id}@example.test`, role, gender, hostelName, `R${id.slice(0, 8)}`],
  );
  return id;
};

const mkOuting = (studentId, status) => client.query(
  `INSERT INTO outing_requests (id, student_id, destination, purpose, out_time, in_time, status)
   VALUES ($1, $2, 'Market', 'Groceries', now(), now() + interval '4 hours', $3)`,
  [crypto.randomUUID(), studentId, status],
);

const mkLeave = (studentId, status) => client.query(
  `INSERT INTO leave_applications (id, student_id, destination, reason, leave_date, return_date, status)
   VALUES ($1, $2, 'Home', 'Festival', now(), now() + interval '3 days', $3)`,
  [crypto.randomUUID(), studentId, status],
);

// --- the one-active-pass guard ----------------------------------------------

for (const status of ACTIVE_PASS_STATUSES) {
  isolated(`outing: a second '${status}' pass for one student is rejected`, async () => {
    const student = await mkStudent();
    await mkOuting(student, status);
    await rejects(() => mkOuting(student, status), UNIQUE_VIOLATION, `second ${status} outing`);
  });

  isolated(`leave: a second '${status}' application for one student is rejected`, async () => {
    const student = await mkStudent();
    await mkLeave(student, status);
    await rejects(() => mkLeave(student, status), UNIQUE_VIOLATION, `second ${status} leave`);
  });
}

isolated('outing: two DIFFERENT active statuses still collide', async () => {
  // The index is on (student_id) filtered by the status list — not on (student_id, status).
  // A Pending and an Approved pass are both live, so the pair must be rejected too.
  const student = await mkStudent();
  await mkOuting(student, 'Pending');
  await rejects(
    () => mkOuting(student, 'Approved'),
    UNIQUE_VIOLATION,
    'Pending + Approved for one student',
  );
});

for (const status of TERMINAL_STATUSES) {
  isolated(`outing: '${status}' does not block a new pass`, async () => {
    const student = await mkStudent();
    await mkOuting(student, status);
    await mkOuting(student, status);
    await mkOuting(student, 'Pending');
    const { rows } = await client.query(
      'SELECT count(*)::int AS n FROM outing_requests WHERE student_id = $1',
      [student],
    );
    assert.equal(rows[0].n, 3, `${status} unexpectedly blocked a later pass`);
  });
}

isolated('outing: two different students may each hold an active pass', async () => {
  const a = await mkStudent();
  const b = await mkStudent();
  await mkOuting(a, 'Out');
  await mkOuting(b, 'Out');
  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM outing_requests WHERE status = 'Out' AND student_id = ANY($1)",
    [[a, b]],
  );
  assert.equal(rows[0].n, 2);
});

isolated('KNOWN GAP: one active outing AND one active leave are both allowed', async () => {
  // Documented at the bottom of 001_schema.sql. The two partial indexes are per-table, so
  // nothing in the database stops this; application code does, and
  // test/crossCollectionPassBlocking.test.js covers that. Pinned here so that closing the
  // gap (a shared active_pass_locks table) is a deliberate change that fails this test
  // rather than a silent behaviour shift.
  const student = await mkStudent();
  await mkOuting(student, 'Out');
  await mkLeave(student, 'Out');
  const { rows } = await client.query(
    `SELECT (SELECT count(*) FROM outing_requests WHERE student_id = $1)
          + (SELECT count(*) FROM leave_applications WHERE student_id = $1) AS n`,
    [student],
  );
  assert.equal(Number(rows[0].n), 2, 'the cross-collection gap has been closed in the DB');
});

// --- hostels: the FK that kills the casing bug class -------------------------

isolated('users: a correctly-cased hostel is accepted', async () => {
  const id = await mkStudent({ hostel_name: 'Kautilya' });
  const { rows } = await client.query('SELECT hostel_name FROM users WHERE id = $1', [id]);
  assert.equal(rows[0].hostel_name, 'Kautilya');
});

isolated('users: a wrongly-cased hostel is rejected by the foreign key', async () => {
  // The whole point of promoting config/hostels.js to a table: in MongoDB 'kautilya'
  // stored fine and then failed to match five .collation() queries.
  await rejects(() => mkStudent({ hostel_name: 'kautilya' }), FK_VIOLATION, 'lowercase hostel');
});

isolated('users: an unknown hostel is rejected by the foreign key', async () => {
  await rejects(() => mkStudent({ hostel_name: 'Hogwarts' }), FK_VIOLATION, 'unknown hostel');
});

isolated('hostels: a second casing of an existing hostel cannot be inserted', async () => {
  await rejects(
    () => client.query("INSERT INTO hostels (name, gender) VALUES ('KAUTILYA', 'Male')"),
    UNIQUE_VIOLATION,
    'hostels_name_ci',
  );
});

isolated('hostels: the seeded rows match config/hostels.js exactly', async () => {
  const { rows } = await client.query('SELECT name FROM hostels ORDER BY name');
  assert.deepEqual(
    rows.map((r) => r.name).sort(),
    hostelNames().slice().sort(),
    'the hostels table and config/hostels.js have drifted',
  );
});

// --- close_contacts: the "max 2" that used to be a save()-only validator -----

isolated('close_contacts: two are accepted, a third has nowhere to go', async () => {
  const student = await mkStudent();
  const add = (slot) => client.query(
    `INSERT INTO close_contacts (id, user_id, slot, name, mobile_number, room_number)
     VALUES ($1, $2, $3, 'Contact', '9876543210', 'A-101')`,
    [crypto.randomUUID(), student, slot],
  );
  await add(1);
  await add(2);
  await rejects(() => add(3), CHECK_VIOLATION, 'third close contact');
});

isolated('close_contacts: the same slot cannot be reused for one user', async () => {
  const student = await mkStudent();
  const add = () => client.query(
    `INSERT INTO close_contacts (id, user_id, slot, name, mobile_number, room_number)
     VALUES ($1, $2, 1, 'Contact', '9876543210', 'A-101')`,
    [crypto.randomUUID(), student],
  );
  await add();
  await rejects(add, UNIQUE_VIOLATION, 'duplicate slot');
});

// --- scan_logs and delay_notices: the flattened embedded documents -----------

isolated('scan_logs: a log cannot reference an outing AND a leave at once', async () => {
  const student = await mkStudent();
  const outing = crypto.randomUUID();
  const leave = crypto.randomUUID();
  await client.query(
    `INSERT INTO outing_requests (id, student_id, destination, purpose, out_time, in_time, status)
     VALUES ($1, $2, 'Market', 'Groceries', now(), now() + interval '4 hours', 'Out')`,
    [outing, student],
  );
  await client.query(
    `INSERT INTO leave_applications (id, student_id, destination, reason, leave_date, return_date, status)
     VALUES ($1, $2, 'Home', 'Festival', now(), now() + interval '3 days', 'Returned')`,
    [leave, student],
  );
  await rejects(
    () => client.query(
      `INSERT INTO scan_logs (id, student_id, direction, outing_id, leave_id, pass_type)
       VALUES ($1, $2, 'OUT', $3, $4, 'Outing')`,
      [crypto.randomUUID(), student, outing, leave],
    ),
    CHECK_VIOLATION,
    'scan_logs_one_pass',
  );
});

isolated('scan_logs: an invalid direction is rejected', async () => {
  const student = await mkStudent();
  await rejects(
    () => client.query(
      "INSERT INTO scan_logs (id, student_id, direction) VALUES ($1, $2, 'SIDEWAYS')",
      [crypto.randomUUID(), student],
    ),
    CHECK_VIOLATION,
    'direction CHECK',
  );
});

isolated('delay_notices: exactly one trip — neither and both are rejected', async () => {
  const student = await mkStudent();
  const outing = crypto.randomUUID();
  await client.query(
    `INSERT INTO outing_requests (id, student_id, destination, purpose, out_time, in_time, status)
     VALUES ($1, $2, 'Market', 'Groceries', now(), now() + interval '4 hours', 'Out')`,
    [outing, student],
  );
  const leave = crypto.randomUUID();
  await client.query(
    `INSERT INTO leave_applications (id, student_id, destination, reason, leave_date, return_date, status)
     VALUES ($1, $2, 'Home', 'Festival', now(), now() + interval '3 days', 'Returned')`,
    [leave, student],
  );
  const insert = (outingId, leaveId) => client.query(
    `INSERT INTO delay_notices (id, student_id, outing_id, leave_id, reason)
     VALUES ($1, $2, $3, $4, 'Traffic')`,
    [crypto.randomUUID(), student, outingId, leaveId],
  );

  await rejects(() => insert(null, null), CHECK_VIOLATION, 'delay notice with no trip');
  await rejects(() => insert(outing, leave), CHECK_VIOLATION, 'delay notice with two trips');
  await insert(outing, null); // exactly one — must be accepted
});

// --- blobs: the bytea round-trip the JSON contract depends on ---------------

isolated('user_photos: bytea round-trips to the exact data URL the frontend expects', async () => {
  // The API contract does not change in this migration: the frontend still receives
  // "data:<mime>;base64,...". Storing decoded bytes is only safe if it rebuilds byte-exact,
  // so the fixture is real binary — every byte value, not printable text.
  const student = await mkStudent();
  const original = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  const dataUrl = `data:image/jpeg;base64,${original.toString('base64')}`;

  await client.query(
    `INSERT INTO user_photos (user_id, photo, mime_type, byte_size)
     VALUES ($1, $2, 'image/jpeg', $3)`,
    [student, original, original.length],
  );

  const { rows } = await client.query(
    'SELECT photo, mime_type, byte_size FROM user_photos WHERE user_id = $1',
    [student],
  );
  assert.ok(Buffer.isBuffer(rows[0].photo), 'bytea should come back as a Buffer');
  assert.equal(rows[0].byte_size, original.length);
  assert.ok(rows[0].photo.equals(original), 'the stored bytes changed in transit');
  const rebuilt = `data:${rows[0].mime_type};base64,${rows[0].photo.toString('base64')}`;
  assert.equal(rebuilt, dataUrl, 'the rebuilt data URL does not match the original');
});

isolated('user_photos: one photo per user, and it dies with the user', async () => {
  const student = await mkStudent();
  const insert = () => client.query(
    `INSERT INTO user_photos (user_id, photo, mime_type, byte_size)
     VALUES ($1, $2, 'image/jpeg', 3)`,
    [student, Buffer.from('abc')],
  );
  await insert();
  await rejects(insert, UNIQUE_VIOLATION, 'second photo for one user');

  await client.query('DELETE FROM users WHERE id = $1', [student]);
  const { rows } = await client.query(
    'SELECT count(*)::int AS n FROM user_photos WHERE user_id = $1',
    [student],
  );
  assert.equal(rows[0].n, 0, 'ON DELETE CASCADE did not remove the photo');
});

// --- users: the remaining column-level rules --------------------------------

isolated('users: login_id and email must already be lowercase', async () => {
  await rejects(
    () => client.query(
      "INSERT INTO users (id, name, login_id, role) VALUES ($1, 'Staff', 'ADMIN', 'Admin')",
      [crypto.randomUUID()],
    ),
    CHECK_VIOLATION,
    'uppercase login_id',
  );
  await rejects(
    () => client.query(
      "INSERT INTO users (id, name, email, role) VALUES ($1, 'Staff', 'A@B.COM', 'Admin')",
      [crypto.randomUUID()],
    ),
    CHECK_VIOLATION,
    'uppercase email',
  );
});

isolated('users: role and campus_status are constrained to their enums', async () => {
  await rejects(
    () => client.query(
      "INSERT INTO users (id, name, role) VALUES ($1, 'X', 'Principal')",
      [crypto.randomUUID()],
    ),
    CHECK_VIOLATION,
    'unknown role',
  );
  await rejects(
    () => client.query(
      "INSERT INTO users (id, name, campus_status) VALUES ($1, 'X', 'Elsewhere')",
      [crypto.randomUUID()],
    ),
    CHECK_VIOLATION,
    'unknown campus_status',
  );
});

isolated('users: name is required', async () => {
  await rejects(
    () => client.query('INSERT INTO users (id) VALUES ($1)', [crypto.randomUUID()]),
    NOT_NULL_VIOLATION,
    'user without a name',
  );
});

// --- referential integrity the ETL depends on -------------------------------

isolated('outing_requests: a dangling student_id is rejected', async () => {
  // Every dangling reference in the Mongo data fails the ETL exactly like this.
  // scripts/mongoInventory.js exists to find them before that happens.
  await rejects(
    () => mkOuting(crypto.randomUUID(), 'Pending'),
    FK_VIOLATION,
    'outing for a non-existent student',
  );
});

isolated('users: a student holding a pass cannot be deleted', async () => {
  // ON DELETE RESTRICT — a pass is an audit record, so removing the student must not
  // silently discard the movement history.
  const student = await mkStudent();
  await mkOuting(student, 'Out');
  await rejects(
    () => client.query('DELETE FROM users WHERE id = $1', [student]),
    FK_VIOLATION,
    'deleting a student who holds a pass',
  );
});

// --- the drift guard, checked against the live catalog ----------------------

isolated('the live partial index filters on exactly ACTIVE_PASS_STATUSES', async () => {
  // schemaDdl.test.js asserts this about the DDL text. This asserts it about the index
  // PostgreSQL actually built, which is what enforces the rule at 9pm on a Friday.
  const { rows } = await client.query(
    `SELECT indexdef FROM pg_indexes
      WHERE indexname IN ('one_active_outing_per_student', 'one_active_leave_per_student')
      ORDER BY indexname`,
  );
  assert.equal(rows.length, 2, 'both one-active-pass indexes should exist');
  for (const { indexdef } of rows) {
    const where = indexdef.slice(indexdef.toUpperCase().indexOf('WHERE'));
    for (const status of ACTIVE_PASS_STATUSES) {
      assert.ok(
        where.includes(`'${status}'`),
        `${status} is missing from the live index filter — the race is open for it: ${where}`,
      );
    }
    for (const status of TERMINAL_STATUSES) {
      assert.ok(
        !where.includes(`'${status}'`),
        `${status} is terminal but appears in the index filter: ${where}`,
      );
    }
  }
});
