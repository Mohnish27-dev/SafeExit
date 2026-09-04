// Full-flow stress harness. Boots the REAL app against a REAL MongoDB 7.0,
// seeds a campus, then hammers every flow concurrently.
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const mongod = await MongoMemoryServer.create({ binary: { version: '7.0.14' } });
process.env.MONGO_URI = mongod.getUri() + 'safeexit_stress';
process.env.JWT_SECRET = 'stress-test-secret';
process.env.NODE_ENV = 'test';
process.env.PORT = '0';
// No SMTP / no VAPID -> mail logs to console, push is a no-op. Keeps the test hermetic.
delete process.env.SMTP_HOST; delete process.env.SMTP_USER; delete process.env.SMTP_PASS;
delete process.env.VAPID_PUBLIC_KEY; delete process.env.VAPID_PRIVATE_KEY;
process.env.FRONTEND_URL = 'http://localhost:3000';

const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
await mongoose.connect(process.env.MONGO_URI);

const app = require('../src/app');
const User = require('../src/models/User');
const OutingRequest = require('../src/models/OutingRequest');
const LeaveApplication = require('../src/models/LeaveApplication');
const ScanLog = require('../src/models/ScanLog');
const SOSAlert = require('../src/models/SOSAlert');
const DelayNotice = require('../src/models/DelayNotice');
const { verifyIndexes } = require('../src/utils/verifyIndexes');

// Build indexes for real - this is what guards the races.
await Promise.all([
  OutingRequest.syncIndexes(), LeaveApplication.syncIndexes(), User.syncIndexes(),
  ScanLog.syncIndexes(), SOSAlert.syncIndexes(), DelayNotice.syncIndexes(),
]);
const indexesOk = await verifyIndexes();

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

// ---- seed ----
const mk = (o) => User.create({ signature: SIG, ...o });
const guard = await mk({ name: 'Guard1', role: 'Guard', loginId: 'guard1' });
const admin = await mk({ name: 'Admin1', role: 'Admin', loginId: 'admin1' });
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
  guard: tok(guard), admin: tok(admin), chief: tok(chief),
  ctF: tok(ctF), ctM: tok(ctM), wdF: tok(wdF),
};
console.log(`\n=== SEEDED: ${males.length} male + ${females.length} female students, indexes ok=${indexesOk} ===`);
console.log(`=== Campus-local time now: ${Math.floor(nowIstMinutes()/60)}:${String(nowIstMinutes()%60).padStart(2,'0')} IST ===\n`);

export { app, server, mongod, mongoose, api, tok, record, results, SIG, istAt, nowIstMinutes,
  User, OutingRequest, LeaveApplication, ScanLog, SOSAlert, DelayNotice,
  guard, admin, chief, ctF, ctM, wdF, males, females, T, indexesOk, BASE };
