#!/usr/bin/env node
// Applies the PostgreSQL DDL in backend/db/postgres/, and verifies the result.
//
//   node scripts/applySchema.js               # apply 001_schema.sql
//   node scripts/applySchema.js constraints   # apply 002_post_etl_constraints.sql
//   node scripts/applySchema.js validate      # apply 003_validate_constraints.sql
//   node scripts/applySchema.js drop-legacy   # apply 004_drop_legacy_ids.sql (post-cutover)
//   node scripts/applySchema.js check         # verify, change nothing
//
// Reads DATABASE_URL. Nothing here writes application data, so it is safe to run against
// the college server as a first connection test — `check` in particular touches only
// catalog tables.

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { migrationPoolConfig } = require('../src/config/postgres');

const DDL_DIR = path.join(__dirname, '..', 'db', 'postgres');

const STEPS = {
  schema: '001_schema.sql',
  constraints: '002_post_etl_constraints.sql',
  validate: '003_validate_constraints.sql',
  'drop-legacy': '004_drop_legacy_ids.sql',
};

// What `check` expects to find. Kept as data rather than prose so it fails loudly if the
// DDL and this list ever drift.
const EXPECTED_TABLES = [
  'hostels', 'users', 'close_contacts', 'webauthn_credentials',
  'user_photos', 'user_signatures', 'outing_requests', 'leave_applications',
  'scan_logs', 'sos_alerts', 'delay_notices', 'push_subscriptions', 'email_otps',
];

// The two indexes that are correctness guards rather than performance ones. If either is
// missing, the double-submit race that lets one student hold two live passes is open.
const CRITICAL_INDEXES = ['one_active_outing_per_student', 'one_active_leave_per_student'];

// ---------------------------------------------------------------------------

// Splits a SQL file into statements. Handles line comments, block comments and
// single-quoted strings so a ';' or a '--' inside a literal is not treated as syntax.
// The DDL uses no dollar-quoted blocks by design (no PL/pgSQL, no CREATE FUNCTION), so
// this does not need to understand them.
const splitStatements = (sql) => {
  const out = [];
  let buf = '';
  let inLine = false, inBlock = false, inString = false;

  for (let i = 0; i < sql.length; i += 1) {
    const c = sql[i];
    const next = sql[i + 1];

    if (inLine) { buf += c; if (c === '\n') inLine = false; continue; }
    if (inBlock) { buf += c; if (c === '*' && next === '/') { buf += next; i += 1; inBlock = false; } continue; }
    if (inString) {
      buf += c;
      // '' inside a string is an escaped quote, not the end of it.
      if (c === "'") { if (next === "'") { buf += next; i += 1; } else inString = false; }
      continue;
    }

    if (c === '-' && next === '-') { inLine = true; buf += c; continue; }
    if (c === '/' && next === '*') { inBlock = true; buf += c; continue; }
    if (c === "'") { inString = true; buf += c; continue; }

    if (c === ';') { out.push(buf); buf = ''; continue; }
    buf += c;
  }
  out.push(buf);

  // Drop fragments that are only comments and whitespace.
  return out
    .map((s) => s.trim())
    .filter((s) => s.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 0);
};

// A one-line label for the log: the first meaningful line of the statement.
const label = (stmt) => {
  const firstCode = stmt
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('--'));
  return (firstCode || stmt).slice(0, 78);
};

// 002 and 004 are re-runnable in intent but ALTER TABLE ... ADD CONSTRAINT has no
// IF NOT EXISTS form, so a second run raises 42710. Treat that as "already applied".
const ALREADY_APPLIED = new Set([
  '42710', // duplicate_object — constraint already exists
  '42P07', // duplicate_table
  '42701', // duplicate_column
]);

const connect = async () => {
  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
    console.error(
      '\nFATAL: DATABASE_URL is not set.\n' +
      'Add it to backend/.env, e.g.\n' +
      '  DATABASE_URL=postgres://safeexit:password@127.0.0.1:5432/safeexit\n'
    );
    process.exit(1);
  }
  const client = new Client(migrationPoolConfig());
  await client.connect();
  return client;
};

const reportServer = async (client) => {
  // The Phase 0 "what version do they run?" question, answered for free on first connect.
  const { rows } = await client.query(
    'SELECT version() AS version, current_database() AS db, current_user AS role, ' +
    "current_setting('server_version_num') AS vnum, " +
    "current_setting('max_connections') AS max_conn"
  );
  const r = rows[0];
  console.log(`  server   : ${r.version.split(',')[0]}`);
  console.log(`  database : ${r.db}   role: ${r.role}   max_connections: ${r.max_conn}`);
  if (Number(r.vnum) < 90500) {
    console.error(`\nFATAL: this schema targets PostgreSQL 9.5+, server reports ${r.vnum}.`);
    process.exit(1);
  }
  return r;
};

