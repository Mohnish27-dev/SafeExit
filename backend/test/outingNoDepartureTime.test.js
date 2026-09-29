const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { sequelize, User, OutingRequest, LeaveApplication, ScanLog } = require('../src/models');
const { createOutingRequest } = require('../src/controllers/outingController');
const { createScanLog, previewScan } = require('../src/controllers/scanController');
const {
  computeExitDeadline,
  computeReturnDeadline,
  getOutingRequestViolation,
  isDeparturePassed,
  isWithinDepartureWindow,
  resolveOutingPolicy,
} = require('../src/utils/outingRules');

// Students no longer choose a departure time. The gate scan IS the departure, and the only
// exit rule is the gender/type window on the day the pass was requested. These pin:
//
//   - the loophole that motivated the change: a pass requested at 12 PM "for 3 PM" and used
//     at 1 PM, or used at 3:01 PM and refused as expired. Neither can happen now.
//   - the unused-pass rule the user chose: the pass lapses when that day's window closes,
//     never mid-window, and never carries over to another day.
//   - that a client still sending outTime cannot influence anything.

const ist = (hh, mm = 0, ss = 0, day = '2026-09-29') =>
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

const mockSignature = 'data:image/png;base64,' + 'A'.repeat(50);

// Swaps properties on an object for the duration of one test.
const stub = (t, target, overrides) => {
  const originals = {};
  for (const [key, value] of Object.entries(overrides)) {
    originals[key] = target[key];
    target[key] = value;
  }
  t.after(() => Object.assign(target, originals));
};

// ---------------------------------------------------------------------------
// Pure rules
// ---------------------------------------------------------------------------

test('exit deadline is the last instant of the day\'s exit window, per gender and type', () => {
  const requestedAt = ist(12, 0);
  assert.equal(computeExitDeadline('Male', 'General', requestedAt).toISOString(), ist(19, 59, 59).toISOString().replace('.000Z', '.999Z'));
  assert.equal(computeExitDeadline('Female', 'Nearby', requestedAt).toISOString(), ist(18, 30, 59).toISOString().replace('.000Z', '.999Z'));
  assert.equal(computeExitDeadline('Female', 'Market', requestedAt).toISOString(), ist(15, 0, 59).toISOString().replace('.000Z', '.999Z'));
  // 'Other' and a female-only type sent by a male both collapse to the General rules.
  assert.equal(
    computeExitDeadline('Other', 'Market', requestedAt).getTime(),
    computeExitDeadline('Male', 'General', requestedAt).getTime()
  );
  assert.equal(
    computeExitDeadline('Male', 'Market', requestedAt).getTime(),
    computeExitDeadline('Male', 'General', requestedAt).getTime()
  );
});

test('girls\' Market exit window now closes at 3:00 PM', () => {
  assert.equal(resolveOutingPolicy('Female', 'Market').departEndMinutes, 15 * 60);
  assert.equal(isWithinDepartureWindow('Female', 'Market', ist(15, 0, 30)), true);
  assert.equal(isWithinDepartureWindow('Female', 'Market', ist(15, 1)), false);
});

test('return deadline is always after the exit deadline (outing_window_ordered CHECK holds)', () => {
  for (const [gender, type] of [['Male', 'General'], ['Female', 'Nearby'], ['Female', 'Market']]) {
    const at = ist(9, 0);
    assert.ok(
      computeReturnDeadline(gender, type, at) > computeExitDeadline(gender, type, at),
      `${gender}/${type}: in_time must be > out_time`
    );
  }
});

test('deadlines land on the CAMPUS day, not the server\'s UTC day', () => {
  // 00:30 IST on the 30th is still the 29th in UTC. The pass belongs to the 30th.
  const requestedAt = ist(0, 30, 0, '2026-09-30');
  assert.equal(requestedAt.getUTCDate(), 29);
  const exitBy = computeExitDeadline('Male', 'General', requestedAt);
  assert.equal(exitBy.toISOString(), '2026-09-30T14:29:59.999Z'); // 19:59:59.999 IST on the 30th
  // And at 23:30 IST — the next day in no timezone that matters — it stays the same day.
  const late = computeReturnDeadline('Male', 'General', ist(23, 30));
  assert.equal(late.toISOString(), ist(20, 0).toISOString());
});

