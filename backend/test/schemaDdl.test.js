const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { splitStatements, EXPECTED_TABLES, DDL_DIR, STEPS } = require('../scripts/applySchema');
const { ACTIVE_PASS_STATUSES } = require('../src/config/passStatuses');
const { HOSTELS } = require('../src/config/hostels');
const User = require('../src/models/User');
const OutingRequest = require('../src/models/OutingRequest');
const LeaveApplication = require('../src/models/LeaveApplication');

// Static assertions about the PostgreSQL DDL in backend/db/postgres/. No live database —
// same style as the rest of this suite.
//
// The failure mode these exist for is DRIFT. Once the migration lands, the schema stops
// being generated from the Mongoose models and becomes a separate hand-written artefact,
// so nothing automatically notices when somebody adds a pass status, a role, or a hostel
// on one side and not the other. That is exactly the class of change that reopens the
// double-submit race quietly — see the note in models/OutingRequest.js.

const read = (file) => fs.readFileSync(path.join(DDL_DIR, file), 'utf8');
const schemaSql = read(STEPS.schema);

// Mongoose stores enum values on the schema path; pull them rather than restating them.
const enumOf = (model, pathName) => model.schema.path(pathName).enumValues.filter(Boolean);

// The status list inside a partial index's WHERE clause, e.g.
//   ... WHERE status IN ('Pending','Approved')
const statusesInPartialIndex = (sql, indexName) => {
  const stmt = splitStatements(sql).find((s) => s.includes(indexName));
  assert.ok(stmt, `no statement creates ${indexName}`);
  const where = stmt.match(/WHERE\s+status\s+IN\s*\(([^)]*)\)/i);
  assert.ok(where, `${indexName} has no WHERE status IN (...) clause — it is not a partial index`);
  return where[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
};

// The value list inside a column's CHECK, e.g.
//   role text NOT NULL DEFAULT 'Student' CHECK (role IN ('Student','Admin'))
const checkValues = (sql, column) => {
  const m = sql.match(new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, 'i'));
  assert.ok(m, `no CHECK (${column} IN (...)) found in the DDL`);
  return m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
};

// ---------------------------------------------------------------------------

test('every DDL file parses into complete statements', () => {
  for (const file of Object.values(STEPS)) {
    const statements = splitStatements(read(file));
    assert.ok(statements.length > 0, `${file} produced no statements`);
    for (const stmt of statements) {
      // A ';' in the executable part means the splitter mis-parsed and glued two
      // statements together — applySchema.js would then send them as one and the
      // per-statement error handling in 002/004 would not work. A ';' inside a comment
      // is fine and common (the DDL quotes example queries), so strip those first.
      const code = stmt.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
      assert.ok(!code.includes(';'), `${file}: statement still contains ';' — ${code.trim().slice(0, 70)}`);
    }
  }
});

