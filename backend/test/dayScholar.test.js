const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Op } = require('sequelize');

const {
  sequelize, User, OutingRequest, LeaveApplication, ScanLog, AppSetting,
} = require('../src/models');
const { createScanLog, previewScan } = require('../src/controllers/scanController');
const { createLeaveApplication } = require('../src/controllers/leaveController');
const { updateUserProfile } = require('../src/controllers/authController');
const { updateStudent, getUsers } = require('../src/controllers/adminController');
const { passScope, studentInScope, studentInGenderScope } = require('../src/utils/hostelScope');
const { annualWindowStart } = require('../src/utils/profileWindow');

// Day scholars live at home and have no hostel. These pin:
//
//   - at the gate they are a movement log and nothing else: no outing, no deadline, no
//     campusStatus write, so never Outside, never overdue, never phoned.
//   - their direction comes from their own log: the first scan of a campus day is an entry,
//     so a forgotten evening exit does not turn the next morning's arrival into an exit.
//   - either QR, or the ID card, does the same thing; a leave QR is never refused for them.
//   - they cannot apply for leave.
//   - no caretaker's gender fallback reaches them.
//   - switching hostel <-> day scholar is a window edit, refused while a pass is live.

const ist = (hh, mm = 0, ss = 0, day = '2026-10-15') =>
  new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+05:30`);

const responseRecorder = () => {
  const result = { statusCode: 200, body: null };
  result.status = (code) => {
    result.statusCode = code;
    return result;
  };
  result.json = (body) => {
    result.body = body;
    return result;
  };
  return result;
};

const stub = (t, target, overrides) => {
  const originals = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = target[key];
    target[key] = value;
  }
  t.after(() => Object.assign(target, originals));
};

// ---------------------------------------------------------------------------
// Gate
// ---------------------------------------------------------------------------

// `history` is the day scholar's scan log, oldest first, as { direction, createdAt }.
const dayScholarGate = (t, { gender = 'Male', history = [] } = {}) => {
  const student = {
    id: crypto.randomUUID(),
    name: 'Day Scholar',
    studentId: 'DS001',
    gender,
    residency: 'DayScholar',
    hostelName: null,
    campusStatus: 'Inside',
    photo: null,
  };
  const writes = { outings: [], leaves: [], user: [], logs: [], locks: 0 };
  const log = [...history];

  stub(t, User, {
    findOne: async () => student,
    findByPk: async (id, options) => {
      if (options?.lock) writes.locks += 1;
      return student;
    },
    update: async (values) => {
      writes.user.push(values);
      return [1];
    },
  });
  const refuse = (what) => async () => {
    throw new Error(`a day scholar's scan must not touch ${what}`);
  };
  stub(t, OutingRequest, { findOne: refuse('outings'), create: refuse('outings'), update: refuse('outings') });
  stub(t, LeaveApplication, { findOne: refuse('leaves'), update: refuse('leaves') });
  stub(t, ScanLog, {
    // Honours the campus-day lower bound, which is the whole point of the lookup.
    findOne: async ({ where }) => {
      const since = where.createdAt[Op.gte];
      const today = log.filter((l) => l.createdAt >= since && l.studentId === where.studentId);
      return today.length ? today[today.length - 1] : null;
    },
    create: async (values) => {
      const row = { ...values, createdAt: new Date() };
      writes.logs.push(row);
      log.push(row);
      return { id: crypto.randomUUID() };
    },
    findByPk: async () => ({ ok: true }),
  });
  stub(t, sequelize, { transaction: async (fn) => fn({ LOCK: { UPDATE: 'UPDATE' } }) });

  for (const h of history) h.studentId = student.id;
  return { student, writes };
};

const scan = async (body = { studentId: 'DS001', direction: 'AUTO' }) => {
  const res = responseRecorder();
  await createScanLog({ user: { _id: crypto.randomUUID() }, body }, res);
  return res;
};

const preview = async (purpose) => {
  const res = responseRecorder();
  await previewScan({ query: { studentId: 'DS001', ...(purpose ? { purpose } : {}) } }, res);
  return res;
};

test('day scholar: the first scan of the day is an entry, and creates nothing', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(9, 0) });
  const { writes } = dayScholarGate(t);

  const p = await preview();
  assert.equal(p.body.dayScholar, true);
  assert.equal(p.body.direction, 'IN');
  assert.equal(p.body.exit.allowed, true);
  assert.equal(p.body.exit.passType, null);
  assert.equal(p.body.activePass, null);
  assert.equal(p.body.student.residency, 'DayScholar');

  const res = await scan();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(writes.logs.length, 1);
  assert.equal(writes.logs[0].direction, 'IN');
  assert.equal(writes.logs[0].punctuality, 'N/A');
  assert.equal(writes.logs[0].passType, undefined, 'a day scholar movement has no pass');
  assert.equal(writes.locks, 1, 'the student row is locked for the derivation');
  assert.ok(writes.user.every((u) => !('campusStatus' in u)), 'campusStatus is never written');
});

