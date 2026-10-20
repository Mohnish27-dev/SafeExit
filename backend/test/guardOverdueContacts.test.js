const test = require('node:test');
const assert = require('node:assert/strict');

const { OutingRequest, DelayNotice, User } = require('../src/models');
const { getOverdueOutings } = require('../src/controllers/outingController');

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

const lateOuting = (id, student) => {
  const inTime = new Date(Date.now() - 60 * 60_000);
  return {
    id,
    inTime,
    toJSON: () => ({ _id: id, id, status: 'Out', inTime, student: { ...student } }),
  };
};

const boy = { _id: 'boy-1', name: 'Ravi', studentId: '2301001', hostelName: 'Kautilya', roomNumber: '101', gender: 'Male', phoneNumber: '9000000001' };
const girl = { _id: 'girl-1', name: 'Asha', studentId: '2301002', hostelName: 'Sarojini', roomNumber: '203', gender: 'Female', phoneNumber: '9000000002' };
// Gender missing on the row: the girls' hostel alone must still hide the number.
const girlNoGender = { _id: 'girl-2', name: 'Meera', studentId: '2301003', hostelName: 'kadambini', roomNumber: '7', gender: null, phoneNumber: '9000000003' };

const stubbed = (t, rows) => {
  const originals = {
    outing: OutingRequest.findAll,
    notice: DelayNotice.findAll,
    user: User.findAll,
  };
  const userQueries = [];
  OutingRequest.findAll = async () => rows;
  DelayNotice.findAll = async () => [];
  User.findAll = async (options) => {
    userQueries.push(options);
    return [];
  };
  t.after(() => {
    OutingRequest.findAll = originals.outing;
    DelayNotice.findAll = originals.notice;
    User.findAll = originals.user;
  });
  return userQueries;
};

test('guard sees an overdue boy\'s number but only name and roll number for an overdue girl', async (t) => {
  const userQueries = stubbed(
    t,
    [lateOuting('o-1', boy), lateOuting('o-2', girl), lateOuting('o-3', girlNoGender)]
  );

  const res = responseRecorder();
  await getOverdueOutings({ user: { _id: 'guard-1', role: 'Guard' } }, res);

  assert.equal(res.statusCode, null, JSON.stringify(res.body));
  const [b, g, g2] = res.body;

  assert.equal(b.student.phoneNumber, '9000000001');
  assert.equal(b.hostelGuardCalls, undefined);

  for (const row of [g, g2]) {
    assert.equal(row.hostelGuardCalls, true);
    assert.equal('phoneNumber' in row.student, false);
    assert.equal('roomNumber' in row.student, false);
    assert.equal('caretakers' in row, false);
  }
  assert.equal(g.student.name, 'Asha');
  assert.equal(g.student.studentId, '2301002');
  assert.equal(g.student.hostelName, 'Sarojini');
  assert.equal(g2.student.hostelName, 'kadambini');

  // No staff lookup at all: the guard is never handed anyone's number for a girl.
  assert.equal(userQueries.length, 0);
});

test('caretakers still see a girl\'s own number', async (t) => {
  stubbed(t, [lateOuting('o-2', girl)]);
  const res = responseRecorder();
  await getOverdueOutings({ user: { _id: 'ct-1', role: 'Caretaker', managedHostel: 'Sarojini' } }, res);

  assert.equal(res.statusCode, null, JSON.stringify(res.body));
  assert.equal(res.body[0].student.phoneNumber, '9000000002');
  assert.equal(res.body[0].hostelGuardCalls, undefined);
});

// The same rule on the other guard-readable lists that join the student.
const joinedRow = (id, student) => ({ id, toJSON: () => ({ _id: id, id, student: { ...student } }) });

const listStub = (t, Model, rows) => {
  const original = Model.findAll;
  Model.findAll = async () => rows;
  t.after(() => { Model.findAll = original; });
};

for (const [label, Model, call] of [
  ['scan logs', 'ScanLog', () => require('../src/controllers/scanController').getScanLogs],
  ['delay notices', 'DelayNotice', () => require('../src/controllers/delayNoticeController').getDelayNotices],
]) {
  test(`guard gets only name, roll number and hostel for a girl in ${label}`, async (t) => {
    const models = require('../src/models');
    listStub(t, models[Model], [joinedRow('r-1', boy), joinedRow('r-2', girl), joinedRow('r-3', girlNoGender)]);

    const res = responseRecorder();
    res.set = () => res;
    await call()({ user: { _id: 'guard-1', role: 'Guard' }, query: {} }, res);

    assert.equal(res.statusCode, null, JSON.stringify(res.body));
    const [b, g, g2] = res.body.map((r) => r.student);
    assert.equal(b.hostelName, 'Kautilya');
    assert.equal(b.roomNumber, '101');
    for (const s of [g, g2]) {
      assert.deepEqual(Object.keys(s).sort(), ['_id', 'hostelName', 'name', 'studentId']);
    }
  });
}
