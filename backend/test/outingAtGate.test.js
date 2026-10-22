const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Op } = require('sequelize');

const { sequelize, User, OutingRequest, LeaveApplication, ScanLog } = require('../src/models');
const { createOutingRequest } = require('../src/controllers/outingController');
const { createScanLog, previewScan } = require('../src/controllers/scanController');
const { computeOutingReturnDeadline, outingTypeFor } = require('../src/utils/outingRules');

// Outings have no request, no approval and no destination. The student shows their QR at
// the gate and the exit scan creates the outing. These pin:
//
//   - an exit is never refused: no "no approved pass", no window, no red alert. Whether it is
//     a sensible hour is the guard's call.
//   - boys and girls (nearby or market) are all due back by 8:00 PM campus time.
//   - the QR decides the exit: the outing QR always makes an outing, even on the student's
//     leave day, and the leave QR leaves on a leave approved for today (at any hour of it)
//     or is refused with the reason, before anything is written.
//   - a leave for a later day is NOT burnt by an outing taken today.
//   - requests left open by the old flow cannot block the new outing on the unique index.

const ist = (hh, mm = 0, ss = 0, day = '2026-10-15') =>
  new Date(`${day}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}+05:30`);

const responseRecorder = () => {
  const result = { statusCode: null, body: null };
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

// Swaps properties on an object for the duration of one test.
const stub = (t, target, overrides) => {
  const originals = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = target[key];
    target[key] = value;
  }
  t.after(() => Object.assign(target, originals));
};

const withSetter = (row) => ({
  ...row,
  setDataValue(key, value) {
    this[key] = value;
  },
});

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

test('return deadline is 8:00 PM on the campus day of the exit', () => {
  assert.equal(computeOutingReturnDeadline(ist(6, 0)).getTime(), ist(20, 0).getTime());
  assert.equal(computeOutingReturnDeadline(ist(14, 45)).getTime(), ist(20, 0).getTime());
  assert.equal(computeOutingReturnDeadline(ist(19, 59, 59)).getTime(), ist(20, 0).getTime());
  // Before 6 AM is still that day: the guard decided to let them out.
  assert.equal(computeOutingReturnDeadline(ist(5, 0)).getTime(), ist(20, 0).getTime());
});

test('deadline lands on the CAMPUS day, not the server\'s UTC day', () => {
  // 00:30 IST on the 16th is 19:00 UTC on the 15th.
  assert.equal(
    computeOutingReturnDeadline(ist(0, 30, 0, '2026-10-16')).getTime(),
    ist(20, 0, 0, '2026-10-16').getTime()
  );
});

test('an exit at or after 8:00 PM is due back at once, and in_time stays after out_time', () => {
  for (const exitAt of [ist(20, 0), ist(21, 30), ist(23, 59, 59)]) {
    const deadline = computeOutingReturnDeadline(exitAt);
    assert.ok(deadline > exitAt, 'outing_window_ordered (in_time > out_time) must hold');
    assert.equal(deadline.getTime() - exitAt.getTime(), 1000);
  }
  assert.equal(computeOutingReturnDeadline('garbage'), null);
});

test('girls record Nearby, everyone else General', () => {
  assert.equal(outingTypeFor('Female'), 'Nearby');
  assert.equal(outingTypeFor('Male'), 'General');
  assert.equal(outingTypeFor('Other'), 'General');
  assert.equal(outingTypeFor(undefined), 'General');
});

// ---------------------------------------------------------------------------
// POST /api/outing is retired
// ---------------------------------------------------------------------------

test('creating an outing request answers 410 and tells the student to use the gate', async () => {
  const res = responseRecorder();
  await createOutingRequest({ user: { _id: crypto.randomUUID() }, body: { destination: 'Market' } }, res);
  assert.equal(res.statusCode, 410);
  assert.match(res.body.message, /QR/);
});

// ---------------------------------------------------------------------------
// Gate scan
// ---------------------------------------------------------------------------

// The leave lookups ask for one status ('Out') or a set of them ({ [Op.in]: [...] }).
const statusMatches = (cond, status) =>
  typeof cond === 'string' ? cond === status : Boolean(cond?.[Op.in]?.includes(status));

