// Full-flow stress harness. Boots the REAL app against a REAL PostgreSQL, seeds a campus,
// then hammers every flow concurrently.
//
// ---------------------------------------------------------------------------
// WHAT CHANGED WITH THE POSTGRES MIGRATION
//
// This used to spin up mongodb-memory-server: a throwaway database per run, downloaded and
// managed by the test process. There is no equivalent for Postgres, and inventing one would
// be worse than using the real thing — the races these scenarios exist to provoke are
// decided by the DATABASE, so testing them against anything but the real engine would prove
// nothing.
//
// So it runs against the development server named by DATABASE_URL, inside a THROWAWAY
// SCHEMA that is created at the start and dropped at the end. Two guard rails make that
// safe, and both matter because this file seeds a hundred students and then hammers them:
//
//   1. It refuses to run unless DATABASE_URL points at localhost. The Mongo version had
//      the same check on mongoose.connection.host; this is the port of it.
//   2. Every table lives in the throwaway schema, never `public`. PG_SCHEMA sets the
//      connection's search_path (see src/config/sequelize.js), so the app's own queries —
//      unmodified — resolve there and cannot see, let alone write, the working data.
//
// A schema rather than a database because the dev role cannot CREATEDB, which is also the
// constraint the college's server will impose.
// ---------------------------------------------------------------------------

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config();

const { Client } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const { splitStatements, DDL_DIR, STEPS } = require('../scripts/applySchema');

const SCHEMA = process.env.STRESS_SCHEMA || 'safeexit_stress';

// ---- guard rail 1: never point this at anything but a local development database ----
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('ABORT: DATABASE_URL is not set. See backend/db/postgres/README.md.');
  process.exit(1);
}
const host = (() => {
  try { return new URL(url).hostname; } catch { return ''; }
})();
if (!/^(127\.0\.0\.1|localhost|::1|172\.\d+\.\d+\.\d+)$/.test(host)) {
  console.error(`ABORT: DATABASE_URL host is "${host}", which is not local. This harness seeds a`);
  console.error('       hundred students and hammers every flow — it must never touch a real server.');
  process.exit(1);
}

// ---- build the throwaway schema with a raw client, before any model is loaded ----
const admin = new Client({ connectionString: url });
await admin.connect();
await admin.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
await admin.query(`CREATE SCHEMA ${SCHEMA}`);
await admin.end();

process.env.PG_SCHEMA = SCHEMA;
process.env.JWT_SECRET = 'stress-test-secret';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
// No SMTP / no VAPID -> mail logs to console, push is a no-op. Keeps the test hermetic.
delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
process.env.FRONTEND_URL = 'http://localhost:3000';

const jwt = require('jsonwebtoken');
// First require of the models binds the Sequelize instance to PG_SCHEMA above, so
// everything from here on — including the app's own queries — lands in the throwaway
// schema. Nothing may require ../src/models before this point.
const {
  sequelize, User, CloseContact, OutingRequest, LeaveApplication, ScanLog, SOSAlert, DelayNotice,
} = require('../src/models');

// ---- apply the real schema into it ----
//
// This replaces the Mongoose syncIndexes() calls, and it is a stronger guarantee: the
// indexes that decide the races are not derived from the models here, they are the same
// DDL that ships to production. utils/verifyIndexes.js is gone for the same reason — a
// partial unique index either applies or this throws.
const schemaSql = fs.readFileSync(path.join(DDL_DIR, STEPS.schema), 'utf8');
for (const stmt of splitStatements(schemaSql)) {
  await sequelize.query(stmt);
}
const [[{ count: indexCount }]] = await sequelize.query(
  `SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname = '${SCHEMA}'`
);
const [oneActive] = await sequelize.query(
  `SELECT indexname FROM pg_indexes WHERE schemaname = '${SCHEMA}' AND indexname LIKE 'one_active%'`
);
const indexesOk = oneActive.length === 2;