test('the reported loophole: a noon pass is usable at 1 PM AND at 3:01 PM', () => {
  const exitBy = computeExitDeadline('Male', 'General', ist(12, 0));
  assert.equal(isDeparturePassed(exitBy, ist(13, 0).getTime()), false);
  assert.equal(isDeparturePassed(exitBy, ist(15, 1).getTime()), false);
  assert.equal(isWithinDepartureWindow('Male', 'General', ist(15, 1)), true);
});

test('window boundary: 7:59:30 PM is inside the window AND not lapsed; 8:00 PM is lapsed', () => {
  const exitBy = computeExitDeadline('Male', 'General', ist(12, 0));
  assert.equal(isWithinDepartureWindow('Male', 'General', ist(19, 59, 30)), true);
  assert.equal(isDeparturePassed(exitBy, ist(19, 59, 30).getTime()), false);
  assert.equal(isDeparturePassed(exitBy, ist(20, 0).getTime()), true);
});

test('an unused pass never carries over to the next day', () => {
  const exitBy = computeExitDeadline('Male', 'General', ist(12, 0));
  // 10 AM the next day is inside the daily window, but the pass is yesterday's.
  assert.equal(isWithinDepartureWindow('Male', 'General', ist(10, 0, 0, '2026-09-30')), true);
  assert.equal(isDeparturePassed(exitBy, ist(10, 0, 0, '2026-09-30').getTime()), true);
});

test('requests are refused only once today\'s window has closed', () => {
  // Before the window opens: allowed, the gate holds the exit until 6 AM.
  assert.equal(getOutingRequestViolation('Male', 'General', ist(5, 0)), null);
  assert.equal(getOutingRequestViolation('Male', 'General', ist(12, 0)), null);
  assert.equal(getOutingRequestViolation('Male', 'General', ist(19, 59, 45)), null);
  assert.equal(getOutingRequestViolation('Male', 'General', ist(20, 0)), 'EXIT_WINDOW_CLOSED');

  assert.equal(getOutingRequestViolation('Female', 'Nearby', ist(18, 30)), null);
  assert.equal(getOutingRequestViolation('Female', 'Nearby', ist(18, 31)), 'EXIT_WINDOW_CLOSED');

  assert.equal(getOutingRequestViolation('Female', 'Market', ist(15, 0)), null);
  assert.equal(getOutingRequestViolation('Female', 'Market', ist(15, 1)), 'EXIT_WINDOW_CLOSED');
  // A girl too late for Market can still take a Nearby outing.
  assert.equal(getOutingRequestViolation('Female', 'Nearby', ist(15, 1)), null);

  assert.equal(getOutingRequestViolation('Male', 'General', 'not a date'), 'INVALID_DATE');
});

// ---------------------------------------------------------------------------
// POST /api/outing
// ---------------------------------------------------------------------------

const studentUser = (gender = 'Male') => ({
  _id: crypto.randomUUID(),
  name: 'Test Student',
  campusStatus: 'Inside',
  gender,
  hostelName: gender === 'Female' ? 'Kadambini' : 'Kautilya',
});

const stubCreatePath = (t) => {
  const created = [];
  stub(t, User, { getSignature: async () => mockSignature });
  stub(t, OutingRequest, {
    findAll: async () => [],
    create: async (values) => {
      created.push(values);
      return { id: crypto.randomUUID(), ...values };
    },
  });
  stub(t, LeaveApplication, { findAll: async () => [] });
  return created;
};

