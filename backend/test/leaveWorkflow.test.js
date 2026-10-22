const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { sequelize, User, OutingRequest, LeaveApplication } = require('../src/models');
const {
  createLeaveApplication,
  decideLeaveApplication,
  revokeLeaveApplication,
  cancelLeaveApplication,
} = require('../src/controllers/leaveController');

// The leave workflow: boys' leave is approved on submit and may be revoked by staff until
// he is Out; girls' leave goes to the caretaker, the hostel's wardens and the chief warden
// at once, and the first of them to act decides it. A girl may apply on the departure day
// itself, flagged as an emergency. No live database: the model seams are stubbed.

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

const mockSignature = 'data:image/png;base64,' + 'A'.repeat(50);

// Replaces each [object, key] with a stub for one test, restored afterwards.
const stub = (t, object, key, value) => {
  const original = object[key];
  object[key] = value;
  t.after(() => { object[key] = original; });
};

const campusDateKey = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);

const dayFromNow = (days) => {
  const d = new Date(`${campusDateKey(new Date())}T00:00:00+05:30`);
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
};

const leaveRequest = ({ gender = 'Male', leaveInDays = 1, ...body } = {}) => ({
  user: {
    _id: crypto.randomUUID(),
    name: 'Test Student',
    gender,
    hostelName: gender === 'Female' ? 'Ganga' : 'Kautilya',
  },
  body: {
    destination: 'Home',
    reason: 'Visiting family',
    leaveDate: dayFromNow(leaveInDays).toISOString(),
    returnDate: new Date(dayFromNow(leaveInDays + 2).getTime() + 1).toISOString(),
    parentPhone: '9876543210',
    expectedDepartureTime: '10:30',
    acknowledgement: true,
    ...body,
  },
});

// Stubs every read createLeaveApplication makes and captures what it would insert.
const stubCreatePath = (t) => {
  const created = [];
  stub(t, User, 'getSignature', async () => mockSignature);
  stub(t, User, 'findOne', async () => null); // no caretaker assigned to the hostel
  stub(t, LeaveApplication, 'findAll', async () => []);
  stub(t, OutingRequest, 'findOne', async () => null);
  stub(t, LeaveApplication, 'create', async (values) => {
    created.push(values);
    return { id: crypto.randomUUID(), ...values, toJSON() { return { ...values }; } };
  });
  return created;
};

test("a boy's leave is approved on submit, decided by nobody", async (t) => {
  const created = stubCreatePath(t);
  const res = responseRecorder();
  await createLeaveApplication(leaveRequest({ gender: 'Male' }), res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created[0].status, 'Approved');
  assert.equal(created[0].decision, 'Approved');
  assert.equal(created[0].decidedByRole, 'System');
  assert.equal(created[0].approvedBy, undefined);
  assert.equal(created[0].expectedDepartureTime, '10:30');
});

test("a boy may apply on the departure day and it is no emergency", async (t) => {
  const created = stubCreatePath(t);
  const res = responseRecorder();
  await createLeaveApplication(leaveRequest({ gender: 'Male', leaveInDays: 0 }), res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created[0].isEmergency, false);
});

test("a girl's leave waits for a decision", async (t) => {
  const created = stubCreatePath(t);
  const res = responseRecorder();
  await createLeaveApplication(leaveRequest({ gender: 'Female' }), res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created[0].status, 'Pending');
  assert.equal(created[0].decision, undefined);
  assert.equal(created[0].isEmergency, false);
});

test('a girl applying on the departure day is accepted as an emergency', async (t) => {
  const created = stubCreatePath(t);
  const res = responseRecorder();
  await createLeaveApplication(leaveRequest({ gender: 'Female', leaveInDays: 0 }), res);

  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created[0].status, 'Pending');
  assert.equal(created[0].isEmergency, true);
});

test('nobody can apply for a day already gone', async (t) => {
  const created = stubCreatePath(t);
  for (const gender of ['Male', 'Female']) {
    const res = responseRecorder();
    await createLeaveApplication(leaveRequest({ gender, leaveInDays: -1 }), res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /past/);
  }
  assert.equal(created.length, 0);
});

test('the expected departure time is required, as HH:MM', async (t) => {
  const created = stubCreatePath(t);
  for (const expectedDepartureTime of [undefined, '', '9:30', '24:00', '10:60', '10.30', 'noon']) {
    const res = responseRecorder();
    await createLeaveApplication(leaveRequest({ expectedDepartureTime }), res);
    assert.equal(res.statusCode, 400, `accepted ${JSON.stringify(expectedDepartureTime)}`);
    assert.match(res.body.message, /time you expect to leave/);
  }
  assert.equal(created.length, 0);
});