const app = require('../src/app');
const server = app.listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---- helpers ----
const results = [];
const record = (id, title, status, detail) => {
  results.push({ id, title, status, detail });
  const icon = status === 'PASS' ? 'PASS' : status === 'FAIL' ? 'FAIL' : 'WARN';
  console.log(`[${icon}] ${id} ${title}${detail ? ' :: ' + detail : ''}`);
};
const tok = (u) => jwt.sign({ id: u._id.toString() }, process.env.JWT_SECRET, { expiresIn: '1d' });
const api = async (path, { method = 'GET', token, body, headers = {} } = {}) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { __raw: text.slice(0, 200) }; }
  return { status: res.status, body: json, headers: res.headers };
};
const SIG = 'data:image/png;base64,' + 'A'.repeat(500);
// Campus-local (IST) date at a given hour/min, offset by whole days from today.
const istAt = (h, m = 0, dayOffset = 0) => {
  const now = new Date(Date.now() + dayOffset * 86400000);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${ymd}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);
};
const nowIstMinutes = () => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
  return Number(p.find(x => x.type === 'hour').value) * 60 + Number(p.find(x => x.type === 'minute').value);
};

// Drops the throwaway schema and closes everything. Every scenario ends by calling it, so
// a run leaves nothing behind even though the database itself is a real, shared one.
const teardown = async () => {
  server.close();
  await sequelize.close().catch(() => {});
  const cleaner = new Client({ connectionString: url });
  await cleaner.connect();
  await cleaner.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
  await cleaner.end();
};

// ---- seed ----
//
// `signature` is no longer a column on users — it is a row in user_signatures behind a
// virtual — so it cannot be passed to create(). Every seeded account gets one written
// explicitly, because the submit and approve paths refuse to run without one (428).
const mk = async (o) => {
  const user = await User.create(o);
  await User.setSignature(user.id, SIG);
  return user;
};
const guard = await mk({ name: 'Guard1', role: 'Guard', loginId: 'guard1' });
const admin2 = await mk({ name: 'Admin1', role: 'Admin', loginId: 'admin1' });
const chief = await mk({ name: 'Chief', role: 'ChiefWarden', loginId: 'chief1' });
const ctF = await mk({ name: 'CT-Kadambini', role: 'Caretaker', loginId: 'ctf', managedHostel: 'Kadambini', managedGender: 'Female' });
const ctM = await mk({ name: 'CT-Kautilya', role: 'Caretaker', loginId: 'ctm', managedHostel: 'Kautilya', managedGender: 'Male' });
const wdF = await mk({ name: 'WD-Kadambini', role: 'Warden', loginId: 'wdf', managedHostel: 'Kadambini', managedGender: 'Female' });

const mkStudent = (i, gender, hostel) => mk({
  name: `Student${i}`, role: 'Student', gender, hostelName: hostel,
  studentId: `2${String(i).padStart(5, '0')}`, email: `s${i}@nitp.ac.in`,
  roomNumber: `R${i}`, department: 'CSE', year: '2', phoneNumber: '9999999999',
  guardianPhoneNumber: '8888888888',
});
const males = await Promise.all(Array.from({ length: 60 }, (_, i) => mkStudent(i, 'Male', 'Kautilya')));
const females = await Promise.all(Array.from({ length: 40 }, (_, i) => mkStudent(1000 + i, 'Female', 'Kadambini')));

const T = {
  guard: tok(guard), admin: tok(admin2), chief: tok(chief),
  ctF: tok(ctF), ctM: tok(ctM), wdF: tok(wdF),
};
console.log(`\n=== SCHEMA ${SCHEMA} on ${host} — ${indexCount} indexes, one-active guards ok=${indexesOk} ===`);
console.log(`=== SEEDED: ${males.length} male + ${females.length} female students ===`);
console.log(`=== Campus-local time now: ${Math.floor(nowIstMinutes()/60)}:${String(nowIstMinutes()%60).padStart(2,'0')} IST ===\n`);

export { app, server, sequelize, teardown, api, tok, record, results, SIG, istAt, nowIstMinutes,
  User, CloseContact, OutingRequest, LeaveApplication, ScanLog, SOSAlert, DelayNotice,
  guard, admin2 as admin, chief, ctF, ctM, wdF, males, females, T, indexesOk, BASE, SCHEMA };