const gateFixture = (t, { gender = 'Male', campusStatus = 'Inside', leave = null, outPass = null } = {}) => {
  const student = {
    id: crypto.randomUUID(),
    name: 'Test Student',
    studentId: 'STU12345',
    gender,
    campusStatus,
    photo: null,
  };
  const writes = { outingUpdates: [], outingCreates: [], leaveUpdates: [], user: [], logs: [] };

  stub(t, User, {
    findOne: async () => student,
    update: async (values) => {
      writes.user.push(values);
      return [1];
    },
  });
  stub(t, OutingRequest, {
    findOne: async ({ where }) => (outPass && where.status === outPass.status ? outPass : null),
    update: async (values, options) => {
      writes.outingUpdates.push({ values, where: options.where });
      return [0];
    },
    create: async (values) => {
      writes.outingCreates.push(values);
      return withSetter({ id: crypto.randomUUID(), ...values });
    },
  });
  stub(t, LeaveApplication, {
    findOne: async ({ where }) => (leave && statusMatches(where.status, leave.status) ? leave : null),
    update: async (values, options) => {
      writes.leaveUpdates.push({ values, where: options.where });
      return [1];
    },
  });
  stub(t, ScanLog, {
    create: async (values) => {
      writes.logs.push(values);
      return { id: crypto.randomUUID() };
    },
    findByPk: async () => ({ ok: true }),
  });
  stub(t, sequelize, { transaction: async (fn) => fn({}) });

  return { student, writes };
};

const LEAVE_QR = { studentId: 'STU12345', direction: 'AUTO', purpose: 'leave' };

const scan = async (body = { studentId: 'STU12345', direction: 'AUTO' }) => {
  const res = responseRecorder();
  await createScanLog({ user: { _id: crypto.randomUUID() }, body }, res);
  return res;
};

const preview = async (purpose) => {
  const res = responseRecorder();
  await previewScan({ query: { studentId: 'STU12345', ...(purpose ? { purpose } : {}) } }, res);
  return res;
};

test('gate: a student with no request at all walks out, and the scan creates the outing', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(15, 1) });
  const { writes, student } = gateFixture(t);

  const p = await preview();
  assert.equal(p.body.exit.allowed, true);
  assert.equal(p.body.exit.passType, 'Outing');
  assert.equal(new Date(p.body.exit.pass.windowEnd).getTime(), ist(20, 0).getTime());

  const res = await scan();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));

  assert.equal(writes.outingCreates.length, 1);
  const row = writes.outingCreates[0];
  assert.equal(row.studentId, student.id);
  assert.equal(row.status, 'Out');
  assert.equal(row.autoApproved, true);
  assert.equal(row.destination, '', 'no destination is asked for');
  assert.equal(row.outingType, 'General');
  assert.equal(row.actualOutTime.getTime(), ist(15, 1).getTime(), 'departure = gate scan time');
  assert.equal(row.outTime.getTime(), ist(15, 1).getTime());
  assert.equal(row.inTime.getTime(), ist(20, 0).getTime());

  assert.equal(writes.logs[0].direction, 'OUT');
  assert.equal(writes.logs[0].passType, 'Outing');
  assert.ok(writes.logs[0].outingId, 'the log points at the outing it created');
  assert.deepEqual(writes.user[0].campusStatus, 'Outside');
});

test('gate: girls are due back at 8:00 PM too, whatever the trip (market included)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(16, 30) });
  const { writes } = gateFixture(t, { gender: 'Female' });

  const res = await scan();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(writes.outingCreates[0].outingType, 'Nearby');
  assert.equal(writes.outingCreates[0].inTime.getTime(), ist(20, 0).getTime());
});

test('gate: there is no exit window — an early-morning or late exit is logged, not refused', async (t) => {
  for (const now of [ist(5, 15), ist(21, 10)]) {
    await t.test(now.toISOString(), async (st) => {
      st.mock.timers.enable({ apis: ['Date'], now });
      const { writes } = gateFixture(st);

      const p = await preview();
      assert.equal(p.body.exit.allowed, true);

      const res = await scan();
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      assert.equal(writes.outingCreates.length, 1);
      assert.ok(writes.outingCreates[0].inTime > writes.outingCreates[0].outTime);
    });
  }
});