test('day scholar: after an entry today the next scan is an exit, with no outing and no deadline', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(17, 30) });
  const { writes } = dayScholarGate(t, { history: [{ direction: 'IN', createdAt: ist(9, 0) }] });

  const p = await preview();
  assert.equal(p.body.direction, 'OUT');
  assert.equal(p.body.exit.pass, null, 'no return-by time is shown');

  const res = await scan();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(writes.logs[0].direction, 'OUT');
});

test('day scholar: a forgotten exit yesterday does not turn this morning\'s arrival into an exit', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(9, 0, 0, '2026-10-16') });
  const { writes } = dayScholarGate(t, { history: [{ direction: 'IN', createdAt: ist(9, 0) }] });

  assert.equal((await preview()).body.direction, 'IN');
  await scan();
  assert.equal(writes.logs[0].direction, 'IN');
});

test('day scholar: the same card twice within seconds logs once', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(9, 0) });
  const { writes } = dayScholarGate(t);

  assert.equal((await scan()).statusCode, 201);
  t.mock.timers.tick(10 * 1000);
  const again = await scan();
  assert.equal(again.statusCode, 409);
  assert.equal(again.body.code, 'DAY_SCHOLAR_RESCAN');
  assert.equal(writes.logs.length, 1);

  t.mock.timers.tick(60 * 1000);
  assert.equal((await scan()).statusCode, 201, 'a real exit later is logged');
  assert.deepEqual(writes.logs.map((l) => l.direction), ['IN', 'OUT']);
});

test('day scholar: a leave QR is not refused — it is just a movement', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(9, 0) });
  const { writes } = dayScholarGate(t);

  const p = await preview('leave');
  assert.equal(p.body.exit.allowed, true);
  const res = await scan({ studentId: 'DS001', direction: 'AUTO', purpose: 'leave' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(writes.logs.length, 1);
});

// ---------------------------------------------------------------------------
// Leave
// ---------------------------------------------------------------------------

test('day scholar: leave applications are refused before anything is read', async (t) => {
  stub(t, LeaveApplication, {
    create: async () => {
      throw new Error('must not create');
    },
  });
  const res = responseRecorder();
  await createLeaveApplication(
    {
      user: { _id: crypto.randomUUID(), role: 'Student', residency: 'DayScholar', gender: 'Female' },
      body: { destination: 'Home', reason: 'x', leaveDate: '2026-10-20', returnDate: '2026-10-22' },
    },
    res
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'DAY_SCHOLAR');
});

// ---------------------------------------------------------------------------
// Staff scope
// ---------------------------------------------------------------------------

test('scope: no caretaker gender fallback reaches a day scholar', () => {
  const dayScholar = { role: 'Student', residency: 'DayScholar', gender: 'Male', hostelName: null };
  const fallbackCaretaker = { role: 'Caretaker', managedGender: 'Male', managedHostel: null, _id: 'c1' };

  assert.equal(studentInScope(fallbackCaretaker, dayScholar), false);
  assert.equal(studentInGenderScope(fallbackCaretaker, dayScholar), false);
  assert.equal(studentInScope({ role: 'ChiefWarden' }, dayScholar), true);
  assert.equal(studentInScope({ role: 'Admin' }, dayScholar), true);

  const scope = passScope(ScanLog, fallbackCaretaker, ['id']);
  assert.equal(scope.include[0].where.residency, 'Hostel');
});

// ---------------------------------------------------------------------------
// Switching residency
// ---------------------------------------------------------------------------

const insideWindow = () => new Date(annualWindowStart().getTime() + 60 * 1000);
const beforeWindow = () => new Date(annualWindowStart().getTime() - 24 * 3600 * 1000);

const profileFixture = (t, student, { livePasses = 0 } = {}) => {
  stub(t, User, { findByPk: async () => student });
  stub(t, OutingRequest, { count: async () => livePasses });
  stub(t, LeaveApplication, { count: async () => 0 });
  stub(t, AppSetting, { findByPk: async () => null });
  stub(t, sequelize, { transaction: async (fn) => fn({}) });
};

const hostelBoy = (overrides = {}) => ({
  id: 'stu-1',
  role: 'Student',
  name: 'Ravi',
  gender: 'Male',
  residency: 'Hostel',
  hostelName: 'Kautilya',
  roomNumber: '101',
  campusStatus: 'Outside',
  year: '2nd',
  profileConfirmedAt: beforeWindow(),
  closeContacts: [],
  save: async () => {},
  ...overrides,
});

const patchProfile = async (body) => {
  const res = responseRecorder();
  await updateUserProfile({ user: { _id: 'stu-1' }, body }, res);
  return res;
};

