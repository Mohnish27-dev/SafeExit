const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');

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

const boy = { _id: 'boy-1', name: 'Ravi', studentId: '2301001', hostelName: 'Kautilya', gender: 'Male', phoneNumber: '9000000001' };
const girl = { _id: 'girl-1', name: 'Asha', studentId: '2301002', hostelName: 'Sarojini', gender: 'Female', phoneNumber: '9000000002' };
// Gender missing on the row: the girls' hostel alone must still hide the number.
const girlNoGender = { _id: 'girl-2', name: 'Meera', studentId: '2301003', hostelName: 'kadambini', gender: null, phoneNumber: '9000000003' };

const stubbed = (t, rows, caretakersByHostel) => {
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
    // ciEquals() builds a where(lower(col), value) node; its value is the hostel, lowered.
    const hostel = options.where[Op.or][0].logic;
    return caretakersByHostel[hostel] || [];
  };
  t.after(() => {
    OutingRequest.findAll = originals.outing;
    DelayNotice.findAll = originals.notice;
    User.findAll = originals.user;
  });
  return userQueries;
};

test('guard sees an overdue boy\'s number but only the caretaker for an overdue girl', async (t) => {
  const userQueries = stubbed(
    t,
    [lateOuting('o-1', boy), lateOuting('o-2', girl), lateOuting('o-3', girlNoGender)],
    {
      sarojini: [{ name: 'Sunita Devi', phoneNumber: '9111111111' }],
      kadambini: [{ name: 'Kiran Kumari', phoneNumber: null }],
    }
  );

  const res = responseRecorder();
  await getOverdueOutings({ user: { _id: 'guard-1', role: 'Guard' } }, res);

  assert.equal(res.statusCode, null, JSON.stringify(res.body));
  const [b, g, g2] = res.body;

  assert.equal(b.student.phoneNumber, '9000000001');
  assert.equal(b.caretakerCalls, undefined);

  assert.equal('phoneNumber' in g.student, false);
  assert.equal(g.caretakerCalls, true);
  assert.deepEqual(g.caretakers, [{ name: 'Sunita Devi', phoneNumber: '9111111111' }]);

  assert.equal('phoneNumber' in g2.student, false);
  assert.deepEqual(g2.caretakers, [{ name: 'Kiran Kumari', phoneNumber: null }]);

  // One caretaker lookup per girls' hostel, never one per student, and only caretakers.
  assert.equal(userQueries.length, 2);
  for (const q of userQueries) assert.equal(q.where.role, 'Caretaker');
  assert.deepEqual(userQueries[0].attributes, ['name', 'phoneNumber']);
});

test('caretakers still see a girl\'s own number', async (t) => {
  stubbed(t, [lateOuting('o-2', girl)], {});
  const res = responseRecorder();
  await getOverdueOutings({ user: { _id: 'ct-1', role: 'Caretaker', managedHostel: 'Sarojini' } }, res);

  assert.equal(res.statusCode, null, JSON.stringify(res.body));
  assert.equal(res.body[0].student.phoneNumber, '9000000002');
  assert.equal(res.body[0].caretakerCalls, undefined);
});