test('gate: requests left open by the old flow are retired first, in the same transaction', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(11, 0) });
  const { writes } = gateFixture(t);

  const res = await scan();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));

  const retire = writes.outingUpdates.find((w) => w.values.status === 'Expired');
  assert.ok(retire, 'old Pending/Approved/Forwarded rows are expired');
  const statuses = retire.where.status[Object.getOwnPropertySymbols(retire.where.status)[0]];
  assert.deepEqual(statuses, ['Pending', 'Approved', 'Forwarded']);

  // Both clean-ups (open requests, and any stray 'Out' row) run before the insert, or the
  // unique index would reject it.
  assert.equal(writes.outingUpdates.length, 2);
  assert.equal(writes.outingUpdates[1].where.status, 'Out');
  assert.equal(writes.outingCreates.length, 1);
});

const approvedLeave = (leaveDay, status = 'Approved') =>
  withSetter({
    id: crypto.randomUUID(),
    status,
    // Date-only applications are stored at campus midnight of the departure day.
    leaveDate: ist(0, 0, 0, leaveDay),
    returnDate: ist(23, 59, 59, '2026-10-20'),
  });

// A refused scan must leave no trace: no campus-status flip, no pass, no log.
const assertNothingLogged = (writes) => {
  assert.equal(writes.user.length, 0, 'campusStatus is not flipped');
  assert.equal(writes.outingCreates.length, 0, 'no outing is created');
  assert.equal(writes.logs.length, 0, 'no scan log is written');
  assert.equal(writes.leaveUpdates.filter((w) => w.values.status === 'Out').length, 0);
};

test('gate: the leave QR leaves on a leave approved for today, at any hour of that day', async (t) => {
  // Before the old 6:00 AM opening, mid-afternoon, and after the old 5:30 PM curfew.
  for (const now of [ist(0, 5), ist(5, 36), ist(15, 0), ist(17, 45), ist(23, 50)]) {
    await t.test(now.toISOString(), async (st) => {
      st.mock.timers.enable({ apis: ['Date'], now });
      const leave = approvedLeave('2026-10-15');
      const { writes } = gateFixture(st, { leave });

      const p = await preview('leave');
      assert.equal(p.body.purpose, 'leave');
      assert.equal(p.body.exit.allowed, true);
      assert.equal(p.body.exit.passType, 'Leave');

      const res = await scan(LEAVE_QR);
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      assert.equal(writes.outingCreates.length, 0, 'no outing is created for a leave departure');
      assert.equal(writes.leaveUpdates[0].values.status, 'Out');
      assert.equal(writes.logs[0].passType, 'Leave');
      assert.equal(writes.logs[0].leaveId, leave.id);
    });
  }
});

test('gate: the outing QR makes an outing even on the leave day, and leaves the leave alone', async (t) => {
  // The case the leave QR exists for: leave today, but out into town at noon first.
  t.mock.timers.enable({ apis: ['Date'], now: ist(12, 0) });
  const leave = approvedLeave('2026-10-15');
  const { writes } = gateFixture(t, { leave });

  const p = await preview();
  assert.equal(p.body.purpose, 'outing');
  assert.equal(p.body.exit.passType, 'Outing');
  assert.ok(p.body.exit.leaveToday, 'the guard is told this student has a leave today');

  const res = await scan();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(writes.outingCreates.length, 1);
  assert.equal(writes.leaveUpdates.length, 0, 'the leave stays Approved for later today');
  assert.equal(writes.logs[0].passType, 'Outing');
});

test('gate: an outing today does not burn a leave approved for a later day', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(10, 0) });
  const leave = approvedLeave('2026-10-17');
  const { writes } = gateFixture(t, { leave });

  const p = await preview();
  assert.equal(p.body.exit.passType, 'Outing');
  assert.equal(p.body.exit.leaveToday, null);

  const res = await scan();
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(writes.outingCreates.length, 1);
  assert.equal(writes.leaveUpdates.length, 0, 'the future leave is left untouched');
});

test('gate: the leave QR is refused, with the reason, when no leave is valid today', async (t) => {
  const cases = [
    ['no leave at all', null, 'NO_LEAVE'],
    ['leave still pending', approvedLeave('2026-10-15', 'Pending'), 'LEAVE_NOT_APPROVED'],
    ['leave with the warden', approvedLeave('2026-10-15', 'Forwarded'), 'LEAVE_NOT_APPROVED'],
    ['leave approved for a later day', approvedLeave('2026-10-16'), 'LEAVE_NOT_TODAY'],
  ];
  for (const [name, leave, code] of cases) {
    await t.test(name, async (st) => {
      st.mock.timers.enable({ apis: ['Date'], now: ist(15, 0) });
      const { writes } = gateFixture(st, { leave });

      const p = await preview('leave');
      assert.equal(p.body.exit.allowed, false);
      assert.equal(p.body.exit.reason, code);

      const res = await scan(LEAVE_QR);
      assert.equal(res.statusCode, 409);
      assert.equal(res.body.code, code);
      assertNothingLogged(writes);
      assert.equal(writes.leaveUpdates.length, 0, 'a live leave is never touched by a refusal');
    });
  }
});