test('switch: a hostel student becomes a day scholar in the window, and loses hostel and room', async (t) => {
  const student = hostelBoy();
  profileFixture(t, student);

  const res = await patchProfile({ residency: 'DayScholar', year: '3rd' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(student.residency, 'DayScholar');
  assert.equal(student.hostelName, null);
  assert.equal(student.roomNumber, null);
  assert.equal(student.gender, 'Male', 'the hostel-implied gender is kept');
  assert.equal(student.campusStatus, 'Inside');
  assert.equal(res.body.residency, 'DayScholar');
});

test('switch: refused outside the window', async (t) => {
  const student = hostelBoy({ profileConfirmedAt: insideWindow() });
  profileFixture(t, student);

  const res = await patchProfile({ residency: 'DayScholar', year: '3rd' });
  assert.equal(res.statusCode, 403);
  assert.equal(student.residency, 'Hostel');
});

test('switch: refused while an outing is in progress', async (t) => {
  const student = hostelBoy();
  profileFixture(t, student, { livePasses: 1 });

  const res = await patchProfile({ residency: 'DayScholar', year: '3rd' });
  assert.equal(res.statusCode, 409);
  assert.equal(student.residency, 'Hostel');
});

test('switch: a day scholar moving into a hostel must name one, of their own gender', async (t) => {
  const student = hostelBoy({ residency: 'DayScholar', hostelName: null, roomNumber: null, campusStatus: 'Inside' });
  profileFixture(t, student);

  assert.equal((await patchProfile({ residency: 'Hostel', year: '3rd' })).statusCode, 400);
  assert.equal((await patchProfile({ residency: 'Hostel', hostelName: 'Kadambini', year: '3rd' })).statusCode, 400);

  const ok = await patchProfile({ residency: 'Hostel', hostelName: 'Aryabhatta', roomNumber: 'B-12', year: '3rd' });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(student.residency, 'Hostel');
  assert.equal(student.hostelName, 'Aryabhatta');
  assert.equal(student.roomNumber, 'B-12');
});

test('switch: a day scholar cannot pick a hostel through the legacy backfill, outside the window', async (t) => {
  const student = hostelBoy({
    residency: 'DayScholar', hostelName: null, roomNumber: null, profileConfirmedAt: insideWindow(),
  });
  profileFixture(t, student);

  const res = await patchProfile({ hostelName: 'Kautilya' });
  assert.equal(res.statusCode, 403);
  assert.equal(student.hostelName, null);
});

test('switch: a day scholar editing in the window keeps no room number', async (t) => {
  const student = hostelBoy({ residency: 'DayScholar', hostelName: null, roomNumber: null });
  profileFixture(t, student);

  const res = await patchProfile({ year: '3rd', roomNumber: '12' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(student.roomNumber, null);
});

test('admin: can switch a student to day scholar at any time, but sets a gender if none is known', async (t) => {
  const student = hostelBoy({ gender: 'Other', profileConfirmedAt: insideWindow() });
  profileFixture(t, student);

  const run = async (body) => {
    const res = responseRecorder();
    await updateStudent({ params: { id: 'stu-1' }, body }, res);
    return res;
  };

  assert.equal((await run({ residency: 'DayScholar' })).statusCode, 400);
  const ok = await run({ residency: 'DayScholar', gender: 'Male' });
  assert.equal(ok.statusCode, 200, JSON.stringify(ok.body));
  assert.equal(student.residency, 'DayScholar');
  assert.equal(student.hostelName, null);
  assert.equal(ok.body.student.residency, 'DayScholar');
});

test('admin roster: status filters cover hostel residents only; DayScholar is its own filter', async (t) => {
  const captured = [];
  stub(t, User, {
    findAll: async ({ where }) => {
      captured.push(where);
      return [];
    },
    count: async () => 0,
  });
  stub(t, OutingRequest, { findAll: async () => [] });
  stub(t, LeaveApplication, { findAll: async () => [] });
  stub(t, AppSetting, { findByPk: async () => null });

  for (const campusStatus of ['Inside', 'DayScholar']) {
    const res = responseRecorder();
    res.set = () => res;
    await getUsers({ user: { role: 'Admin' }, query: { role: 'Student', campusStatus } }, res);
  }
  assert.equal(captured[0].residency, 'Hostel');
  assert.equal(captured[0].campusStatus, 'Inside');
  assert.equal(captured[1].residency, 'DayScholar');
  assert.equal(captured[1].campusStatus, undefined);
});

test('contacts: a day scholar may leave a contact\'s room blank; a hostel student may not', () => {
  const { normalizeCloseContacts } = require('../src/utils/closeContacts');
  const contacts = [{ name: 'Friend', mobileNumber: '9000000001', roomNumber: '' }];

  assert.match(normalizeCloseContacts(contacts, '9000000002').error, /room number/);
  const ok = normalizeCloseContacts(contacts, '9000000002', { roomOptional: true });
  assert.equal(ok.error, undefined);
  assert.equal(ok.contacts[0].roomNumber, '');
});