const applyFile = async (client, file, { tolerateExisting }) => {
  const full = path.join(DDL_DIR, file);
  const sql = fs.readFileSync(full, 'utf8');
  const statements = splitStatements(sql);
  console.log(`\napplying ${file} — ${statements.length} statements`);

  // Postgres DDL is transactional, which MongoDB's index builds were not: either the
  // whole schema lands or none of it does, and there is no half-migrated state to unpick.
  await client.query('BEGIN');
  try {
    let skipped = 0;
    for (const stmt of statements) {
      try {
        await client.query(stmt);
      } catch (err) {
        if (tolerateExisting && ALREADY_APPLIED.has(err.code)) {
          skipped += 1;
          // A failed statement aborts the transaction, so restart it to keep going.
          await client.query('ROLLBACK');
          await client.query('BEGIN');
          continue;
        }
        console.error(`\n  FAILED: ${label(stmt)}`);
        console.error(`  ${err.code || ''} ${err.message}`);
        if (err.detail) console.error(`  detail: ${err.detail}`);
        if (err.hint) console.error(`  hint: ${err.hint}`);
        throw err;
      }
    }
    await client.query('COMMIT');
    console.log(`  ok${skipped ? ` (${skipped} already applied, skipped)` : ''}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
};

const check = async (client) => {
  let problems = 0;

  const { rows: tables } = await client.query(
    "SELECT table_name FROM information_schema.tables " +
    "WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'"
  );
  const present = new Set(tables.map((t) => t.table_name));

  console.log('\ntables');
  for (const t of EXPECTED_TABLES) {
    if (present.has(t)) {
      const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
      console.log(`  ok      ${t.padEnd(22)} ${rows[0].n} rows`);
    } else {
      console.log(`  MISSING ${t}`);
      problems += 1;
    }
  }

  const extra = [...present].filter((t) => !EXPECTED_TABLES.includes(t));
  if (extra.length) console.log(`  note    unexpected tables present: ${extra.join(', ')}`);

  console.log('\ncorrectness guards (one live pass per student)');
  const { rows: idx } = await client.query(
    'SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema()'
  );
  const byName = new Map(idx.map((i) => [i.indexname, i.indexdef]));
  for (const name of CRITICAL_INDEXES) {
    const def = byName.get(name);
    if (!def) {
      console.log(`  MISSING ${name}  <-- the double-submit race is UNGUARDED`);
      problems += 1;
      continue;
    }
    // The index is only a guard if it is UNIQUE and still filters on the same statuses
    // the controllers block on.
    const { ACTIVE_PASS_STATUSES } = require('../src/config/passStatuses');
    const missing = ACTIVE_PASS_STATUSES.filter((s) => !def.includes(`'${s}'`));
    if (!/UNIQUE/i.test(def) || missing.length) {
      console.log(`  BROKEN  ${name}`);
      if (missing.length) {
        console.log(`          filter is missing status(es): ${missing.join(', ')}`);
        console.log('          it now enforces a different rule than the controllers do.');
      }
      problems += 1;
    } else {
      console.log(`  ok      ${name}`);
    }
  }

  console.log(`\nindexes: ${idx.length} total`);

  // Constraints from 002 that are added but not yet validated against existing rows.
  const { rows: notValid } = await client.query(
    "SELECT conrelid::regclass::text AS tbl, conname FROM pg_constraint " +
    'WHERE NOT convalidated ORDER BY 1, 2'
  );
  if (notValid.length) {
    console.log('\nconstraints added but NOT YET VALIDATED against existing rows:');
    for (const c of notValid) console.log(`  ${c.tbl}.${c.conname}`);
    console.log('  (enforced on new writes; run `applySchema.js validate` after cleaning data)');
  }

  const { rows: legacy } = await client.query(
    "SELECT table_name FROM information_schema.columns " +
    "WHERE table_schema = current_schema() AND column_name = 'legacy_id' ORDER BY 1"
  );
  console.log(`\nlegacy_id still present on ${legacy.length} table(s)` +
    (legacy.length ? ' — expected until after cutover' : ' — cutover cleanup done'));

  console.log(problems === 0 ? '\nRESULT: ok' : `\nRESULT: ${problems} problem(s)`);
  return problems;
};

const main = async () => {
  const step = (process.argv[2] || 'schema').replace(/^--/, '');
  if (step !== 'check' && !STEPS[step]) {
    console.error(`unknown step "${step}". One of: ${Object.keys(STEPS).join(', ')}, check`);
    process.exit(1);
  }

  const client = await connect();
  let problems = 0;
  try {
    await reportServer(client);
    if (step === 'check') {
      problems = await check(client);
    } else {
      // 001 is written IF NOT EXISTS throughout; 002/004 need the duplicate-object escape.
      await applyFile(client, STEPS[step], { tolerateExisting: step !== 'schema' });
      if (step === 'schema') problems = await check(client);
    }
  } finally {
    await client.end();
  }
  process.exit(problems === 0 ? 0 : 1);
};

// Exported so test/schemaDdl.test.js can exercise the splitter and assert on the DDL
// without a live database — the same style as the rest of backend/test.
module.exports = { splitStatements, EXPECTED_TABLES, CRITICAL_INDEXES, DDL_DIR, STEPS };

if (require.main === module) {
  main().catch((err) => {
    console.error(`\n${err.message}`);
    process.exit(1);
  });
}