test('createOutingRequest ignores a client outTime and stamps the server deadlines', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(12, 0) });
  const created = stubCreatePath(t);

  const res = responseRecorder();
  await createOutingRequest(
    {
      user: studentUser('Male'),
      // An old cached client trying to pick 3 PM — or a malicious one picking midnight.
      body: { destination: '  Boring Road  ', outingType: 'General', outTime: ist(23, 59).toISOString() },
    },
    res
  );

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created.length, 1);
  const row = created[0];
  assert.equal(row.destination, 'Boring Road', 'destination is trimmed');
  assert.equal(row.purpose, 'Outing', 'purpose defaults instead of hitting the NOT NULL column');
  assert.equal(row.outTime.getTime(), computeExitDeadline('Male', 'General', ist(12, 0)).getTime());
  assert.equal(row.inTime.getTime(), ist(20, 0).getTime());
  assert.equal(row.status, 'Approved');
  assert.equal(row.autoApproved, true);
});

test('createOutingRequest works with no time field at all (the new form)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(9, 15) });
  const created = stubCreatePath(t);

  const res = responseRecorder();
  await createOutingRequest(
    { user: studentUser('Female'), body: { destination: 'Chai stall', outingType: 'Nearby' } },
    res
  );

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created[0].outingType, 'Nearby');
  assert.equal(created[0].outTime.getTime(), computeExitDeadline('Female', 'Nearby', ist(9, 15)).getTime());
  assert.equal(created[0].inTime.getTime(), ist(20, 0).getTime());
});

test('createOutingRequest before 6 AM is accepted for that same day', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(5, 10) });
  const created = stubCreatePath(t);

  const res = responseRecorder();
  await createOutingRequest({ user: studentUser('Male'), body: { destination: 'Station' } }, res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created[0].outTime.getTime(), computeExitDeadline('Male', 'General', ist(5, 10)).getTime());
});

test('createOutingRequest refuses once today\'s window has closed and creates nothing', async (t) => {
  const cases = [
    ['Male', 'General', ist(20, 0), /7:59 PM/],
    ['Female', 'Nearby', ist(18, 45), /6:30 PM/],
    ['Female', 'Market', ist(15, 5), /3:00 PM/],
  ];
  for (const [gender, outingType, now, windowEnd] of cases) {
    await t.test(`${gender}/${outingType}`, async (st) => {
      st.mock.timers.enable({ apis: ['Date'], now });
      const created = stubCreatePath(st);
      const res = responseRecorder();
      await createOutingRequest({ user: studentUser(gender), body: { destination: 'X', outingType } }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, windowEnd);
      assert.match(res.body.message, /tomorrow/);
      assert.equal(created.length, 0);
    });
  }
});

test('createOutingRequest rejects a blank or oversized destination', async (t) => {
  for (const destination of [undefined, '', '    ', 42, 'x'.repeat(121)]) {
    await t.test(JSON.stringify(destination)?.slice(0, 20) ?? 'undefined', async (st) => {
      st.mock.timers.enable({ apis: ['Date'], now: ist(12, 0) });
      const created = stubCreatePath(st);
      const res = responseRecorder();
      await createOutingRequest({ user: studentUser('Male'), body: { destination } }, res);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /Destination/);
      assert.equal(created.length, 0);
    });
  }
});

test('the signature 428 still comes before any other check', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(21, 0) }); // window closed too
  stub(t, User, { getSignature: async () => null });
  const res = responseRecorder();
  await createOutingRequest({ user: studentUser('Male'), body: {} }, res);
  assert.equal(res.statusCode, 428);
});

// ---------------------------------------------------------------------------
// Gate scan
// ---------------------------------------------------------------------------