test('the expected departure time is at most 5:30 PM', async (t) => {
  const created = stubCreatePath(t);
  for (const expectedDepartureTime of ['17:31', '18:00', '23:59']) {
    const res = responseRecorder();
    await createLeaveApplication(leaveRequest({ expectedDepartureTime }), res);
    assert.equal(res.statusCode, 400, `accepted ${expectedDepartureTime}`);
    assert.match(res.body.message, /5:30 PM or earlier/);
  }
  for (const expectedDepartureTime of ['00:00', '06:00', '17:30']) {
    const res = responseRecorder();
    await createLeaveApplication(leaveRequest({ expectedDepartureTime }), res);
    assert.equal(res.statusCode, 201, `refused ${expectedDepartureTime}: ${JSON.stringify(res.body)}`);
  }
  assert.equal(created.length, 3);
});

test('the ticket is optional, and only a small image or PDF is accepted', async (t) => {
  const created = stubCreatePath(t);

  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 ticket').toString('base64');
  let res = responseRecorder();
  await createLeaveApplication(leaveRequest({ ticket: pdf }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  assert.equal(created.at(-1).ticket, pdf);
  assert.equal(res.body.ticket, undefined, 'the bytes are never echoed back');

  res = responseRecorder();
  await createLeaveApplication(leaveRequest({ ticket: 'data:text/html;base64,PGgxPg==' }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /photo .* or a PDF/);

  // 700 KB is the cap: base64'd, the whole application must stay under nginx's default
  // 1 MB request limit, which the college proxy is left at.
  const atCap = 'data:image/jpeg;base64,' + Buffer.alloc(700 * 1024, 1).toString('base64');
  res = responseRecorder();
  await createLeaveApplication(leaveRequest({ ticket: atCap }), res);
  assert.equal(res.statusCode, 201, JSON.stringify(res.body));
  const body = JSON.stringify(leaveRequest({ ticket: atCap }).body);
  assert.ok(Buffer.byteLength(body) < 1024 * 1024, `a max-size application is ${Buffer.byteLength(body)} bytes`);

  const huge = 'data:image/jpeg;base64,' + Buffer.alloc(700 * 1024 + 1, 1).toString('base64');
  res = responseRecorder();
  await createLeaveApplication(leaveRequest({ ticket: huge }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /too large/);
});

// ---------------------------------------------------------------------------
// Deciding and revoking
// ---------------------------------------------------------------------------

const girl = { id: 'stu-g', name: 'Girl', gender: 'Female', hostelName: 'Ganga' };
const boy = { id: 'stu-b', name: 'Boy', gender: 'Male', hostelName: 'Kautilya' };

const row = (fields) => {
  const r = {
    id: crypto.randomUUID(),
    studentId: fields.student.id,
    leaveDate: dayFromNow(1),
    targetCaretaker: null,
    saved: false,
    ...fields,
  };
  r.save = async () => { r.saved = true; };
  r.toJSON = () => ({ id: r.id, status: r.status });
  return r;
};

// saveClaimedDecision: a transaction around a conditional UPDATE. `claimed` decides
// whether this caller won the row.
const stubClaim = (t, claimed) => {
  stub(t, sequelize, 'transaction', async (fn) => fn(null));
  stub(t, LeaveApplication, 'update', async () => [claimed ? 1 : 0]);
};

const staff = {
  caretaker: { _id: 'ct-1', role: 'Caretaker', managedHostel: 'Ganga', managedGender: 'Female' },
  warden: { _id: 'w-1', role: 'Warden', managedHostel: 'Ganga' },
  otherWarden: { _id: 'w-9', role: 'Warden', managedHostel: 'Kautilya' },
  chief: { _id: 'cw-1', role: 'ChiefWarden' },
};

for (const who of ['caretaker', 'warden', 'chief']) {
  test(`the ${who} can approve a girl's pending leave directly`, async (t) => {
    const app = row({ student: girl, status: 'Pending' });
    stub(t, User, 'getSignature', async () => mockSignature);
    stub(t, LeaveApplication, 'findByPk', async () => app);
    stubClaim(t, true);

    const res = responseRecorder();
    await decideLeaveApplication({ user: staff[who], params: { id: app.id }, body: { status: 'Approved' } }, res);

    assert.equal(res.statusCode, 200, JSON.stringify(res.body));
    assert.equal(app.status, 'Approved');
    assert.equal(app.decidedByRole, staff[who].role);
    assert.equal(app.caretakerSignature, mockSignature, 'the pass is signed');
    assert.ok(app.saved);
  });
}

test('a warden of another hostel cannot decide', async (t) => {
  const app = row({ student: girl, status: 'Pending' });
  stub(t, User, 'getSignature', async () => mockSignature);
  stub(t, LeaveApplication, 'findByPk', async () => app);

  const res = responseRecorder();
  await decideLeaveApplication({ user: staff.otherWarden, params: { id: app.id }, body: { status: 'Approved' } }, res);
  assert.equal(res.statusCode, 403);
});

test('the second of two simultaneous deciders gets a 409, not an overwrite', async (t) => {
  const app = row({ student: girl, status: 'Pending' });
  stub(t, User, 'getSignature', async () => mockSignature);
  stub(t, LeaveApplication, 'findByPk', async (id, opts) =>
    opts?.attributes ? { id: app.id, status: 'Approved' } : app
  );
  stubClaim(t, false);

  const res = responseRecorder();
  await decideLeaveApplication({ user: staff.warden, params: { id: app.id }, body: { status: 'Rejected', remarks: 'No' } }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /already acted/);
  assert.equal(app.saved, false);
});

test('rejecting is one tap: no reason needed', async (t) => {
  const app = row({ student: girl, status: 'Pending' });
  stub(t, LeaveApplication, 'findByPk', async () => app);
  stubClaim(t, true);

  const res = responseRecorder();
  await decideLeaveApplication({ user: staff.caretaker, params: { id: app.id }, body: { status: 'Rejected' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(app.status, 'Rejected');
  assert.equal(app.remarks, undefined);
});

test("an old 'Forwarded' application is still decidable", async (t) => {
  const app = row({ student: girl, status: 'Forwarded' });
  stub(t, LeaveApplication, 'findByPk', async () => app);
  stubClaim(t, true);

  const res = responseRecorder();
  await decideLeaveApplication({ user: staff.caretaker, params: { id: app.id }, body: { status: 'Rejected', remarks: 'Dates clash' } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(app.status, 'Rejected');
});

test("staff revoke a boy's auto-approved leave with a reason", async (t) => {
  const app = row({ student: boy, status: 'Approved', decision: 'Approved', decidedByRole: 'System' });
  stub(t, LeaveApplication, 'findByPk', async () => app);
  stubClaim(t, true);

  const warden = { _id: 'w-k', role: 'Warden', managedHostel: 'Kautilya' };
  const res = responseRecorder();
  await revokeLeaveApplication({ user: warden, params: { id: app.id }, body: { remarks: 'Exams on Monday' } }, res);

  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(app.status, 'Rejected');
  assert.equal(app.decision, 'Rejected');
  assert.equal(app.decidedByRole, 'Warden');
  assert.equal(app.remarks, 'Exams on Monday');
  assert.ok(app.revokedAt instanceof Date);
});

test('revoking needs a reason', async () => {
  const res = responseRecorder();
  await revokeLeaveApplication({ user: staff.chief, params: { id: 'x' }, body: {} }, res);
  assert.equal(res.statusCode, 400);
});

test('a leave he is already Out on cannot be revoked', async (t) => {
  const app = row({ student: boy, status: 'Out', decision: 'Approved', decidedByRole: 'System' });
  stub(t, LeaveApplication, 'findByPk', async () => app);

  const res = responseRecorder();
  await revokeLeaveApplication({ user: staff.chief, params: { id: app.id }, body: { remarks: 'x' } }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /already left campus/);
});

test('a revoke that loses to the gate scan reports the student left', async (t) => {
  const app = row({ student: boy, status: 'Approved', decision: 'Approved', decidedByRole: 'System' });
  stub(t, LeaveApplication, 'findByPk', async (id, opts) =>
    opts?.attributes ? { id: app.id, status: 'Out' } : app
  );
  stubClaim(t, false);

  const res = responseRecorder();
  await revokeLeaveApplication({ user: staff.chief, params: { id: app.id }, body: { remarks: 'x' } }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /just left campus/);
});

test("a staff-approved girl's leave is not revocable through this path", async (t) => {
  const app = row({ student: girl, status: 'Approved', decision: 'Approved', decidedByRole: 'Caretaker' });
  stub(t, LeaveApplication, 'findByPk', async () => app);

  const res = responseRecorder();
  await revokeLeaveApplication({ user: staff.chief, params: { id: app.id }, body: { remarks: 'x' } }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /auto-approved/);
});

// ---------------------------------------------------------------------------
// Cancelling
// ---------------------------------------------------------------------------

test('a student cancels their own approved leave', async (t) => {
  const app = row({ student: boy, status: 'Approved', decision: 'Approved', decidedByRole: 'System' });
  stub(t, LeaveApplication, 'findByPk', async () => app);
  stubClaim(t, true);

  const res = responseRecorder();
  await cancelLeaveApplication({ user: { _id: boy.id }, params: { id: app.id } }, res);
  assert.equal(res.statusCode, 200, JSON.stringify(res.body));
  assert.equal(app.status, 'Cancelled');
  assert.ok(app.saved);
});

test('a cancel that loses to the gate scan does not overwrite Out', async (t) => {
  const app = row({ student: boy, status: 'Approved', decision: 'Approved', decidedByRole: 'System' });
  stub(t, LeaveApplication, 'findByPk', async (id, opts) =>
    opts?.attributes ? { id: app.id, status: 'Out' } : app
  );
  stubClaim(t, false);

  const res = responseRecorder();
  await cancelLeaveApplication({ user: { _id: boy.id }, params: { id: app.id } }, res);
  assert.equal(res.statusCode, 409);
  assert.match(res.body.message, /already left campus/);
  assert.equal(app.saved, false, 'the row is not written');
});