test('the schema creates every table applySchema.js verifies', () => {
  for (const table of EXPECTED_TABLES) {
    assert.match(
      schemaSql,
      new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`),
      `${table} is in EXPECTED_TABLES but nothing creates it`
    );
  }
});

test('the schema is re-runnable: every CREATE uses IF NOT EXISTS', () => {
  for (const stmt of splitStatements(schemaSql)) {
    if (/^\s*CREATE\s+(TABLE|(UNIQUE\s+)?INDEX)/i.test(stmt.replace(/--[^\n]*/g, ''))) {
      assert.match(stmt, /IF NOT EXISTS/i,
        `not idempotent, so the ETL cannot be re-run while debugging: ${stmt.slice(0, 70)}`);
    }
  }
});

// The single most important assertion in this file.
for (const [label, indexName] of [
  ['outing', 'one_active_outing_per_student'],
  ['leave', 'one_active_leave_per_student'],
]) {
  test(`the ${label} partial unique index filters on exactly ACTIVE_PASS_STATUSES`, () => {
    const inIndex = statusesInPartialIndex(schemaSql, indexName);
    assert.deepEqual(
      [...inIndex].sort(),
      [...ACTIVE_PASS_STATUSES].sort(),
      'The index filter has drifted from config/passStatuses.js. It now enforces a ' +
      'different rule than the controllers 409 on, and the double-submit race is open ' +
      'for the statuses that are missing.'
    );
  });
}

test('pass status CHECKs match the Mongoose enums', () => {
  const outingStatuses = checkValues(
    schemaSql.slice(schemaSql.indexOf('CREATE TABLE IF NOT EXISTS outing_requests')),
    'status'
  );
  assert.deepEqual([...outingStatuses].sort(), [...enumOf(OutingRequest, 'status')].sort());

  const leaveStatuses = checkValues(
    schemaSql.slice(schemaSql.indexOf('CREATE TABLE IF NOT EXISTS leave_applications')),
    'status'
  );
  assert.deepEqual([...leaveStatuses].sort(), [...enumOf(LeaveApplication, 'status')].sort());
});

test('user role and campus status CHECKs match the Mongoose enums', () => {
  const usersSql = schemaSql.slice(
    schemaSql.indexOf('CREATE TABLE IF NOT EXISTS users'),
    schemaSql.indexOf('CREATE TABLE IF NOT EXISTS close_contacts')
  );
  assert.deepEqual([...checkValues(usersSql, 'role')].sort(), [...enumOf(User, 'role')].sort());
  assert.deepEqual(
    [...checkValues(usersSql, 'campus_status')].sort(),
    [...enumOf(User, 'campusStatus')].sort()
  );
});

test('every active pass status is also a legal status', () => {
  // Guards the seam between the two assertions above: a status could match the enum on
  // both sides and still be absent from the CHECK the index filter references.
  const outingStatuses = checkValues(
    schemaSql.slice(schemaSql.indexOf('CREATE TABLE IF NOT EXISTS outing_requests')),
    'status'
  );
  for (const status of ACTIVE_PASS_STATUSES) {
    assert.ok(outingStatuses.includes(status),
      `'${status}' is an active pass status but not an allowed outing_requests.status`);
  }
});

test('the hostels seed matches config/hostels.js', () => {
  for (const { name, gender } of HOSTELS) {
    assert.match(
      schemaSql,
      new RegExp(`\\('${name}',\\s*'${gender}'\\)`),
      `hostel ${name} (${gender}) is missing from the hostels seed. users.hostel_name has ` +
      'a foreign key to that table, so students in an unseeded hostel cannot be inserted.'
    );
  }
});

test('the deferred constraints in 002 are exactly the ones 003 validates', () => {
  const added = [...read(STEPS.constraints).matchAll(/ADD CONSTRAINT\s+(\w+)/gi)].map((m) => m[1]);
  const validated = [...read(STEPS.validate).matchAll(/VALIDATE CONSTRAINT\s+(\w+)/gi)].map((m) => m[1]);
  assert.deepEqual([...added].sort(), [...validated].sort(),
    'A constraint added NOT VALID but never validated stays unenforced against migrated ' +
    'rows forever; one validated but never added fails 003 outright.');
});

test('002 adds every deferred constraint as NOT VALID', () => {
  for (const stmt of splitStatements(read(STEPS.constraints))) {
    if (/ADD CONSTRAINT/i.test(stmt)) {
      assert.match(stmt, /NOT VALID/i,
        'A constraint added without NOT VALID is checked against existing rows ' +
        `immediately, which is what this file exists to avoid: ${stmt.slice(0, 60)}`);
    }
  }
});

test('legacy_id exists on every table the ETL resolves foreign keys through', () => {
  // The join tables and 1:1 side tables key off the parent, so they need no legacy_id.
  const noLegacyId = new Set([
    'hostels', 'close_contacts', 'webauthn_credentials', 'user_photos', 'user_signatures',
  ]);
  for (const table of EXPECTED_TABLES) {
    const body = schemaSql.slice(schemaSql.indexOf(`CREATE TABLE IF NOT EXISTS ${table}`));
    const create = body.slice(0, body.indexOf(');'));
    const has = /legacy_id\s+char\(24\)\s+UNIQUE/i.test(create);
    assert.equal(has, !noLegacyId.has(table),
      `${table}: legacy_id presence is wrong — the two-pass ETL resolves FKs through it`);
  }
});

test('004 drops legacy_id from exactly the tables that have one', () => {
  const dropped = [...read(STEPS['drop-legacy']).matchAll(/ALTER TABLE\s+(\w+)\s+DROP COLUMN/gi)]
    .map((m) => m[1]);
  const carried = EXPECTED_TABLES.filter((t) => {
    const body = schemaSql.slice(schemaSql.indexOf(`CREATE TABLE IF NOT EXISTS ${t}`));
    return /legacy_id\s+char\(24\)/i.test(body.slice(0, body.indexOf(');')));
  });
  assert.deepEqual([...dropped].sort(), [...carried].sort(),
    'A legacy_id left behind after cutover is a permanent 24-byte column plus a unique ' +
    'index on data nothing reads any more.');
});