const gateFixture = (t, { gender = 'Male', outingType = 'General', requestedAt }) => {
  const student = {
    id: crypto.randomUUID(),
    name: 'Test Student',
    studentId: 'STU12345',
    gender,
    campusStatus: 'Inside',
    photo: null,
  };
  const pass = {
    id: crypto.randomUUID(),
    studentId: student.id,
    outingType,
    outTime: computeExitDeadline(gender, outingType, requestedAt),
    inTime: computeReturnDeadline(gender, outingType, requestedAt),
    status: 'Approved',
    setDataValue(key, value) {
      this[key] = value;
    },
  };
  const writes = { outing: [], user: [], logs: [] };

  stub(t, User, {
    findOne: async () => student,
    update: async (values) => {
      writes.user.push(values);
      return [1];
    },
  });
  stub(t, OutingRequest, {
    findOne: async ({ where }) => (where.status === pass.status ? pass : null),
    update: async (values, options) => {
      writes.outing.push({ values, where: options.where });
      return [1];
    },
  });
  stub(t, LeaveApplication, { findOne: async () => null, update: async () => [0] });
  stub(t, ScanLog, {
    create: async (values) => {
      writes.logs.push(values);
      return { id: crypto.randomUUID() };
    },
    findByPk: async () => ({ ok: true }),
  });
  stub(t, sequelize, { transaction: async (fn) => fn({}) });

  return { student, pass, writes };
};

test('gate: noon pass exits at 3:01 PM, and the scan time becomes the departure', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(15, 1) });
  const { writes } = gateFixture(t, { requestedAt: ist(12, 0) });

  const preview = responseRecorder();
  await previewScan({ query: { studentId: 'STU12345' } }, preview);
  assert.equal(preview.body.exit.allowed, true, JSON.stringify(preview.body.exit));

  const res = responseRecorder();
  await createScanLog({ user: { _id: crypto.randomUUID() }, body: { studentId: 'STU12345', direction: 'AUTO' } }, res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const out = writes.outing.find((w) => w.values.status === 'Out');
  assert.ok(out, 'pass moved to Out');
  assert.equal(out.values.actualOutTime.getTime(), ist(15, 1).getTime(), 'departure = gate scan time');
  assert.equal(writes.logs[0].direction, 'OUT');
});

test('gate: girls\' Market pass exits at 2:45 PM (was refused under the old 2:30 PM rule)', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(14, 45) });
  gateFixture(t, { gender: 'Female', outingType: 'Market', requestedAt: ist(10, 0) });

  const res = responseRecorder();
  await createScanLog({ user: { _id: crypto.randomUUID() }, body: { studentId: 'STU12345', direction: 'AUTO' } }, res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
});

test('gate: a pass requested before 6 AM is held, not lapsed, until the window opens', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(5, 40) });
  const { writes } = gateFixture(t, { requestedAt: ist(5, 30) });

  const preview = responseRecorder();
  await previewScan({ query: { studentId: 'STU12345' } }, preview);
  assert.equal(preview.body.exit.allowed, false);
  assert.equal(preview.body.exit.reason, 'not-yet-valid');

  const res = responseRecorder();
  await createScanLog({ user: { _id: crypto.randomUUID() }, body: { studentId: 'STU12345', direction: 'AUTO' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(writes.outing.length, 0, 'the pass must stay usable for later that morning');
  assert.equal(writes.user.length, 0, 'the student did not move');
});

test('gate: an unused pass from yesterday is refused and lapses', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(10, 0, 0, '2026-09-30') });
  const { writes } = gateFixture(t, { requestedAt: ist(12, 0) });

  const preview = responseRecorder();
  await previewScan({ query: { studentId: 'STU12345' } }, preview);
  assert.equal(preview.body.exit.allowed, false);
  assert.equal(preview.body.exit.reason, 'expired');

  const res = responseRecorder();
  await createScanLog({ user: { _id: crypto.randomUUID() }, body: { studentId: 'STU12345', direction: 'AUTO' } }, res);
  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /lapsed unused/);
  assert.deepEqual(writes.outing[0].values, { status: 'Expired' });
  assert.equal(writes.outing[0].where.status, 'Approved', 'never lapses a pass already Out');
  assert.equal(writes.user.length, 0);
});

test('gate: same-day pass after the window closes is refused', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: ist(20, 5) });
  const { writes } = gateFixture(t, { requestedAt: ist(12, 0) });

  const res = responseRecorder();
  await createScanLog({ user: { _id: crypto.randomUUID() }, body: { studentId: 'STU12345', direction: 'AUTO' } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(writes.user.length, 0);
});
