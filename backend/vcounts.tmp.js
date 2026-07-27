// Temp test: counts-only /caretaker/stats, ISOLATED scratch DB.
// Drops 'safeexit_counts_scratch' before and after — production is never touched.
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const OutingRequest = require('./src/models/OutingRequest');
const LeaveApplication = require('./src/models/LeaveApplication');
const { getCaretakerStats } = require('./src/controllers/caretakerController');

let pass = 0, fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label} ${extra}`); }
};

const call = async (user) => {
  let payload, code = 200;
  const res = { status(c) { code = c; return this; }, json(p) { payload = p; return this; } };
  await getCaretakerStats({ user }, res);
  return { code, payload };
};

const HOUR = 3600e3;
const mk = (over) => ({
  name: 'X', email: `${Math.random().toString(36).slice(2)}@nitp.ac.in`,
  password: 'x', role: 'Student', ...over,
});
const outing = (student, dueOffsetMs, status = 'Out') => OutingRequest.create({
  student, destination: 'Market', purpose: 'Errand',
  outTime: new Date(Date.now() - HOUR), inTime: new Date(Date.now() + dueOffsetMs), status,
});
const leave = (student, dueOffsetMs, status = 'Out') => LeaveApplication.create({
  student, destination: 'Home', reason: 'Family',
  leaveDate: new Date(Date.now() - HOUR), returnDate: new Date(Date.now() + dueOffsetMs), status,
});

(async () => {
  await mongoose.connect(process.env.MONGO_URI, { dbName: 'safeexit_counts_scratch' });
  await mongoose.connection.dropDatabase();

  const care = await User.create(mk({
    name: 'Kadambini Caretaker', role: 'Caretaker',
    managedHostel: 'Kadambini', managedGender: 'Female',
  }));
  const asCare = () => User.findById(care._id).select('-password');

  // 5 Kadambini residents (one with odd casing) + 2 from another hostel.
  const a = await User.create(mk({ name: 'A', gender: 'Female', hostelName: 'Kadambini' }));
  const b = await User.create(mk({ name: 'B', gender: 'Female', hostelName: 'kadambini' }));
  const c = await User.create(mk({ name: 'C', gender: 'Female', hostelName: 'Kadambini' }));
  const d = await User.create(mk({ name: 'D', gender: 'Female', hostelName: 'Kadambini' }));
  const e = await User.create(mk({ name: 'E', gender: 'Female', hostelName: 'Kadambini' }));
  const far = await User.create(mk({ name: 'Far', gender: 'Female', hostelName: 'Sarojini' }));

  console.log('\n1. Payload shape — counts only');
  let r = await call(await asCare());
  const keys = Object.keys(r.payload).sort();
  ok('exactly outNow/overdue/totalStudents/generatedAt',
    JSON.stringify(keys) === JSON.stringify(['generatedAt', 'outNow', 'overdue', 'totalStudents']),
    JSON.stringify(keys));
  ok('no students array', !('students' in r.payload));
  ok('roster counts both casings = 5', r.payload.totalStudents === 5, `got ${r.payload.totalStudents}`);
  ok('outNow = 0 with no passes', r.payload.outNow === 0);
  ok('overdue = 0', r.payload.overdue === 0);

  console.log('\n2. Outing + leave counted, deduped');
  await outing(a._id, HOUR);          // A out, on time
  await leave(b._id, HOUR);           // B out on leave, on time
  await outing(c._id, HOUR);          // C out via outing...
  await leave(c._id, HOUR);           // ...and a stray leave: must count once
  r = await call(await asCare());
  ok('outNow = 3 (C deduped)', r.payload.outNow === 3, `got ${r.payload.outNow}`);
  ok('overdue still 0', r.payload.overdue === 0, `got ${r.payload.overdue}`);
  ok('roster unchanged at 5', r.payload.totalStudents === 5);

  console.log('\n3. Overdue derived from the return window');
  await outing(d._id, -2 * HOUR);     // D due two hours ago
  r = await call(await asCare());
  ok('outNow = 4', r.payload.outNow === 4, `got ${r.payload.outNow}`);
  ok('overdue = 1', r.payload.overdue === 1, `got ${r.payload.overdue}`);

  console.log('\n4. Overdue via a leave pass too');
  await leave(e._id, -3 * HOUR);
  r = await call(await asCare());
  ok('outNow = 5', r.payload.outNow === 5, `got ${r.payload.outNow}`);
  ok('overdue = 2', r.payload.overdue === 2, `got ${r.payload.overdue}`);

  console.log('\n5. Dedupe prefers the outing (first-pass-wins) for overdue');
  // C holds an on-time outing and an overdue leave; outing wins, so C is NOT overdue.
  await LeaveApplication.updateMany({ student: c._id }, { returnDate: new Date(Date.now() - 5 * HOUR) });
  r = await call(await asCare());
  ok('overdue still 2 (outing window wins)', r.payload.overdue === 2, `got ${r.payload.overdue}`);
  ok('outNow still 5', r.payload.outNow === 5);

  console.log('\n6. Non-Out passes ignored');
  await outing(a._id, HOUR, 'Approved');
  await outing(a._id, HOUR, 'Returned');
  r = await call(await asCare());
  ok('outNow unchanged at 5', r.payload.outNow === 5, `got ${r.payload.outNow}`);

  console.log('\n7. Cross-hostel isolation');
  await outing(far._id, -4 * HOUR);
  r = await call(await asCare());
  ok('Sarojini student excluded, outNow = 5', r.payload.outNow === 5, `got ${r.payload.outNow}`);
  ok('overdue = 2, not 3', r.payload.overdue === 2, `got ${r.payload.overdue}`);

  console.log('\n8. Gender-only caretaker (legacy scope) still works');
  const genderOnly = await User.create(mk({
    name: 'Girls Caretaker', role: 'Caretaker', managedGender: 'Female',
  }));
  r = await call(await User.findById(genderOnly._id).select('-password'));
  ok('roster = all 6 female students', r.payload.totalStudents === 6, `got ${r.payload.totalStudents}`);
  ok('outNow = 6 (incl. Sarojini)', r.payload.outNow === 6, `got ${r.payload.outNow}`);
  ok('overdue = 3', r.payload.overdue === 3, `got ${r.payload.overdue}`);

  console.log('\n9. Unscoped caretaker gets the empty payload');
  const unscoped = await User.create(mk({ name: 'Nobody', role: 'Caretaker' }));
  r = await call(await User.findById(unscoped._id).select('-password'));
  ok('all zeros', r.payload.outNow === 0 && r.payload.overdue === 0 && r.payload.totalStudents === 0);
  ok('still no students key', !('students' in r.payload));

  console.log('\n10. Empty-roster caretaker');
  const empty = await User.create(mk({
    name: 'Nagarjuna Caretaker', role: 'Caretaker', managedHostel: 'Nagarjuna', managedGender: 'Male',
  }));
  r = await call(await User.findById(empty._id).select('-password'));
  ok('totalStudents = 0', r.payload.totalStudents === 0, `got ${r.payload.totalStudents}`);
  ok('outNow = 0', r.payload.outNow === 0);

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