test('gate: a leave whose day is over lapses; refused on the leave QR, outing on the outing QR', async (t) => {
  await t.test('leave QR', async (st) => {
    st.mock.timers.enable({ apis: ['Date'], now: ist(0, 10, 0, '2026-10-16') });
    const { writes } = gateFixture(st, { leave: approvedLeave('2026-10-15') });

    const res = await scan(LEAVE_QR);
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'LEAVE_EXPIRED');
    assert.deepEqual(writes.leaveUpdates[0].values, { status: 'Expired' });
    assertNothingLogged(writes);
  });

  await t.test('outing QR', async (st) => {
    st.mock.timers.enable({ apis: ['Date'], now: ist(18, 0, 0, '2026-10-16') });
    const { writes } = gateFixture(st, { leave: approvedLeave('2026-10-15') });

    const res = await scan();
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.deepEqual(writes.leaveUpdates[0].values, { status: 'Expired' });
    const guarded = writes.leaveUpdates[0].where.status[Op.in];
    assert.ok(guarded.includes('Approved') && !guarded.includes('Out'), 'never lapses a leave already Out');
    assert.equal(writes.outingCreates.length, 1);
  });
});

test('gate: on return either QR closes whichever pass took the student out', async (t) => {
  await t.test('leave QR closes an outing', async (st) => {
    st.mock.timers.enable({ apis: ['Date'], now: ist(19, 0) });
    const outPass = withSetter({ id: crypto.randomUUID(), status: 'Out', outTime: ist(15, 0), inTime: ist(20, 0) });
    const { writes } = gateFixture(st, { campusStatus: 'Outside', outPass });

    const res = await scan(LEAVE_QR);
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(writes.logs[0].direction, 'IN');
    assert.equal(writes.logs[0].passType, 'Outing');
  });

  await t.test('outing QR closes a leave', async (st) => {
    st.mock.timers.enable({ apis: ['Date'], now: ist(11, 0, 0, '2026-10-20') });
    const leave = approvedLeave('2026-10-15', 'Out');
    const { writes } = gateFixture(st, { campusStatus: 'Outside', leave });

    const res = await scan();
    assert.equal(res.statusCode, 201, JSON.stringify(res.body));
    assert.equal(writes.logs[0].direction, 'IN');
    assert.equal(writes.logs[0].passType, 'Leave');
    assert.equal(writes.leaveUpdates[0].values.status, 'Returned');
  });
});

test('gate: the entry scan closes the outing and judges punctuality against 8:00 PM', async (t) => {
  for (const [now, expected] of [[ist(19, 30), 'On-Time'], [ist(20, 15), 'Overdue']]) {
    await t.test(expected, async (st) => {
      st.mock.timers.enable({ apis: ['Date'], now });
      const outPass = withSetter({
        id: crypto.randomUUID(),
        status: 'Out',
        outTime: ist(15, 0),
        inTime: ist(20, 0),
      });
      const { writes } = gateFixture(st, { campusStatus: 'Outside', outPass });

      const p = await preview();
      assert.equal(p.body.punctuality, expected);

      const res = await scan();
      assert.equal(res.statusCode, 201, JSON.stringify(res.body));
      const close = writes.outingUpdates.find((w) => w.values.status === 'Returned');
      assert.equal(close.values.returnPunctuality, expected);
      assert.equal(writes.logs[0].direction, 'IN');
      assert.equal(writes.logs[0].punctuality, expected);
      assert.equal(writes.outingCreates.length, 0);
    });
  }
});

test('gate: a caller-supplied outing id is ignored, so a bad one cannot fail the scan', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(19, 0) });
  // Outside with no pass behind it: the log carries no pass at all.
  const { writes } = gateFixture(t, { campusStatus: 'Outside' });

  const res = await scan({ studentId: 'STU12345', direction: 'AUTO', outing: 'not-a-real-id' });
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(writes.logs[0].outingId, null);
  assert.equal(writes.logs[0].passType, null);
});
